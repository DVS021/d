// Maintainer task: generate all dialogue audio locally, before a normal static build.
// See trainer/VOICE.md for private owner-voice generation and explicit Piper fallback.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, mkdtemp, readdir, rename, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { guidedTurn, roles, voiceText, voiceCases } from '../trainer/engine.js';

const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' }, model: { type: 'string' }, engine: {type:'string',default:'owner'}, reference:{type:'string'}, 'work-dir':{type:'string'}, 'base-python':{type:'string'}, 'base-model':{type:'string'} } });
if (!['owner','piper'].includes(values.engine)) throw new Error('Unknown voice engine');
if (!values.model || (values.engine==='owner'&&(!values.reference||!values['base-python']||!values['base-model']))) throw new Error('Pass --model and, for owner voice, --reference. See trainer/VOICE.md.');
const root = fileURLToPath(new URL('../', import.meta.url));
const model = resolve(values.model);
const recipe = values.engine==='owner'?'owner-openvoice-v2-multireference-20261112-v2':'piper-1.3.0-denis-medium-ru-v1-length1.08-pause0.28-64k';
const run = (command, args, progress = false) => new Promise((done, fail) => {
  const child = spawn(command, args, { stdio: ['ignore', progress ? 'inherit' : 'ignore', 'pipe'] });
  let error = ''; child.stderr.on('data', bytes => error += bytes);
  child.on('error', fail); child.on('close', code => code === 0 ? done() : fail(new Error(error)));
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
for(const topic of voiceCases) samples.push(...['case','case-answer'].map(action=>({action,caseId:topic.id})));
const texts = new Set(Object.keys(roles).flatMap(role => samples.map(input => voiceText(guidedTurn({ role, ...input })))));
const directory = join(root, 'trainer/audio'); await mkdir(directory, { recursive: true });
const temporary = values['work-dir']?resolve(values['work-dir']):await mkdtemp(join(tmpdir(), 'rarus-trainer-'));
await mkdir(temporary,{recursive:true});
const audioMap = {};
try {
  const items = [...texts].map(text => {
    const id = createHash('sha256').update(recipe + '\n' + text).digest('hex').slice(0, 16);
    audioMap[text] = 'audio/' + id + '.mp3';
    return { text, file: join(temporary, id + '.wav'), baseFile:join(temporary,id+'.base.wav'), id };
  });
  const manifest = join(temporary, 'manifest.json'); await writeFile(manifest, JSON.stringify(items));
  if(values.engine==='owner'){
    const baseManifest=join(temporary,'base-manifest.json');const missing=[];for(const item of items){try{if((await stat(item.baseFile)).size>1000)continue;}catch{}missing.push({...item,file:item.baseFile});}await writeFile(baseManifest,JSON.stringify(missing));
    if(missing.length)await run(values['base-python'],[join(root,'scripts/synthesize-trainer.py'),'--model',resolve(values['base-model']),'--manifest',baseManifest],true);
  }
  await run(values.python, values.engine==='owner'?[join(root,'scripts/synthesize-owner-voice.py'),'--model',model,'--manifest',manifest,'--reference',resolve(values.reference),'--work-dir',join(temporary,'chunks')]:[join(root, 'scripts/synthesize-trainer.py'), '--model', model, '--manifest', manifest], true);
  for (const item of items) {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', item.file, '-ac', '1', '-ar', '22050', '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-codec:a', 'libmp3lame', '-b:a', '64k', join(temporary, item.id + '.mp3')]);
  }
  // Publish the complete generated set together, then remove superseded recordings.
  for (const item of items) await copyFile(join(temporary, item.id + '.mp3'), join(directory, item.id + '.mp3'));
  const mapFile = join(root, 'trainer/audio-map.js');
  await writeFile(mapFile + '.tmp', 'export const audioMap = ' + JSON.stringify(audioMap, null, 2) + ';\n');
  await rename(mapFile + '.tmp', mapFile);
  const used = new Set(items.map(item => item.id + '.mp3'));
  for (const name of await readdir(directory)) if (/^[a-f0-9]{16}\.mp3$/.test(name) && !used.has(name)) await rm(join(directory, name));
  await run(process.execPath, [join(root, 'scripts/build-trainer-levels.mjs')], true);
  console.log(`Generated ${texts.size} Russian replies with ${values.engine} voice.`);
} finally { if(!values['work-dir']) await rm(temporary, { recursive: true, force: true }); }
