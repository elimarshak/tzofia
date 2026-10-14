// A small static file server for the load-time comparison: compresses text files the way GitHub Pages does
// and answers partial (Range) requests, which the map files need.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [root, port] = [process.argv[2], Number(process.argv[3])];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf',
  '.pmtiles': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.ttf', '.webmanifest']);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f), size = fs.statSync(f).size;
  const head = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'max-age=600', 'Access-Control-Allow-Origin': '*' };
  const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  if (range) {
    const a = Number(range[1]), b = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
    return fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  if (GZIP.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { ...head, 'Content-Encoding': 'gzip' });
    return fs.createReadStream(f).pipe(zlib.createGzip()).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  fs.createReadStream(f).pipe(res);
}).listen(port);
