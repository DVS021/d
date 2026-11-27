import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(await readFile(new URL('../assets/data.js',import.meta.url),'utf8'),context);
const data=context.window.PORTAL_DATA;
test('every practice case has exactly one primary topic while cross-topic collections retain valid links',()=>{
 const topics=data.practiceTopics,caseIds=new Set(data.cases.map(c=>c.id));
 assert.ok(topics.length>1);
 assert.equal(new Set(topics.map(t=>t.id)).size,topics.length);
 const assignments=new Map();
 for(const topic of topics){
  assert.ok(topic.title&&topic.description&&topic.icon&&topic.caseIds.length,topic.id);
  for(const id of topic.caseIds){assert.ok(caseIds.has(id),`Missing case ${topic.id}/${id}`);assignments.set(id,(assignments.get(id)||0)+1)}
  for(const id of topic.collectionIds||[])assert.ok(data.practiceCollections.some(c=>c.id===id),`Missing collection ${id}`);
 }
 assert.equal(assignments.size,caseIds.size);
 for(const id of caseIds)assert.equal(assignments.get(id),1,`Primary topic for ${id}`);
 for(const collection of data.practiceCollections){assert.equal(new Set(collection.caseIds).size,collection.caseIds.length);for(const id of collection.caseIds)assert.ok(assignments.has(id),id)}
});
