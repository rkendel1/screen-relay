# AppPort extraction map and gap register

This is the baseline for turning screen-relay into an AppPort application with vendor-neutral capabilities. It records what exists today, where each piece belongs after the extraction, and what is missing. It proposes no code changes on its own; every change it calls for is listed in the gap register with the evidence behind it.

Status: baseline audit, 2026-11-19, at commit `815f3a4` (screen-relay 0.1.2).

## Evidence collected

| Check | Result |
| --- | --- |
| `npm test` (build plus `tests/unit/*.test.mjs`) | 151 passed, 0 failed, 11 skipped. Every skip is gated on macOS or Windows. |
| `npm run typecheck` | Passed with no errors. |
| `make test` (engine C++ tests) | Not run. The FFmpeg, x264, and libwebsockets development packages are not installed in the audit environment, and the Ubuntu package mirrors returned 503 errors during setup. |
| AppPort packages | Read from the published npm tarballs: `@appport/sdk` 1.9.0, `@appport/core` 1.8.0, `@appport/protocol` 1.5.0, `@appport/server` 1.3.3, `@appport/authorization` 1.2.0, `@appport/mcp` 1.3.9, `@appport/testing` 1.2.6, `@appport/runtime` 0.19.0. |
| AuthBoundry | Not inspected. The repository is outside this session's access, so its contract is an open item (G-12). |

## The finding that shapes the plan

The shipped product is already close to vendor neutral. Of everything in the npm package (`dist`, `skills`, `src/engine`, `Makefile`, `packages.tsv`), only one runtime dependency belongs to a vendor: `@vercel/detect-agent`, used in `src/cli/mode.ts` to decide whether the CLI may prompt. The engine, protocol, SDK, viewer, and CLI host carry no vendor APIs.

The Vercel coupling is concentrated in three places that are not the product:

1. The documentation site (`docs/`), which is built on `@vercel/geistdocs` and uses Vercel Analytics, Speed Insights, the AI Gateway, and a Vercel Marketplace search integration.
2. Content that names Vercel: the `vercel-sandbox` agent skill, the README badge, repository URLs, and the `examples/mcp-app` prototype, which shells out to Vercel's `sandbox` CLI.
3. Identity: the npm name `screen-relay` belongs to the upstream maintainer, and the `screen-relay.dev` domain serves the upstream docs.

So decoupling is mostly removal and replacement at the edges. The work that needs real design is the AppPort layer, which does not exist yet.

## Vendor coupling inventory

| ID | Location | Coupling | Ships to users | Proposed action |
| --- | --- | --- | --- | --- |
| V-1 | `src/cli/mode.ts`, `package.json` | `@vercel/detect-agent` decides the CLI's agent mode | Yes | Replace with a local check of known agent environment variables. `SCREEN_RELAY_AGENT=1/0` already overrides detection and stays as the authority. |
| V-2 | `package.json` `repository.url` | Points at `vercel-labs/screen-relay` | Yes | Point at this repository once identity is decided (D-1). |
| V-3 | `skills/vercel-sandbox/SKILL.md`, `skills/core/SKILL.md:170`, `skills/screen-relay/SKILL.md:21`, `tests/unit/cli-skills.test.mjs:13` | `screen-relay skills` serves a Vercel-specific skill | Yes | Replace with a provider-neutral `remote-host` skill: the engine on a remote machine, reached through a tunnel or TLS proxy with a token. Vendor recipes belong in the docs as examples, not in the shipped skill set. |
| V-4 | `src/cli/help.ts:6`, README, docs pages | Links to `screen-relay.dev` and `github.com/vercel-labs/screen-relay` | Yes (help text) | Follow D-1 and D-2. |
| V-5 | `README.md:6` | "Vercel Labs Experiment" badge | Yes (npm README) | Remove. |
| V-6 | `docs/package.json`, `docs/next.config.ts`, `docs/proxy.ts`, `docs/app/**`, `docs/lib/geistdocs/**`, `docs/.env.example` | `@vercel/geistdocs`, `@vercel/analytics`, `@vercel/speed-insights`, `@vercel/agent-readability`, AI Gateway chat, Vercel Marketplace search, `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` | No | Decide the docs platform (D-2). Geistdocs wraps `fumadocs`, which the site already depends on directly, so the content in `docs/content/docs/` can move without being rewritten. |
| V-7 | `docs/content/docs/vercel-sandbox.mdx`, `docs/content/docs/index.mdx:54`, `docs/content/docs/agent-skills.mdx` | Pages about one vendor's sandbox | No | Fold into a provider-neutral remote-host page. A vendor walkthrough can stay as one example among several. |
| V-8 | `examples/mcp-app/sandbox.ts`, `config.ts`, `README.md` | Executes commands through Vercel's `sandbox exec` with a `/vercel/.local/bin` path | No | Superseded by `desktop.process` and `@appport/mcp` (G-9). Delete the sandbox shim once that exists. |
| V-9 | `LICENSE:189`, `THIRD-PARTY-NOTICES.md` | Upstream copyright notice | Yes | Keep. Apache-2.0 requires retaining the upstream copyright and notices in a derivative work. Add this project's copyright beside it; do not remove Vercel's. |
| V-10 | `.agents/skills/technical-writer`, `.agents/skills/architecture-diagram` | Contributor tooling written in Vercel's editorial voice and style | No | Low priority. Rewrite the voice references when the docs move. |
| V-11 | `.github/workflows/release.yml` | Publishes `screen-relay` to npm with trusted publishing | Process | Cannot work from this fork: the npm name belongs to the upstream maintainer. Blocked on D-1. |

