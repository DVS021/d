import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context={window:{}};
vm.createContext(context);
for(const file of ['data','materials','learning'])vm.runInContext(await readFile(new URL('../assets/'+file+'.js',import.meta.url),'utf8'),context);
const {PORTAL_DATA:data,PORTAL_MATERIALS:materials,PORTAL_LEARNING:learning}=context.window;

test('each control criterion has concrete checks, relevant cases and links to existing source blocks',()=>{
 const {core,diagnostic}=data.controlCriteria;
 assert.equal(core.length,5);assert.equal(diagnostic.length,8);
 const ids=new Set();
 for(const criterion of [...core,...diagnostic]){
  assert.ok(!ids.has(criterion.id));ids.add(criterion.id);
  assert.ok(criterion.title&&criterion.description&&criterion.checks.length>=2);
  assert.ok(criterion.caseIds.length>=2&&criterion.ruleIds.length);
  for(const id of criterion.caseIds){const example=data.cases.find(c=>c.id===id);assert.ok(example,id);assert.ok(example.roles.includes('manager')||example.roles.includes('controller'));}
  for(const id of criterion.ruleIds){const rule=data.practiceRules[id];assert.ok(rule,id);if(rule.kind==='standard')assert.ok(materials.standards.find(s=>s.id===rule.standard)?.blocks.some(b=>b.id===rule.block),id);else if(rule.kind==='memo')assert.ok(learning.memos.find(m=>m.standard===rule.standard&&m.slide===rule.slide)?.sections[rule.section],id);else assert.fail('Unresolved source '+id);}
 }
 assert.equal(core.find(c=>c.code==='К5').title,'Устранение замечаний');
 assert.ok(materials.lessons.find(l=>String(l.id)==='1').slides.find(s=>s.number===20).paragraphs.includes('Исправление'));
});

test('new diagnostic cases are grounded in current standards and preserve the navigator examples',()=>{
 const cases=['messenger-contact-not-recorded','lead-deadline-not-reset','correction-needs-recheck','new-demand-after-correct-completion'];
 for(const id of cases){const example=data.cases.find(c=>c.id===id);assert.ok(example&&example.choices[example.correct]&&example.why&&example.next,id);for(const key of example.ruleIds){const rule=data.practiceRules[key];assert.ok(rule,key);assert.ok(materials.standards.find(s=>s.id===rule.standard)?.blocks.some(b=>b.id===rule.block),key);}}
 const lifetime=data.cases.find(c=>c.id==='lead-deadline-not-reset');assert.match(lifetime.choices[lifetime.correct],/поступления/);assert.match(lifetime.why,/16 рабочих часов/);
 const reopened=data.cases.find(c=>c.id==='new-demand-after-correct-completion');assert.match(reopened.choices[reopened.correct],/новый Лид/);assert.match(reopened.why,/ошибочном или автоматическом/);
 assert.equal(data.cases.filter(c=>c.navigatorId).length,13);
 assert.equal(new Set(data.cases.map(c=>c.id)).size,data.cases.length);
});
