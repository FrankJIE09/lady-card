import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (manifest.d1 !== 'DB') throw new Error('Room API requires the DB binding in .openai/hosting.json.');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await build({
  entryPoints: [resolve(root, 'worker/index.ts')],
  outfile: resolve(root, 'dist/server/index.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: false, legalComments: 'none',
});
await writeFile(resolve(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Cloud room API built to dist/server/index.js');
