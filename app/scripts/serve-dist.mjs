/**
 * Serve `dist/` the way the real server does, for testing.
 *
 *   node scripts/serve-dist.mjs [port] [dir]
 *
 * The one thing that matters here is the SPA fallback: without it every deep
 * link 404s and a test walk reports the whole app as broken when nothing is.
 * `python -m http.server` does not do it, which is exactly how that false alarm
 * happened.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[3] ?? 'dist'
);
const port = Number(process.argv[2] ?? 8202);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, url);

    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    // An unknown path is a route, not a missing file.
    if (!fs.existsSync(file)) file = path.join(root, 'index.html');

    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`serving dist on http://127.0.0.1:${port}`));
