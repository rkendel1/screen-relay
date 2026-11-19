import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const bundle = join(root, 'dist/cli/agent-test.mjs');
buildSync({ entryPoints: [join(root, 'src/cli/agent.ts')], bundle: true, outfile: bundle, platform: 'node', format: 'esm' });
const { detectAgent } = await import(pathToFileURL(bundle).href);
const absent = () => false;

test('an empty environment is not an agent', () => {
  assert.equal(detectAgent({}, absent), false);
});

test('each agent variable marks an agent', () => {
  for (const name of ['AI_AGENT', 'CURSOR_TRACE_ID', 'CURSOR_AGENT', 'GEMINI_CLI', 'CODEX_SANDBOX', 'CODEX_CI', 'CODEX_THREAD_ID',
    'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT', 'OPENCODE_CLIENT', 'CLAUDECODE', 'CLAUDE_CODE', 'REPL_ID',
    'COPILOT_MODEL', 'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN']) {
    assert.equal(detectAgent({ [name]: '1' }, absent), true, name);
  }
});

test('values that do not name an agent are ignored', () => {
  assert.equal(detectAgent({ AI_AGENT: '  ' }, absent), false);
  assert.equal(detectAgent({ OPENCODE: '0' }, absent), false);
  assert.equal(detectAgent({ CURSOR_EXTENSION_HOST_ROLE: 'user' }, absent), false);
});

test('value-specific signals and the marker file mark an agent', () => {
  assert.equal(detectAgent({ OPENCODE: '1' }, absent), true);
  assert.equal(detectAgent({ CURSOR_EXTENSION_HOST_ROLE: 'agent-exec' }, absent), true);
  assert.equal(detectAgent({}, (path) => path === '/opt/.devin'), true);
});
