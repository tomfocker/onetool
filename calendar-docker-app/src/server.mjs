import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEventStore } from "./eventStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const MAX_BODY_BYTES = 1024 * 1024;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode);
  response.end();
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new Error("请求体过大");
    }
  }
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function serveStatic(requestPath, response) {
  const requested = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(requested);
  const resolvedPath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, "禁止访问该路径");
    return;
  }

  try {
    const info = await stat(resolvedPath);
    if (!info.isFile()) {
      sendError(response, 404, "页面不存在");
      return;
    }

    const contentType = CONTENT_TYPES.get(path.extname(resolvedPath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "public, max-age=60"
    });
    createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "页面不存在");
      return;
    }
    throw error;
  }
}

async function handleApi(request, response, store, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { status: "ok", app: "mountain-calendar", version: "1.0.0" });
    return;
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    sendJson(response, 200, await store.listEvents());
    return;
  }

  if (url.pathname === "/api/events" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 201, await store.createEvent(body));
    return;
  }

  const eventMatch = url.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch && request.method === "PUT") {
    const body = await readJsonBody(request);
    const updated = await store.updateEvent(decodeURIComponent(eventMatch[1]), body);
    if (!updated) {
      sendError(response, 404, "事件不存在");
      return;
    }
    sendJson(response, 200, updated);
    return;
  }

  if (eventMatch && request.method === "DELETE") {
    const deleted = await store.deleteEvent(decodeURIComponent(eventMatch[1]));
    if (!deleted) {
      sendError(response, 404, "事件不存在");
      return;
    }
    sendEmpty(response, 204);
    return;
  }

  sendError(response, 404, "接口不存在");
}

export function createApp(options = {}) {
  const store = createEventStore(options);

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, store, url);
        return;
      }
      await serveStatic(url.pathname, response);
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 500;
      sendError(response, status, error.message || "服务器错误");
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "0.0.0.0";
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Mountain Calendar WebUI listening on http://${host}:${port}`);
  });
}
