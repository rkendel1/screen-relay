#!/usr/bin/env node
// Publish the package to npm from the CLI.
// Reads NPM_TOKEN from the environment or .env.local, builds, and skips
// versions that npm already has. Pass --dry-run to preview without publishing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] ??= value;
  }
}

loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env'));

const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token && !dryRun) {
  console.error('NPM_TOKEN is not set. Add it to .env.local or export it.');
  process.exit(1);
}

const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
}

// A temporary userconfig keeps the token out of the repo and the process list.
const tmp = mkdtempSync(join(tmpdir(), 'publish-'));
const userconfig = join(tmp, 'npmrc');
writeFileSync(userconfig, `//registry.npmjs.org/:_authToken=${token ?? ''}\n`, { mode: 0o600 });
const env = { ...process.env, NPM_CONFIG_USERCONFIG: userconfig };

try {
  const view = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (view.status === 0 && view.stdout.trim() === version) {
    console.log(`${name}@${version} is already published; skipping.`);
    process.exit(0);
  }
  if (view.status !== 0 && !/E404/.test(view.stderr)) {
    console.error(view.stderr);
    process.exit(1);
  }

  if (run('npm', ['run', 'build']).status !== 0) process.exit(1);

  const args = ['publish', '--access', 'public'];
  if (dryRun) args.push('--dry-run');
  console.log(`${dryRun ? 'Dry run: ' : ''}publishing ${name}@${version}`);
  // Provenance only works from CI, so it is not requested here.
  process.exit(run('npm', args, { env }).status ?? 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
