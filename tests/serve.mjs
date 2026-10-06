// Minimal static server that mimics GitHub Pages closely enough for local testing:
// - serves dist/ under a base path (default /anima-body-anatomy/)
// - gzips text responses (html, js, css, json, svg, webmanifest) like Pages does
// - serves binary geometry as-is, with no Content-Encoding
// Usage: node tests/serve.mjs [--dir dist] [--base /anima-body-anatomy/] [--port 4173]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(arg('dir', 'dist'));
const base = arg('base', '/anima-body-anatomy/');
const port = Number(arg('port', 4173));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.bin': 'application/octet-stream',
  '.gz': 'application/gzip', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.md', '.txt']);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith(base)) {
    res.writeHead(302, {Location: base}).end();
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname.slice(base.length)));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('Not found');
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = {'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600'};
  if (COMPRESSIBLE.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers).end(body);
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}${base}`));
