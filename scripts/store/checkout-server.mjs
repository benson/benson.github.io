import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleStoreApiRequest } from "./checkout.mjs";
import { loadLocalEnv } from "./env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
loadLocalEnv();

const port = Number(process.env.PORT || 8787);
const orderValues = new Map();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function nodeRequestUrl(req) {
  return new URL(req.url || "/", `http://localhost:${port}`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function safeStaticPath(url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const relative = pathname.replace(/^\/+/, "");
  const target = path.resolve(root, relative.endsWith("/") ? path.join(relative, "index.html") : relative);
  if (!target.startsWith(root)) return null;
  return target;
}

async function serveStatic(req, res, url) {
  const target = safeStaticPath(url);
  if (!target) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  try {
    const bytes = await fs.readFile(target);
    const type = contentTypes[path.extname(target)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(bytes);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = nodeRequestUrl(req);

  if (url.pathname.startsWith("/api/store/")) {
    const body = await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body
    });
    await sendResponse(
      res,
      await handleStoreApiRequest(request, {
        orderStore: {
          async get(key) {
            return orderValues.get(key) || null;
          },
          async put(key, value) {
            orderValues.set(key, value);
          }
        }
      })
    );
    return;
  }

  await serveStatic(req, res, url);
});

server.listen(port, () => {
  console.log(`store checkout dev server: http://localhost:${port}/store/`);
});
