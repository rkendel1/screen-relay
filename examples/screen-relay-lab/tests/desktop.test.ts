/**
 * Run with `npm test`. The live test operates a real Screen Relay desktop: start one with `screen-relay up -d`,
 * open the fixture with `fixture/open.sh`, then run `LAB_LIVE=1 npm test`. Without LAB_LIVE it is skipped, never faked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "@feltdb/feltkit/testing";
import { api } from "../feltkit/_generated/api.js";

const live = process.env.LAB_LIVE === "1";

test("observers read but cannot operate the desktop; anonymous callers can do neither", async () => {
  const t = await createTestApp();
  try {
    const grace = t.as("grace");
    await grace.query(api.desktop.overview);
    await assert.rejects(grace.action(api.desktop.connect), { code: "FORBIDDEN" });
    await assert.rejects(grace.action(api.desktop.click, { connectionId: "x", x: 0.5, y: 0.5 }), { code: "FORBIDDEN" });
    await assert.rejects(grace.mutation(api.desktop.recordInput, { connectionId: "x", kind: "click", detail: {}, ok: true }), { code: "FORBIDDEN" });
    await assert.rejects(t.query(api.desktop.overview), { code: "UNAUTHORIZED" });
  } finally {
    await t.close();
  }
});

test("an unreachable engine fails the connection and records why", async () => {
  const saved = process.env.SCREEN_RELAY_URL;
  process.env.SCREEN_RELAY_URL = "http://127.0.0.1:9";
  const t = await createTestApp();
  try {
    await assert.rejects(t.as("ada").action(api.desktop.connect), { code: "UNAVAILABLE" });
    const { connections } = await t.as("ada").query(api.desktop.overview);
    assert.equal(connections[0]!.state, "failed");
    assert.match(connections[0]!.error!, /unreachable/);
  } finally {
    if (saved === undefined) delete process.env.SCREEN_RELAY_URL; else process.env.SCREEN_RELAY_URL = saved;
    await t.close();
  }
});

test("a FeltKit app operates a real Screen Relay desktop and keeps the evidence", { skip: live ? false : "set LAB_LIVE=1 with a running desktop and the fixture open" }, async () => {
  const t = await createTestApp();
  try {
    const ada = t.as("ada");
    const connectionId = await ada.action(api.desktop.connect);
    const overview = await ada.query(api.desktop.overview);
    assert.equal(overview.connections[0]!.state, "connected");
    assert.equal(overview.stream.available, true);

    const result = await ada.action(api.desktop.runFixture, { connectionId });
    assert.deepEqual({ passed: result.passed, initial: result.initial, final: result.final }, { passed: true, initial: "ready", final: "success" });

    await ada.mutation(api.desktop.disconnect, { connectionId });
    await assert.rejects(ada.action(api.desktop.click, { connectionId, x: 0.5, y: 0.5 }), { code: "FAILED_PRECONDITION" });

    await t.restart();
    const shots = await t.as("grace").query(api.desktop.screenshotList, { connectionId });
    assert.deepEqual(shots.map((shot) => shot.label).sort(), ["fixture-after", "fixture-before"]);
    for (const shot of shots) {
      assert.ok(shot.bytes > 1000 && shot.width > 0 && shot.height > 0 && shot.url.startsWith("/api/files/"));
    }
    const history = await t.as("grace").query(api.desktop.history, { connectionId });
    const types = history.map((event) => event.type);
    assert.deepEqual(types, [
      "session.connected", "input.key", "screenshot.captured", "input.click", "input.type", "input.click",
      "screenshot.captured", "fixture.passed", "session.disconnected",
    ]);
    assert.ok(history.every((event) => event.actor === "ada"));
    assert.doesNotMatch(JSON.stringify(history), /ticket|token|bearer/i);
  } finally {
    await t.close();
  }
});
