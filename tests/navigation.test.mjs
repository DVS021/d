import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../assets/navigation.js', import.meta.url), 'utf8'), context);
const { canonicalRoute, parentRoute } = context.window.PORTAL_NAVIGATION;

test('old links retain access to memos, schemes, videos and test results', () => {
  const routes = {
    memos: 'catalog', 'memo/4': 'standard/4', 'memo/5': 'standard/5',
    'memo/1': 'standard/1', 'memo/2': 'standard/2/memos', 'memo/3': 'standard/3/memos',
    'memo/print': 'memo/print', visuals: 'practice/schemes',
    scenarios: 'practice/cases', 'scenarios/schemes': 'practice/schemes',
    'lesson/1': 'practice/lessons', 'lesson/1/15': 'practice/lessons',
    cases: 'practice/cases', videos: 'practice/videos', quiz: 'practice/tests',
    'quiz/a': 'practice/tests/a', 'quiz/b/review': 'practice/tests/b/review',
    'glossary/term-034': 'glossary/term-034', 'video/duplicates': 'video/duplicates',
    'case/repeat': 'case/repeat', 'standard/2/reference': 'standard/2/reference',
  };
  for (const [before, after] of Object.entries(routes)) {
    assert.equal(canonicalRoute(before), after);
    assert.equal(canonicalRoute(after), after, 'canonical routes must be stable');
  }
});

test('all child pages highlight exactly one of the five main sections', async () => {
  const roots = ['home', 'catalog', 'practice', 'glossary', 'control'];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidebar = [...html.matchAll(/class="side-link[^"]*" data-nav="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sidebar, roots);
  for (const [page, parent] of Object.entries({
    'standard/4': 'catalog', 'memo/4': 'catalog', 'memo/print': 'catalog',
    'scenario/incoming': 'practice', visuals: 'practice', 'scenarios/schemes': 'practice',
    videos: 'practice', 'video/duplicates': 'practice', 'case/repeat': 'practice',
    'quiz/a/review': 'practice', 'practice/tests': 'practice', 'glossary/term-001': 'glossary',
    'lesson/1/15': 'practice', 'practice/lessons': 'practice', 'standard/2/text/std-2-block-006': 'catalog',
  })) assert.equal(parentRoute(page), parent);
  assert.equal(parentRoute('unknown'), null);
});
