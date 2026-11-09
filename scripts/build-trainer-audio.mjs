// Optional maintainer task. Runtime uses only these generated MP3 files.
// node scripts/build-trainer-audio.mjs [path/to/extracted/espeak-ng/root]
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guidedTurn, roles, voiceText } from '../trainer/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const unpacked = process.argv[2] && resolve(process.argv[2]);
const run = (command, args, input) => new Promise((done, fail) => {
  const process = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = ''; process.stderr.on('data', bytes => error += bytes);
  process.on('error', fail); process.on('close', code => code === 0 ? done() : fail(new Error(error)));
  process.stdin.end(input);
});
const samples = [
  { action: 'intro' }, { action: 'case' },
  { action: 'message', text: 'Кто проверяет первый отклик?' },
  { action: 'message', text: 'Сколько минут SLA?' },
  { action: 'message', text: 'Зачем нужны стандарты?' },
  { action: 'message', text: 'Мой ответ' },
  { action: 'message', text: 'Я проверяю SLA' },
  { action: 'message', text: 'первый отклик' },
];
const texts = new Set(Object.keys(roles).flatMap(role => samples.map(input => voiceText(guidedTurn({ role, ...input })))));
const directory = join(root, 'trainer/audio'); await mkdir(directory, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'rarus-trainer-'));
const audioMap = {};
try {
  for (const text of texts) {
    const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const wav = join(temporary, id + '.wav');
    const voiceArgs = ['-v', 'ru', '-s', '155', '-p', '47', '-w', wav, '--stdin'];
    if (unpacked) {
      const libs = join(unpacked, 'usr/lib/x86_64-linux-gnu');
      await run('/lib64/ld-linux-x86-64.so.2', ['--library-path', libs, join(unpacked, 'usr/bin/espeak-ng'), '--path=' + libs, ...voiceArgs], text);
    } else await run(process.env.TRAINER_ESPEAK_BIN || 'espeak-ng', voiceArgs, text);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '48k', join(directory, id + '.mp3')]);
    audioMap[text] = 'audio/' + id + '.mp3';
  }
  await writeFile(join(root, 'trainer/audio-map.js'), 'export const audioMap = ' + JSON.stringify(audioMap, null, 2) + ';\n');
  console.log(`Generated ${texts.size} Russian audio replies.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