The CI workflow, `Dockerfile`, and `Makefile` have no Vercel references.

## What exists today

screen-relay has four layers. Their boundaries are already reasonable, and the extraction keeps them.

| Layer | Source | Runs where | Public contract today |
| --- | --- | --- | --- |
| Engine | `src/engine/` (C++): `core/` for capture, encoding, flow control, and input; `backends/` for X11, Wayland, macOS, and Windows; `server/` for HTTP and WebSocket | On the machine that shows the desktop | HTTP and WebSocket on one port, documented in `PROTOCOL.md`: `GET /capabilities`, `GET /screenshot.png`, `POST /input`, `POST /tickets`, `GET /metrics`, WS `/stream`, `/stream?view=1`, `/control`, plus the viewer at `/` |
| Protocol | `src/protocol/` (TypeScript) | Anywhere | Input record and NSL1 message encoding, error reasons. Exported as `screen-relay/protocol`. |
| SDK | `src/sdk/` | Anywhere with network access to the engine | `createClient`, `connect`, `capabilities`, `status`, `screenshot`. Exported as `screen-relay`. |
| CLI host | `src/cli/host/` | On the desktop machine | `install`, `up`, `down`, `status`, `logs`, `run`, `doctor`. Local only: there is no API for session lifecycle or launching apps. |
| Viewer | `viewer/` | Browser | Speaks NSL1 over `/stream`. Authenticates with the session token from the URL fragment; it does not accept one-time tickets yet (`PROTOCOL.md`). |

Authority today is a single 64-character session token, created only when the engine listens on a non-loopback address, plus one-time WebSocket tickets minted with that token. The engine enforces one input owner at a time. There is no identity: anyone holding the token has full control.

## Target architecture

```
             AuthBoundry  (identity, authorization decisions)
                  │ authenticate()
                  ▼
   ┌──────── screen-relay AppPort application ────────┐
   │  capability contracts, schemas, permissions      │
   │  @appport/core: validate → authorize → execute    │
   └───────┬──────────────────────────┬───────────────┘
           │ DesktopProvider          │ HostProvider
           ▼                          ▼
   engine adapter (existing SDK)   local host (existing CLI host)
   other desktop providers         other placements (container, VM, remote)
           │
           ▼  NSL1 media and input, out of band
       engine ◄────────────── viewer (ticket from desktop.stream.open)
```

Four rules follow from AppPort's own contracts, and they settle most placement questions:

1. **AppPort carries control, not media.** AppPort envelopes are JSON, and its binary support is a reference (`BlobRef`, §51) with transfer left to the application. Sending H.264 frames through it would add copies and break the engine's ACK-based flow control. `desktop.stream.open` therefore returns a stream descriptor and a one-time ticket; frames keep flowing over NSL1 straight from the engine. This is where streaming and input stop sharing a required transport: control may use the AppPort transport while media uses NSL1.
2. **The engine's wire protocol is the desktop provider contract.** `PROTOCOL.md` is documented, versioned, and implemented on four platforms. The X11, Wayland, macOS, and Windows backends stay inside the engine as they are; they are not separate AppPort providers. A different desktop implementation becomes a provider either by speaking the same wire protocol or by implementing the `DesktopProvider` interface directly.
3. **Placement is a separate provider.** Containers, VMs, a signed-in Windows PC, and remote sandboxes decide where the engine runs and how it is reached. They implement `HostProvider` (start, stop, reach, run a process). They never appear in capability contracts.
4. **The application holds no identity.** It uses `@appport/server`'s `authenticate` hook to ask AuthBoundry who the caller is and which permissions they hold, then authorizes with `permissionAuthorizer()`. The engine token becomes a credential that only the host holds, used in AppPort's trusted boundary mode. Browsers and agents never receive it; viewers get one-time tickets.

### Capability catalog

The catalog below adjusts the proposed one to what the code can support. Names follow AppPort's grammar, which rejects names that encode a transport.

