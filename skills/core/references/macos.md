# macOS

On macOS, `screen-relay up -d` streams the logged-in user's display. It starts no virtual display and no desktop.

## Install

```sh
npm install -g @boundry/screen-relay
screen-relay install --yes
```

- Requires macOS 12.3 or later and Node 22 or newer. Node 24 and newer need macOS 13.5, so use Node 22 on macOS 12.3 through 13.4. Install Node first; the install does not install it.
- Requires Homebrew and the Xcode Command Line Tools. Without Homebrew, `install` stops and says so.
- `install` uses Homebrew to install `pkgconf`, `x264` and `libwebsockets`, then builds the `macos` backend. `--backend` accepts only `macos`.
- `up -d --yes` runs the same setup when it is needed.

## Permissions

Grant both to the app that starts screen-relay, such as your terminal, then restart that app:

- Screen Recording: System Settings > Privacy & Security > Screen & System Audio Recording.
- Accessibility: System Settings > Privacy & Security > Accessibility.

`screen-relay doctor` reports them in the `permissions` check.

## Start a session

```sh
screen-relay up -d
screen-relay run -- open -a Terminal
```

- `--display` fails with `invalid_input`.
- `display.resolution` is ignored with a warning.
- `--desktop` has no effect. The desktop is always `none`.
- `run` clears `DISPLAY`, `WAYLAND_DISPLAY` and `XAUTHORITY`.

## Choose a display

Without `--output`, screen-relay streams the main display. `--output` takes a CGDirectDisplayID, a number. If the ID is not an active display, `up` fails, and the engine log lists the active display IDs.

```sh
screen-relay up -d --output 69733382
```

## Limits

- The stream uses the display's native pixel size, halved until it fits the engine's maximum frame size.
- The pointer is not drawn into the video. The viewer shows its own arrow.
- If the display's size, position or ID changes, the engine stops the stream. Run `screen-relay down`, then `screen-relay up -d`.
