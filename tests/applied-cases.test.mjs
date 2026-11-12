import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={window:{}};
for(const name of ['data','materials']) vm.runInNewContext(await readFile(new URL('../assets/'+name+'.js',import.meta.url),'utf8'),context);
const data=context.window.PORTAL_DATA,materials=context.window.PORTAL_MATERIALS;

test('16 concrete work cases retain the existing library and point to published rules',()=>{
 const cases=data.cases.filter(c=>c.applied);
 assert.equal(cases.length,16);assert.equal(data.cases.length,53);
 assert.equal(new Set(data.cases.map(c=>c.id)).size,data.cases.length);
 for(const c of cases){
  assert.ok(c.choices[c.correct]&&c.clarify.length&&c.steps.length&&c.next&&c.mistake);
  assert.ok(c.ruleIds.length);
  for(const id of c.ruleIds){const r=data.practiceRules[id];assert.equal(r.kind,'standard');assert.ok(materials.standards.find(d=>d.id===r.standard)?.blocks.some(b=>b.id===r.block));}
 }
});

test('independent legal-entity purchases differ from two payments for one purchase',()=>{
 const get=id=>data.cases.find(c=>c.id===id);
 const separate=get('two-entities-license-purchase');assert.match(separate.question,/независимо/);assert.match(separate.choices[separate.correct],/два Интереса/);
 const payment=get('two-bills-one-purchase');assert.match(payment.question,/аванс и остаток/);assert.match(payment.choices[payment.correct],/не создаёт второй/);
 const fresh=get('consultation-becomes-new-sale');assert.match(fresh.choices[fresh.correct],/Проверить активный Лид или Интерес/);
 const active=get('consultation-with-existing-interest');assert.match(active.choices[active.correct],/действующего Интереса/);
});

