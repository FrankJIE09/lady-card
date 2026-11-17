import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApiHandler } from "./service.ts";
import { FileRoomStore } from "./store.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};
export function lanAddresses(): string[] {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flatMap((values) => values ?? [])
        .filter((value) => value.family === "IPv4" && !value.internal)
        .map((value) => value.address),
    ),
  ];
}
function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function bodyBuffer(
  req: IncomingMessage,
): Promise<ArrayBuffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error("BODY_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks)).buffer;
}
async function serveStatic(
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "不支持这个请求方式。" });
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: "网址格式不正确。" });
  }
  if (
    decoded.split("/").some((part) => part.startsWith(".")) ||
    decoded.includes("\0")
  )
    return sendJson(res, 404, { error: "找不到这个页面。" });
  const requested = resolve(
    staticDir,
    `.${decoded === "/" ? "/index.html" : decoded}`,
  );
  if (requested !== staticDir && !requested.startsWith(staticDir + sep))
    return sendJson(res, 404, { error: "找不到这个页面。" });
  try {
    const actualRoot = await realpath(staticDir);
    const actual = await realpath(requested);
    if (!actual.startsWith(actualRoot + sep))
      return sendJson(res, 404, { error: "找不到这个页面。" });
    const details = await stat(actual);
    if (!details.isFile())
      return sendJson(res, 404, { error: "找不到这个页面。" });
    res.writeHead(200, {
      "Content-Type": mime[extname(actual)] ?? "application/octet-stream",
      "Content-Length": details.size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        extname(actual) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : await readFile(actual));
  } catch {
    sendJson(res, 404, {
      error: "找不到页面。开发时请打开前端地址；正式游玩前请先运行构建。",
    });
  }
}

export function createAppServer({
  dataFile = resolve(root, ".data/rooms.json"),
  staticDir = resolve(root, "dist"),
  port = Number(process.env.PORT ?? 3187),
} = {}) {
  const handler = createApiHandler(new FileRoomStore(dataFile), {
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    allowPrivateOrigins: true,
  });
  return createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? `localhost:${port}`}`,
      );
      if (url.pathname === "/api/network" && req.method === "GET") {
        const frontendPort = Number(process.env.FRONTEND_PORT ?? port);
        const urls = lanAddresses().map((ip) => `http://${ip}:${frontendPort}`);
        return sendJson(res, 200, {
          urls,
          url: urls[0] ?? `http://localhost:${frontendPort}`,
          apiUrls: lanAddresses().map((ip) => `http://${ip}:${port}`),
        });
      }
      if (!url.pathname.startsWith("/api/"))
        return await serveStatic(url.pathname, req, res, staticDir);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      // Trust the actual socket, not arbitrary client-supplied proxy headers.
      headers.delete("cf-connecting-ip");
      headers.set("x-real-ip", req.socket.remoteAddress ?? "unknown");
      const body = await bodyBuffer(req);
      const response = await handler(
        new Request(url, { method: req.method, headers, body }),
      );
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (!res.headersSent)
        sendJson(
          res,
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? 413
            : 500,
          {
            error:
              error instanceof Error && error.message === "BODY_TOO_LARGE"
                ? "提交内容太长了。"
                : "牌桌暂时连接不上，请稍后再试。",
          },
        );
      else res.end();
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT ?? 3187);
  const server = createAppServer({ port });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Lady Card API ready: http://localhost:${port}`);
    for (const ip of lanAddresses())
      console.log(`LAN: http://${ip}:${process.env.FRONTEND_PORT ?? port}`);
  });
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
