import { build } from 'esbuild';
import { chmod, copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

const entries = [
  { entry: 'src/cli/main.ts', outfile: 'dist/cli/relay.mjs' },
  { entry: 'src/sdk/index.ts', outfile: 'dist/sdk/index.js' },
  { entry: 'src/protocol/index.ts', outfile: 'dist/protocol/index.js', neutral: true },
  { entry: 'src/app/provider.ts', outfile: 'dist/app/provider.js', external: ['@appport/*'] },
  { entry: 'src/stream/attach.ts', outfile: 'dist/stream/attach.js', neutral: true },
];

await Promise.all(entries.map(async ({ entry, outfile, neutral, external = [] }) => {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: neutral ? 'neutral' : 'node',
    format: 'esm',
    target: 'node20',
    define: { __RELAY_VERSION__: JSON.stringify(version) },
    banner: neutral ? {} : { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    packages: 'bundle',
    external,
  });
  await chmod(outfile, 0o755);
}));
await build({
  entryPoints: ['viewer/main.ts'],
  outfile: 'dist/viewer/viewer.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'relayViewer',
  target: 'es2020',
});
await mkdir('dist/viewer', { recursive: true });
await copyFile('viewer/index.html', 'dist/viewer/index.html');
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
