import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createServer } from '../scripts/server.mjs';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../assets/data.js', import.meta.url), 'utf8'), context);
const data = context.window.PORTAL_DATA;
vm.runInNewContext(await readFile(new URL('../assets/tests.js', import.meta.url), 'utf8'), context);
const tests = context.window.PORTAL_TESTS;

test('all three training variants contain 18 valid closed and 2 open questions', () => {
  assert.equal(tests.variants.length, 3);
  for (const variant of tests.variants) {
    assert.equal(variant.questions.length, 20);
    assert.equal(variant.questions.filter(q => q.type === 'open').length, 2);
    assert.equal(new Set(variant.questions.map(q => q.id)).size, 20);
    for (const q of variant.questions.filter(q => q.type !== 'open')) {
      assert.ok(q.correct.length > 0);
      for (const index of q.correct) assert.ok(q.options[index]);
      if (q.type === 'single') assert.equal(q.correct.length, 1);
    }
  }
});

test('all published learning materials have valid sources and cross references', () => {
  const ids = new Set(data.standards.map(s => s.id));
  assert.equal(ids.size, data.standards.length);
  for (const s of data.standards.filter(s => s.status !== 'planned')) {
    assert.equal(new URL(s.source).protocol, 'https:');
    assert.ok(s.steps.length > 0 && s.checklist.length > 0);
  }
  for (const c of data.cases) {
    assert.ok(c.choices[c.correct]);
    for (const id of c.standards) assert.ok(ids.has(id));
  }
  for (const q of data.quiz) {
    assert.ok(q.a[q.correct]);
    assert.ok(ids.has(q.standard));
  }
});

test('every scenario branch reaches a valid decision and has no dead links', () => {
  for (const scenario of data.scenarios) {
    const visited = new Set();
    function visit(key, path = []) {
      assert.ok(!path.includes(key), `Cycle in ${scenario.id}/${key}`);
      const node = scenario.nodes[key];
      assert.ok(node, `Missing ${scenario.id}/${key}`);
      visited.add(key);
      if (node.q) {
        assert.ok(node.options.length > 0);
        for (const option of node.options) visit(option.to, [...path, key]);
      } else {
        assert.ok(node.result && node.steps.length > 0);
        for (const id of node.std) assert.ok(data.standards.some(s => s.id === id && s.status !== 'planned'));
      }
    }
    visit(scenario.start);
    assert.equal(visited.size, Object.keys(scenario.nodes).length);
  }
});

test('local server serves the portal and assets, and keeps repository files private', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    const html = await home.text();
    for (const match of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
      const response = await fetch(`${base}/${match[1]}`);
      assert.equal(response.status, 200);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
      const type = match[1].endsWith('.png') ? /image\/png/ : match[1].endsWith('.css') ? /text\/css/ : /javascript/;
      assert.match(response.headers.get('content-type'), type);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    assert.equal((await fetch(`${base}/.git/config`)).status, 404);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
