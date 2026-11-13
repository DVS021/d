import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import vm from'node:vm';
import{voiceCases}from'../trainer/engine.js';
const scripts=await Promise.all(['data','materials','study'].map(n=>readFile(new URL('../assets/'+n+'.js',import.meta.url),'utf8')));
function fixture(){const c={window:{}};vm.createContext(c);for(const s of scripts)vm.runInContext(s,c);let time=Date.UTC(2026,10,14,9);const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};const options={data:c.window.PORTAL_DATA,materials:c.window.PORTAL_MATERIALS,storage,now:()=>time};const make=()=>c.window.PORTAL_STUDY.create(options);return{c,values,storage,options,make,model:make(),advance:days=>time+=days*86400000};}
function passCheck(s,id,role='employee'){for(const q of s.byId.get(id).questions)s.answerCheck(id,q.id,q.correct);return s.submit(id,role);}

test('role routes, cases, trainer recommendations and all short-check rules resolve to published material',()=>{
 const{model:s}=fixture();assert.equal(s.modules.length,4);assert.equal(s.route('dispatcher').length,3);assert.ok(!s.route('dispatcher').some(m=>m.id==='qualification'));
 const ids=new Set();for(const m of s.modules){for(const[,r]of m.guide)assert.ok(s.source(r),m.id+' guide');
  for(const q of m.questions){assert.ok(!ids.has(q.id));ids.add(q.id);assert.ok(q.options[q.correct]&&q.why&&q.refs.length);for(const r of q.refs){assert.ok(r.standard>=1&&r.standard<=4);assert.ok(s.source(r));}assert.doesNotMatch(q.prompt+q.why,/мотиваци|август|2026 года/i);}
  for(const role of s.roles.filter(role=>s.route(role).includes(m))){assert.equal(s.practice(m,role).length,2);for(const c of s.practice(m,role))assert.ok(role==='general'||c.roles.includes(role),m.id+'/'+role+'/'+c.id);const t=voiceCases.find(c=>c.id===m.trainer[role]);assert.ok(t&&(role==='general'||t.roles.includes(role)));}
 }assert.equal(ids.size,12);
});

test('a completed module requires reading, successful practice and a full check; drafts survive reload',()=>{
 const f=fixture(),s=f.model,m=s.byId.get('basics');s.begin(m.id,'employee');s.acknowledge(m.id);
 assert.equal(s.status(m,'employee').complete,false);for(const c of s.practice(m,'employee'))s.recordCase(c.id,c.correct,'employee');
 assert.equal(s.status(m,'employee').complete,false);s.answerCheck(m.id,m.questions[0].id,m.questions[0].correct);assert.equal(s.submit(m.id,'employee'),null);
 const restored=f.make();assert.equal(Object.keys(restored.draft(m.id).answers).length,1);passCheck(restored,m.id);assert.equal(restored.status(m,'employee').complete,true);
 assert.equal(restored.snapshot().quizLog.length,1);assert.equal(restored.submit(m.id,'employee'),null);assert.equal(restored.snapshot().quizLog.length,1);
 assert.equal(restored.continuation('employee').module.id,'incoming');
});

test('continue opens the exact reading location and advances beyond solved course cases',()=>{
 const f=fixture(),s=f.model;s.begin('basics','employee');s.visit('standard/1/text/std-1-block-060','employee');
 assert.equal(f.make().continuation('employee').route,'standard/1/text/std-1-block-060');s.acknowledge('basics');const examples=s.practice(s.byId.get('basics'),'employee');
 assert.equal(s.continuation('employee').route,'case/'+examples[0].id);s.recordCase(examples[0].id,examples[0].correct,'employee');assert.equal(s.continuation('employee').route,'case/'+examples[1].id);
});

