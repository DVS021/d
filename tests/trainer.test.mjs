import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guidedTurn, roles, sources, voiceText } from '../trainer/engine.js';
import { audioMap } from '../trainer/audio-map.js';
import { audioLevels } from '../trainer/audio-levels.js';
import { createServer } from '../scripts/server.mjs';

const inputs = [
  { action: 'intro' }, { action: 'case' },
  ...['Кто проверяет первый отклик?', 'Сколько минут SLA?', 'Зачем нужны стандарты?', 'Кейс по УАТ', 'Мой ответ', 'Я проверяю SLA', 'первый отклик'].map(text => ({ action: 'message', text })),
];
test('Russian speech expands abbreviations and uses the right case for numbers without changing the visible text', () => {
  const response = {
    speech: 'РОПу нужен расчёт по 1С:УАТ для 60 автомобилей. Клиент просит КП.',
    question: 'Кто проверяет SLA?',
  };
  const spoken = voiceText(response);
  assert.match(spoken, /руководителю отдела продаж/);
  assert.match(spoken, /один эс, управление автотранспортом/);
  assert.match(spoken, /для шестидесяти автомобилей/);
  assert.match(spoken, /коммерческое предложение/);
  assert.doesNotMatch(spoken, /РОП|SLA|КП|1С:УАТ|60/);
  assert.match(response.speech, /РОПу нужен расчёт по 1С:УАТ/);
  const extra=voiceText({speech:'CRM и ИТС. Есть доступный email. По правилам ЕИС.',question:''});
  assert.match(extra,/си эр эм и и тэ эс/);
  assert.match(extra,/адрес электронной почты/);
  assert.match(extra,/правилам единой информационной системы/);
});
test('all role dialogues have readable sources and a recorded audio reply', async () => {
  assert.deepEqual(Object.keys(roles), ['general', 'employee', 'dispatcher', 'manager', 'controller']);
  assert.equal(sources.filter(s => s.type === 'lesson_text').length, 60);
  const validSources = new Set(sources.map(s => s.id));
  for (const role of Object.keys(roles)) for (const input of inputs) {
    const reply = guidedTurn({ role, ...input });
    assert.equal(reply.mode, 'guided');
    assert.ok(reply.speech && reply.question && reply.sources.length);
    for (const source of reply.sources) assert.ok(validSources.has(source.id) && source.text);
    const file = audioMap[voiceText(reply)];
    assert.match(file, /^audio\/[a-f0-9]{16}\.mp3$/);
    assert.ok((await readFile(new URL('../trainer/' + file, import.meta.url))).length > 1000);
  }
  assert.throws(() => guidedTurn({ role: 'unknown', action: 'intro' }));
});

test('the trainer preserves dispatcher responsibility and never grades a keyword as a correct answer', () => {
  const intro = guidedTurn({ role: 'dispatcher', action: 'intro' });
  assert.match(intro.speech, /Первого отклика|Проверку первого отклика/);
  assert.match(intro.speech, /контролёр и РОП/);
  const reply = guidedTurn({ role: 'dispatcher', action: 'message', text: 'Принятие не подтверждено' });
  assert.doesNotMatch(reply.speech, /^Верно|^Правильно/);
  assert.match(reply.speech, /принял конкретный исполнитель/);
});

test('static trainer works without an API and audio supports seeking', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const file of ['index.html', 'app.js', 'engine.js', 'data.js', 'audio-map.js', 'audio-levels.js', 'style.css']) {
      assert.equal((await fetch(base + '/trainer/' + file)).status, 200);
    }
    const file = Object.values(audioMap)[0];
    const response = await fetch(base + '/trainer/' + file, { headers: { Range: 'bytes=0-63' } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await response.arrayBuffer()).byteLength, 64);
    assert.equal((await fetch(base + '/api/turn')).status, 404);
    const app = await readFile(new URL('../trainer/app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /fetch\(|\/api\//);
    assert.doesNotMatch(app, /createMediaElementSource|SpeechSynthesisUtterance/);
    assert.match(app, /event\.source !== window\.parent/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('every recording has mouth levels without routing its sound through Web Audio',()=>{
 for(const [text,file] of Object.entries(audioMap)){
  const levels=Buffer.from(audioLevels[text]||'','base64');
  assert.ok(levels.length>20&&levels.some(x=>x>0),file);
 }
});
