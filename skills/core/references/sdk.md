# Node SDK

A script needs the package as a local dependency in its project. The global install (`npm install -g @boundry/screen-relay`) provides only the CLI.

```sh
npm install @boundry/screen-relay
```

```js
import { createClient, connect, RelayError } from '@boundry/screen-relay';
```

## Options

`createClient(options)` and `connect(options)` take the same options.

| Option | Default | Meaning |
| --- | --- | --- |
| `url` | `http://127.0.0.1:8080` | Engine origin. |
| `token` | none | The 64-character session token. Required for a remote host. Read it with `screen-relay status --show-token --json`. |
| `timeout` | `10000` | Milliseconds. The CLI's `--timeout` is in seconds (default 10), so `--timeout 10` is `timeout: 10000`. |

## createClient

`createClient(options)` returns a client. Each call sends its own request. Coordinates are fractions of the screen from 0 to 1, the same as the CLI.

```ts
status(): Promise<Status>                          // engine metrics, not the CLI's session record
capabilities(): Promise<Capabilities>
screenshot(): Promise<Uint8Array>                  // PNG bytes
click(x, y, { button?: 'left' | 'middle' | 'right' })
move(x, y)
scroll(x, y, { dx?, dy? })
key(...combos)
type(text)
input(events)                                      // raw SDK input events
```

## connect

`connect(options)` opens a control session that owns input until `close()`.

```ts
surface: { width, height }
capabilities(): Promise<Capabilities>
status(): Promise<Status>
screenshot(path?): Promise<Uint8Array>             // writes a file when path is set
input(event): Promise<void>                        // one raw SDK input event
close(): void
```

Only one controller sends input at a time. A control session needs the viewer closed, because the engine serves one stream or control connection at a time. See [One controller](../SKILL.md#one-controller).

## Errors

Failures throw `RelayError`. Its `reason` is one of the reasons the CLI reports. See [Reasons and recovery](../SKILL.md#reasons-and-recovery).

## Example

```js
import { writeFile } from 'node:fs/promises';
import { createClient } from '@boundry/screen-relay';

const client = createClient();
await writeFile('screen.png', await client.screenshot());
await client.click(0.5, 0.5);
await client.type('echo hello');
await client.key('Enter');
```
