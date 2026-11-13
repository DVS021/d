import { mkdir, readFile, writeFile, cp, stat, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { loadVideoCatalog, videoCatalogScript } from './video-catalog.mjs';
import { trainerExport } from './trainer-export.mjs';

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
const sourceHtml = await readFile(new URL('index.html', root), 'utf8');
// Keep the template independent of the previous build's asset version.
const html = sourceHtml.replace(/((?:src|href)="assets\/[^"?]+\.(?:js|css))(?:\?[^"\s]*)?"/g, '$1"');
const css = await readFile(new URL('assets/styles.css', root), 'utf8');
const data = await readFile(new URL('assets/data.js', root), 'utf8');
const app = await readFile(new URL('assets/app.js', root), 'utf8');
const study = await readFile(new URL('assets/study.js', root), 'utf8');
const studyUI = await readFile(new URL('assets/study-ui.js', root), 'utf8');
const tests = await readFile(new URL('assets/tests.js', root), 'utf8');
const videos = videoCatalogScript(catalog);
const videoUtils = await readFile(new URL('assets/video-utils.js', root), 'utf8');
const learning = await readFile(new URL('assets/learning.js', root), 'utf8');
const learningUI = await readFile(new URL('assets/learning-ui.js', root), 'utf8');
const navigation = await readFile(new URL('assets/navigation.js', root), 'utf8');
const materials = await readFile(new URL('assets/materials.js', root), 'utf8');
const materialsUI = await readFile(new URL('assets/materials-ui.js', root), 'utf8');
const logo = (await readFile(new URL('assets/rarus-logo.png', root))).toString('base64');
const trainerFiles = new Map();
for (const name of ['index.html', 'style.css', 'app.js', 'engine.js', 'data.js', 'role-cases.js', 'audio-map.js', 'audio-levels.js']) {
  const source = await readFile(new URL('trainer/' + name, root), 'utf8');
  trainerFiles.set(name, source.replace(/\?v=[a-z0-9]+/g, '?v=trainer'));
}
const trainerAudioHashes = [];
for (const name of (await readdir(new URL('trainer/audio/', root))).sort()) {
  trainerAudioHashes.push([name, createHash('sha256').update(await readFile(new URL('trainer/audio/' + name, root))).digest('hex')]);
}
// One content version keeps cached scripts, data and styles from different
// releases from being combined. Both branch Pages and Actions use these URLs.
const version = createHash('sha256').update(JSON.stringify([
  html, css, data, app, tests, videos, videoUtils, learning, learningUI,
  navigation, materials, materialsUI, study, studyUI, [...trainerFiles], trainerAudioHashes,
])).digest('hex').slice(0, 12);
const publishedHtml = html.replace(/((?:src|href)="assets\/[^"?]+\.(?:js|css))"/g, `$1?v=${version}"`);
if (sourceHtml !== publishedHtml) await writeFile(new URL('index.html', root), publishedHtml);
await writeFile(new URL('index.html', out), publishedHtml);
await rm(new URL('trainer/', out), { recursive: true, force: true });
await cp(new URL('trainer/', root), new URL('trainer/', out), { recursive: true });
for (const [name, source] of trainerFiles) {
  const versioned = source.replaceAll('?v=trainer', '?v=' + version);
  await writeFile(new URL('trainer/' + name, root), versioned);
  await writeFile(new URL('trainer/' + name, out), versioned);
}
const trainerBootstrap = '<script>window.PORTAL_TRAINER_PREVIEW=' + JSON.stringify(await trainerExport(root)).replaceAll('<', '\\u003c') + ';</script>';
const standalone = html
  .replace('src="assets/rarus-logo.png"', () => `src="data:image/png;base64,${logo}"`)
  .replace('<link rel="stylesheet" href="assets/styles.css" />', () => `<style>${css}</style>`)
  .replace('<script src="assets/data.js" defer></script>', () => `<script>${data}</script>`)
  .replace('<script src="assets/tests.js" defer></script>', () => `<script>${tests}</script>`)
  .replace('<script src="assets/videos.js" defer></script>', () => `<script>${videos}</script>`)
  .replace('<script src="assets/video-utils.js" defer></script>', () => `<script>${videoUtils}</script>`)
  .replace('<script src="assets/learning.js" defer></script>', () => `<script>${learning}</script>`)
  .replace('<script src="assets/learning-ui.js" defer></script>', () => `<script>${learningUI}</script>`)
  .replace('<script src="assets/materials.js" defer></script>', () => `<script>${materials}</script>`)
  .replace('<script src="assets/materials-ui.js" defer></script>', () => `<script>${materialsUI}</script>`)
  .replace('<script src="assets/navigation.js" defer></script>', () => `<script>${navigation}</script>`)
  .replace('<script src="assets/study.js" defer></script>', () => `<script>${study}</script>`)
  .replace('<script src="assets/study-ui.js" defer></script>', () => `<script>${studyUI}</script>`)
  .replace('<script src="assets/app.js" defer></script>', () => trainerBootstrap + `<script>${app}</script>`);
await writeFile(new URL('dvis-standards.html', out), standalone);
console.log('Built dist/index.html and standalone dist/dvis-standards.html');
