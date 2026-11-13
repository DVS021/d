import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import vm from 'node:vm';
import { loadVideoCatalog, videoCatalogScript } from '../scripts/video-catalog.mjs';
import { createServer } from '../scripts/server.mjs';

const sourceRoot = new URL('../', import.meta.url);
const run = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rarus-catalog-'));
  await mkdir(join(root, 'assets'));
  await mkdir(join(root, 'media/videos'), { recursive: true });
  await writeFile(join(root, 'assets/videos.js'), 'window.PORTAL_VIDEOS = [];\n');
  return root;
}

test('folder videos are discovered with Russian names, stable IDs and manual overrides', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'media/videos/Кейс 1_Контроль К3.mp4'), 'first-video');
    await writeFile(join(root, 'media/videos/Кейс 2.WEBM'), 'second-video');
    await writeFile(join(root, 'media/videos/README.md'), 'Instructions');
    await writeFile(join(root, 'media/videos/.private.mp4'), 'hidden');
    await mkdir(join(root, 'media/videos/nested'));
    await writeFile(join(root, 'media/videos/nested/hidden.mp4'), 'nested');
    const catalog = await loadVideoCatalog(root);
    assert.equal(catalog.length, 2);
    assert.equal(catalog[0].title, 'Кейс 1 Контроль К3');
    assert.equal(catalog[0].src, 'media/videos/' + encodeURIComponent('Кейс 1_Контроль К3.mp4'));
    const context = { window: {} };
    vm.runInNewContext(await readFile(new URL('assets/video-utils.js', sourceRoot), 'utf8'), context);
    for (const video of catalog) assert.equal(context.window.PORTAL_VIDEO_UTILS.validVideo(video), true);
    assert.deepEqual(await loadVideoCatalog(root), catalog);
    const manual = { ...catalog[0], title: 'Название редактора', description: '</script><script>injected()</script>' };
    await writeFile(join(root, 'assets/videos.js'), 'window.PORTAL_VIDEOS = ' + JSON.stringify([manual]) + ';\n');
    const merged = await loadVideoCatalog(root);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, 'Название редактора');
    assert.ok(!videoCatalogScript(merged).includes('</script>'));
    await rm(join(root, 'media/videos/Кейс 2.WEBM'));
    assert.equal((await loadVideoCatalog(root)).length, 1);
    assert.equal(await readFile(join(root, 'media/videos/Кейс 1_Контроль К3.mp4'), 'utf8'), 'first-video');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local server refreshes the catalog and streams Russian-named media with byte ranges', async () => {
  const root = await fixture();
  const filename = 'Кейс 1 — Отчёт.mp4';
  await writeFile(join(root, 'media/videos', filename), '0123456789');
  const server = createServer({ rootDirectory: root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = { window: {} };
    vm.runInNewContext(await (await fetch(base + '/assets/videos.js')).text(), context);
    assert.equal(context.window.PORTAL_VIDEOS.length, 1);
    const media = await fetch(base + '/' + context.window.PORTAL_VIDEOS[0].src, { headers: { Range: 'bytes=2-5' } });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.equal(await media.text(), '2345');
    await writeFile(join(root, 'outside.mp4'), 'private');
    await symlink(join(root, 'outside.mp4'), join(root, 'media/videos/escape.mp4'));
    assert.equal((await fetch(base + '/media/videos/escape.mp4')).status, 404);
    assert.equal((await fetch(base + '/media/videos/%2e%2e%2foutside.mp4')).status, 404);
    await rm(join(root, 'media/videos', filename));
    vm.runInNewContext(await (await fetch(base + '/assets/videos.js')).text(), context);
    assert.equal(context.window.PORTAL_VIDEOS.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('static builds include discovered videos and remove deleted videos without rewriting the source catalog', async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, 'scripts'));
    for (const file of ['build.mjs', 'video-catalog.mjs', 'trainer-export.mjs']) await cp(new URL('scripts/' + file, sourceRoot), join(root, 'scripts', file));
    await cp(new URL('assets/video-utils.js', sourceRoot), join(root, 'assets/video-utils.js'));
    for (const file of ['data.js', 'app.js', 'study.js', 'study-ui.js', 'tests.js', 'learning.js', 'learning-ui.js', 'materials.js', 'materials-ui.js', 'navigation.js', 'styles.css']) await writeFile(join(root, 'assets', file), '/* fixture */');
    await writeFile(join(root, 'assets/rarus-logo.png'), 'fixture-logo');
    await writeFile(join(root, 'index.html'), '<link rel="stylesheet" href="assets/styles.css" />\n<script src="assets/videos.js" defer></script>\n<script src="assets/app.js" defer></script>');
    await mkdir(join(root, 'documents'));
    await cp(new URL('trainer/', sourceRoot), join(root, 'trainer'), { recursive: true });
    await writeFile(join(root, 'documents/README.md'), 'fixture');
    const name = 'Мой видеокейс.mp4';
    await writeFile(join(root, 'media/videos', name), 'video-data');
    await run(process.execPath, [join(root, 'scripts/build.mjs')]);
    const context = { window: {} };
    vm.runInNewContext(await readFile(join(root, 'dist/assets/videos.js'), 'utf8'), context);
    assert.equal(context.window.PORTAL_VIDEOS.length, 1);
    assert.equal(context.window.PORTAL_VIDEOS[0].title, 'Мой видеокейс');
    assert.equal(await readFile(join(root, 'dist/media/videos', name), 'utf8'), 'video-data');
    assert.equal(await readFile(join(root, 'assets/videos.js'), 'utf8'), 'window.PORTAL_VIDEOS = [];\n');
    const firstHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
    assert.equal(await readFile(join(root, 'index.html'), 'utf8'), firstHtml, 'branch and Actions publication must use the same asset URLs');
    const firstVersion = firstHtml.match(/\?v=([a-f0-9]{12})/)[1];
    assert.match(firstHtml, /assets\/styles\.css\?v=[a-f0-9]{12}/);
    const standalone = await readFile(join(root, 'dist/dvis-standards.html'), 'utf8');
    assert.doesNotMatch(standalone, /(?:src|href)="assets\/(?:videos\.js|app\.js|styles\.css)/, 'standalone export must still inline versioned files');
    await rm(join(root, 'media/videos', name));
    await run(process.execPath, [join(root, 'scripts/build.mjs')]);
    await assert.rejects(readFile(join(root, 'dist/media/videos', name)), { code: 'ENOENT' });
    vm.runInNewContext(await readFile(join(root, 'dist/assets/videos.js'), 'utf8'), context);
    assert.equal(context.window.PORTAL_VIDEOS.length, 0);
    const nextHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
    assert.notEqual(nextHtml.match(/\?v=([a-f0-9]{12})/)[1], firstVersion, 'changing the discovered video library must invalidate cached assets');
    await run(process.execPath, [join(root, 'scripts/build.mjs')]);
    assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), nextHtml, 'unchanged builds must keep stable asset URLs');
  } finally { await rm(root, { recursive: true, force: true }); }
});
