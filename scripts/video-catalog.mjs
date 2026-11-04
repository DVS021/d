import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

export async function loadVideoCatalog(rootDirectory) {
  const root = resolve(rootDirectory);
  const source = await readFile(resolve(root, 'assets/videos.js'), 'utf8');
  const match = source.match(/window\.PORTAL_VIDEOS\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error('Cannot read video catalog.');
  const manual = JSON.parse(match[1]);
  if (!Array.isArray(manual)) throw new Error('Video catalog must be an array.');
  const mediaDirectory = resolve(root, 'media/videos');
  let files;
  try {
    const actualDirectory = await realpath(mediaDirectory);
    if (actualDirectory !== mediaDirectory) throw new Error('Video directory must not be a symlink.');
    files = await readdir(mediaDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return manual;
    throw error;
  }
  const knownSources = new Set(manual.filter(v => v.provider !== 'google-drive').map(v => v.src));
  const automatic = [];
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))) {
    const extension = extname(file.name).toLowerCase();
    if (!file.isFile() || file.name.startsWith('.') || !['.mp4', '.webm', '.ogv'].includes(extension)) continue;
    const src = 'media/videos/' + encodeURIComponent(file.name);
    if (knownSources.has(src)) continue;
    const info = await stat(resolve(mediaDirectory, file.name));
    if (info.size === 0) throw new Error(`Empty video file: ${file.name}`);
    if (info.size > 100 * 1024 * 1024) throw new Error(`Video exceeds 100 MiB: ${file.name}`);
    automatic.push({
      id: 'file-' + createHash('sha256').update(file.name).digest('hex').slice(0, 16),
      title: file.name.slice(0, -extname(file.name).length).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || file.name,
      description: '', category: 'Видеокейсы', standards: [], provider: 'file', src,
    });
  }
  return [...manual, ...automatic];
}

export function videoCatalogScript(catalog) {
  return 'window.PORTAL_VIDEOS = ' + JSON.stringify(catalog, null, 2).replace(/</g, '\\u003c') + ';\n';
}
