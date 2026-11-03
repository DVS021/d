import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/styles.css', ['assets/styles.css', 'text/css; charset=utf-8']],
  ['/assets/data.js', ['assets/data.js', 'text/javascript; charset=utf-8']],
  ['/assets/tests.js', ['assets/tests.js', 'text/javascript; charset=utf-8']],
  ['/assets/app.js', ['assets/app.js', 'text/javascript; charset=utf-8']],
  ['/assets/videos.js', ['assets/videos.js', 'text/javascript; charset=utf-8']],
  ['/assets/video-utils.js', ['assets/video-utils.js', 'text/javascript; charset=utf-8']],
]);

const mediaTypes = { mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', vtt: 'text/vtt; charset=utf-8' };

async function serveMedia(req, res, pathname) {
  const match = pathname.match(/^\/media\/videos\/[a-z0-9][a-z0-9._-]*\.(mp4|webm|ogv|jpg|jpeg|png|webp|vtt)$/);
  if (!match) return false;
  try {
    const file = await realpath(resolve(root, pathname.slice(1)));
    const directory = resolve(root, 'media/videos') + '/';
    if (!file.startsWith(directory)) { res.writeHead(404).end('Not found'); return true; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end('Not found'); return true; }
    let start = 0, end = info.size - 1, status = 200;
    if (req.headers.range) {
      const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
      const valid = range && (range[1] || range[2]);
      if (valid) {
        if (range[1]) {
          start = Number(range[1]);
          end = range[2] ? Math.min(Number(range[2]), end) : end;
        } else { start = Math.max(0, info.size - Number(range[2])); }
      }
      if (!valid || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return true;
      }
      status = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    res.writeHead(status, { 'Content-Type': mediaTypes[match[1]], 'Accept-Ranges': 'bytes', 'Content-Length': Math.max(0, end - start + 1) });
    if (req.method === 'HEAD' || !info.size) res.end();
    else {
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Cannot load media');
  }
  return true;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (await serveMedia(req, res, pathname)) return;
    const entry = allowedFiles.get(pathname);
    if (!entry) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(resolve(root, entry[0]));
      res.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error('Cannot read application asset:', error.code);
      res.writeHead(500).end('Cannot load application');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`1C-Rarus portal listening on ${host}:${server.address().port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
