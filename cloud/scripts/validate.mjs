import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = await readFile(resolve(root, 'dist/server/index.js'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'dist/.openai/hosting.json'), 'utf8'));
assert.equal(manifest.d1, 'DB');
assert.ok(!/from\s+["']node:/.test(source), 'Worker must not import Node-only modules');
const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(typeof mod.default.fetch, 'function');
const response = await mod.default.fetch(new Request('https://example.test/'), {});
assert.equal(response.status, 200);
assert.equal((await response.json()).status, 'ready');
const unavailable = await mod.default.fetch(new Request('https://example.test/api/health'), {});
assert.equal(unavailable.status, 503);
console.log('Validated bundled Worker exports, manifest, routing and missing-binding handling.');
