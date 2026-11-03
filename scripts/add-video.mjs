import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' }, title: { type: 'string' },
    description: { type: 'string', default: '' }, standards: { type: 'string', default: '' },
    category: { type: 'string', default: 'Работа с клиентом' },
    duration: { type: 'string' }, poster: { type: 'string' }, captions: { type: 'string' },
  },
});
const root = new URL('../', import.meta.url);
if (positionals.length !== 1 || !values.id || !values.title?.trim()) {
  throw new Error('Usage: npm run add-video -- /path/video.mp4 --id first-call --title "Первый контакт" [--standards 2,3] [--duration 125] [--poster /path/cover.jpg] [--captions /path/subtitles.vtt]');
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(values.id)) throw new Error('ID must contain lowercase Latin letters, digits and hyphens.');
const source = resolve(positionals[0]);
const extension = extname(source).toLowerCase();
if (!['.mp4', '.webm', '.ogv'].includes(extension)) throw new Error('Supported formats: MP4, WebM, OGV.');
const info = await stat(source);
if (!info.isFile() || !info.size) throw new Error('Video must be a non-empty file.');
if (info.size > 95 * 1024 * 1024) throw new Error('Compress the video below 95 MiB before adding it to this GitHub Pages repository.');
const standards = values.standards ? values.standards.split(',').map(Number) : [];
if (standards.some(n => !Number.isInteger(n) || n < 1 || n > 18)) throw new Error('Invalid standard number.');
const duration = values.duration === undefined ? undefined : Number(values.duration);
if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) throw new Error('Duration must be positive seconds.');
const catalogPath = new URL('assets/videos.js', root);
const raw = await readFile(catalogPath, 'utf8');
const match = raw.match(/window\.PORTAL_VIDEOS\s*=\s*([\s\S]*);\s*$/);
if (!match) throw new Error('Cannot read video catalog.');
const catalog = JSON.parse(match[1]);
if (catalog.some(v => v.id === values.id)) throw new Error('This video ID already exists; choose a new ID.');
const video = {
  id: values.id, title: values.title.trim(), description: values.description,
  category: values.category, standards: [...new Set(standards)],
  src: `media/videos/${values.id}${extension}`,
  ...(duration === undefined ? {} : { duration }),
};
const copies = [[source, video.src]];
if (values.poster) {
  const ext = extname(values.poster).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) throw new Error('Poster must be JPG, PNG or WebP.');
  video.poster = `media/videos/${values.id}-poster${ext}`;
  copies.push([resolve(values.poster), video.poster]);
}
if (values.captions) {
  if (extname(values.captions).toLowerCase() !== '.vtt') throw new Error('Captions must be WebVTT.');
  video.captions = `media/videos/${values.id}.vtt`;
  copies.push([resolve(values.captions), video.captions]);
}
// Validate the complete entry before copying anything into the checkout.
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('assets/video-utils.js', root), 'utf8'), context);
if (!context.window.PORTAL_VIDEO_UTILS.validVideo(video)) throw new Error('Invalid video entry.');
for (const [from, destination] of copies) {
  if (!(await stat(from)).isFile()) throw new Error('Attachment must be a file.');
  try {
    await stat(new URL(destination, root));
    throw new Error(`Destination already exists: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await mkdir(new URL('media/videos/', root), { recursive: true });
for (const [from, to] of copies) await copyFile(from, fileURLToPath(new URL(to, root)));
catalog.push(video);
await writeFile(catalogPath, `// Общие видеокейсы ГК «1С-Рарус».\nwindow.PORTAL_VIDEOS = ${JSON.stringify(catalog, null, 2)};\n`);
console.log(`Added ${video.id}. Run npm test and npm run build, then commit and push the catalog and media files.`);
