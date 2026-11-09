// Export the draft as one offline HTML file. Nothing is uploaded or published.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
const types = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.vtt': 'text/vtt', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const resources = {};
async function collect(folder) {
  for (const entry of await readdir(new URL(folder, out), { withFileTypes: true })) {
    const relative = folder + entry.name;
    if (entry.isDirectory()) await collect(relative + '/');
    else if (types[extname(entry.name)]) {
      const url = relative.split('/').map(encodeURIComponent).join('/');
      resources[url] = {
        mime: types[extname(entry.name)], name: entry.name,
        base64: (await readFile(new URL(relative, out))).toString('base64'),
      };
    }
  }
}
await collect('media/');
await collect('documents/');
const bootstrap = `<script>
(() => {
  'use strict';
  const resources = ${JSON.stringify(resources).replaceAll('<', '\\u003c')};
  const lookup = new Map();
  for (const [name, item] of Object.entries(resources)) {
    const binary = atob(item.base64), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    item.url = URL.createObjectURL(new Blob([bytes], { type: item.mime }));
    delete item.base64;
    lookup.set(name, item);
    lookup.set(decodeURIComponent(name), item);
    lookup.set(item.url, item);
  }
  function replaceFiles(object) {
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string' && lookup.has(value)) object[key] = lookup.get(value).url;
      else if (value && typeof value === 'object') replaceFiles(value);
    }
    return object;
  }
  const validate = window.PORTAL_VIDEO_UTILS.validVideo;
  const bundled = window.PORTAL_VIDEOS.filter(validate).map(replaceFiles);
  window.PORTAL_VIDEOS = bundled;
  window.PORTAL_VIDEO_UTILS.validVideo = video => bundled.includes(video) || validate(video);
  replaceFiles(window.PORTAL_MATERIALS);
  replaceFiles(window.PORTAL_LEARNING);
  if (window.PORTAL_TRAINER_PREVIEW) {
    for (const [name, item] of lookup) {
      if (name.startsWith('documents/')) window.PORTAL_TRAINER_PREVIEW = window.PORTAL_TRAINER_PREVIEW.replaceAll(name, item.url);
    }
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const file = lookup.get(anchor.getAttribute('href'));
    if (!file) return;
    anchor.href = file.url;
    if (anchor.hasAttribute('download') && !anchor.download) anchor.download = file.name;
  }, true);
})();
</script>\n`;
const app = await readFile(new URL('assets/app.js', root), 'utf8');
const marker = `<script>${app}</script>`;
const html = await readFile(new URL('dvis-standards.html', out), 'utf8');
if (!html.includes(marker)) throw new Error('Build the current standalone HTML first: npm run build');
const preview = html.replace(marker, () => bootstrap + marker);
await writeFile(new URL('rarus-preview.html', out), preview);
console.log(`Built dist/rarus-preview.html with ${Object.keys(resources).length} embedded media and document files`);
