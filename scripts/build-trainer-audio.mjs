// Maintainer task: generate all dialogue audio locally, before a normal static build.
// See trainer/VOICE.md for private owner-voice generation and explicit Piper fallback.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, mkdtemp, readdir, rename, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { guidedTurn, roles, voiceText, voiceCases } from '../trainer/engine.js';

const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' }, model: { type: 'string' }, engine: {type:'string',default:'owner'}, reference:{type:'string'}, 'work-dir':{type:'string'}, 'base-python':{type:'string'}, 'base-model':{type:'string'},workers:{type:'string',default:'1'},threads:{type:'string',default:'2'} } });
const workers=Number(values.workers);
if(!Number.isInteger(workers)||workers<1||workers>4)throw new Error('Use 1–4 audio workers');
const threads=Number(values.threads);
if(!Number.isInteger(threads)||threads<1||threads>8)throw new Error('Use 1–8 threads per worker');
if (!['owner','piper'].includes(values.engine)) throw new Error('Unknown voice engine');
if (!values.model || (values.engine==='owner'&&(!values.reference||!values['base-python']||!values['base-model']))) throw new Error('Pass --model and, for owner voice, --reference. See trainer/VOICE.md.');
const root = fileURLToPath(new URL('../', import.meta.url));
const model = resolve(values.model);
const referenceDigest=createHash('sha256');
if(values.reference){
 const path=resolve(values.reference),info=await stat(path);
 const files=info.isDirectory()?(await readdir(path)).filter(n=>n.endsWith('.wav')).sort().map(n=>join(path,n)):[path];
 for(const file of files)referenceDigest.update(await readFile(file));
}
const referenceHash=referenceDigest.digest('hex');
const recipe = (values.engine==='owner'?'owner-approved-preview-role-20261112-v3-'+referenceHash:'piper-role-style-20261112-v2');
const styles={general:{lengthScale:1.08,pause:.28},employee:{lengthScale:1.13,pause:.36},dispatcher:{lengthScale:1.13,pause:.36},controller:{lengthScale:1.06,pause:.28},manager:{lengthScale:1.03,pause:.24}};
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
  { action: 'message', text: 'первый ответ' },
  { action: 'message', text: 'Сколько минут?' },
];
for(const topic of voiceCases) samples.push(...['case','case-answer'].map(action=>({action,caseId:topic.id})));
const texts = new Map();
for(const role of Object.keys(roles))for(const input of samples){
 const topic=input.caseId&&voiceCases.find(c=>c.id===input.caseId);
 if(topic&&role!=='general'&&!topic.roles.includes(role))continue;
 const text=voiceText(guidedTurn({role,...input}));
 const previous=texts.get(text);
 if(previous&&JSON.stringify(previous.style)!==JSON.stringify(styles[role]))throw new Error('Same speech has conflicting role styles');
 texts.set(text,{text,role,style:styles[role]});
}
const previewText=voiceText(guidedTurn({role:'general',action:'voice-preview'}));
texts.set(previewText,{text:previewText,role:'general',style:styles.general});
const directory = join(root, 'trainer/audio'); await mkdir(directory, { recursive: true });
const temporary = values['work-dir']?resolve(values['work-dir']):await mkdtemp(join(tmpdir(), 'rarus-trainer-'));
await mkdir(temporary,{recursive:true});
const audioMap = {};
try {
  const items = [...texts.values()].map(item => {
    const {text,style}=item;
    const id = createHash('sha256').update(recipe + '\n' + JSON.stringify(style)+'\n'+text).digest('hex').slice(0, 16);
    audioMap[text] = 'audio/' + id + '.mp3';
    return { ...item, file: join(temporary, id + '.wav'), baseFile:join(temporary,id+'.base.wav'), id };
  });
  const manifest = join(temporary, 'manifest.json'); await writeFile(manifest, JSON.stringify(items));
  if(values.engine==='owner'){
    const baseManifest=join(temporary,'base-manifest.json');const missing=[];for(const item of items){try{if((await stat(item.baseFile)).size>1000)continue;}catch{}missing.push({...item,file:item.baseFile});}await writeFile(baseManifest,JSON.stringify(missing));
    if(missing.length)await run(values['base-python'],[join(root,'scripts/synthesize-trainer.py'),'--model',resolve(values['base-model']),'--manifest',baseManifest],true);
  }
  if(values.engine==='owner')await Promise.all(Array.from({length:workers},(_,worker)=>run(values.python,[join(root,'scripts/synthesize-owner-voice.py'),'--model',model,'--manifest',manifest,'--reference',resolve(values.reference),'--work-dir',join(temporary,'chunks'),'--worker-count',String(workers),'--worker-index',String(worker),'--threads',String(threads)],true)));
  else await run(values.python,[join(root,'scripts/synthesize-trainer.py'),'--model',model,'--manifest',manifest],true);
  for (const item of items) {
    try {const cached=await stat(join(temporary,item.id+'.mp3')),wav=await stat(item.file);if(cached.size>1000&&cached.mtimeMs>=wav.mtimeMs)continue;} catch {}
    await run('ffmpeg', ['-v', 'error', '-y', '-i', item.file, '-ac', '1', '-ar', '22050', '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-codec:a', 'libmp3lame', '-b:a', '64k', join(temporary, item.id + '.mp3')]);
  }
  // Publish the complete generated set together, then remove superseded recordings.
  for (const item of items) await copyFile(join(temporary, item.id + '.mp3'), join(directory, item.id + '.mp3'));
  const mapFile = join(root, 'trainer/audio-map.js');
  await writeFile(mapFile + '.tmp', 'export const audioMap = ' + JSON.stringify(audioMap, null, 2) + ';\n');
  await rename(mapFile + '.tmp', mapFile);
  const preview=audioMap[previewText];
  await writeFile(join(root,'trainer/voice-check.html'),`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Озвучка тренера</title><style>body{font:17px/1.5 system-ui;background:#f2f6f8;color:#183243;max-width:640px;margin:40px auto;padding:24px}audio{width:100%;margin-bottom:20px}h1{font-size:28px}h2{font-size:19px}a{color:#067a9f}</style><h1>Сравните озвучку</h1><p>«Здравствуйте. Сегодня разберём, как квалифицировать Лид и не потерять запрос клиента».</p><h2>Проба, которую вы выбрали</h2><audio controls preload="metadata" src="voice-preview-20261110.mp3"></audio><h2>Текущая озвучка · Общее</h2><audio controls preload="metadata" src="${preview}"></audio><p>Темп и паузы в тренере зависят от выбранной роли.</p><p><a href="../index.html#trainer">Открыть тренера →</a></p></html>`);
  const used = new Set(items.map(item => item.id + '.mp3'));
  for (const name of await readdir(directory)) if (/^[a-f0-9]{16}\.mp3$/.test(name) && !used.has(name)) await rm(join(directory, name));
  await run(process.execPath, [join(root, 'scripts/build-trainer-levels.mjs')], true);
  console.log(`Generated ${texts.size} Russian replies with ${values.engine} voice.`);
} finally { if(!values['work-dir']) await rm(temporary, { recursive: true, force: true }); }
