import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createDeck, DEFAULT_RULES, type Mode } from "../shared/game.ts";
import {
  ApiError,
  createApiHandler,
  RoomService,
  type StoredRoom,
} from "../server/service.ts";
import { FileRoomStore, MemoryRoomStore } from "../server/store.ts";
import { createAppServer } from "../server/index.ts";

test("all three rule packs produce 52 unique cards with the selected custom rules", () => {
  for (const mode of ["lady", "queen", "gentleman"] as Mode[]) {
    const deck = createDeck(mode);
    assert.equal(deck.length, 52);
    assert.equal(new Set(deck.map((card) => card.id)).size, 52);
    assert.equal(deck.filter((card) => card.rank === "Q").length, 4);
    const custom = structuredClone(DEFAULT_RULES[mode]);
    custom[0].title = "自定义规则";
    assert.ok(
      createDeck(mode, custom)
        .filter((card) => card.rank === "A")
        .every((card) => card.title === "自定义规则"),
    );
  }
});

test("private tokens and future card order never enter public state", async () => {
  const store = new MemoryRoomStore();
  const service = new RoomService(store);
  const host = await service.create({ name: "房主", mode: "lady" });
  const joined = await service.join(host.room.code, { name: "朋友" });
  const result = await service.action(host.room.code, host.token, {
    action: "start",
    revision: joined.room.revision,
  });
  const json = JSON.stringify(result);
  assert.ok(!json.includes(host.token));
  assert.ok(!json.includes(joined.token));
  assert.ok(!json.includes("deck"));
  assert.equal(result.room.remaining, 52);
  await assert.rejects(
    () => service.get(host.room.code, "wrong-token"),
    (error: ApiError) => error.status === 401,
  );
});

