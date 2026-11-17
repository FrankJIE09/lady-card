import type { RoomView } from "../../shared/game";
export type RoomSession = { code: string; playerId: string; token: string };
const origin = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${origin}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data)
      throw new RequestError(
        data?.error || "房间服务暂时不可用，请稍后重试。",
        response.status,
      );
    return data as T;
  } catch (e) {
    if (
      e instanceof TypeError ||
      (e instanceof Error && e.name === "AbortError")
    )
      throw new Error("暂时连接不上房间。请检查网络，或先选择「同屏开一局」。");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export type SessionResponse = {
  room: RoomView;
  playerId: string;
  token: string;
};
