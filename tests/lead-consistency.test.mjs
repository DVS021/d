import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const c={window:{}};vm.createContext(c);
for(const name of ['data','materials'])vm.runInContext(await readFile(new URL('../assets/'+name+'.js',import.meta.url),'utf8'),c);
const data=c.window.PORTAL_DATA,standard=c.window.PORTAL_MATERIALS.standards.find(s=>s.id===4);
test('navigator case 009 follows the currently published Lead standard, preserving its ID and case number',()=>{
 const entry=data.cases.find(c=>c.id==='lead-return-after-close');assert.equal(entry.navigatorId,'009');
 assert.match(entry.choices[entry.correct],/Корректно завершённый Лид не восстанавливается/);
 assert.match(standard.blocks.find(b=>b.id==='std-4-block-137').text,/завершённый Лид не восстанавливается/);
 assert.match(entry.why,/ошибочном или автоматическом закрытии/);
 assert.doesNotMatch(data.practiceRules['lead-return'].body,/успешный контакт.*восстановить/);
 for(const key of entry.ruleIds){const r=data.practiceRules[key];assert.equal(r.standard,4);assert.ok(standard.blocks.some(b=>b.id===r.block));}
 assert.equal(data.cases.filter(c=>c.navigatorId).length,13);
});
test('role quick answers resolve to applicable cases with published rule sources',()=>{
 for(const[role,ids]of Object.entries(data.quickCases))for(const id of ids){const entry=data.cases.find(c=>c.id===id);assert.ok(entry,id);assert.ok(role==='general'||entry.roles.includes(role));assert.ok(entry.choices[entry.correct]);for(const key of entry.ruleIds)assert.ok(data.practiceRules[key],key);}
});
