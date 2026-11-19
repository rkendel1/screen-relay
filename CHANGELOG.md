# screen-relay

## 0.1.2

<!-- release:start -->

The first release published as `@appport/screen-relay`. Earlier releases were published as `screen-relay`. The `screen-relay` command is unchanged; install it with `npm install -g @appport/screen-relay`. screen-relay is becoming an AppPort application, but this release adds no AppPort capabilities yet.

### New Features

- Added **one-time viewer tickets**: `POST /tickets` returns a ticket that opens one WebSocket within 60 seconds, so a custom client can connect without holding the session token (vercel-labs/screen-relay#64)
- Added the **`remote-host` agent skill**, which runs screen-relay on a remote machine, container, or cloud sandbox behind an HTTPS URL. It replaces the `vercel-sandbox` skill (#1)

### Improvements

- **GitHub releases** no longer attach `relay-engine` binaries. `screen-relay install` already builds the engine on each machine (vercel-labs/screen-relay#67)
- **Agent detection** no longer depends on a vendor package. The CLI checks the same environment variables itself, and `SCREEN_RELAY_AGENT` still overrides it (#1)
- The **MCP App example** runs its automation tools locally or through any command prefix, such as `ssh` or `docker exec`, instead of one provider's sandbox CLI (#1)

### Documentation

- Replaced the **Vercel Sandbox guide** with the provider-neutral remote access guide, and pointed repository links at rkendel1/screen-relay (#1)

### Contributors

- @joshuasoup
- @lahfir
- @rkendel1

<!-- release:end -->

## 0.1.1

### New Features

- Added **Windows hosts**: `screen-relay install`, `up`, `down`, `status`, `logs`, `run`, and `doctor` work on Windows, with MSYS2 at `C:\msys64` providing the build tools and the libraries the engine loads (#57)

### Bug Fixes

- Fixed **TLS verification** skipping the host name check when the SDK was given a CA file. `ca` now checks the chain and the URL host name, and the new `certificate` option pins one exact server certificate (#54)
- Fixed **wheel scrolling** sending at least one notch for every wheel event, which scrolled the desktop dozens of notches during a short trackpad swipe. The viewer now adds up wheel distance and sends a notch for every 100 pixels (#61)
- Fixed **Windows setup** running an MSYS2 installation that another local account could have created first. `install` and `doctor` now check the owner and the write rules of the paths they run and load (#60)

### Improvements

- The **viewer opens view-only**. Choose **Take control** to own input and **Release control** to hand it back, so the CLI or SDK can send input while the viewer is open (#56)

### Documentation

- Added **platform demos** to the overview and to the Linux, macOS, and Windows pages (#59)
- Pointed documentation links at screen-relay.dev, showed screen-relay as a Labs experiment, and gave every diagram node even padding (#53, #55)

### Contributors

- @ctate
- @lahfir
- @Railly

## 0.1.0

### New Features

- Added the **install command**: `screen-relay install` installs the system packages and builds the engine on Linux and macOS. It replaces `./install.sh` (#52)
- Added **first-run setup to `up`**: on a machine that is not set up, `screen-relay up` asks which backend to use at a terminal, installs the packages, builds the engine, and then starts the session. Without a terminal it needs `--yes` (#52)

### Improvements

- Renamed the npm package, the CLI command, and the SDK import from `desktop-relay` and `relay` to **screen-relay**. Environment variables now start with `SCREEN_RELAY_`, the config file is `~/.config/screen-relay/config.yaml`, and session state is under `~/.local/state/screen-relay` (#52)
- The npm package now ships the **engine source**, so `npm install -g screen-relay` is the only install step. It needs Node 22 or newer (#52)
- Added the **Apache-2.0 license** and third-party notices (#52)

### Documentation

- Replaced the clone-and-install instructions with the npm commands in the docs and the agent skills (#52)

### Contributors

- @lahfir

## 0.0.1

### New Features

- First release of **relay**: the engine streams a Linux, macOS, or Windows desktop to a browser, and the `relay` CLI and the Node SDK control it
- The `desktop-relay` npm package ships the `relay` CLI, the Node SDK, and the agent skills
- Each GitHub release attaches a `relay-engine` binary for Linux x64 and ARM64, macOS ARM64 and x64, and Windows x64. A binary needs the x264 and libwebsockets libraries it was built against, so `./install.sh` remains the supported way to install the engine

### Contributors

- @ctate
- @lahfir

