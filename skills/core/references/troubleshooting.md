# Troubleshooting

The published guide is at https://screen-relay.dev/docs/troubleshooting.

Start with `screen-relay doctor`. For each reason, such as `busy` or `unauthorized`, see [Reasons and recovery](../SKILL.md#reasons-and-recovery). This page covers symptoms that have no reason code.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `screen-relay: command not found` | npm's global `bin` directory is not on `PATH`, or the global install did not finish. | Run `npm install -g @appport/screen-relay` again. Then check that `$(npm prefix -g)/bin` is on `PATH`. |
| `component_failed` from `up`, or `status` shows `failed` | A component exited during startup or after ready. The session stops. | Read `data.component`, then `screen-relay logs <component>`. For `-d`, also read `supervisor.log` in the directory named by `session.logs` in `screen-relay status --json`. |
| `unreachable` with `Connection refused.` | Nothing is listening on the address. | For a local session, run `screen-relay up -d`. Otherwise check the port. |
| `unreachable` with `The TLS certificate was rejected.` | The certificate is not trusted or names another host. | Use a trusted certificate for the public host, or pass the local session's certificate. |
| Engine log says `Cannot listen on 127.0.0.1:8080` | Another process owns the port. | `screen-relay up --port 8081`, or stop the old session. |
| Engine log names a missing Wayland protocol (`zwlr_screencopy_manager_v1`, `zwp_virtual_keyboard_manager_v1` or `zwlr_virtual_pointer_manager_v1`) | The compositor from `--display` lacks it. | Attach to a supported compositor. See [Linux](https://screen-relay.dev/docs/linux). |
| Engine log shows `Unsupported root size` | The attached output is outside 320x240 to 16384x16384, or has an odd side. | Create a headless output of a supported size and pass its name with `--output`. |
| `missing_input` saying `XDG_RUNTIME_DIR is required` | `--display` on wayland without `XDG_RUNTIME_DIR`. | Export the compositor's runtime directory. If it is `/run/user/$(id -u)`, run `export XDG_RUNTIME_DIR=/run/user/$(id -u)`. |
| `component_failed` or `timeout` for `display` with `--backend wayland` | sway did not start or did not report its displays. | `SCREEN_RELAY_BACKEND=wayland screen-relay doctor`, then `screen-relay logs display`. |
| `Cannot open display` with `--display` | Missing `XAUTHORITY` for that display. | Export the session's `XAUTHORITY`. Never use `xhost +`. |
| Engine log says `Screen capture permission is missing`, `Screen Recording permission is missing` or `Accessibility permission is missing`, or `doctor` fails `permissions` | The app that started screen-relay lacks the permission. | Grant both permissions: [macOS permissions](macos.md#permissions). |
| Engine log says `Display N not found; active displays: ...` | `--output` is not the CGDirectDisplayID of an active display. | Use one of the listed IDs. |
| Engine log says `The display changed from ... restart screen-relay to stream it` | The display's size, position or ID changed during the session. The stream stops. | `screen-relay down`, then `screen-relay up -d`. |
| Blank viewer page or WebCodecs error | The browser lacks H.264 WebCodecs, or the page is not a secure context. | Use a current Chrome, Edge or Safari over `https://` or `http://127.0.0.1`. |
| Viewer cannot connect through a proxy | The proxy drops WebSocket upgrades or rewrites headers. | Forward `/stream`, `/control`, `/input` and the rest without a path prefix. Keep `Host`, `Origin` and `Authorization`. |

## Doctor checks that need a manual step

`screen-relay doctor` prints the fix for each failing check. These checks need more than a package install:

| Check | Cause | Fix |
| --- | --- | --- |
| `libx264` on Ubuntu | The x264 package is in the `universe` component. | Run `screen-relay install --yes`. It adds `universe` to `/etc/apt/sources.list.d/ubuntu.sources` and updates apt. If that file does not exist, enable `universe` in your apt sources, run `sudo apt-get update`, then run `screen-relay install --yes` again. |
| `libx264` on Fedora | x264 comes from RPM Fusion Free. `screen-relay install` stops and prints the `dnf` command when RPM Fusion Free is not enabled. | Run `sudo dnf -y install https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm`, then run `screen-relay install --yes`. |
| `icon decoding` with `bubblewrap failed` | Image loaders sandbox themselves with `bwrap`, which needs unprivileged user namespaces. | Allow them for `bwrap`, with an AppArmor profile or `kernel.unprivileged_userns_clone=1`, then run `screen-relay doctor` again. screen-relay does not turn the sandbox off. |
