import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{guidedTurn,voiceCases,voiceText,roles}from'../trainer/engine.js';
import{audioMap}from'../trainer/audio-map.js';
import{roleCaseViews}from'../trainer/role-cases.js';

test('every available case changes both the task and solution for each role',()=>{
 for(const c of voiceCases){
  const available=['general',...Object.keys(roles).filter(r=>r!=='general'&&c.roles.includes(r))];
  for(const action of ['case','case-answer']){
   const replies=available.map(role=>guidedTurn({role,action,caseId:c.id}));
   assert.equal(new Set(replies.map(r=>r.speech)).size,available.length,c.id+' distinct '+action+' content');
   assert.equal(new Set(replies.map(r=>r.speech+'\n'+r.question)).size,available.length,c.id+' '+action);
   for(const r of replies){assert.ok(r.sources.length);assert.ok(c.sources.every(id=>r.sources.some(s=>s.id===id)));}
  }
  for(const role of c.roles)assert.ok(roleCaseViews[c.id][role],c.id+'/'+role);
 }
 const defaultAnswers=Object.keys(roles).map(role=>guidedTurn({role,action:'case-answer'}).speech);
 assert.equal(new Set(defaultAnswers).size,5);
 for(const text of ['Зачем нужны стандарты?','Кто проверяет первый отклик?','Сколько минут?']){
  assert.equal(new Set(Object.keys(roles).map(role=>guidedTurn({role,action:'message',text}).speech)).size,5,text);
 }
});

test('roles keep their responsibilities and the employee UAT review answers the selected case',()=>{
 const employee=guidedTurn({role:'employee',action:'case-answer',caseId:'handoff-default'});
 assert.match(employee.speech,/число автомобилей и срок/);
 assert.doesNotMatch(employee.speech,/КП|Поговорили/);
 const dispatcher=guidedTurn({role:'dispatcher',action:'case-answer',caseId:'automatic-route-no-acceptance'});
 assert.match(dispatcher.speech,/контроль остаётся у вас/);
 assert.doesNotMatch(dispatcher.speech,/[Кк]валифицируйте|[Сс]оздайте Интерес|[Пп]роверьте.*первый отклик/);
 const controller=guidedTurn({role:'controller',action:'case-answer',caseId:'reject-after-one-attempt'});
 assert.match(controller.speech,/не переписывая историю за владельца/);
 const manager=guidedTurn({role:'manager',action:'case-answer',caseId:'office-without-dispatcher'});
 assert.match(manager.speech,/Организуйте назначение всех ролей/);
 const firstResponse=guidedTurn({role:'employee',action:'message',text:'первый отклик'});
 assert.match(firstResponse.speech,/Первый ответ клиенту/);
 assert.throws(()=>guidedTurn({role:'dispatcher',action:'case',caseId:'two-entities-license-purchase'}),RangeError);
});

test('all selectable role stories and solutions have their own complete recordings',async()=>{
 for(const role of Object.keys(roles))for(const c of [{id:'handoff-default'},...voiceCases.filter(c=>role==='general'||c.roles.includes(role))]){
  for(const action of ['case','case-answer']){
   const r=guidedTurn({role,caseId:c.id,action});const file=audioMap[voiceText(r)];
   assert.match(file,/^audio\/[a-f0-9]{16}\.mp3$/,c.id+'/'+role+'/'+action);
   assert.ok((await readFile(new URL('../trainer/'+file,import.meta.url))).length>1000);
  }
 }
});
