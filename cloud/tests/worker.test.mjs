import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const source = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const { tag } of journal.entries) {
    sqlite.exec(await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8'));
  }
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) ?? null; },
        async run() {
          const result = statement.run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  const request = async (path, body, token, origin = 'https://frankjie09.github.io') => {
    const response = await worker.fetch(new Request(`https://rooms.example${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), { DB });
    return { response, data: await response.json() };
  };
  return { request, sqlite };
}

test('D1 room lifecycle preserves private tokens and serializes simultaneous draws', async () => {
  const { request, sqlite } = await fixture();
  try {
    const { data: host, response } = await request('/api/rooms', { name: '房主', mode: 'lady' });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://frankjie09.github.io');
    assert.equal(host.room.players[0].token, undefined);
    assert.equal(host.room.deck, undefined);
    const code = host.room.code;
    const { data: guest } = await request(`/api/rooms/${code}/join`, { name: '朋友' });
    const denied = await request(`/api/rooms/${code}/action`, { action: 'start' }, guest.token);
    assert.equal(denied.response.status, 403);
    const { data: started } = await request(`/api/rooms/${code}/action`, { action: 'start', revision: guest.room.revision }, host.token);
    assert.equal(started.room.remaining, 52);
    const parallel = await Promise.all([
      request(`/api/rooms/${code}/action`, { action: 'draw', revision: started.room.revision }, host.token),
      request(`/api/rooms/${code}/action`, { action: 'draw', revision: started.room.revision }, host.token),
    ]);
    assert.deepEqual(parallel.map(({ response: item }) => item.status).sort(), [200, 409]);
    const { data: after } = await request(`/api/rooms/${code}`, undefined, guest.token);
    assert.equal(after.room.remaining, 51);
    assert.equal(after.room.history.length, 1);
    assert.equal(after.room.turnPlayerId, guest.playerId);
    const unauthenticated = await request(`/api/rooms/${code}`);
    assert.equal(unauthenticated.response.status, 401);
  } finally { sqlite.close(); }
});

test('cloud rejects unapproved origins and purges expired rooms during creation', async () => {
  const { request, sqlite } = await fixture();
  try {
    const denied = await request('/api/health', undefined, undefined, 'https://unapproved.example');
    assert.equal(denied.response.status, 403);
    sqlite.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?)').run('123456', '{}', 0, 1);
    const allowed = await request('/api/rooms', { name: '新朋友', mode: 'queen' });
    assert.equal(allowed.response.status, 201);
    assert.equal(sqlite.prepare('SELECT count(*) as count FROM rooms WHERE code = ?').get('123456').count, 0);
  } finally { sqlite.close(); }
});
