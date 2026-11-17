import { createApiHandler } from '../vendor/server/service';
import { D1RoomStore, type RoomDatabase } from './store';

interface Env {
  DB: RoomDatabase;
  ALLOWED_ORIGINS?: string;
}

const handlers = new WeakMap<object, ReturnType<typeof createApiHandler>>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: '今夜开牌 · 房间服务',
        status: 'ready',
        play: 'https://frankjie09.github.io/lady-card/',
        health: '/api/health',
      }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: '房间服务暂不可用，请稍后重试。' }), {
        status: 503, headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    let handler = handlers.get(env.DB);
    if (!handler) {
      handler = createApiHandler(new D1RoomStore(env.DB), {
        allowedOrigins: [url.origin, 'https://frankjie09.github.io',
          ...(env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)],
        allowPrivateOrigins: false,
      });
      handlers.set(env.DB, handler);
    }
    return handler(request);
  },
};
