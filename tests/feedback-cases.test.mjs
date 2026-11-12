import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={window:{}};
for(const name of ['data','materials'])vm.runInNewContext(await readFile(new URL('../assets/'+name+'.js',import.meta.url),'utf8'),context);
const d=context.window.PORTAL_DATA,m=context.window.PORTAL_MATERIALS;
const get=id=>d.cases.find(c=>c.id===id);
function ruleText(c){return c.ruleIds.map(id=>{const r=d.practiceRules[id];return JSON.stringify(m.standards.find(s=>s.id===r.standard).blocks.find(b=>b.id===r.block));}).join(' ');}
test('feedback cases have resolvable full-standard sources and remain searchable from work questions',()=>{
 const cases=d.cases.filter(c=>c.feedback);assert.equal(cases.length,12);
 for(const c of cases){
  assert.ok(c.why&&c.choices[c.correct]&&c.steps.length&&c.clarify.length&&c.mistake);
  assert.ok(c.ruleIds.length&&c.ruleIds.every(id=>{const r=d.practiceRules[id];return r?.kind==='standard'&&m.standards.find(s=>s.id===r.standard)?.blocks.some(b=>b.id===r.block)}));
  assert.ok(d.workQuestions.some(q=>q.caseIds.includes(c.id)));
  assert.equal(c.followUpTitle,'Что важно сохранить');
  assert.doesNotMatch([c.question,c.why,...c.steps].join(' '),/откройте.*ЕИС|нажмите|вкладк|пункт меню/i);
 }
});
test('new and existing sales, assignment and rejection stay within their stated rules',()=>{
 const current=get('ongoing-project-no-new-lead');assert.match(ruleText(current),/новое входящее обращение не создает новый Лид/);assert.match(current.choices[current.correct],/действующем/);
 const duplicate=get('duplicate-found-during-qualification');assert.match(ruleText(duplicate),/отклоняет Лид с причиной/);assert.match(duplicate.why,/следующий шаг и срок/);
 const role=get('office-without-dispatcher');assert.match(ruleText(role),/не ограничивает организацию в выборе конкретного исполнителя роли/);
 const first=get('combined-roles-first-assignment');assert.match(ruleText(first),/Первичное назначение.*не считается передачей/);assert.doesNotMatch(first.choices[first.correct],/продлевает срок/);
 const attempts=get('reject-after-one-attempt');assert.match(ruleText(attempts),/не менее двух попыток.*в разное время/);assert.match(attempts.choices[attempts.correct],/двух попыток в разное время/);
 const after=get('customer-refusal-after-qualification');assert.match(ruleText(after),/Результат квалификации Лида при этом не меняется/);assert.match(after.choices[after.correct],/не меняется/);
});
