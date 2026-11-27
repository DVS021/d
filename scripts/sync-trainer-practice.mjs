// Sync only verified portal cases and cited rules; speech wording is reviewed separately.
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=name=>readFile(new URL(name,root),'utf8');
const portal={window:{}};
for(const name of ['data','materials','learning'])vm.runInNewContext(await read('assets/'+name+'.js'),portal);
const d=portal.window.PORTAL_DATA,m=portal.window.PORTAL_MATERIALS,l=portal.window.PORTAL_LEARNING;
const content=JSON.parse(await read('scripts/trainer-practice-content.json'));
const marker='// BEGIN GENERATED PRACTICE LIBRARY';
const baseData=(await read('trainer/data.js')).split(marker)[0].trimEnd();
const baseViews=(await read('trainer/role-cases.js')).split(marker)[0].trimEnd();
const context={};vm.runInNewContext(baseData.replace(/export const /g,'const ')+'\nthis.data={voiceCases,sources};',context);
const existing=context.data.voiceCases,existingIds=new Set(existing.map(c=>c.id)),sources=context.data.sources;
const byId=new Map(sources.map(s=>[s.id,s]));
function blockText(block){return block.text||(block.rows||[]).flatMap(row=>row.flatMap(cell=>cell.blocks.map(blockText))).join('\n')}
function sourceFor(id){const rule=d.practiceRules[id];if(!rule)throw new Error('Missing rule '+id);let text,reference;
 if(rule.kind==='standard'){const block=m.standards.find(s=>s.id===rule.standard)?.blocks.find(b=>b.id===rule.block);if(!block)throw new Error('Missing full text '+id);text=blockText(block);reference=`index.html#standard/${rule.standard}/text/${rule.block}`}
 else if(rule.kind==='memo'){const memo=l.memos.find(x=>x.standard===rule.standard&&x.slide===rule.slide);const section=rule.part==='notes'?null:memo?.sections[rule.section];if(!memo||(!section&&rule.part!=='notes'))throw new Error('Missing memo section '+id);text=section?[section.title,...section.items].join('\n'):memo.notes.join('\n');reference=`index.html#memo/${rule.standard}/text/${rule.part==='notes'?'memo-notes-'+rule.slide:'memo-section-'+rule.slide+'-'+rule.section}`}
 else{if(!rule.body)throw new Error('Missing guide text '+id);text=rule.body;reference='index.html#practice/cases/rule/'+id}
 return {id,type:'portal_rule',title:rule.title,text,reference};
}
const additions=[],views={},newSources=new Map();
const perspective={employee:'Вы продолжаете работу с клиентом.',dispatcher:'Вы отвечаете за маршрут и принятие обращения.',controller:'Вы проверяете записи и подтверждения.',manager:'Вы разбираете работу команды.'};
const prompts={employee:'Что вы сделаете сейчас?',dispatcher:'Как сохранить запрос и подтвердить принятие?',controller:'Какие факты нужно сопоставить?',manager:'Какое действие вы поручите и как проверите результат?'};
const reflection={employee:'Какой результат и следующий шаг вы сохраните?',dispatcher:'Кто должен подтвердить принятие запроса?',controller:'Что подтвердит ваш вывод?',manager:'По какому факту вы примете выполненную работу?'};
for(const c of d.cases){
 for(const id of c.ruleIds){const source=sourceFor(id);if(byId.has(id)||!newSources.has(id))newSources.set(id,source)}
 if(existingIds.has(c.id))continue;
 const speech=content[c.id];if(!speech)throw new Error('Review speech for '+c.id);
 additions.push({id:c.id,title:c.title,question:speech.facts,prompt:'Как правильно продолжить работу?',answer:speech.principle,record:speech.record,recordLabel:'Важно сохранить',sources:c.ruleIds,caseUrl:'index.html#case/'+c.id,roles:c.roles});
 views[c.id]={};
 for(const role of c.roles){if(!speech[role])throw new Error('Missing role task '+c.id+'/'+role);views[c.id][role]={situation:perspective[role]+' '+speech.facts,prompt:prompts[role],answer:speech[role],question:reflection[role]}}
}
const unused=Object.keys(content).filter(id=>!additions.some(c=>c.id===id));if(unused.length)throw new Error('Unexpected curated entries: '+unused.join(','));
const topics=d.practiceTopics.map(t=>({id:t.id,title:t.title,caseIds:t.caseIds}));
const dataBlock=`\n\n${marker}\nvoiceCases.push(...${JSON.stringify(additions,null,2)});\nconst syncedPracticeSources=${JSON.stringify([...newSources.values()],null,2)};\nfor(const source of syncedPracticeSources){const existing=sources.find(s=>s.id===source.id);if(existing)Object.assign(existing,source);else sources.push(source)}\nexport const voiceCaseTopics=${JSON.stringify(topics,null,2)};\nfor(const topic of voiceCaseTopics)for(const id of topic.caseIds){const entry=voiceCases.find(c=>c.id===id);if(!entry)throw new Error('Missing trainer case '+id);entry.topic=topic.id}\n`;
await writeFile(new URL('trainer/data.js',root),baseData+dataBlock);
await writeFile(new URL('trainer/role-cases.js',root),baseViews+`\n\n${marker}\nObject.assign(roleCaseViews,${JSON.stringify(views,null,2)});\n`);
console.log(`Trainer library: ${existing.length+additions.length} cases in ${topics.length} topics; ${additions.length} new role-aware scenarios; ${newSources.size} refreshed rule excerpts.`);
