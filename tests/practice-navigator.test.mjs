import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
for (const file of ['data', 'learning', 'materials', 'videos']) {
  vm.runInNewContext(await readFile(new URL(`../assets/${file}.js`, import.meta.url), 'utf8'), context);
}
const { PORTAL_DATA: data, PORTAL_LEARNING: learning, PORTAL_MATERIALS: materials, PORTAL_VIDEOS: videos } = context.window;

test('all 13 navigator examples have unique text cases and resolve to rules and videos', () => {
  assert.deepEqual(Array.from(data.navigatorCases, c => c.number), Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(3, '0')));
  assert.equal(new Set(data.navigatorCases.map(c => c.caseId)).size, 13);
  const linkedVideos = new Set();
  for (const entry of data.navigatorCases) {
    const c = data.cases.find(c => c.id === entry.caseId);
    assert.equal(c?.navigatorId, entry.number);
    assert.ok(c.question && c.why && c.next && c.choices[c.correct]);
    assert.ok(c.ruleIds.length);
    for (const key of c.ruleIds) assert.ok(data.practiceRules[key], `${entry.number}/${key}`);
    for (const id of c.videoIds) {
      assert.ok(videos.some(v => v.id === id), `Missing video ${id}`);
      linkedVideos.add(id);
    }
  }
  assert.equal(linkedVideos.size, videos.length, 'each published video has a reverse link to its text case');
});

test('24 working questions and all cases have valid rules, helpers and case references', () => {
  assert.equal(data.workQuestions.length, 24);
  assert.equal(new Set(data.workQuestions.map(q => q.id)).size, 24);
  for (const q of data.workQuestions) {
    assert.ok(q.title && q.group && q.ruleIds.length);
    for (const key of q.ruleIds) assert.ok(data.practiceRules[key], `${q.id}/${key}`);
    for (const id of q.caseIds) assert.ok(data.cases.some(c => c.id === id), `${q.id}/${id}`);
    if (q.helper) assert.ok(data.scenarios.some(s => s.id === q.helper));
  }
  for (const c of data.cases) {
    assert.ok(c.ruleIds?.length, `Case without specific rules: ${c.id}`);
    for (const key of c.ruleIds) assert.ok(data.practiceRules[key]);
  }
  for (const entry of data.navigatorCases) {
    assert.ok(data.workQuestions.some(q => q.caseIds.includes(entry.caseId)), `Unreachable navigator example ${entry.number}`);
  }
});

test('first-response checks belong to controllers and managers; dispatcher questions focus on acceptance', () => {
  for (const id of ['sla', 'website-first-response']) {
    const c = data.cases.find(c => c.id === id);
    assert.deepEqual([...c.roles].sort(), ['controller', 'manager']);
    assert.match(c.responsibility, /контролёр и РОП/);
    assert.match(c.responsibility, /принято конкретным исполнителем/);
  }
  const firstResponse = data.workQuestions.find(q => q.id === 'first-response');
  assert.deepEqual([...firstResponse.roles].sort(), ['controller', 'manager']);
  const dispatcherQuestions = data.workQuestions.filter(q => q.roles.includes('dispatcher'));
  assert.ok(dispatcherQuestions.some(q => q.id === 'acceptance'));
  assert.ok(!dispatcherQuestions.some(q => ['first-response', 'lead-life', 'overdue'].includes(q.id)));
  for (const q of data.workQuestions) {
    assert.ok(q.roles.length);
    assert.ok(q.roles.includes('manager') && q.roles.includes('controller'));
  }
});

test('rule links point into available full standards or the correct memo section', async () => {
  for (const [key, rule] of Object.entries(data.practiceRules)) {
    if (rule.kind === 'standard') {
      const doc = materials.standards.find(d => d.id === rule.standard);
      assert.ok(doc, `Unavailable full standard referenced by ${key}`);
      assert.ok(doc.blocks.some(b => b.id === rule.block), `Missing standard paragraph for ${key}`);
    } else if (rule.kind === 'memo') {
      const memo = learning.memos.find(m => m.slide === rule.slide);
      assert.equal(memo?.standard, rule.standard);
      assert.ok(rule.part === 'notes' ? memo.notes.length : memo.sections[rule.section]);
    } else {
      assert.equal(rule.kind, 'navigator');
      assert.ok(rule.body);
    }
  }
  const keyPhrases = {
    'sla-start': 'подтверждённого факта поступления',
    'first-response': 'Первый отклик фиксируется один раз',
    active: 'по тому же клиенту и самостоятельному предмету',
    repeat: 'новое входящее обращение не создает новый Лид',
    history: 'Правило сохранения результата',
    controller: 'Ограничения роли',
  };
  for (const [key, phrase] of Object.entries(keyPhrases)) {
    const rule = data.practiceRules[key];
    const block = materials.standards.find(d => d.id === rule.standard).blocks.find(b => b.id === rule.block);
    assert.ok(block.text.includes(phrase), `Rule ${key} no longer matches its source paragraph`);
  }
  assert.ok((await readFile(new URL('../' + data.practiceSource, import.meta.url))).length);
});
