import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
await mkdir(out, { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });
const html = await readFile(new URL('index.html', root), 'utf8');
await writeFile(new URL('index.html', out), html);
const css = await readFile(new URL('assets/styles.css', root), 'utf8');
const data = await readFile(new URL('assets/data.js', root), 'utf8');
const app = await readFile(new URL('assets/app.js', root), 'utf8');
const tests = await readFile(new URL('assets/tests.js', root), 'utf8');
const standalone = html
  .replace('<link rel="stylesheet" href="assets/styles.css" />', () => `<style>${css}</style>`)
  .replace('<script src="assets/data.js" defer></script>', () => `<script>${data}</script>`)
  .replace('<script src="assets/tests.js" defer></script>', () => `<script>${tests}</script>`)
  .replace('<script src="assets/app.js" defer></script>', () => `<script>${app}</script>`);
await writeFile(new URL('dvis-standards.html', out), standalone);
console.log('Built dist/index.html and standalone dist/dvis-standards.html');
