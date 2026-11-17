(() => {
  'use strict';
  function canonicalRoute(value = 'home') {
    const route = String(value).replace(/^\//, '') || 'home';
    const memo = route.match(/^standard\/(\d+)\/memos$/);
    if (memo) return 'memo/' + memo[1];
    const reference = route.match(/^standard\/(\d+)\/reference$/);
    if (reference) return 'standard/' + reference[1];
    if (['practice/schemes', 'scenarios/schemes', 'schemes'].includes(route)) return 'visuals';
    if (route === 'scenarios' || route === 'cases' || route === 'practice') return 'practice/cases';
    if (route === 'videos') return 'practice/videos';
    if (route === 'practice/tests' || route.startsWith('practice/tests/')) return 'quiz' + route.slice('practice/tests'.length);
    if (route === 'practice/lessons' || /^lesson\/[12](?:\/\d+)?$/.test(route)) return 'sources/lessons';
    return route;
  }
  function parentRoute(value) {
    const page = canonicalRoute(value).split('/')[0];
    if(['study','trainer','quiz'].includes(page)||canonicalRoute(value).startsWith('sources/lessons'))return 'study';
    if (['catalog', 'standard'].includes(page)) return 'catalog';
    if (['reference','memo','memos','visuals','glossary','sources'].includes(page)) return 'reference';
    if (['practice', 'scenario', 'case', 'video','answer'].includes(page)) return 'practice';
    return ['home', 'control'].includes(page) ? page : null;
  }
  window.PORTAL_NAVIGATION = { canonicalRoute, parentRoute };
})();
