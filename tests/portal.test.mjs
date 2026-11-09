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

test('all six lesson exercises have one case each and valid presentation references', async () => {
  vm.runInNewContext(await readFile(new URL('../assets/materials.js', import.meta.url), 'utf8'), context);
  const exercises = new Set();
  for (const c of data.cases.filter(c => c.training && [1,2].includes(c.training.lesson))) {
    const { lesson, caseNumber, slide, reviewSlide } = c.training;
    const key = `${lesson}/${caseNumber}`;
    assert.ok(!exercises.has(key), `Duplicated exercise ${key}`);
    exercises.add(key);
    const presentation = context.window.PORTAL_MATERIALS.lessons.find(l => +l.id === lesson);
    assert.ok(presentation, `Missing lesson for ${c.id}`);
    const sourceSlide = presentation.slides.find(s => s.number === slide);
    assert.ok(sourceSlide, `Missing exercise slide for ${c.id}`);
    assert.match(sourceSlide.paragraphs.join(' '), new RegExp(`кейс\\s*${caseNumber}`, 'i'));
    if (reviewSlide) assert.ok(presentation.slides.some(s => s.number === reviewSlide));
    assert.ok(c.roles.length && c.roles.every(r => ['employee', 'dispatcher', 'manager', 'controller'].includes(r)));
    assert.ok(c.why && c.next && c.choices[c.correct]);
    assert.ok((await readFile(new URL('../' + presentation.pdf, import.meta.url))).length);
  }
  assert.deepEqual([...exercises].sort(), ['1/1', '1/2', '1/3', '2/1', '2/2', '2/3']);
  assert.equal(new Set(data.cases.map(c => c.id)).size, data.cases.length);
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
      const pathname = new URL(match[1], base).pathname;
      const type = pathname.endsWith('.png') ? /image\/png/ : pathname.endsWith('.css') ? /text\/css/ : /javascript/;
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

test('all six Lead exercises preserve the basic and advanced lesson 3 cases and full standard links', async () => {
  vm.runInNewContext(await readFile(new URL('../assets/materials.js', import.meta.url), 'utf8'), context);
  const materials = context.window.PORTAL_MATERIALS;
  const cases = data.cases.filter(c => String(c.training?.lesson).startsWith('3'));
  assert.equal(cases.length, 6);
  const keys = new Set();
  for (const c of cases) {
    const lesson = materials.lessons.find(l => l.id === c.training.lesson);
    const slide = lesson.slides.find(s => s.number === c.training.slide);
    assert.match(slide.paragraphs.join(' '), new RegExp('Кейс ' + c.training.caseNumber));
    keys.add(lesson.id + '/' + c.training.caseNumber);
    assert.ok(c.question && c.why && c.choices[c.correct]);
    for (const key of c.ruleIds) {
      const rule = data.practiceRules[key];
      assert.equal(rule.standard, 4);
      assert.ok(materials.standards.find(s => s.id === 4).blocks.some(b => b.id === rule.block));
    }
  }
  assert.equal(keys.size, 6);
});