| Capability | Kind | Effect | Permission | Backed by today | Status |
| --- | --- | --- | --- | --- | --- |
| `desktop.display.describe` | request | observation | `desktop.view` | `GET /capabilities` via `sdk.capabilities()` | Exists; needs a contract |
| `desktop.screenshot.capture` | request | observation | `desktop.view` | `GET /screenshot.png` via `sdk.screenshot()` | Exists; output shape open (G-4) |
| `desktop.input.pointer` | request | consequential | `desktop.control` | `click`, `move`, `scroll` | Exists; needs a contract |
| `desktop.input.keyboard` | request | consequential | `desktop.control` | `key`, `type` | Exists; needs a contract |
| `desktop.input.events` | request | consequential | `desktop.control` | `POST /input`, `sdk.input()` | Exists; raw batches of up to 256 events |
| `desktop.stream.open` | request | observation, or consequential with `control: true` | `desktop.view`, plus `desktop.control` to take input | `POST /tickets` | Partial: the viewer cannot use tickets (G-5), and tickets cannot be limited to viewing (G-6) |
| `desktop.sessions.list`, `.describe` | request | observation | `desktop.view` | `cmdStatus`, `src/cli/host/state.ts` | Local CLI only (G-7) |
| `desktop.sessions.start`, `.stop` | request | consequential | `desktop.sessions.manage` | `cmdUp`, `cmdDown` | Local CLI only (G-7) |
| `desktop.process.run` | request | consequential | `desktop.process.run` | `cmdRun` | Local CLI only, and arbitrary command execution (G-8) |
| `desktop.input.released` | event | | `desktop.view` | Engine releases held input on disconnect | Not exposed (G-10) |

Two items from the proposed catalog are deliberately left out:

- **`desktop.capture`** is the engine's internal frame acquisition. No consumer needs raw frames through a JSON protocol, and every consumer need is met by `desktop.screenshot.capture` or `desktop.stream.open`. Exposing it would freeze an implementation detail into a contract.
- **`desktop.stream`** as a frame stream is replaced by `desktop.stream.open`, for the reason in rule 1.

Every input capability declares `concurrency: "serialized"`. The engine already enforces one input owner at a time; the contract makes that visible to callers instead of surfacing it as a `busy` error.

### Package choices

| Package | Use | Reason |
| --- | --- | --- |
| `@appport/core`, `@appport/schema`, `@appport/protocol`, `@appport/authorization` | Yes | Capability definitions, dispatch, authorization. No transport or storage assumptions. |
| `@appport/server` | Yes | `serve()` binds HTTP, NDJSON streams, SSE, and WebSocket, and publishes `/.well-known/appport`. Its WebSocket binding has no dependencies. |
| `@appport/mcp` | Yes | Projects the same capabilities as MCP tools, so the hand-written tools in `examples/mcp-app/tools.ts` go away. It brings `@modelcontextprotocol/sdk`; load it only for the MCP entry point. |
| `@appport/testing` | Dev only | Transport and store conformance suites. Needs `vitest` as a peer, while this repository uses `node --test` (G-11). |
| `@appport/sdk` | No | A convenience facade that also installs the mobile, Electron, and Tauri transports. The CLI does not need them. |
| `@appport/runtime` | No | Brings `@appport/services`, Express, and a generated `feltdb.flow`. That adds a storage platform and HTTP framework screen-relay has no need for, which is the coupling this work removes. |

## Gap register

Severity: **blocker** stops the extraction; **high** stops a capability from working through AppPort; **medium** degrades it; **low** is cleanup.

