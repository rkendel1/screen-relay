# Screen Relay Lab

A small FeltKit application that consumes `@appport/screen-relay` as a desktop provider. It connects to a running Screen Relay desktop, shows its live stream, clicks and types on it, takes screenshots, and keeps every interaction as evidence in its FeltDB instance.

It is an integration test of the package, not a product. Run it only on a trusted machine: see [Security limits](#security-limits).

## What it proves

| Question | How the lab answers it |
| --- | --- |
| Can FeltKit consume the package? | The app imports the SDK (`@appport/screen-relay`) on the server and the protocol module (`@appport/screen-relay/protocol`) in the browser, and builds with `feltkit build`. |
| Can the app operate a real desktop? | The fixture check reloads a test page on the desktop, types a known value, submits it, and reads the result from a screenshot. |
| Can the result be reviewed later? | Connections, input events, and screenshots are stored in FeltDB and FeltKit Files, and survive an app restart. |

## Run it

You need Node 22 or later, a Linux machine that runs Screen Relay, and a browser with WebCodecs H.264 (current Chrome, Edge, or Safari).

1. Start a desktop on loopback and open the fixture on it:

   ```bash
   screen-relay install --yes
   screen-relay up -d
   ./fixture/open.sh
   ```

   `open.sh` uses `screen-relay run` to open `fixture/index.html` full screen in Chrome or Chromium. Set `LAB_BROWSER` to pick another browser.

2. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

   Until `@appport/screen-relay` is on npm, `npm install` cannot find it. Run `npm pack` in the screen-relay repository, then install from the tarball instead. This installs every dependency and changes neither `package.json` nor a lockfile:

   ```bash
   npm install --no-save /path/to/appport-screen-relay-0.1.2.tgz
   ```

3. Open the app URL that `npm run dev` prints, choose **Connect**, then **Run fixture check**. A pass reads `Fixture passed: ready → success`, and the Evidence section shows the before and after screenshots and every step.

The app reaches the engine at `SCREEN_RELAY_URL` (default `http://127.0.0.1:8080`). For an engine with a token, set `SCREEN_RELAY_TOKEN_FILE`; the token stays on the server, and the browser stream is then turned off.

## Tests

```bash
npm test                 # authorization and failure handling
LAB_LIVE=1 npm test      # also runs the fixture against the running desktop, then restarts the app
npm run typecheck
npx feltkit build
```

Without `LAB_LIVE=1`, the live test is reported as skipped.

## How it is built

| Part | Where | What it does |
| --- | --- | --- |
| Provider module | `feltkit/_relay.ts` | The only code that calls Screen Relay: `createClient` for `capabilities`, `screenshot`, `click`, `type`, and `key`, and `socketTarget` for the stream address. Engine errors become FeltKit errors that keep the engine's reason. |
| Actions | `feltkit/desktop.ts` | `connect`, `click`, `type`, `key`, `screenshot`, and `runFixture` are `app.action` functions: they talk to Screen Relay and write state only through mutations, as the caller. Each checks that the connection is open before it reaches the engine. |
| Records | `feltkit/desktop.ts` | Mutations store connections, screenshots (bytes in FeltKit Files, metadata in FeltDB), and an audit trail per connection (`app.auditTrail`), with the actor, request ID, and order FeltDB assigns. |
| Stream | `src/DesktopStream.tsx` | The browser opens the engine's `/stream?view=1` WebSocket with the `nsl1` subprotocol, decodes H.264 with WebCodecs, and acknowledges each drawn frame with `encodeAck`. Video never passes through FeltKit or FeltDB. |
| Fixture | `fixture/index.html`, `feltkit/_fixture.ts` | A page with an input, a button, a counter, and a banner whose color encodes its state. The check reads the banner color from screenshots, so the result needs no text recognition. |

Roles: `operator` (Ada in development) connects and operates the desktop; `observer` (Grace) reads the session and evidence and is refused every operation.

## Security limits

- **Local only.** The browser stream is offered only for a loopback engine without a token. The engine accepts that stream from any loopback page, so the app's roles decide who is shown the stream, not who can open it.
- **No tickets.** The app never requests engine tickets. A ticket opens any WebSocket, including one that controls input, so the lab does not hand one to a browser as if it were view-only.
- **Evidence is written by mutations that operators can call.** FeltKit has no internal functions, so an operator could call `recordInput` or `recordScreenshot` directly. A screenshot record still requires real PNG bytes stored through Files.
- **No process launching.** The app cannot start programs. `fixture/open.sh` is a test harness step run by a person.
