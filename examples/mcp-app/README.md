# screen-relay MCP App

A prototype that shows a screen-relay desktop inside an MCP App. The resource embeds the built viewer directly and connects to the screen-relay server over WebSocket, so it does not need a nested iframe.

| File | Role |
| --- | --- |
| `server.ts` | Builds the server and serves it over stdio or streamable HTTP |
| `tools.ts` | Registers `open_desktop`, `desktop_screenshot`, `desktop_action`, and `browser_action` |
| `viewer.ts` | Registers the `ui://` resource and its CSP metadata |
| `direct-viewer.ts` | Adapts the built viewer bundle at request time |
| `direct-ui.js` | Bridges MCP messages to the embedded viewer |
| `config.ts` | Reads and validates the screen-relay origin and token |
| `host.ts` | Runs automation commands on the desktop host |

## Setup

Build screen-relay first (the prototype reads `dist/viewer/` and imports `dist/sdk/index.js`). Run the desktop in a Linux VM, container, or cloud sandbox, not on your host display.

```sh
npm run build
cd examples/mcp-app && npm install
```

## Run

Set the screen-relay origin. It must match the origin in the URL passed to `open_desktop`.

```sh
SCREEN_RELAY_ORIGIN=https://desktop.example.com SCREEN_RELAY_TOKEN="$SCREEN_RELAY_TOKEN" npm run start:http
```

The MCP endpoint is `http://localhost:3001/mcp`. Without `--http`, the server uses stdio.

In HTTP mode, each MCP session keeps its own state. `desktop_screenshot` captures the desktop that the same client opened with `open_desktop`, and returns `Call open_desktop first` to a client that hasn't opened one.

An idle session closes after 30 minutes, and a later request that carries its id returns `404 Session not found`. Set `MCP_SESSION_IDLE_MS` to change the timeout in milliseconds. A host that reconnects without closing its previous session does not keep that session alive.

The HTTP mode listens on loopback only, rejects any request whose `Host` is not this server, and rejects an `Origin` that is not served from this machine. That stops DNS rebinding from reaching the desktop tools while letting a local host such as `http://localhost:8080` connect.

For the ext-apps basic host:

```sh
cd /path/to/ext-apps/examples/basic-host
npm install && npm run start
```

Open `http://localhost:8080`, choose `open_desktop`, and call it with the viewer URL. Use `desktop_screenshot` afterwards to capture the same session.

Configure `SCREEN_RELAY_TOKEN` in the MCP server environment, then omit the `token` tool argument. The result carries the token only in `_meta`, not model-visible content. Supplying a token as a tool argument exposes it to the conversation.

## Claude rendering

The tested Claude host blocked a nested iframe, despite the resource declaring the screen-relay origin in `frameDomains`. The resource therefore declares the HTTPS and WSS origins in `connectDomains` and renders the viewer inline.

The adapter changes the built viewer in memory: it takes the token from the tool result, waits for MCP initialization, and targets the screen-relay origin explicitly. It retains the viewer's trusted-page check. Neither `viewer/` nor `src/` is changed. If the viewer bundle changes enough that the adapter cannot identify its startup code, resource loading fails with an error.

## Desktop and browser tools

Two tools drive the same host the stream comes from. `desktop_action` runs [agent-desktop](https://github.com/vercel-labs/agent-desktop), and `browser_action` runs [agent-browser](https://agent-browser.dev). Each takes an `args` array and returns the command's stdout and stderr.

By default the tools run on the machine that runs this server. When the desktop is elsewhere, set `SCREEN_RELAY_EXEC` to a JSON array that runs a command on the desktop host. The server appends the command and its arguments to it:

```sh
SCREEN_RELAY_EXEC='["docker", "exec", "relay", "--"]' npm run start:http
SCREEN_RELAY_EXEC='["ssh", "user@vm", "--"]' SCREEN_RELAY_EXEC_SHELL=1 npm run start:http
```

A hosting provider's own exec command works the same way. Set `SCREEN_RELAY_EXEC_SHELL=1` when the prefix passes the command through a shell on the host, as `ssh` does, so that each argument is quoted and a model-supplied argument cannot run as shell syntax.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCREEN_RELAY_EXEC` | Empty, run locally | JSON array prefix that runs a command on the desktop host |
| `SCREEN_RELAY_EXEC_SHELL` | Unset | `1` quotes each argument for a remote shell |
| `SCREEN_RELAY_ENV_WRAPPER` | `relay-env` | Path of the `relay-env` wrapper on the host |
| `SCREEN_RELAY_AGENT_BROWSER` | `agent-browser` | Path of agent-browser on the host |

Install both tools on the host, then copy the wrapper that loads the desktop environment:

```sh
npm install -g agent-desktop
npm install -g agent-browser
agent-browser install --with-deps
```

Copy `relay-env` to a directory on the host's `PATH`, or set `SCREEN_RELAY_ENV_WRAPPER` to its path, and make it executable. It reads `display`, `xauthority`, and the session D-Bus address from screen-relay's `session.json` before running a command, which is what lets these tools reach the running desktop.

It reads the session named by `SCREEN_RELAY_SESSION_NAME`, which defaults to `default`. Set it to the name you gave `screen-relay up --name` to reach a named desktop. The state directory comes from `XDG_STATE_HOME`, or from `$HOME/.local/state` when that is unset. Set `SCREEN_RELAY_STATE` to the full path of a `session.json` to read a file outside that layout. An invalid session name or an unreadable file exits with status 2 and a message on stderr naming the session or the path.

```json
{ "name": "desktop_action", "arguments": { "args": ["list-windows"] } }
{ "name": "browser_action", "arguments": { "args": ["open", "https://example.com"] } }
```

agent-desktop reads the accessibility tree, so it only sees apps that publish one. A GTK app started on the desktop bus with `GTK_MODULES=gail:atk-bridge` appears in `list-windows`; SDL games such as Doom never do. agent-browser controls its own headless Chrome, so it is unaffected by what the desktop shows.

## Verification

From this directory, with the server environment set:

```sh
node check.mjs
```

Alternatively, `SCREEN_RELAY_TOKEN_FILE` can point to the session's token file for the check. The check reads the resource through MCP, checks that credentials stay out of model-visible results, exercises both UI initialization orders, captures a screenshot, and tests a WebSocket upgrade with a foreign HTTPS Origin. It does not decode video or drive a browser.

The check passed against a cloud sandbox with a 1280×720 screenshot, including after a fresh screen-relay build. In Claude Desktop's Code chat, the resource rendered inline, reported `Live · click to control`, and displayed the sandbox desktop. Its generated frame policy included both configured connection origins. Codex rendered the same resource inline at 1280×720.

The direct viewer's optional capabilities and metrics fetches are cross-origin and remain subject to the engine's CORS policy. WebSocket streaming does not use that HTTP CORS flow. Mouse and keyboard, fullscreen, and clipboard still need host testing; the viewer source currently has no clipboard integration.
