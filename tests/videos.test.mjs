import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import vm from 'node:vm';
import { createServer } from '../scripts/server.mjs';

const root = new URL('../', import.meta.url);
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('assets/video-utils.js', root), 'utf8'), context);
const { validVideo } = context.window.PORTAL_VIDEO_UTILS;

test('video player accepts local media and rejects executable and escaping paths', () => {
  const entry = { id: 'first-contact', title: 'Первый контакт', description: 'Разбор ситуации', src: 'media/videos/contact.mp4', standards: [2, 3] };
  assert.equal(validVideo(entry), true);
  for (const src of ['javascript:alert(1)', '../private.mp4', 'media/videos/../../secret.mp4', 'https://unknown.test/clip.mp4', 'media/videos/index.html']) {
    assert.equal(validVideo({ ...entry, src }), false);
  }
  assert.equal(validVideo({ ...entry, poster: 'javascript:alert(1)' }), false);
  assert.equal(validVideo({ ...entry, standards: [99] }), false);
});

test('importing a video copies it and creates a usable entry without overwriting existing videos', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rarus-video-'));
  const run = promisify(execFile);
  try {
    await mkdir(join(temp, 'scripts'));
    await mkdir(join(temp, 'assets'));
    await cp(new URL('scripts/add-video.mjs', root), join(temp, 'scripts/add-video.mjs'));
    await cp(new URL('assets/video-utils.js', root), join(temp, 'assets/video-utils.js'));
    await writeFile(join(temp, 'assets/videos.js'), 'window.PORTAL_VIDEOS = [];\n');
    await writeFile(join(temp, 'source.mp4'), 'test-media-bytes');
    const args = [join(temp, 'scripts/add-video.mjs'), join(temp, 'source.mp4'), '--id', 'contact', '--title', 'Первый контакт', '--standards', '2,3'];
    await run(process.execPath, args);
    const imported = { window: {} };
    vm.runInNewContext(await readFile(join(temp, 'assets/videos.js'), 'utf8'), imported);
    assert.equal(imported.window.PORTAL_VIDEOS.length, 1);
    assert.equal(validVideo(imported.window.PORTAL_VIDEOS[0]), true);
    assert.equal(await readFile(join(temp, 'media/videos/contact.mp4'), 'utf8'), 'test-media-bytes');
    await assert.rejects(run(process.execPath, args), /already exists/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('media server supports seeking ranges and refuses invalid byte ranges', async () => {
  const mediaDir = new URL('media/videos/', root);
  await mkdir(mediaDir, { recursive: true });
  const name = `transport-test-${process.pid}.mp4`;
  const path = new URL(name, mediaDir);
  await writeFile(path, '0123456789');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/media/videos/${name}`;
  try {
    const range = await fetch(url, { headers: { Range: 'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(range.headers.get('content-type'), 'video/mp4');
    assert.equal(await range.text(), '2345');
    const suffix = await fetch(url, { headers: { Range: 'bytes=-3' } });
    assert.equal(await suffix.text(), '789');
    const invalid = await fetch(url, { headers: { Range: 'bytes=20-' } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    assert.equal((await fetch(`${base}/media/videos/missing.mp4`)).status, 404);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(path, { force: true });
  }
});
