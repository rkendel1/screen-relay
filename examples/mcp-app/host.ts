import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXEC_PREFIX, EXEC_SHELL, RELAY_ENV } from "./config.ts";

const run = promisify(execFile);

/** Runs one automation command on the host that shows the desktop, through the configured command prefix. */
export async function runOnHost(binary: string, args: string[]) {
  const command = [RELAY_ENV, binary, ...args];
  const argv = [...EXEC_PREFIX, ...(EXEC_SHELL ? command.map(quote) : command)];
  try {
    const { stdout, stderr } = await run(argv[0], argv.slice(1), { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return { content: [{ type: "text" as const, text: JSON.stringify({ stdout, stderr: stderr.trim() }) }] };
  } catch (error: any) {
    const detail = {
      exitCode: typeof error.code === "number" ? error.code : null,
      signal: error.signal ?? null,
      stdout: error.stdout ?? "",
      stderr: (error.stderr || error.message || "Command failed").trim(),
    };
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(detail) }] };
  }
}

/** Quotes one argument for a POSIX shell, for prefixes such as ssh that pass the command through a remote shell. */
function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
