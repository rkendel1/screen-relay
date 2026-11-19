import { existsSync } from 'node:fs';

type Env = Record<string, string | undefined>;

const SIGNALS: readonly string[] = [
  'AI_AGENT', 'CURSOR_TRACE_ID', 'CURSOR_AGENT', 'GEMINI_CLI', 'CODEX_SANDBOX', 'CODEX_CI', 'CODEX_THREAD_ID',
  'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT', 'OPENCODE_CLIENT', 'CLAUDECODE', 'CLAUDE_CODE', 'REPL_ID',
  'COPILOT_MODEL', 'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN',
];

/** Whether the environment shows that a coding agent runs this process, from the variables and marker file that agents set. */
export function detectAgent(env: Env = process.env, exists: (path: string) => boolean = existsSync): boolean {
  if (SIGNALS.some((name) => env[name]?.trim())) return true;
  if (env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec' || env.OPENCODE === '1') return true;
  return exists('/opt/.devin');
}
