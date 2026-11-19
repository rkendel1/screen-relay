/**
 * The one module that talks to Screen Relay. Functions call these helpers instead of the SDK, so the same
 * operations can later sit behind AppPort capabilities without changing the functions or the UI.
 */
import { readFileSync } from "node:fs";
import { fail } from "@feltdb/feltkit";
import { createClient, RelayError, type Capabilities, type Client } from "@appport/screen-relay";
import { isLoopback, socketTarget } from "@appport/screen-relay/protocol";

const DEFAULT_URL = "http://127.0.0.1:8080";

/** The engine this app operates, from SCREEN_RELAY_URL. Its token, if any, comes from SCREEN_RELAY_TOKEN_FILE and never leaves the server. */
export function host(): string {
  return new URL(process.env.SCREEN_RELAY_URL || DEFAULT_URL).origin;
}

function token(): string | undefined {
  const file = process.env.SCREEN_RELAY_TOKEN_FILE;
  return file ? readFileSync(file, "utf8").trim() : undefined;
}

function client(): Client {
  return createClient({ url: host(), token: token(), timeout: 15_000 });
}

/** Where the browser may read the view-only stream, or why it may not. Only a loopback engine without a token qualifies. */
export function stream(): { available: true; url: string } | { available: false; reason: string } {
  const origin = new URL(host());
  if (!isLoopback(origin.hostname)) return { available: false, reason: "The stream is offered only for a loopback engine in this lab." };
  if (process.env.SCREEN_RELAY_TOKEN_FILE) return { available: false, reason: "The engine has a token. Handing a browser a ticket is out of scope: tickets are not limited to viewing." };
  return { available: true, url: socketTarget(origin, "/stream?view=1").url.href };
}

/** Runs one Screen Relay call and turns its failure into a FeltKit error that keeps the engine's reason. */
async function call<T>(operation: (relay: Client) => Promise<T>): Promise<T> {
  try {
    return await operation(client());
  } catch (error) {
    if (error instanceof RelayError) {
      const code = error.reason === "invalid_input" ? "INVALID_ARGUMENT" : error.reason === "busy" ? "FAILED_PRECONDITION" : "UNAVAILABLE";
      fail(code, `Screen Relay ${error.reason}: ${error.message}`);
    }
    throw error;
  }
}

export const describe = (): Promise<Capabilities> => call((relay) => relay.capabilities());
export const screenshot = (): Promise<Uint8Array> => call((relay) => relay.screenshot());
export const click = (x: number, y: number) => call((relay) => relay.click(x, y));
export const type = (text: string) => call((relay) => relay.type(text));
export const key = (...combos: string[]) => call((relay) => relay.key(...combos));

/** The message of an error a helper raised, for the evidence record. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