test("simultaneous draws accept one revision once; turns and host permissions are enforced", async () => {
  const service = new RoomService(new MemoryRoomStore());
  const host = await service.create({ name: "房主", mode: "lady" });
  const friend = await service.join(host.room.code, { name: "朋友" });
  await assert.rejects(
    () => service.action(host.room.code, friend.token, { action: "start" }),
    (error: ApiError) => error.status === 403,
  );
  const started = await service.action(host.room.code, host.token, {
    action: "start",
  });
  await assert.rejects(
    () =>
      service.action(host.room.code, friend.token, {
        action: "draw",
        revision: started.room.revision,
      }),
    (error: ApiError) => error.status === 403,
  );
  const outcomes = await Promise.allSettled([
    service.action(host.room.code, host.token, {
      action: "draw",
      revision: started.room.revision,
    }),
    service.action(host.room.code, host.token, {
      action: "draw",
      revision: started.room.revision,
    }),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const state = (await service.get(host.room.code, friend.token)).room;
  assert.equal(state.remaining, 51);
  assert.equal(state.history.length, 1);
  assert.equal(state.currentCard?.playerId, host.playerId);
  assert.equal(state.turnPlayerId, friend.playerId);
  const next = await service.action(host.room.code, friend.token, {
    action: "draw",
    revision: state.revision,
  });
  assert.equal(next.room.currentCard?.playerId, friend.playerId);
  assert.equal(next.room.turnPlayerId, host.playerId);
});

test("a full game has no duplicate draws, ends at 52, and restart returns to joinable lobby", async () => {
  const service = new RoomService(new MemoryRoomStore());
  const host = await service.create({ name: "房主", mode: "queen" });
  let { room } = await service.action(host.room.code, host.token, {
    action: "start",
  });
  await assert.rejects(
    () => service.join(room.code, { name: "迟到的朋友" }),
    (error: ApiError) => error.status === 409,
  );
  for (let i = 0; i < 52; i++)
    ({ room } = await service.action(room.code, host.token, {
      action: "draw",
      revision: room.revision,
    }));
  assert.equal(room.phase, "finished");
  assert.equal(room.remaining, 0);
  assert.equal(room.turnPlayerId, null);
  assert.equal(new Set(room.history.map((card) => card.id)).size, 52);
  await assert.rejects(
    () =>
      service.action(room.code, host.token, {
        action: "draw",
        revision: room.revision,
      }),
    (error: ApiError) => error.status === 409,
  );
  ({ room } = await service.action(room.code, host.token, {
    action: "restart",
  }));
  assert.equal(room.phase, "lobby");
  assert.equal(room.history.length, 0);
  assert.equal(
    (await service.join(room.code, { name: "新朋友" })).room.players.length,
    2,
  );
});

test("leaving transfers host and current turn, and invalidates departed credentials", async () => {
  const service = new RoomService(new MemoryRoomStore());
  const host = await service.create({ name: "房主", mode: "gentleman" });
  const friend = await service.join(host.room.code, { name: "朋友" });
  await service.action(host.room.code, host.token, { action: "start" });
  const result = await service.action(host.room.code, host.token, {
    action: "leave",
  });
  assert.equal(result.room.hostId, friend.playerId);
  assert.equal(result.room.turnPlayerId, friend.playerId);
  await assert.rejects(
    () => service.get(host.room.code, host.token),
    (error: ApiError) => error.status === 401,
  );
  await service.action(host.room.code, friend.token, { action: "leave" });
  await assert.rejects(
    () => service.get(host.room.code, friend.token),
    (error: ApiError) => error.status === 410,
  );
});

test("room capacity, rule limits, expired rooms, and settings are validated", async () => {
  const store = new MemoryRoomStore();
  const service = new RoomService(store);
  await assert.rejects(
    () => service.create({ name: "", mode: "lady" }),
    (error: ApiError) => error.status === 400,
  );
  await assert.rejects(
    () => service.create({ name: "朋友", mode: "unknown" }),
    (error: ApiError) => error.status === 400,
  );
  await assert.rejects(
    () => service.create({ name: "朋友", mode: "lady", rules: [] }),
    (error: ApiError) => error.status === 400,
  );
  const host = await service.create({ name: "房主", mode: "lady" });
  for (let i = 0; i < 11; i++)
    await service.join(host.room.code, { name: `朋友${i}` });
  await assert.rejects(
    () => service.join(host.room.code, { name: "满员" }),
    (error: ApiError) => error.status === 409,
  );
  const updated = await service.action(host.room.code, host.token, {
    action: "settings",
    mode: "queen",
  });
  assert.equal(updated.room.rules[1].title, "大姐登场");
  const raw = (await store.get(host.room.code)) as StoredRoom;
  raw.expiresAt = Date.now() - 1;
  await store.compareAndSwap(raw, raw.revision);
  await assert.rejects(
    () => service.get(host.room.code, host.token),
    (error: ApiError) => error.status === 410,
  );
});

test("HTTP handler handles CORS, malformed JSON, payload limits and auth", async () => {
  const handler = createApiHandler(new MemoryRoomStore(), {
    allowedOrigins: ["https://example.github.io"],
  });
  const req = (path: string, init?: RequestInit) =>
    new Request(`http://localhost:3001${path}`, init);
  const denied = await handler(
    req("/api/rooms", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    }),
  );
  assert.equal(denied.status, 403);
  const preflight = await handler(
    req("/api/rooms", {
      method: "OPTIONS",
      headers: { origin: "https://example.github.io" },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "https://example.github.io",
  );
  assert.equal(
    (await handler(req("/api/rooms", { method: "POST", body: "{oops" })))
      .status,
    400,
  );
  assert.equal(
    (
      await handler(
        req("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ name: "x".repeat(17000) }),
        }),
      )
    ).status,
    413,
  );
  const response = await handler(
    req("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "朋友", mode: "lady" }),
    }),
  );
  assert.equal(response.status, 201);
  const created = (await response.json()) as {
    room: { code: string };
    token: string;
  };
  assert.equal(
    (await handler(req(`/api/rooms/${created.room.code}`))).status,
    401,
  );
  assert.equal(
    (
      await handler(
        req(`/api/rooms/${created.room.code}`, {
          headers: { Authorization: `Bearer ${created.token}` },
        }),
      )
    ).status,
    200,
  );
});

test("file storage survives a new service instance without leaking to public state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lady-card-test-"));
  try {
    const file = join(dir, "rooms.json");
    const service = new RoomService(new FileRoomStore(file));
    const host = await service.create({ name: "房主", mode: "lady" });
    const started = await service.action(host.room.code, host.token, {
      action: "start",
    });
    await service.action(host.room.code, host.token, {
      action: "draw",
      revision: started.room.revision,
    });
    const restored = new RoomService(new FileRoomStore(file));
    const { room } = await restored.get(host.room.code, host.token);
    assert.equal(room.remaining, 51);
    assert.equal(room.history.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Node HTTP adapter serves the built app and authorized API on one LAN endpoint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lady-card-http-"));
  await writeFile(
    join(dir, "index.html"),
    "<!doctype html><title>今夜开牌</title>",
  );
  const server = createAppServer({
    dataFile: join(dir, ".private/rooms.json"),
    staticDir: dir,
    port: 0,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("今夜开牌"));
    const createdResponse = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://192.168.1.50:5173",
      },
      body: JSON.stringify({ name: "手机朋友", mode: "lady" }),
    });
    assert.equal(createdResponse.status, 201);
    assert.equal(
      createdResponse.headers.get("access-control-allow-origin"),
      "http://192.168.1.50:5173",
    );
    const created = (await createdResponse.json()) as {
      room: { code: string };
      token: string;
    };
    const read = await fetch(`${origin}/api/rooms/${created.room.code}`, {
      headers: { Authorization: `Bearer ${created.token}` },
    });
    assert.equal(read.status, 200);
    assert.equal((await fetch(`${origin}/.private/rooms.json`)).status, 404);
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
    assert.ok(
      Array.isArray(
        (
          (await (await fetch(`${origin}/api/network`)).json()) as {
            urls: unknown;
          }
        ).urls,
      ),
    );
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
