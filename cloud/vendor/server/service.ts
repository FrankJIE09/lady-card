import {
  createDeck,
  DEFAULT_RULES,
  RANKS,
  type GameCard,
  type Mode,
  type Phase,
  type RoomView,
  type Rule,
} from "../shared/game.ts";

export interface StoredRoom {
  code: string;
  mode: Mode;
  phase: Phase;
  players: { id: string; name: string; token: string }[];
  hostId: string;
  turnPlayerId: string | null;
  currentCard: GameCard | null;
  history: GameCard[];
  rules: Rule[];
  revision: number;
  deck: GameCard[];
  createdAt: number;
  expiresAt: number;
}
export interface RoomStore {
  get(code: string): Promise<StoredRoom | null>;
  insert(room: StoredRoom): Promise<boolean>;
  compareAndSwap(room: StoredRoom, expectedRevision: number): Promise<boolean>;
  remove(code: string): Promise<void>;
}
export interface ApiOptions {
  allowedOrigins?: string[];
  allowPrivateOrigins?: boolean;
}
export const ROOM_TTL = 24 * 60 * 60 * 1000;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const modeOf = (input: unknown): Mode => {
  if (input === "lady" || input === "queen" || input === "gentleman")
    return input;
  return fail(400, "请选择一种有效的玩法。");
};
function nameOf(input: unknown): string {
  if (typeof input !== "string") return fail(400, "请填写昵称。");
  const name = input.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (name.length < 1 || name.length > 16)
    return fail(400, "昵称需要 1–16 个字符。");
  return name;
}
export function validateRules(input: unknown, mode: Mode): Rule[] {
  if (input === undefined) return structuredClone(DEFAULT_RULES[mode]);
  if (!Array.isArray(input) || input.length !== 13)
    return fail(400, "每套玩法需要 A 到 K 的 13 条规则。");
  return RANKS.map((rank) => {
    const matches = input.filter((item) => item && item.rank === rank);
    const item = matches[0];
    if (
      matches.length !== 1 ||
      typeof item.title !== "string" ||
      typeof item.description !== "string"
    )
      return fail(400, "规则格式不完整，请检查 A 到 K。");
    const title = item.title.trim();
    const description = item.description.trim();
    if (!title || title.length > 24 || !description || description.length > 200)
      return fail(400, "规则名称最多 24 字，内容最多 200 字，且不能为空。");
    return { rank, title, description };
  });
}
export function publicRoom(room: StoredRoom): RoomView {
  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    players: room.players.map(({ id, name }) => ({ id, name })),
    hostId: room.hostId,
    turnPlayerId: room.turnPlayerId,
    currentCard: room.currentCard,
    remaining: room.deck.length,
    history: room.history,
    rules: room.rules,
    revision: room.revision,
  };
}
const newToken = () =>
  `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
function newCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (100000 + (values[0] % 900000)).toString();
}
export class RoomService {
  constructor(private store: RoomStore) {}
  private async load(code: string): Promise<StoredRoom> {
    if (!/^\d{6}$/.test(code)) return fail(400, "房间号为 6 位数字。");
    const room = await this.store.get(code);
    if (!room) return fail(404, "房间不存在或已结束，请检查房间号。");
    if (room.expiresAt <= Date.now()) {
      await this.store.remove(code);
      return fail(410, "这个房间已过期，请创建新房间。");
    }
    return structuredClone(room);
  }
  private member(room: StoredRoom, token: string) {
    const player = room.players.find((item) => token && item.token === token);
    if (!player) return fail(401, "入场凭证已失效，请重新加入房间。");
    return player;
  }
  async create(input: Record<string, unknown>) {
    const name = nameOf(input.name);
    const mode = modeOf(input.mode);
    const rules = validateRules(input.rules, mode);
    const player = { id: crypto.randomUUID(), name, token: newToken() };
    for (let i = 0; i < 12; i++) {
      const room: StoredRoom = {
        code: newCode(),
        mode,
        phase: "lobby",
        players: [player],
        hostId: player.id,
        turnPlayerId: null,
        currentCard: null,
        history: [],
        rules,
        revision: 0,
        deck: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + ROOM_TTL,
      };
      if (await this.store.insert(room))
        return {
          room: publicRoom(room),
          playerId: player.id,
          token: player.token,
        };
    }
    return fail(503, "房间暂时有点拥挤，请稍后再试。");
  }
  async join(code: string, input: Record<string, unknown>) {
    const name = nameOf(input.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const room = await this.load(code);
      if (room.players.length >= 12)
        return fail(409, "房间已满，最多可加入 12 位朋友。");
      const player = { id: crypto.randomUUID(), name, token: newToken() };
      const previous = room.revision;
      room.players.push(player);
      room.revision++;
      if (await this.store.compareAndSwap(room, previous))
        return {
          room: publicRoom(room),
          playerId: player.id,
          token: player.token,
        };
    }
    return fail(409, "朋友们正在同时入场，请再点一次加入。");
  }
  async get(code: string, token: string) {
    const room = await this.load(code);
    this.member(room, token);
    return { room: publicRoom(room) };
  }
  async action(code: string, token: string, input: Record<string, unknown>) {
    const room = await this.load(code);
    const player = this.member(room, token);
    const host = player.id === room.hostId;
    const action = input.action;
    const previous = room.revision;
    if (
      input.revision !== undefined &&
      (!Number.isSafeInteger(input.revision) || input.revision !== previous)
    )
      return fail(409, "牌桌刚刚更新了，请稍等后重试。");
    if (action === "start" || action === "restart") {
      if (!host) return fail(403, "只有房主可以开局。");
      if (action === "start" && room.phase !== "lobby")
        return fail(409, "这一局已经开始了。");
      if (action === "restart") {
        room.phase = "lobby";
        room.deck = [];
        room.currentCard = null;
        room.history = [];
        room.turnPlayerId = null;
      } else {
        room.deck = createDeck(room.mode, room.rules);
        room.phase = "playing";
        room.currentCard = null;
        room.history = [];
        room.turnPlayerId = room.players[0].id;
      }
    } else if (action === "draw") {
      if (!Number.isSafeInteger(input.revision))
        return fail(400, "抽牌需要当前牌桌版本，请刷新后重试。");
      if (room.phase !== "playing") return fail(409, "请先开局再抽牌。");
      if (player.id !== room.turnPlayerId && !host)
        return fail(403, "还没轮到你，看看朋友抽到了什么吧。");
      const turnIndex = room.players.findIndex(
        (item) => item.id === room.turnPlayerId,
      );
      if (turnIndex < 0 || room.deck.length === 0)
        return fail(409, "这一局已结束。");
      const active = room.players[turnIndex];
      const card = {
        ...room.deck.pop()!,
        playerId: active.id,
        playerName: active.name,
      };
      room.currentCard = card;
      room.history.unshift(card);
      if (room.deck.length === 0) {
        room.phase = "finished";
        room.turnPlayerId = null;
      } else
        room.turnPlayerId =
          room.players[(turnIndex + 1) % room.players.length].id;
    } else if (action === "settings") {
      if (!host) return fail(403, "只有房主可以修改玩法。");
      if (room.phase !== "lobby") return fail(409, "请在开局前修改玩法。");
      const mode = input.mode === undefined ? room.mode : modeOf(input.mode);
      room.rules =
        input.rules !== undefined || mode !== room.mode
          ? validateRules(input.rules, mode)
          : room.rules;
      room.mode = mode;
    } else if (action === "leave") {
      const index = room.players.findIndex((item) => item.id === player.id);
      room.players.splice(index, 1);
      if (room.players.length === 0) {
        // The revisioned tombstone prevents an older in-flight action from reviving the room.
        room.phase = "finished";
        room.turnPlayerId = null;
        room.deck = [];
        room.expiresAt = Date.now();
      } else {
        if (host) room.hostId = room.players[0].id;
        if (room.turnPlayerId === player.id)
          room.turnPlayerId = room.players[index % room.players.length].id;
      }
    } else return fail(400, "暂不支持这个牌桌操作。");
    room.revision++;
    if (!(await this.store.compareAndSwap(room, previous)))
      return fail(409, "牌桌刚刚更新了，请稍等后重试。");
    return { room: publicRoom(room) };
  }
}

function privateOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      /^10\.(\d{1,3}\.){2}\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

export function createApiHandler(store: RoomStore, options: ApiOptions = {}) {
  const service = new RoomService(store);
  const buckets = new Map<string, { count: number; until: number }>();
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin) {
      const allowed =
        origin === url.origin ||
        options.allowedOrigins?.includes(origin) ||
        ((options.allowPrivateOrigins ?? true) && privateOrigin(origin));
      if (!allowed) return json({ error: "这个网址尚未获准连接牌桌。" }, 403);
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      headers.set("Access-Control-Max-Age", "600");
    }
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === "/api/health" && request.method === "GET")
        return json({ ok: true, service: "lady-card" });
      const match = url.pathname.match(
        /^\/api\/rooms(?:\/(\d{6})(?:\/(join|action))?)?\/?$/,
      );
      if (!match) return json({ error: "没有找到这个接口。" }, 404);
      const [, code, route] = match;
      const token =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (request.method === "GET" && code && !route)
        return json(await service.get(code, token));
      if (request.method !== "POST")
        return json({ error: "不支持这个请求方式。" }, 405);
      // Keep room-creation/join abuse bounded without penalizing one-second room polling.
      const address =
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-real-ip") ??
        "local";
      const key = `${address}:${!code || route === "join" ? "entry" : "action"}`;
      const now = Date.now();
      const bucket = buckets.get(key);
      const limit = !code || route === "join" ? 40 : 240;
      if (bucket && bucket.until > now) {
        if (++bucket.count > limit)
          return json({ error: "操作有点快，请稍等一分钟再试。" }, 429);
      } else buckets.set(key, { count: 1, until: now + 60_000 });
      if (buckets.size > 2000)
        for (const [bucketKey, value] of buckets)
          if (value.until <= now) buckets.delete(bucketKey);
      if (Number(request.headers.get("content-length")) > 16_384)
        return json({ error: "提交内容太长了。" }, 413);
      const reader = request.body?.getReader();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          if (bytes > 16_384) {
            await reader.cancel();
            return json({ error: "提交内容太长了。" }, 413);
          }
          chunks.push(result.value);
        }
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(new TextDecoder().decode(joined));
      } catch {
        return json({ error: "请求内容不是有效的 JSON。" }, 400);
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "请求格式不正确。" }, 400);
      if (!code) return json(await service.create(input), 201);
      if (route === "join") return json(await service.join(code, input));
      if (route === "action")
        return json(await service.action(code, token, input));
      return json({ error: "没有找到这个接口。" }, 404);
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message }, error.status);
      console.error(
        "Room request failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      return json({ error: "牌桌暂时连接不上，请稍后再试。" }, 500);
    }
  };
}
