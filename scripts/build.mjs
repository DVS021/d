import { mkdir, readFile, writeFile, cp, stat, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadVideoCatalog, videoCatalogScript } from './video-catalog.mjs';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('assets/video-utils.js', root), 'utf8'), context);
const catalog = await loadVideoCatalog(fileURLToPath(root));
if (!Array.isArray(catalog)) throw new Error('Video catalog must be an array.');
const ids = new Set();
for (const video of catalog) {
  if (!context.window.PORTAL_VIDEO_UTILS.validVideo(video) || ids.has(video.id)) throw new Error('Invalid or duplicate video entry.');
  ids.add(video.id);
  for (const file of [video.provider === 'google-drive' ? null : video.src, video.poster, video.captions].filter(Boolean)) {
    if (!(await stat(new URL(file, root))).isFile()) throw new Error(`Missing media file: ${file}`);
  }
}
await mkdir(out, { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });
await writeFile(new URL('assets/videos.js', out), videoCatalogScript(catalog));
await cp(new URL('documents/', root), new URL('documents/', out), { recursive: true });
await rm(new URL('media/', out), { recursive: true, force: true });
try {
  await stat(new URL('media/', root));
  await cp(new URL('media/', root), new URL('media/', out), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const html = await readFile(new URL('index.html', root), 'utf8');
await writeFile(new URL('index.html', out), html);
const css = await readFile(new URL('assets/styles.css', root), 'utf8');
const data = await readFile(new URL('assets/data.js', root), 'utf8');
const app = await readFile(new URL('assets/app.js', root), 'utf8');
const tests = await readFile(new URL('assets/tests.js', root), 'utf8');
const videos = videoCatalogScript(catalog);
const videoUtils = await readFile(new URL('assets/video-utils.js', root), 'utf8');
const learning = await readFile(new URL('assets/learning.js', root), 'utf8');
const learningUI = await readFile(new URL('assets/learning-ui.js', root), 'utf8');
const logo = (await readFile(new URL('assets/rarus-logo.png', root))).toString('base64');
const standalone = html
  .replace('src="assets/rarus-logo.png"', () => `src="data:image/png;base64,${logo}"`)
  .replace('<link rel="stylesheet" href="assets/styles.css" />', () => `<style>${css}</style>`)
  .replace('<script src="assets/data.js" defer></script>', () => `<script>${data}</script>`)
  .replace('<script src="assets/tests.js" defer></script>', () => `<script>${tests}</script>`)
  .replace('<script src="assets/videos.js" defer></script>', () => `<script>${videos}</script>`)
  .replace('<script src="assets/video-utils.js" defer></script>', () => `<script>${videoUtils}</script>`)
  .replace('<script src="assets/learning.js" defer></script>', () => `<script>${learning}</script>`)
  .replace('<script src="assets/learning-ui.js" defer></script>', () => `<script>${learningUI}</script>`)
  .replace('<script src="assets/app.js" defer></script>', () => `<script>${app}</script>`);
await writeFile(new URL('dvis-standards.html', out), standalone);
console.log('Built dist/index.html and standalone dist/dvis-standards.html');
