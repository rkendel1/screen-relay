# Screen Relay Lab (native composition)

The Screen Relay Lab, rebuilt with Screen Relay as an AppPort provider that FeltKit composes. Compare it with
`../screen-relay-lab`, the baseline that wraps the SDK by hand.

```ts
// feltkit/app.ts
providers: {
  desktop: { module: "@appport/screen-relay/provider", export: "screenRelayProvider", config: { url: "http://127.0.0.1:8080" } },
},
```

The provider's capabilities (`desktop.display.describe`, `desktop.screenshot.capture`, `desktop.input.pointer`,
`desktop.input.keyboard`, `desktop.stream.view`, `desktop.stream.control`) join the app's own, so the app's roles
authorize them on every surface:

- The browser calls them with `client.invoke`.
- The app's actions call them with `ctx.integrations.invoke`.
- FeltKit records every input before it is sent, with its outcome.
- The stream is the provider's channel on the app's own port, opened with a single-use grant that a viewer cannot use
  to take input. `attachStream` from `@appport/screen-relay/viewer` renders it.

What the app itself contains is its own logic: the fixture check (`feltkit/lab.ts`) and the evidence it keeps.

## Run it

This needs FeltKit with `feltkit({ providers })`, `@appport/core` with providers, and `@appport/screen-relay` with
its provider export. None is published yet. Install local builds with `npm install --no-save <tarballs>`.

```bash
screen-relay up -d
./fixture/open.sh
npm run dev
```

Open the printed URL, choose **Start stream**, then **Run fixture check**. A pass reads
`Fixture passed: ready → success`.

```bash
npm test               # authorization and failure handling
LAB_LIVE=1 npm test    # also runs the fixture against the running desktop, then restarts the app
```