test('mistakes are retried after one and three days, not cleared by immediate repeated clicks',()=>{
 const f=fixture(),s=f.model,c=s.cases.get('two-bills-one-purchase');s.recordCase(c.id,(c.correct+1)%3,'employee');assert.equal(s.mistakes().find(x=>x.id===c.id).due,true);
 s.recordCase(c.id,c.correct,'employee');let r=s.mistakes().find(x=>x.id===c.id);assert.equal(r.streak,1);assert.equal(r.due,false);
 s.recordCase(c.id,c.correct,'employee');assert.equal(s.mistakes().find(x=>x.id===c.id).streak,1);
 f.advance(1);s.recordCase(c.id,c.correct,'employee');assert.equal(s.mistakes().find(x=>x.id===c.id).streak,2);
 f.advance(3);s.recordCase(c.id,c.correct,'employee');assert.ok(!s.mistakes().some(x=>x.id===c.id));
});

test('reviewing one question never turns a failed full check into a pass and survives backup',()=>{
 const f=fixture(),s=f.model,m=s.byId.get('qualification');for(const q of m.questions)s.answerCheck(m.id,q.id,(q.correct+1)%3);s.submit(m.id,'employee');
 assert.equal(s.status(m,'employee').checked,false);const q=m.questions[0];s.reviewCheck(q.id,q.correct,'employee');assert.equal(s.snapshot().quizLog.length,1);assert.equal(s.status(m,'employee').checked,false);
 const restored=f.make();assert.equal(restored.snapshot().questionLog.length,4);assert.equal(restored.status(m,'employee').checked,false);
 restored.retry(m.id);passCheck(restored,m.id);assert.equal(restored.status(m,'employee').checked,true);
});

test('backups merge without erasing newer attempts and reject unrelated files without altering progress',()=>{
 const f=fixture(),s=f.model,c=s.cases.get('two-bills-one-purchase');s.recordCase(c.id,(c.correct+1)%3,'employee');s.toggleBookmark('case/'+c.id);const old=JSON.stringify(s.exportData());
 f.advance(.1);s.recordCase(c.id,c.correct,'employee');s.importData(old);assert.equal(s.snapshot().caseLog.length,2);assert.equal(s.passedCase(c.id),true);
 const other=fixture().model;other.importData(JSON.stringify(s.exportData()));assert.equal(other.snapshot().caseLog.length,2);assert.ok(other.snapshot().bookmarks.includes('case/'+c.id));
 const before=JSON.stringify(s.snapshot());assert.throws(()=>s.importData('{'));assert.throws(()=>s.importData('{"format":"another"}'));assert.throws(()=>s.importData('{"format":"rarus-smb-learning","schema":1,"learning":{"caseLog":{}}}'));assert.equal(JSON.stringify(s.snapshot()),before);
});

test('source updates invalidate the affected topic but offline blob URLs and voice changes do not',()=>{
 const f=fixture(),s=f.model;for(const id of ['basics','incoming']){s.acknowledge(id);passCheck(s,id);}
 const offline=structuredClone(f.options.materials);for(const d of offline.standards)for(const b of d.blocks)if(b.type==='image')b.src='blob:random-export-url';
 const clone=f.c.window.PORTAL_STUDY.create({...f.options,materials:offline});assert.equal(clone.status(clone.byId.get('incoming'),'employee').checked,true);
 const changed=structuredClone(f.options.materials);changed.standards.find(s=>s.id===2).blocks.find(b=>b.id==='std-2-block-019').text+=' Обновлённое правило.';
 const newer=f.c.window.PORTAL_STUDY.create({...f.options,materials:changed});assert.equal(newer.status(newer.byId.get('incoming'),'employee').read,false);assert.equal(newer.status(newer.byId.get('incoming'),'employee').checked,false);assert.equal(newer.status(newer.byId.get('basics'),'employee').checked,true);
});

test('storage failures keep progress in memory and allow export',()=>{
 const f=fixture(),s=f.c.window.PORTAL_STUDY.create({...f.options,storage:{getItem:()=>null,setItem:()=>{throw Error('Quota')}}});
 s.acknowledge('basics');assert.equal(s.persistent(),false);assert.ok(s.exportData().learning.reads.basics);
});
