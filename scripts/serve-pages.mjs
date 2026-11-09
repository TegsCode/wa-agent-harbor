// Minimal static server that mimics GitHub Pages for the /wa-agent-harbor/ project site.
// Usage: node scripts/serve-pages.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist/client/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const base = "/wa-agent-harbor/";
const port = Number(process.argv[2] ?? 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function tryFile(path) {
  try {
    const s = await stat(path);
    if (s.isDirectory()) return tryFile(join(path, "index.html"));
    return path;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(base)) {
    res.writeHead(302, { location: base });
    res.end();
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, "");
  let file = await tryFile(join(root, rel || "index.html"));
  if (!file) file = await tryFile(join(root, "404.html"));
  if (!file) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(body);
}).listen(port, () => console.log(`Pages preview: http://localhost:${port}${base}`));
