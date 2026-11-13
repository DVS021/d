import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadVideoCatalog, videoCatalogScript } from './video-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/styles.css', ['assets/styles.css', 'text/css; charset=utf-8']],
  ['/assets/data.js', ['assets/data.js', 'text/javascript; charset=utf-8']],
  ['/assets/tests.js', ['assets/tests.js', 'text/javascript; charset=utf-8']],
  ['/assets/app.js', ['assets/app.js', 'text/javascript; charset=utf-8']],
  ['/assets/study.js', ['assets/study.js', 'text/javascript; charset=utf-8']],
  ['/assets/study-ui.js', ['assets/study-ui.js', 'text/javascript; charset=utf-8']],
  ['/assets/videos.js', ['assets/videos.js', 'text/javascript; charset=utf-8']],
  ['/assets/video-utils.js', ['assets/video-utils.js', 'text/javascript; charset=utf-8']],
  ['/assets/rarus-logo.png', ['assets/rarus-logo.png', 'image/png']],
  ['/assets/learning.js', ['assets/learning.js', 'text/javascript; charset=utf-8']],
  ['/assets/learning-ui.js', ['assets/learning-ui.js', 'text/javascript; charset=utf-8']],
  ['/assets/navigation.js', ['assets/navigation.js', 'text/javascript; charset=utf-8']],
  ['/assets/materials.js', ['assets/materials.js', 'text/javascript; charset=utf-8']],
  ['/assets/materials-ui.js', ['assets/materials-ui.js', 'text/javascript; charset=utf-8']],
  ['/trainer/', ['trainer/index.html', 'text/html; charset=utf-8']],
  ['/trainer/index.html', ['trainer/index.html', 'text/html; charset=utf-8']],
  ['/trainer/voice-check.html', ['trainer/voice-check.html', 'text/html; charset=utf-8']],
  ['/trainer/voice-preview-20261110.mp3', ['trainer/voice-preview-20261110.mp3', 'audio/mpeg']],
  ...['app.js', 'engine.js', 'data.js', 'role-cases.js', 'audio-map.js', 'audio-levels.js'].map(file => ['/trainer/' + file, ['trainer/' + file, 'text/javascript; charset=utf-8']]),
  ['/trainer/style.css', ['trainer/style.css', 'text/css; charset=utf-8']],
  ['/documents/sales-navigator-2026-10-28.docx', ['documents/sales-navigator-2026-10-28.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['/documents/glossary-v2.docx', ['documents/glossary-v2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['/documents/standard-2-v2.docx', ['documents/standard-2-v2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['/documents/standard-3-v2.docx', ['documents/standard-3-v2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['/documents/lesson-1-why-standards.pptx', ['documents/lesson-1-why-standards.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']],
  ['/documents/lesson-1-why-standards.pdf', ['documents/lesson-1-why-standards.pdf', 'application/pdf']],
  ['/documents/lesson-2-routing.pptx', ['documents/lesson-2-routing.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']],
  ['/documents/lesson-2-routing.pdf', ['documents/lesson-2-routing.pdf', 'application/pdf']],
  ['/documents/sales-memos-v2.pptx', ['documents/sales-memos-v2.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']],
  ['/documents/sales-memos-v2.pdf', ['documents/sales-memos-v2.pdf', 'application/pdf']],
]);

for (const [name,mime] of [['standard-4-v2.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['lesson-3-presenter-notes.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['lesson-3-lead.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],['lesson-3-lead-advanced.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation']]) allowedFiles.set('/documents/'+name,['documents/'+name,mime]);

allowedFiles.set('/trainer/portrait-cartoon-20261109.png',['trainer/portrait-cartoon-20261109.png','image/png']);
allowedFiles.set('/trainer/portrait-speaking-natural-20261109.png',['trainer/portrait-speaking-natural-20261109.png','image/png']);
const mediaTypes = { mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', vtt: 'text/vtt; charset=utf-8' };

async function serveMedia(req, res, pathname, rootDirectory) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const match = decoded.match(/^\/media\/(videos|standards|lessons\/lesson-1)\/([^/\\\x00-\x1f\x7f]+)\.(mp4|webm|ogv|jpg|jpeg|png|webp|vtt)$/i)
    || decoded.match(/^\/(trainer\/audio)\/([a-f0-9]{16})\.(mp3)$/);
  if (!match || match[2].startsWith('.') || (!['videos', 'trainer/audio'].includes(match[1]) && !/^(jpg|jpeg|png|webp)$/i.test(match[3]))) return false;
  try {
    const file = await realpath(resolve(rootDirectory, decoded.slice(1)));
    const directory = resolve(rootDirectory, match[1] === 'trainer/audio' ? match[1] : 'media/' + match[1]) + '/';
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
    res.writeHead(status, { 'Content-Type': mediaTypes[match[3].toLowerCase()], 'Accept-Ranges': 'bytes', 'Content-Length': Math.max(0, end - start + 1) });
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

export function createServer({ rootDirectory = root } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (await serveMedia(req, res, pathname, rootDirectory)) return;
    if (pathname === '/assets/videos.js') {
      try {
        const content = Buffer.from(videoCatalogScript(await loadVideoCatalog(rootDirectory)));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': content.length });
        res.end(req.method === 'HEAD' ? undefined : content);
      } catch (error) {
        console.error('Cannot create video catalog:', error.message);
        res.writeHead(500).end('Cannot load video catalog');
      }
      return;
    }
    const entry = allowedFiles.get(pathname);
    if (!entry) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(resolve(rootDirectory, entry[0]));
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
