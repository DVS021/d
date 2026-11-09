import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../assets/navigation.js', import.meta.url), 'utf8'), context);
const { canonicalRoute, parentRoute } = context.window.PORTAL_NAVIGATION;

test('old links preserve full standards, separate memos, schemes, test attempts and presentations', () => {
  const routes = {
    memos: 'memos', 'memo/1': 'memo/1', 'memo/4': 'memo/4', 'memo/5': 'memo/5',
    'standard/1': 'standard/1', 'standard/2': 'standard/2', 'standard/4': 'standard/4',
    'standard/1/memos': 'memo/1', 'standard/2/memos': 'memo/2', 'standard/4/memos': 'memo/4',
    'standard/2/reference': 'standard/2',
    'memo/print': 'memo/print', visuals: 'visuals', 'practice/schemes': 'visuals',
    scenarios: 'practice/cases', 'scenarios/schemes': 'visuals',
    'lesson/1': 'sources/lessons', 'lesson/1/15': 'sources/lessons', 'practice/lessons': 'sources/lessons',
    cases: 'practice/cases', videos: 'practice/videos', quiz: 'quiz',
    'quiz/a': 'quiz/a', 'quiz/b/review': 'quiz/b/review',
    'practice/tests': 'quiz', 'practice/tests/a': 'quiz/a', 'practice/tests/b/review': 'quiz/b/review',
    'glossary/term-034': 'glossary/term-034', 'video/duplicates': 'video/duplicates', 'case/repeat': 'case/repeat',
  };
  for (const [before, after] of Object.entries(routes)) {
    assert.equal(canonicalRoute(before), after);
    assert.equal(canonicalRoute(after), after, 'canonical routes must be stable');
  }
});

test('schemes and self-check are independent menu sections; practice contains cases and videos', async () => {
  const roots = ['home', 'catalog', 'visuals', 'practice', 'trainer', 'quiz', 'glossary', 'control'];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidebar = [...html.matchAll(/class="side-link[^\"]*" data-nav="([^\"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sidebar, roots);
  for (const [page, parent] of Object.entries({
    'standard/1': 'catalog', 'standard/2/text/std-2-block-006': 'catalog',
    'memo/4': 'catalog', 'memos': 'catalog', 'memo/print': 'catalog',
    'scenario/incoming': 'practice', 'case/repeat': 'practice', 'video/duplicates': 'practice',
    'practice/cases/question/lead-return': 'practice',
    'practice/cases/standard/5': 'practice', 'practice/cases/rule/lead-return': 'practice',
    'memo/5/text/memo-section-9-1': 'catalog',
    visuals: 'visuals', 'practice/schemes': 'visuals', trainer: 'trainer',
    'quiz/a/review': 'quiz', 'practice/tests/a/review': 'quiz', 'glossary/term-001': 'glossary',
  })) assert.equal(parentRoute(page), parent);
  assert.equal(parentRoute('unknown'), null);
});
