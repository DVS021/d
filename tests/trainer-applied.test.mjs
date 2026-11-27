import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {voiceCases,guidedTurn,voiceText} from '../trainer/engine.js';
import {audioMap} from '../trainer/audio-map.js';
test('all selectable voice cases have grounded, recorded stories and solutions without keyword grading', async()=>{
 const context={window:{}};vm.runInNewContext(await readFile(new URL('../assets/data.js',import.meta.url),'utf8'),context);
 assert.deepEqual(voiceCases.map(c=>c.id).sort(),Array.from(context.window.PORTAL_DATA.cases,c=>c.id).sort());
 for(const c of voiceCases)for(const action of ['case','case-answer']){
  const reply=guidedTurn({role:'general',action,caseId:c.id});
  assert.ok(reply.speech&&reply.sources.length);
  assert.equal(Boolean(reply.question),action==='case');
  assert.ok(reply.sources.every(s=>s.url&&/#(?:standard|memo|practice)\//.test(s.url)));
  const path=audioMap[voiceText(reply)];assert.match(path,/^audio\/[a-f0-9]{16}\.mp3$/);
  assert.ok((await readFile(new URL('../trainer/'+path,import.meta.url))).length>1000);
 }
 const topic=voiceCases[0];const reply=guidedTurn({role:'employee',action:'message',caseId:topic.id,text:'Не согласен, достаточно одного Интереса'});
 assert.doesNotMatch(reply.speech,/^Верно|^Правильно/);assert.match(reply.speech,/два Интереса/);
});

test('trainer topics match practice and each permitted participant has an individual review',async()=>{
 const context={window:{}};vm.runInNewContext(await readFile(new URL('../assets/data.js',import.meta.url),'utf8'),context);
 const {voiceCaseTopics}=await import('../trainer/engine.js');
 assert.deepEqual(JSON.parse(JSON.stringify(voiceCaseTopics)),JSON.parse(JSON.stringify(context.window.PORTAL_DATA.practiceTopics.map(t=>({id:t.id,title:t.title,caseIds:t.caseIds})))));
 for(const example of context.window.PORTAL_DATA.cases){const trained=voiceCases.find(c=>c.id===example.id);assert.deepEqual([...trained.roles].sort(),Array.from(example.roles).sort());assert.equal(trained.topic,voiceCaseTopics.find(t=>t.caseIds.includes(example.id)).id);}
 for(const role of ['general','employee','controller','manager']){
  const reply=guidedTurn({role,action:'case-answer',caseId:'quote-ready-not-sent'});
  assert.match(reply.speech,/направлен|отправк|направлени/);
 }
 assert.throws(()=>guidedTurn({role:'dispatcher',action:'case-answer',caseId:'quote-ready-not-sent'}),RangeError);
 const contextual=guidedTurn({role:'dispatcher',action:'message',caseId:'consultation-becomes-new-sale',text:'Сколько Лидов создавать?'});
 assert.equal(contextual.speech,guidedTurn({role:'dispatcher',action:'case-answer',caseId:'consultation-becomes-new-sale'}).speech);
 const employee=guidedTurn({role:'employee',action:'case-answer',caseId:'interest-customer-not-answering'});
 assert.match(employee.speech,/трёх попыток за три рабочих дня/);
 const controller=guidedTurn({role:'controller',action:'case-answer',caseId:'customer-refusal-interest-outcome'});
 assert.doesNotMatch(controller.speech,/выберите.*Потерян|измените.*результат/);
});
