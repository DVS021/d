// Inline the same trainer for the existing single-file draft exports.
import { readFile } from 'node:fs/promises';
export async function trainerExport(root) {
  const read = name => readFile(new URL('trainer/' + name, root), 'utf8');
  let [html, css, data, audio, engine, app] = await Promise.all(['index.html', 'style.css', 'data.js', 'audio-map.js', 'engine.js', 'app.js'].map(read));
  const map = JSON.parse(audio.replace(/^export const audioMap = /, '').trim().replace(/;$/, ''));
  for (const [text, path] of Object.entries(map)) map[text] = 'data:audio/mpeg;base64,' + (await readFile(new URL('trainer/' + path, root))).toString('base64');
  audio = 'const audioMap = ' + JSON.stringify(map) + ';';
  const plain = text => text.replace(/^import .*;\n/gm, '').replace(/^export \{[^\n]*\};\n/gm, '').replace(/\bexport (const|function) /g, '$1 ');
  engine = plain(engine).replace("new URL('../', import.meta.url)", "new URL('.', document.baseURI)").replace('new URL(file, import.meta.url)', 'new URL(file, document.baseURI)');
  const script = [plain(data), audio, engine, plain(app)].join('\n').replaceAll('</script', '<\\/script');
  html = html.replace(/<link rel="stylesheet" href="style\.css[^\"]*">/, () => '<style>' + css + '</style>')
    .replace(/<script type="module" src="app\.js[^\"]*"><\/script>/, () => '<script defer>window.addEventListener("DOMContentLoaded",()=>{\n' + script + '\n});</script>');
  const portrait = (await readFile(new URL('trainer/portrait-20261109.png',root))).toString('base64');
  html = html.replace('src="portrait-20261109.png"', () => 'src="data:image/png;base64,'+portrait+'"');
  return html;
}
