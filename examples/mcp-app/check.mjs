import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { randomBytes } from "node:crypto";
import { Script, runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const origin = process.env.SCREEN_RELAY_ORIGIN;
assert(origin, "Set SCREEN_RELAY_ORIGIN to the screen-relay HTTPS origin.");
const token = process.env.SCREEN_RELAY_TOKEN ?? (await readFile(process.env.SCREEN_RELAY_TOKEN_FILE, "utf8")).trim();
assert(/^[0-9a-f]{64}$/.test(token), "Set a valid token without putting it in tool arguments.");
const client = new Client({ name: "relay-app-check", version: "0.1.0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [new URL("./server.ts", import.meta.url).pathname],
  env: { ...process.env, SCREEN_RELAY_ORIGIN: origin, SCREEN_RELAY_TOKEN: token },
}));
try {
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((item) => item.name).sort(),
    ["browser_action", "desktop_action", "desktop_screenshot", "open_desktop"],
  );
  const tool = tools.tools.find((item) => item.name === "open_desktop");
  const resource = await client.readResource({ uri: tool._meta.ui.resourceUri });
  const { text: html, _meta: meta } = resource.contents[0];
  assert(meta.ui.csp.connectDomains.includes(origin.replace(/^http/, "ws")));
  assert(!meta.ui.csp.frameDomains);
  assert(!html.includes(token), "A resource must not contain session credentials.");
  new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);

  const opened = await client.callTool({ name: "open_desktop", arguments: { url: origin } });
  assert(!opened.isError);
  assert(opened._meta["relay/viewer"].token === token, "UI credential missing or changed.");
  assert(!JSON.stringify(opened.content).includes(token));
  assert(!(JSON.stringify(opened.structuredContent) ?? "").includes(token));
  const screenshot = await client.callTool({ name: "desktop_screenshot", arguments: {} });
  assert(!screenshot.isError);
  const image = screenshot.content.find((item) => item.type === "image");
  const png = Buffer.from(image.data, "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  console.log(`MCP: token confined to _meta; screenshot ${png.readUInt32BE(16)}×${png.readUInt32BE(20)}.`);

  const bridge = await readFile(new URL("./direct-ui.js", import.meta.url), "utf8");
  for (const resultFirst of [false, true]) {
    const parent = { postMessage() {} };
    let receive;
    let starts = 0;
    let reconnects = 0;
    const input = { value: "" };
    runInNewContext(bridge, {
      URL,
      Event,
      relayOrigin: origin,
      startViewer(stream) { assert(stream.token === token, "UI credential changed."); starts++; },
      document: {
        querySelector(selector) {
          if (selector === "#access-token") return input;
          if (selector === "#connection-panel") return { dispatchEvent() { reconnects++; } };
          return { textContent: "" };
        },
      },
      window: {
        parent,
        isSecureContext: true,
        addEventListener(name, handler) { if (name === "message") receive = handler; },
      },
    });
    const result = { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: opened };
    const ready = { jsonrpc: "2.0", id: 1, result: {} };
    receive({ source: {}, data: result });
    assert.equal(starts, 0, "Only the parent may supply credentials.");
    for (const data of resultFirst ? [result, ready] : [ready, result]) receive({ source: parent, data });
    receive({ source: parent, data: result });
    assert.equal(starts, 1, "Start once, regardless of message ordering.");
    assert.equal(reconnects, 0, "Duplicate results must not restart the stream.");
    const changed = { ...result, params: { _meta: { "relay/viewer": { url: origin, token: "b".repeat(64) } } } };
    receive({ source: parent, data: changed });
    assert.equal(reconnects, 1, "A changed session credential must reconnect the existing viewer.");
    assert(input.value === "b".repeat(64));
  }
  console.log("UI bridge: both message orders and duplicate results passed.");

  await new Promise((resolve, reject) => {
    const upgrade = request(new URL("/stream", origin), {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "Sec-WebSocket-Protocol": `nsl1, bearer.${token}`,
        Origin: "https://relay-test.claudemcpcontent.com",
      },
    });
    const timer = setTimeout(() => { upgrade.destroy(); reject(new Error("Stream handshake timed out")); }, 10000);
    upgrade.on("error", (error) => { clearTimeout(timer); reject(error); });
    upgrade.on("response", (response) => {
      clearTimeout(timer);
      response.resume();
      if ([409, 502, 503].includes(response.statusCode)) {
        console.log(`Stream: skipped (HTTP ${response.statusCode}, another viewer holds the session).`);
        resolve();
        return;
      }
      reject(new Error(`Stream returned HTTP ${response.statusCode}`));
    });
    upgrade.on("upgrade", (response, socket) => {
      clearTimeout(timer);
      assert.equal(response.statusCode, 101);
      socket.destroy();
      console.log("Stream: authenticated WebSocket accepts a foreign HTTPS Origin.");
      resolve();
    });
    upgrade.end();
  });
} finally {
  await client.close();
}
