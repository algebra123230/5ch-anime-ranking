// Minimal static file server for tests: serves the repo root on a random port.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

export function startServer() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let body;
    try {
      body = await readFile(file);
    } catch {
      return res.writeHead(404).end("not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
