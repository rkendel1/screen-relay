const relayOrigin = new URL(process.env.SCREEN_RELAY_ORIGIN ?? "http://localhost:18080").origin;
const envToken = process.env.SCREEN_RELAY_TOKEN;

/** Origin of the screen-relay server this app may embed and talk to. */
export const ORIGIN = relayOrigin;

/** Command prefix that runs a command on the desktop host, as a JSON array such as ["ssh", "user@vm", "--"]. Empty runs commands on this machine. */
export const EXEC_PREFIX = parsePrefix(process.env.SCREEN_RELAY_EXEC);

/** Whether the prefix passes the command through a remote shell, so each argument must be quoted. */
export const EXEC_SHELL = process.env.SCREEN_RELAY_EXEC_SHELL === "1";

/** Path of the relay-env wrapper on the desktop host. */
export const RELAY_ENV = process.env.SCREEN_RELAY_ENV_WRAPPER || "relay-env";

/** Path of agent-browser on the desktop host. */
export const AGENT_BROWSER = process.env.SCREEN_RELAY_AGENT_BROWSER || "agent-browser";

function parsePrefix(value: string | undefined): string[] {
  if (!value) return [];
  const prefix: unknown = JSON.parse(value);
  if (!Array.isArray(prefix) || prefix.length === 0 || !prefix.every((part) => typeof part === "string" && part)) {
    throw new Error("SCREEN_RELAY_EXEC must be a JSON array of non-empty strings");
  }
  return prefix;
}

/** Validates a stream URL and returns it, rejecting anything but the configured origin. */
export function originOf(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Stream URL is not a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Stream URL must be an HTTP(S) origin without credentials or query");
  }
  if (url.origin !== ORIGIN) {
    throw new Error(`Stream URL must use the screen-relay origin ${ORIGIN}`);
  }
  return url;
}

/** Resolves the token from the argument or the environment and checks its shape. */
export function tokenOf(value: string | undefined): string | undefined {
  const token = value ?? envToken;
  if (!token) return undefined;
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Token must be 64 lowercase hexadecimal characters");
  return token;
}
