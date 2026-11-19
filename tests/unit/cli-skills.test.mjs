import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const bundle = join(root, 'dist/cli/skills-test.mjs');
buildSync({ entryPoints: [join(root, 'src/cli/skills.ts')], bundle: true, outfile: bundle, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
const skills = await import(pathToFileURL(bundle).href);

test('lists visible skills and loads full references', () => {
  assert.deepEqual(skills.list().map(({ name }) => name), ['core', 'remote-host']);
  assert.equal(skills.get('screen-relay').name, 'screen-relay');
  assert.equal(skills.path(), join(root, 'skills'));
  const core = skills.get('core', { full: true });
  assert.equal(core.name, 'core');
  assert.match(core.content, /## references\/cli\.md/);
  assert.match(core.content, /## references\/config\.md/);
  assert.match(core.content, /## references\/troubleshooting\.md/);
});

test('unknown skill names fail with a not-found error', () => {
  assert.throws(() => skills.get('missing'), { reason: 'not_found', message: 'Skill not found: missing' });
});
