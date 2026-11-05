(() => {
  'use strict';
  function canonicalRoute(value = 'home') {
    const route = String(value).replace(/^\//, '') || 'home';
    if (route === 'memos') return 'catalog';
    if (/^memo\/[23]$/.test(route)) return 'standard/' + route.slice(5) + '/memos';
    if (route.startsWith('memo/') && route !== 'memo/print') return 'standard/' + route.slice(5);
    if (route === 'visuals' || route === 'scenarios/schemes') return 'practice/schemes';
    if (route === 'scenarios') return 'practice/cases';
    if (/^lesson\/1(?:\/\d+)?$/.test(route)) return 'practice/lessons';
    if (route === 'cases') return 'practice/cases';
    if (route === 'videos') return 'practice/videos';
    if (route === 'quiz' || route.startsWith('quiz/')) return 'practice/tests' + route.slice(4);
    if (route === 'practice') return 'practice/cases';
    return route;
  }
  function parentRoute(value) {
    const page = canonicalRoute(value).split('/')[0];
    if (['catalog', 'standard', 'memo'].includes(page)) return 'catalog';
    if (['practice', 'scenario', 'case', 'video'].includes(page)) return 'practice';
    return ['home', 'glossary', 'control'].includes(page) ? page : null;
  }
  window.PORTAL_NAVIGATION = { canonicalRoute, parentRoute };
})();