| ID | Gap | Evidence | Severity | Proposed resolution | Needs a decision |
| --- | --- | --- | --- | --- | --- |
| G-1 | The fork cannot publish under the `screen-relay` npm name | `npm view screen-relay maintainers` returns the upstream maintainer; `release.yml` publishes that name | blocker for releases | Publish under a new name or scope and update `bin`, `exports`, docs, and `scripts/check-version-sync.mjs` | D-1 |
| G-2 | No AppPort application exists | No `appport` reference anywhere in the repository | blocker | Add `src/app/`: capability definitions, `createApplication`, and a `screen-relay serve` command that runs `@appport/server` against an engine | |
| G-3 | No `DesktopProvider` or `HostProvider` interface | The SDK and CLI host are called directly | high | Define both as TypeScript interfaces in `src/app/providers/`. The first implementations wrap `src/sdk` and `src/cli/host` without changing them. | |
| G-4 | AppPort has no byte transfer for screenshots | `BlobRef` is a reference only; transfer is the application's job | high | v1: return PNG as base64 with `width`, `height`, and `contentType`, which is also what MCP image content uses. Measure size at common resolutions before adopting it. A `BlobRef` with a ticketed URL is the follow-up if the size cost is real. | |
| G-5 | The bundled viewer cannot authenticate with a one-time ticket | `PROTOCOL.md`: "The bundled viewer doesn't use tickets yet" | high | Teach `viewer/main.ts` to offer `ticket.TICKET` from the URL fragment. Without this, `desktop.stream.open` must hand out the session token, which breaks rule 4. | |
| G-6 | One token grants everything, and tickets have no scope | Engine has a single token. `Tickets::redeem` (`src/engine/server/config.cpp:178`) records no scope, and `server.cpp:479` accepts a ticket for any WebSocket, so a ticket issued for viewing can open `/stream` without `?view=1` or `/control` and take input | high | Keep the token on the host only (trusted boundary mode) and enforce permissions in AppPort. Add a scope to tickets in the engine (`view` or `control`) so `desktop.stream.open` can hand a `desktop.view` caller a ticket that cannot take input. This is the one engine change the extraction needs. | |
| G-7 | Session lifecycle is CLI-only and local | `cmdUp`, `cmdDown`, `cmdStatus` read and write local state in `src/cli/host/state.ts` | high | Refactor the command bodies into functions that `HostProvider` calls, keeping the CLI as a thin caller. The CLI output and tests must not change. | |
| G-8 | `desktop.process.run` is arbitrary code execution on the desktop machine | `cmdRun` spawns any command | high | Off by default. Exposed only when the host config enables it, with its own permission and, optionally, an allowlist of app names. | D-4 |
| G-9 | The MCP example is vendor-bound and duplicates capability definitions | `examples/mcp-app/sandbox.ts`, `tools.ts` | medium | Replace tools with `@appport/mcp`. Keep the `ui://` viewer resource, which MCP Apps needs and `@appport/mcp` does not provide. | |
| G-10 | No events | The engine reports control changes only to the connection involved | medium | Defer. Add `desktop.input.released` and session events when a consumer needs them. | |
| G-11 | `@appport/testing` expects `vitest` | `peerDependencies: { vitest: ">=3.2.6" }` | medium | Run the conformance suite in its own `vitest` script; keep the existing `node --test` suite for everything else. | |
| G-12 | AuthBoundry's contract is unverified | Repository not accessible in the audit | medium | Implement `authenticate` against an `IdentityResolver` interface with two implementations: local (loopback, single principal, for development) and AuthBoundry. Confirm the AuthBoundry side once the repository is attached. | |
| G-13 | Engine C++ tests are not in this baseline | Missing development packages | medium | Run `make test` in CI before and after each change to the engine or viewer. The extraction should touch the engine only for ticket scopes (G-6); G-5 is viewer-only. | |
| G-14 | `@vercel/detect-agent` in the shipped CLI | V-1 | low | Replace with a local check | |
| G-15 | Vercel content in shipped skills and README | V-3, V-5 | low | Replace with provider-neutral content | |
| G-16 | Docs site is built on Vercel services | V-6, V-7 | low (not shipped) | Move to plain `fumadocs` or a static generator, drop hosted AI chat and analytics | D-2 |

## Decisions needed

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-1 | Package identity | A new unscoped name; a scope you control; stay a private fork with no npm releases | A scope you control. It also gives a home to the provider packages if they are ever split out. |
| D-2 | Docs platform | Keep Next.js and `fumadocs` without the Vercel pieces; a static site generator; repository Markdown only | `fumadocs` with static export. The content and MDX components carry over, and the result deploys to any static host. |
| D-3 | Where the AppPort application lives | In this package as `src/app/` with a `serve` command; a separate package | In this package. Splitting before a second consumer exists adds a release boundary with nothing on the other side. |
| D-4 | Whether `desktop.process.run` ships in v1 | Ship disabled by default; defer | Ship disabled by default, because the agent loop needs a way to open an app, and today that requires shell access to the machine. |

## Sequencing

Each step is one PR that leaves `npm test` passing and the CLI unchanged for existing users.

1. **Vendor cleanup in the shipped package.** V-1, V-3, V-5, and G-14 and G-15. No behavior change beyond agent detection, which keeps its override.
2. **Contracts.** Capability definitions and schemas in `src/app/capabilities/`, with unit tests against a fake `DesktopProvider` over the in-process transport.
3. **Engine provider.** `DesktopProvider` backed by the existing SDK. Tests against a real engine where the CI image has one.
4. **Host and authority.** `screen-relay serve`, the `IdentityResolver` interface with the local implementation, and viewer ticket support (G-5, G-6).
5. **Session and process capabilities.** G-7 and G-8, after D-4.
6. **MCP projection.** G-9.
7. **AuthBoundry resolver.** G-12, once its contract is confirmed.
8. **Identity and docs.** G-1 and G-16, after D-1 and D-2.

The extraction is complete when an agent can discover the capabilities at `/.well-known/appport`, open a stream, take a screenshot, click, and type through AppPort, under a principal resolved by AuthBoundry, against the same engine the CLI drives today, and when the existing unit and engine tests still pass.
