import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const cloudRoot = fileURLToPath(new URL('..', import.meta.url));
const projectRoot = resolve(cloudRoot, '..');
for (const relative of ['server/service.ts', 'shared/game.ts']) {
  const destination = resolve(cloudRoot, 'vendor', relative);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(resolve(projectRoot, relative), destination);
}
await writeFile(resolve(cloudRoot, 'vendor/README.md'),
  'Generated copy of the shared game rules and room API. Run `npm run sync-source` from cloud/ after editing the originals. Keep these copies in the deployment source so the Worker build is self-contained.\n');
// Fail early if the service accidentally imports a Node-only transport or filesystem.
const service = await readFile(resolve(cloudRoot, 'vendor/server/service.ts'), 'utf8');
if (/from\s+['"]node:/.test(service)) throw new Error('Portable room API contains a Node-only import.');
console.log('Shared game rules and room service copied into cloud/vendor.');
