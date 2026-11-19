---
name: remote-host
description: Run screen-relay on a remote machine, container, or cloud sandbox that publishes a port at an HTTPS URL, and control it from elsewhere.
allowed-tools: Bash(screen-relay:*)
---

# screen-relay on a remote host

Use this when the desktop runs on a machine you reach over the network: a cloud VM, a container, or a sandbox whose provider publishes a port at an HTTPS URL. Run steps 1 to 4 on that machine. If you can open an SSH tunnel instead, use `ssh -N -L 8080:127.0.0.1:8080 user@host` and skip `--public`: the session stays on loopback and needs no token.

1. Publish port 8080 at an HTTPS URL before the first `up`, so that `--public` can match it. How you publish depends on the host: a provider's port setting, a TLS reverse proxy, or a tunnel. The edge must forward every path with no prefix, forward WebSocket upgrades over HTTP/1.1, and keep the `Host` and `Origin` headers. Note the URL, such as `https://desktop.example.com`.

2. Install the CLI:

   ```sh
   npm install -g @boundry/screen-relay
   ```

3. Install the system packages and build the engine:

   ```sh
   screen-relay install --yes
   ```

   On a fresh machine this can take several minutes. Run it with a long command timeout or in the background, and wait for it to exit. It is safe to repeat.

4. Start the session behind the public URL:

   ```sh
   screen-relay up -d --public https://desktop.example.com
   ```

   `--public` makes the session listen on `0.0.0.0` and creates a token. `/` must resolve to `https://desktop.example.com`, because the engine accepts only the `--public` host. Piped, `up -d` prints the viewer URL with its `#token=` fragment. Treat the whole URL as a secret, and share it only through the user's secret channel.

5. Check the session:

   ```sh
   screen-relay status --json
   ```

   From another machine, save the token to a file and pass the URL: `screen-relay status --url https://desktop.example.com --token-file <FILE>`.

If the host has a lifetime limit, extend it before long work, and run `screen-relay down` before the host stops.

## Control it

The default desktop is X11 with XFCE. Start a terminal with `screen-relay run -- xfce4-terminal`, then run the control loop from `screen-relay skills get core`.

## Errors

- `unreachable` with `Connection refused.`: the engine is not listening. Run `screen-relay up -d`.
- `unreachable` with `The host name did not resolve.` or `The TLS certificate was rejected.`: check the edge URL and certificate, then run `screen-relay status --url https://desktop.example.com --token-file <FILE>`.
- `unauthorized`: pass the session's token with `--token-file FILE` or `SCREEN_RELAY_TOKEN_FILE`.
- `forbidden`: `--public` does not match the URL you reached, or a proxy rewrote `Host` or `Origin`.
- `busy`: another controller holds input. See One controller in `screen-relay skills get core`.
- `component_failed` or `timeout` from `up`: read `data.component`, then run `screen-relay logs <component>` and `screen-relay doctor`.

Stop the desktop with `screen-relay down` before you stop the host. The full workflow is in `screen-relay skills get core`.
