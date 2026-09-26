// ブラウザだけで動くアプリを配信するだけのサーバー(マイクは http://localhost か https でしか使えないため)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end();
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, () => console.log(`ボイスチェンジャー: http://localhost:${PORT}`));
