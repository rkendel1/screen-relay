# Screen Relay in FeltKit: integration and composition audit

This is an integration audit of the FeltKit and AppPort developer experience, with `@appport/screen-relay` as the test instrument. It records what composes today, what the probe application had to hand-write, where each piece of that glue belongs, and the smallest set of changes that would remove it for every AppPort package, not only this one.

Status: the approved changes are implemented on branches and verified against a real desktop; nothing is published. See [Implementation status](#implementation-status). The assessment below is the baseline it was measured against.

## Implementation status

Decisions G-1 (grants in existing AppPort packages) and G-2 (declarative provider composition in FeltKit) were approved, along with the external execution model. Work is on branch `claude/youthful-lamport-kpv4gw` in each repository.

| Change | Repository | Commits | Evidence |
| --- | --- | --- | --- |
| AP-1: `ChannelRef`, `AccessGrantToken`, schema builders | `rkendel1/appport` (`packages/protocol`, `packages/schema`) | `2e6a57d` | Protocol and schema tests; a channel reference rejects any secret field |
| AP-1: access grants, `AccessGrantStore`, memory store, conformance suite | `rkendel1/appport` (`packages/core`, `packages/testing`) | `2e6a57d` | 8 conformance cases: digest-only storage, single redemption among 16 or 32 concurrent attempts, replay, expiry, revocation, mismatch without consumption |
| Provider contract and external effect lifecycle | `rkendel1/appport` (`packages/core/src/providers.ts`) | `bad8ea2`, `36e3c26`, `375d6f2` | 13 tests through `createApplication`: authorization before the provider runs, started before the effect, effect not attempted when the start cannot be recorded, failed versus unknown, an unattributable effect refused |
| Provider channels | `rkendel1/appport` | `f4b4d75` | 3 tests: reference and grant kept separate, a view grant does not satisfy control |
| SR-1: Screen Relay provider | `rkendel1/screen-relay` (`src/app/provider.ts`, export `./provider`) | `8eb0457`, `f6403e3` | 5 tests, 2 against a real engine: describe, screenshot, click, type; a view grant streams without holding input, a replayed grant is refused, a control grant holds input |
| SR-2: viewer export; SR-5: encoder types | `rkendel1/screen-relay` (`src/stream/attach.ts`, export `./viewer`) | `8eb0457` | Used by the native lab in Chrome |
| FK-1, FK-2, FK-5: `feltkit({ providers })` | `rkendel1/feltkit` (`src/providers.ts`, `src/runtime/providers.ts`) | `77eaa86`, `a21f1ec` | 8 tests: manifest, roles, recorded effects, failed versus unknown (`OUTCOME_UNKNOWN`, as integrations), action path, restart, missing credential |
| FK-6: channel endpoint and FeltDB grant store | `rkendel1/feltkit` (`src/runtime/access-grants.ts`, `/_provider/<name>/<channel>`) | `77eaa86`, `a21f1ec` | AppPort's grant conformance on both FeltDB storage kinds (16 cases); a channel opened over HTTP, redeemed once, refused without or with a used grant |
| FK-8: `client.invoke` and `POST /api/capability/<name>` | `rkendel1/feltkit` | `77eaa86`, `a21f1ec` | Covered by the channel test; roles refuse an observer |
| Native lab | `rkendel1/screen-relay` (`examples/screen-relay-lab-native`) | `3161071`, `3f2df8a` | Live test and Chrome run below |

### Suites

| Repository | Baseline | Branch |
| --- | --- | --- |
| `rkendel1/appport` (vitest, all packages) | Full suite not run on a clean checkout; protocol, core, and testing at `ab6e49d`: 712 passed | 1,972 passed, 1 skipped; boundary check passes |
| `rkendel1/feltkit` (`npm test`, node and conformance) | 848 tests: 836 passed, 0 failed, 3 skipped (clean worktree at `0662d20`) | 856 tests: 844 passed, 0 failed, 3 skipped; `npm run typecheck` passes |
| `rkendel1/screen-relay` (`npm test`) | 151 passed, 11 skipped | 158 passed, 13 skipped (the 2 live tests run with `RELAY_LIVE=1` and pass) |

### End-to-end evidence

Against a real X11 desktop (Ubuntu 24.04, 1280×720), the native lab, started with `npm run dev`:

- Operator: `desktop.stream.view` returned a channel and a grant; the browser streamed from `ws://localhost:3000/_provider/desktop/stream` (153 distinct colors sampled; the engine was never contacted from the browser). The fixture passed (`ready → success`) through `desktop.input.*`; a click and typing through the UI reached the desktop.
- Observer: the stream went live with her own view grant; her click was refused with "Missing permission: desktop.control".
- Engine stopped: the page showed "Unavailable" with "Screen Relay unreachable: Connection refused." and offered no stream.
- `LAB_LIVE=1 npm test`: the fixture passed, and the screenshots and the `fixture.passed` record survived `restart()`, with no grant, token, or ticket in them.

### Baseline compared

Non-blank, non-comment lines the application owns, excluding the fixture and its check (24 lines, identical):

| | Baseline lab | Native lab |
| --- | ---: | ---: |
| Provider module, actions, record mutations, stream viewer, app definition | 353 | 91 |
| UI (`App.tsx`) | 149 | 165 |

What moved out of the application: the provider module and record mutations (into `@appport/screen-relay/provider` and FeltKit's provider host and call records), the 86-line stream decoder (into `@appport/screen-relay/viewer`), the invented connection model, and the loopback-only stream (replaced by a grant-scoped channel on the app's port). About 10 of the remaining 91 lines are still glue: the base64 screenshot handoff (FK-4) and turning a relative channel URL into a WebSocket URL.

### New findings while implementing

| ID | P | Category | Finding | Status |
| --- | --- | --- | --- | --- |
| FK-8 | P1 | FeltKit platform gap | The browser client could call functions but not an AppPort capability by name; in cookie mode it holds no token for `/appport` | Fixed: `client.invoke`, `POST /api/capability/<name>` |
| FK-9 | P2 | FeltKit platform gap | An app with no collections of its own cannot start (FeltDB needs one), even when providers do all its work | Open; documented in `docs/PROVIDERS.md` |
| FK-10 | P3 | FeltKit platform gap | `feltkit build` and `feltkit dev` reported "0 capabilities" for an app whose capabilities come from providers | Fixed (rkendel1/feltkit#148) |
| FK-11 | P2 | FeltKit platform gap | Functions cannot read provider call records (`_feltkit_provider_calls`); only Studio and inspect can | Open |
| FK-12 | P0 | Cross-layer gap | An app that declares a provider cannot build for AppBoundry | FeltKit side fixed (rkendel1/feltkit#148); AppBoundry host side open |
| AP-4 | P1 | AppPort package gap | Core dispatched an in-process request without a `requestId`, so two external effects recorded under the same key | Fixed: `begin()` refuses an unattributable effect |
| AP-5 | P2 | AppPort package gap | `effectFailed` crossed copies of `@appport/core` only by `instanceof` | Fixed: a registry symbol |

Status of the original register: SR-1, SR-2, SR-5, AP-1, FK-1, FK-2, FK-5, FK-6 are done. SR-3 (engine ticket scopes) is designed, not implemented: the provider relay already enforces view and control at the boundary, and engine scopes remain defense in depth. SR-4, FK-3, FK-4, FK-7, AP-2, AP-3 are open.

### Pre-release closeout (2026-11-19)

The first implementation was merged as rkendel1/appport#294, rkendel1/feltkit#147, and rkendel1/screen-relay#5. The closeout PRs carry what those did not:

| PR | Contents |
| --- | --- |
| rkendel1/appport#295 | Provider channels (`f4b4d75`). FeltKit's and Screen Relay's `main` already import it, so it merges first |
| rkendel1/feltkit#148 | FK-12 (FeltKit side), FK-4, FK-10 (`e9e3724`) |
| rkendel1/screen-relay (this branch) | The native lab on the final declaration; this closeout |

| Finding | Status | Release impact |
| --- | --- | --- |
| FK-12 | FeltKit side fixed: providers are declared by module (`{ module, export?, config?, credentials? }`), never imported into the app's definition, and an AppBoundry build refuses them by name. Running providers in an AppBoundry deployment needs the AppBoundry host to run provider code beside the guest; the published host (`@appport/appboundry` 1.13.0) implements no companion execution, not even `components@1` | Blocks providers on AppBoundry only. Shipping them as FeltKit-server-only, as actions are, is the release owner's decision |
| FK-4 | Fixed: `ctx.services.files` in actions, and actions bound for service authorization. The lab's base64 handoff is gone | None |
| FK-10 | Fixed: dev banner, build summary, Studio count provider capabilities (the lab reports 6) | None |
| FK-9 | Open: an app needs one collection of its own. Every provider app that keeps evidence has one | Track |
| FK-11 | Open: functions cannot read `_feltkit_provider_calls`. Studio and inspect can; applications keep their own business evidence, as the lab does | Track |
| SR-3 | Open, defense in depth | None (see below) |

**SR-3 and the browser path.** In a composed application the browser's only way to the desktop is the provider relay: the app publishes no engine URL or token, `desktop.stream.view` issues a view-scoped grant redeemed at `/_provider/<name>/stream`, and the relay opens `/stream?view=1` server side for it, so a view grant cannot take input whatever the engine's tickets allow (tested against a real engine). The engine's own viewer on loopback is a separate, unchanged path for a person on the desktop machine, and an engine with a token refuses any browser without one. Engine ticket scopes would harden direct custom clients; they do not gate the composed path.

### Release matrix

Every version below is free on npm. All three releases are now prepared on their branches (versions bumped, pins and ranges set, changelogs written), and none is published.

**1. AppPort** (one release of all 18 packages with exact internal pins, `PUBLISHING.md`):

| Package | Published | Prepared | Why |
| --- | --- | --- | --- |
| `@appport/protocol` | 1.5.0 | 1.6.0 | Additive: `ChannelRef`, `AccessGrantToken` |
| `@appport/schema` | 1.1.6 | 1.2.0 | Additive: `s.channel()`, `s.accessGrant()` |
| `@appport/core` | 1.8.0 | 1.9.0 | Additive: access grants, providers, channels |
| `@appport/testing` | 1.2.6 | 1.3.0 | Additive: `runAccessGrantStoreConformance` |
| `@appport/authorization` | 1.2.0 | 1.2.1 | Re-pin only |
| `@appport/client` | 1.1.8 | 1.1.9 | Re-pin only |
| `@appport/contract-builder` | 1.1.6 | 1.1.7 | Re-pin only |
| `@appport/generators` | 1.0.10 | 1.0.11 | Re-pin only |
| `@appport/integration` | 1.2.5 | 1.2.6 | Re-pin only |
| `@appport/mcp` | 1.3.9 | 1.3.10 | Re-pin only |
| `@appport/mobile` | 1.0.12 | 1.0.13 | Re-pin only |
| `@appport/sdk` | 1.9.0 | 1.10.0 | Additive: re-exports `ChannelRef`, `AccessGrantToken` and their guards |
| `@appport/server` | 1.3.3 | 1.3.4 | Re-pin only |
| `@appport/transport-electron` | 1.0.16 | 1.0.17 | Re-pin only |
| `@appport/transport-http` | 1.1.8 | 1.1.9 | Re-pin only |
| `@appport/transport-inprocess` | 1.0.16 | 1.0.17 | Re-pin only |
| `@appport/transport-tauri` | 1.0.12 | 1.0.13 | Re-pin only |
| `@appport/transport-websocket` | 1.0.12 | 1.0.13 | Re-pin only |

Prepared in appport#295 (`57b620a`): `@appport/core` exports providers and access grants from its public entry, and `RELEASE_NOTES.md` has the release set entry. Gates: build, full suite (1,972 tests), `boundary:check`, audit, `release:check` (18 tarballs), `release:verify-install`, and `release:pack` pass; publishing all 18 to a local registry and `release:verify-registry` against it pass.

**2. FeltKit** `@feltdb/feltkit` and `create-feltkit`: 0.3.32 is `latest` and 0.3.33 is published under `pending`, so the next free version in its patch-release practice is **0.3.34**. A minor (0.4.0) would also be defensible for a new public option; it is the maintainer's call. Its `@appport/*` dependencies are exact pins: `@appport/core` 1.8.0 → 1.9.0, `@appport/protocol` 1.5.0 → 1.6.0, `@appport/schema` 1.1.6 → 1.2.0, `@appport/authorization` 1.2.0 → 1.2.1, `@appport/integration` 1.2.5 → 1.2.6, `@appport/sdk` 1.9.0 → 1.10.0, `@appport/server` 1.3.3 → 1.3.4 (dev: `@appport/testing` 1.2.6 → 1.3.0), so it never installs a second copy of core beside a provider's. Prepared in feltkit#148 (`fd8d6f8`) as the publish script writes it. Against the local registry: build and examples pass; the full suite passes except the single-copy test (below), plus one timing failure under full-suite load that passes alone and in three full-file runs.

**AuthBoundry must release against AppPort 1.9 before FeltKit can publish.** `@authboundry/core` 1.20.0 (through FeltKit's dev and optional peer `@authboundry/local`) pins `@appport/core` 1.8.0 exactly, so a second AppPort copy stays in FeltKit's tree. FeltKit's single-copy test and `test:release` both fail on it, and `test:release` refuses a root override ("align the dependency upstream"). AuthBoundry tracks AppPort this way: 1.19.0 pinned `@appport/core` 1.8.0 the day 1.8.0 shipped. A consumer app without `@authboundry/local` installs one copy of each (verified below).

**3. Screen Relay** `@appport/screen-relay`: never published. Prepared as **0.2.0** in screen-relay#6 (`0681a95`): the package adds the `./provider` and `./viewer` exports. The 0.1.2 entry is restored to what upstream `screen-relay@0.1.2` shipped, and the rename and #1 changes, which never shipped, move to 0.2.0. Typecheck and tests (158 pass, 13 skipped) and the version sync check pass; the provider bundle imports AppPort as a peer, so it shares the host's single instance. Optional peer ranges become `@appport/core` `^1.9.0`, `@appport/protocol` `^1.6.0`, `@appport/schema` `^1.2.0` (dev dependencies to the same exact versions). The `screen-relay` npm name remains upstream's.

**Merge and publish order:** appport#295 → publish AppPort → AuthBoundry release pinning `@appport/core` 1.9.0 → FeltKit `npm install` (refresh the lockfile from npm, commit if it changed), CI green, merge feltkit#148 → publish FeltKit → screen-relay#6 CI green, merge → publish → clean consumer test from npm in a fresh FeltKit app.

**Consumer rehearsal (local registry, no tarballs or links):** `npm create feltkit@0.3.34`, then `npm install @appport/screen-relay`, installs one copy each of `@appport/core` 1.9.0, `@appport/protocol` 1.6.0, `@appport/schema` 1.2.0. The native lab installed the same way passes `LAB_LIVE=1 npm test` against the real desktop (authorization, honest engine-down failure, fixture ready → success, evidence after restart), and `feltkit build --target appboundry` refuses its provider by name.

### Release order and remaining blockers

1. AppPort publishes all 18 packages. Until then, FeltKit's and Screen Relay's CI fail: they install from npm, which does not have the pinned versions.
2. AuthBoundry releases with `@appport/core` 1.9.0.
3. FeltKit publishes 0.3.34 with `feltkit({ providers })`.
4. `@appport/screen-relay` publishes 0.2.0. Its Release workflow uses npm trusted publishing, which must be configured for the package on npmjs.com; if npm still requires the package to exist first, the first publish is manual.

No package was published to npm.



## Sources

Every finding cites source at these revisions:

| Repository | Revision | Inspected |
| --- | --- | --- |
| `rkendel1/screen-relay` | `23def5c` | `src/protocol`, `src/sdk`, `src/engine/server`, `viewer/`, `examples/screen-relay-lab` |
| `rkendel1/feltkit` | `0662d20` | `packages/sdk/src` (`app.ts`, `component.ts`, `runtime/`, `server/`), `docs/COMPONENTS.md` |
| `rkendel1/appport` | `ab6e49d` | `packages/*/src`, `spec/appport-1.0.md` |
| `rkendel1/appport-services` | `c81d7d4` | `src/files`, `src/extensions`, `src/runtime/dsl.ts`, `packages/runtime` |
| npm `@appport/github` 1.0.2 | published | `README.md`, `package.json` |

The probe is `examples/screen-relay-lab`, built against the 0.1.2 release tarball. It ran against a real Screen Relay desktop (X11, 1280×720) on Ubuntu 24.04: the fixture check passed through the app's actions, through its UI in Chrome, and again after the desktop was restarted; evidence survived an app restart; a stopped engine was reported as a failed connection.

## A. Executive assessment

**Does Screen Relay integrate naturally with FeltKit today?** No. It works, but only because the application hand-built the integration. Screen Relay is consumed as a plain Node SDK and a browser protocol library, not as an AppPort package: it publishes no capabilities, and FeltKit has no mechanism to consume another package's capabilities even if it did.

**What works without modification:**

- Installing the tarball into a FeltKit app; both export paths (`@appport/screen-relay`, `@appport/screen-relay/protocol`) import and bundle under `feltkit dev` and `feltkit build` with no special treatment.
- The SDK from a FeltKit `app.action`, and the protocol module in the browser.
- FeltKit's own state, Files, audit trail, roles, and test harness (`createTestApp`, `restart()`).

**What requires application glue** (measured in [section D](#measured-integration-surface)): an application-owned provider module, a hand-written H.264 stream viewer, six evidence-writing mutations that exist only so actions can write, a connection model the app invents because Screen Relay has no session identity, base64 transport of screenshots between an action and a mutation, and environment-variable configuration with a token read from disk.

**What cannot be done today:**

- Expose desktop operations as AppPort capabilities from a FeltKit app. FeltKit actions are not capabilities (`app.ts:1299`), `app.integration` is JSON-only (`runtime/integrations.ts:345,559`), and a mutation must not call out.
- Show the stream to a browser without either loopback-only access or handing the browser an engine ticket that also grants control (`src/engine/server/server.cpp:479`).
- Keep evidence unforgeable: FeltKit has no internal functions, so the mutations actions write through are callable by any operator.

**The most important architectural friction:** there is no *composition* path. An AppPort package can neither contribute capabilities to a FeltKit application nor run a provider beside it, so every package integration becomes application code. Second: AppPort deliberately leaves out-of-band transfer to "the application or an extension" (`spec/appport-1.0.md` §14.3), and three layers have since each built their own short-lived access grant.

## B. Current architecture

```
browser ──AppPort JSON (HTTP/WS)──► FeltKit server ──► actions ──SDK HTTP──► Screen Relay engine
   │                                    │                                        ▲
   │                                    └─ mutations ─► FeltDB (+ Files bytes)    │
   └────────── NSL1 binary WebSocket, loopback, no auth ───────────────────────────┘
```

| Concern | Today | Source |
| --- | --- | --- |
| Package dependencies | Lab → `@feltdb/feltkit` (→ `@appport/sdk`, `server`, `services`, `express`), `@appport/screen-relay`, `pngjs` | `examples/screen-relay-lab/package.json` |
| Capability contracts | None. Screen Relay has no AppPort capabilities; the lab's functions publish none (`feltkit build`: "0 capabilities") | build output |
| Runtime execution | `app.action` calls the SDK, then `ctx.runMutation` records | `feltkit/desktop.ts` |
| Provider implementation | Engine binary per platform; SDK over `GET /capabilities`, `GET /screenshot.png`, `POST /input` | `src/sdk/index.ts:203` |
| Transport | Control: FeltKit's AppPort JSON. Media: engine NSL1 WebSocket straight from the browser | `src/DesktopStream.tsx` |
| Authorization | FeltKit roles gate functions. The stream itself is unauthenticated: the engine accepts any loopback origin without a token | `src/engine/server/config.cpp:215-217` |
| Durable state | `connections`, `screenshots`, `events` (audit trail), file bytes in FeltKit Files | `feltkit/app.ts` |
| Ephemeral state | The engine's frames, input queue, single input owner | `src/engine/server/server.hpp` |

## C. Integration walkthrough

**What a developer does today** (as the lab did):

1. Scaffold with `npm create feltkit`, delete the starter domain.
2. Install `@appport/screen-relay` (a tarball until it is published).
3. Write a provider module that reads `SCREEN_RELAY_URL` and a token file with `node:fs`, builds an SDK client per call, and maps `RelayError` reasons to FeltKit error codes.
4. Write actions for each operation, plus a mutation per thing an action must record, plus a query so actions can check state before acting.
5. Invent a connection record, because the engine has no session identity.
6. Base64-encode screenshots to pass them from an action to a mutation, because actions have no Files access.
7. Annotate action return types to break a circular type inference through `_generated/api`.
8. Write a WebCodecs H.264 viewer against the protocol module, because the engine's viewer refuses framing and the package exports no viewer.
9. Accept that the stream works only on loopback, or design a ticket scheme.

**What it should look like:**

1. `npm create feltkit`, `npm install @appport/screen-relay`.
2. Declare the package in `feltkit/app.ts`, with the credential reference and the roles that may view and control.
3. Write the application's own logic: the fixture check, what evidence it keeps, the UI.
4. Render the stream with a component the package exports, given a channel reference a capability returned.

## D. Gap register

### Measured integration surface

Non-blank, non-comment lines in the lab:

| File | Lines | What it is | Belongs in |
| --- | ---: | --- | --- |
| `feltkit/_relay.ts` | 40 | Credential and engine address, client construction, error mapping, stream address policy | Screen Relay (provider) and FeltKit (credentials) |
| `feltkit/desktop.ts` | 185 | 6 actions, 6 mutations, 4 queries. About 70 lines are record mutations and the open-connection check that exist only because actions cannot write or hold internal functions | Mostly platform; the fixture flow and evidence choices are the application's |
| `src/DesktopStream.tsx` | 86 | WebCodecs decoder, frame ACKs, reconnect | Screen Relay |
| `feltkit/app.ts` | 42 | Roles, collections, audit trail | Application, except the `connections` model (Screen Relay session identity) |
| `feltkit/_fixture.ts`, `fixture/`, `tests/`, `src/App.tsx` | 277 | Test fixture, checks, UI | Application |

Counts: 2 packages wired by hand (SDK on the server, protocol in the browser); 4 lifecycle responsibilities in application code (connect, disconnect, liveness check before input, stream reconnect); 3 custom authorization or transport decisions (loopback-only stream, refusing tickets, role-gated record mutations); 3 representations of one desktop session (engine supervisor state, the app's `connections` row, the browser's socket).

### Register

Priorities: P0 blocks a native integration; P1 is repeated friction every AppPort package will hit; P2 is friction specific to this package; P3 is cosmetic.

| ID | P | Category | Current behavior and evidence | Expected behavior | Owner | Required change | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FK-1 | P0 | FeltKit platform gap | `feltkit({…})` accepts `services` and `components` but nothing that consumes another AppPort package's capabilities (`app.ts` options). The `use` DSL exists only in AppPort Services and accepts only its six built-in services (`appport-services/src/runtime/dsl.ts:60`). `@appport/github` documents `use github` as the shared syntax but validates it with its own `parseGitHubCapabilityDeclaration` (`dist/src/dsl.d.ts`) and composes through its own factory, so each package re-implements the composition syntax, and FeltKit reads none of it. | An application declares an AppPort package and its capabilities join the application's manifest, authorized by the application's roles. | FeltKit | A `providers` declaration that mounts a package's `@appport/core` capability definitions into the application's AppPort registry, with the application's authorizer and principal. Depends on SR-1. | A FeltKit app declaring the package lists its `desktop.*` capabilities at `/.well-known/appport` and refuses an observer's `desktop.input.pointer` with FORBIDDEN, with no application function written. |
| FK-2 | P0 | FeltKit platform gap | Actions are "not an AppPort capability" (`app.ts:1299`); `app.integration` is JSON-only (`runtime/integrations.ts:345,559`); mutations must not call out (feltkit-build skill). A consequential external effect over a non-JSON API cannot be a capability. | A capability can perform an external effect, with FeltKit's evidence and unknown-outcome rules. | FeltKit | Allow a provider's capability handlers (FK-1) to run outside the transaction like actions, and record their outcome as evidence. Reuse the outcome model components already have (`ComponentWorkOutcome`: done, failed, unknown). | `desktop.input.pointer` invoked through `/appport` clicks the real desktop and leaves an evidence record with the outcome. |
| FK-3 | P1 | FeltKit platform gap | No internal functions (`FunctionConfig` has no visibility option). Mutations an action writes through are callable by any holder of their permission, so evidence can be forged. | Functions callable only from the application's own actions or components. | FeltKit | `visibility: "internal"` on queries and mutations: refused at every public surface (HTTP, AppPort, MCP), allowed from `ctx.runQuery`, `ctx.runMutation`, and `ctx.call`. | An operator calling `desktop:recordInput` directly gets NOT_FOUND; the action path still records. |
| FK-4 | P1 | FeltKit platform gap | `ActionCtx` has no `services` (`runtime/context.ts`, interface ActionCtx), so an action cannot store bytes; the lab base64-encodes a ~440 KB argument into a mutation. Upload links are relative (`/api/files/<token>`, `runtime/services.js` uploadLink), so an action cannot use them either. | An action stores a file it produced. | FeltKit | `ctx.services.files` (writer) on `ActionCtx`, as the caller, outside any transaction, as Files effects already are. | An action uploads a PNG and a mutation binds its id; no base64 argument. |
| FK-5 | P1 | FeltKit platform gap | Actions cannot read custody credentials; only integrations (`credential-ref:`) and components (`ctx.credential`) can. The lab reads a token file with `node:fs`. | Provider code reads a declared credential from custody. | FeltKit | Resolved by FK-1: a provider declaration names its credentials, as a component's does. No separate action API. | The engine token is set with `feltkit credential` and never appears in application code or environment variables the app reads. |
| FK-6 | P2 | FeltKit platform gap | A component's `entry` must be a project path outside `feltkit/` (`component.ts`, `validateComponents`), so a package cannot ship one; a component cannot resolve the FeltKit session of an inbound request, so it authenticates its own traffic (`docs/COMPONENTS.md`, Routes). | A package-provided runtime part, and inbound routes that know the caller. | FeltKit | Allow `entry` to name a package export. Give `ComponentContext` a way to redeem an access grant (AP-1) issued by a function that authorized the caller. | A component from `@appport/screen-relay` serves the stream on the app's port and refuses a request without a valid grant. |
| FK-7 | P3 | FeltKit platform gap | An action whose result type flows through `api.<module>` in its own module fails inference (`TS2339` in `desktop.ts`); the lab annotates return types. | Inference works, or codegen documents the annotation. | FeltKit | Codegen types action results from declared `returns` when present; document the cycle otherwise. | The lab compiles with the annotations removed. |
| SR-1 | P0 | Screen Relay package gap | The package exports an SDK and a protocol library; no AppPort capability definitions or manifest. | `desktop.*` capabilities defined with `@appport/core`, implemented by the engine adapter. | Screen Relay | The planned extraction (`architecture/appport-extraction.md`, G-2, G-3): `src/app/` with the catalog there. Depends on nothing. | Conformance: the capabilities pass `@appport/testing`'s transport suite in process against a real engine. |
| SR-2 | P1 | Screen Relay package gap | The engine's viewer sends `frame-ancestors 'none'` and `X-Frame-Options: DENY` (`server.cpp:309-310`), and the package exports no viewer. The lab wrote an 86-line decoder; the MCP example rewrites the viewer bundle (`examples/mcp-app/direct-viewer.ts`). | A browser export that renders a stream from a channel reference. | Screen Relay | `@appport/screen-relay/viewer`: `attachStream(canvas, channel)` from `viewer/main.ts`'s decode and ACK loop, returning a handle with `close()` and status events. | The lab and the MCP example drop their decoders and render through the export. |
| SR-3 | P1 | Screen Relay package gap | Tickets carry no scope (`config.cpp:178`, `server.cpp:479`). | View and control tickets distinct; view never opens a controlling connection; single-use, short-lived, bound to session and purpose. | Screen Relay | As specified in `appport-extraction.md` G-6. Gated on engine CI, which is green (run 44528437612). | Engine test: a view ticket on `/stream` and `/control` is refused. |
| SR-4 | P2 | Screen Relay package gap | No session identity over HTTP: `/capabilities` and `/metrics` carry none; the lab invents `connections`. | A session id the engine reports, so evidence names the real session. | Screen Relay | Add the engine's session name and a start nonce to `/capabilities`. | Two `up` runs report different ids; evidence records the engine's. |
| SR-5 | P3 | Screen Relay package gap | `encodeAck` returns `Uint8Array<ArrayBufferLike>`; `WebSocket.send` needs an `ArrayBuffer`-backed view under current DOM types; the lab casts. | Typed to send without a cast. | Screen Relay | Return `Uint8Array<ArrayBuffer>` from encoders. | The lab compiles without the cast. |
| AP-1 | P1 | Missing shared abstraction (AppPort contract and core) | §14.3 leaves transfer to the application. Three layers each built an access grant: Screen Relay tickets (`config.cpp:168-196`), FeltKit file links (`runtime/content.ts:40-52`, `server/index.ts:447`), FeltKit operator grants (`server/operators.ts:115`). No AppPort package has one (searched `packages/*/src`). | A capability returns a typed reference to an out-of-band channel, and the host redeems it with one shared, tested primitive. | AppPort | See [the new-package decision](#4-new-package-decision): a `ChannelRef` type beside `BlobRef` in `@appport/protocol`, and an access-grant primitive with a store interface and conformance suite in `@appport/core` and `@appport/testing`. | Conformance: issue, single redemption, expiry, scope mismatch, and digest-only storage, run against the memory store and FeltKit's. |
| AP-2 | P2 | AppPort package gap | Services extensions add capabilities as authorization metadata only (`extensions/extension.ts:31-39`) with Express routes under `/v1/extensions/<id>` and no WebSocket; FeltKit does not pass them through (`feltkit` `extensions` means browser extensions, `app.ts:268`). | Clear scope. | AppPort Services | Document extensions as management-plane only, so they are not mistaken for the application composition path. | Documentation. |
| AP-3 | P3 | AppPort package gap | FeltKit depends on the `@appport/sdk` facade, which installs the mobile, Electron, and Tauri transports. | Narrow dependencies. | FeltKit | Depend on `@appport/core`, `server`, `client` directly. | Install size drops; no behavior change. |
| APP-1 | — | Application responsibility | Fixture page, banner color check (`pngjs`), what evidence to keep, UI. | Stays. | Application | None. | — |
| EXT-1 | — | External limitation | Chrome for Testing shows an info bar that shifts page content 57 px. The fixture's coordinates tolerate it. | — | — | None. | — |

## E. Package composition

### 1. Existing package inventory

Source lines exclude tests.

| Package | Implements (verified) | Server / browser | Screen Relay can reuse | Missing for this integration | In FeltKit |
| --- | --- | --- | --- | --- | --- |
| `@appport/protocol` (7,967) | Envelopes, errors, names, manifest, `BlobRef` type only (`spec` §14.3) | Both | Capability names, error codes, `BlobRef` for screenshots | A channel reference type | Yes |
| `@appport/schema` (743) | Schema builders, JSON Schema | Both | Input and output schemas | — | Yes (`s`) |
| `@appport/core` (8,603) | Registry, dispatch (validate, authorize, execute), structured streams with backpressure and abort (`streams.ts`, high-water mark 64), sessions store, idempotency, operations, canonical contracts | Server | Capability definitions, dispatch, `operations` for long work, canonical `desktop.*` contract | Access grants | Through FeltKit's own runtime, not as a package mount |
| `@appport/authorization` (222) | Permission, resource, combined authorizers | Both | View versus control as permissions | — | Yes |
| `@appport/server` (1,582) | HTTP, NDJSON, SSE, RFC 6455 WebSocket for AppPort envelopes; **closes binary frames with 1003** (`websocket.ts:152-154`) | Server | Hosting capabilities outside FeltKit | Not a media transport, by design | Yes |
| `@appport/transport-websocket` (140) | Client transport for JSON envelopes (`JSON.parse`, string `send`) | Browser | — | Not a media transport, by design | Via SDK |
| `@appport/transport-http` (268) | Client HTTP transport | Browser | — | — | Via SDK |
| `@appport/client` (1,510) | Typed client over any transport | Both | Agents calling `desktop.*` | — | Via SDK |
| `@appport/mcp` (561) | Projects capabilities as MCP tools through `handleRequest` | Server | Replaces `examples/mcp-app/tools.ts` once SR-1 lands | Image content for screenshots is the package's output choice | FeltKit serves `/mcp` |
| `@appport/testing` (935) | Transport and store conformance (vitest) | Server | Conformance for SR-1 | Grant store conformance (AP-1) | No |
| `@appport/services` (appport-services) | Files metadata records (no bytes, no links: `src/files/service.ts`), secrets references, jobs, webhooks, notifications, management extensions | Server | Secret references for the engine token, jobs if work outlives a request | — | Yes, as FeltKit's services |
| `@appport/runtime` | One line: `export * from '@appport/services'` (`packages/runtime/index.js`) | Server | Nothing | — | No |

### 2. Streaming abstraction analysis

| Kind | What exists | Fit for Screen Relay | Gap |
| --- | --- | --- | --- |
| A. Capability streaming | `defineStreamCapability`, `createStream`, `AsyncChannel` backpressure, `AbortSignal` cancellation, NDJSON and WebSocket delivery of JSON chunks | Session and status events, fixture progress | None |
| B. AppPort WebSocket transport | `@appport/server` WebSocket binding and `@appport/transport-websocket`, JSON envelopes only | Control plane from browsers | None. Binary is refused by design |
| C. Binary media | Nothing shared. Screen Relay's NSL1 has H.264-specific flow control: credit per acknowledged frame, 3-second window, 8 MiB in flight (`PROTOCOL.md`) | Engine-owned | **No shared abstraction is justified.** Flow control, codecs, and recovery are payload-specific; a generic media package would either own none of that or become Screen Relay's protocol |
| D. Connection management | Nothing shared. Three separate grant implementations (AP-1) | The missing piece: who may open the stream, for which purpose, once | **A shared abstraction is justified**: see below |

Data plane and control plane: control (capabilities, authorization, evidence) goes over AppPort; data (frames, cursor, acknowledgments) stays on NSL1 between the engine, or a same-origin relay, and the browser. They meet only at a channel reference: the control plane issues it, the data plane redeems it.

### 3. Composition matrix

| Screen Relay responsibility | Package | Reusable functionality | Missing | Required change | Status |
| --- | --- | --- | --- | --- | --- |
| Capability definition and discovery | `@appport/core`, `@appport/protocol` | `defineCapability`, manifest, canonical contracts | Definitions | SR-1 | Existing and usable |
| Capability invocation | `@appport/core`, FeltKit runtime | Dispatch pipeline | A way for FeltKit to mount a package | FK-1, FK-2 | Existing but not integrated into FeltKit |
| Session management | `@appport/core` sessions | Caller sessions | Desktop session identity | SR-4 | Screen Relay-specific responsibility |
| Stream resource registration | — | — | A channel reference | AP-1 | Missing shared abstraction |
| Stream connection authorization | `@appport/authorization` | Permission check at issue time | Redemption | AP-1, FK-6 | Missing shared abstraction |
| Ticket creation and validation | Engine (C++) | Single-use tickets | Scope | SR-3, then AP-1 at the host | Existing but incomplete |
| Browser connection establishment | `@appport/screen-relay/protocol` | `socketTarget`, `parseMessage`, `encodeAck` | A viewer | SR-2 | Screen Relay-specific responsibility |
| Binary transport | Engine NSL1 | Flow-controlled H.264 | — | — | Screen Relay-specific responsibility |
| Input and control | SDK | `click`, `type`, `key`, `input` | Capability form | SR-1, FK-2 | Existing but incomplete |
| Screenshot capture | SDK, `BlobRef` | PNG bytes | Bytes to Files from provider code | SR-1, FK-4 | Existing but incomplete |
| Durable evidence | FeltKit audit trail, Files | Actor, request id, order | Unforgeable writes | FK-3, FK-2 | Existing but incomplete |
| Ephemeral state | Engine | Input ownership, frames | — | — | Screen Relay-specific responsibility |
| Host and provider lifecycle | FeltKit components | Start, health, close, supervision | Package-provided entry | FK-6 | Existing but not integrated |
| Secrets and credentials | FeltKit custody, AppPort Services secrets | `credential-ref:` | Provider access | FK-5 via FK-1 | Existing but not integrated |
| Events and notifications | `@appport/core` events, FeltKit `afterCommit` | Typed events | — | Optional | Existing and usable |

### 4. New-package decision

**No new streaming package.** Media (C) is payload-specific, and capability streaming (A) and the AppPort transport (B) already exist and are complete for their purpose. A `@appport/streams` package would duplicate `@appport/core` streams or absorb Screen Relay's protocol.

**A shared access-grant primitive is justified, but not as a new package.** The evidence for reuse is in the code: three independent implementations of "a short-lived, single-use, scoped right to make one out-of-band transfer, issued by a call that authorized the caller" (Screen Relay tickets, FeltKit file links, FeltKit operator grants), and a spec section that hands the problem to every application. The boundary is independent of Screen Relay: files are the second consumer. It is small: issue (subject, purpose, scope, principal, expiry), redeem once atomically, store only a digest.

It belongs in existing packages, matching how AppPort already splits a contract from its runtime:

- `@appport/protocol`: a `ChannelRef` type and schema beside `BlobRef` (`{ type: "channel", url, protocols?, purpose, expiresAt }`), so a capability can return one in its published output.
- `@appport/core`: `AccessGrantStore` (issue, redeem) with a memory implementation, following `IdempotencyStore` and `SessionStore`.
- `@appport/testing`: `runAccessGrantStoreConformance`.

This is a recommendation, not a decision: see G-1.

### 5. Implementation options

| | 1. Direct composition | 2. New streaming package | 3. FeltKit provider composition |
| --- | --- | --- | --- |
| Shape | Screen Relay depends on `@appport/core` and exports capabilities; each host wires them | `@appport/streams` owns connection and media plumbing | FeltKit mounts AppPort packages declared in `app.ts` (FK-1, FK-2, FK-6), plus the AP-1 primitive |
| Complexity | Low in Screen Relay; repeated in every host | High; new package and lifecycle | Moderate, once, in FeltKit |
| Coupling | Hosts couple to each package's wiring | Packages couple to a media abstraction | Packages depend only on `@appport/core`; FeltKit depends on no package |
| Reuse | None across packages | Doubtful (media is payload-specific) | Every AppPort package |
| Lifecycle | Host code | Package | FeltKit components, already supervised |
| Authorization | Host code | Package | Application roles via the core pipeline, grants via AP-1 |
| Browser | Package viewer (SR-2) | Package | Package viewer (SR-2) |

**Recommendation: option 3 with SR-1 and AP-1, and no new package.** Option 1 is a prerequisite of it, not an alternative: Screen Relay must publish capabilities either way.

## E2. Target architecture

```
@appport/protocol (ChannelRef)   @appport/core (registry, AccessGrantStore)
            ▲                                   ▲
            └──────────── @appport/screen-relay ┘   (capabilities, engine adapter, /viewer)
                                   ▲
                        FeltKit providers (FK-1)
                                   ▲
                         screen-relay-lab (application logic only)
```

Target dependency rules: `@appport/screen-relay` depends on `@appport/core` and `@appport/protocol`, never on FeltKit. FeltKit depends on no specific package. AppPort depends on neither.

Runtime: a browser calls `desktop.stream.open` through AppPort; the application's roles authorize it; the provider issues a grant and returns a `ChannelRef` to a same-origin route; the provider's route redeems the grant and relays NSL1 to the engine with its custody credential, choosing `/stream?view=1` for a view grant. The engine token never leaves the server, and a view grant cannot reach control whether or not the engine scopes tickets.

## F. Implementation plan

**Required for a native integration**, in order:

1. **SR-1** in `rkendel1/screen-relay`: `src/app/` capability definitions and engine adapter (`appport-extraction.md`). Adds a dependency on `@appport/core`. Compatible: the SDK and CLI are unchanged. Tests: conformance in process against a real engine.
2. **AP-1** in `rkendel1/appport`: `ChannelRef` in `packages/protocol`, `AccessGrantStore` in `packages/core`, conformance in `packages/testing`. Additive; minor versions. Tests: the conformance suite.
3. **FK-1, FK-2, FK-5** in `rkendel1/feltkit`, `packages/sdk/src/app.ts`, `runtime/`: a `providers` declaration that mounts a package's capability definitions, runs their handlers outside transactions with evidence, and gives them declared credentials. Additive option. Tests: the acceptance tests in the register, plus FeltKit's suite.
4. **FK-6** in `rkendel1/feltkit`: package-provided component entries and grant redemption on component routes. Depends on 2 and 3.
5. **SR-2, SR-3** in `rkendel1/screen-relay`: the viewer export and ticket scopes. SR-3 is an engine change; engine CI is green, so it is unblocked.
6. Rebuild the lab on 1 to 5; delete `_relay.ts`, `DesktopStream.tsx`, the record mutations, and the base64 path; rerun the live test.

**General developer-experience improvements:** FK-3 (internal functions), FK-4 (Files in actions), FK-7 (codegen inference), SR-4 (session identity).

**Optional:** SR-5, AP-2, AP-3.

Compatibility: every change is additive. The existing `@appport/screen-relay` SDK and protocol exports stay; a FeltKit app that declares no providers behaves as today; `BlobRef` is unchanged.

## G. Deferred decisions

| ID | Decision | Why it cannot be settled from code |
| --- | --- | --- |
| G-1 | Where the access-grant primitive lives: `@appport/core` (recommended) or its own package | Core states it "knows nothing about HTTP, WebSocket, IPC" (`packages/core/README.md`); a grant store is transport-neutral, but whether core should grow another store is the AppPort maintainers' call |
| G-2 | The shape of FeltKit's provider declaration | FeltKit's surface (`feltkit({...})`, roles, `access`) is a public contract its skill says to stop and ask about before changing |
| G-3 | Whether a provider capability's result can wait on a component's durable work | No caller-facing API for a work item's outcome was found in `runtime/context.ts`; not verified as absent |
| G-4 | Whether `ChannelRef` belongs in AppPort 1 or a 1.x extension | `spec/appport-1.0.md` §14.3 is normative text |
| G-5 | Whether the lab moves to a FeltKit component before FK-1 exists | It would reduce the stream's exposure now, at the cost of more application glue that FK-1 then deletes |

## Release readiness of `@appport/screen-relay` 0.1.2

Ready to publish as what it is today: an SDK, a protocol library, a CLI, and an engine, consumable by a FeltKit application with the glue above. The consumer test found no package defect that blocks publication. It is not yet an AppPort-native package (SR-1), and a browser stream outside a trusted local environment needs SR-3 or the provider relay in E2.
