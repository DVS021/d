import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {voiceCases,guidedTurn,voiceText} from '../trainer/engine.js';
import {audioMap} from '../trainer/audio-map.js';
test('all selectable voice cases have grounded, recorded stories and solutions without keyword grading', async()=>{
 assert.equal(voiceCases.length,14);
 for(const c of voiceCases)for(const action of ['case','case-answer']){
  const reply=guidedTurn({role:'general',action,caseId:c.id});
  assert.ok(reply.speech&&reply.question&&reply.sources.length);
  assert.ok(reply.sources.every(s=>s.url&&s.url.includes('#standard/')));
  const path=audioMap[voiceText(reply)];assert.match(path,/^audio\/[a-f0-9]{16}\.mp3$/);
  assert.ok((await readFile(new URL('../trainer/'+path,import.meta.url))).length>1000);
 }
 const topic=voiceCases[0];const reply=guidedTurn({role:'employee',action:'message',caseId:topic.id,text:'Не согласен, достаточно одного Интереса'});
 assert.doesNotMatch(reply.speech,/^Верно|^Правильно/);assert.match(reply.speech,/два Интереса/);
});
