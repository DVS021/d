// Precompute mouth movement; playback itself stays on the native audio element.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('trainer/audio-map.js',root),'utf8');
const map=JSON.parse(source.replace(/^export const audioMap = /,'').trim().replace(/;$/,''));
const levels={};
for(const [text,file] of Object.entries(map)){
 const pcm=await new Promise((resolve,reject)=>{
  const p=spawn('ffmpeg',['-v','error','-i',fileURLToPath(new URL('trainer/'+file,root)),'-f','f32le','-ac','1','-ar','8000','pipe:1']);
  const chunks=[];let error='';p.stdout.on('data',x=>chunks.push(x));p.stderr.on('data',x=>error+=x);
  p.on('error',reject);p.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(error)));
 });
 const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4),frames=[];
 for(let i=0;i<samples.length;i+=640){let energy=0;const end=Math.min(i+640,samples.length);for(let j=i;j<end;j++)energy+=samples[j]**2;
  frames.push(Math.round(Math.min(1,Math.max(0,(Math.sqrt(energy/(end-i))-.018)*24))*255));
 }
 levels[text]=Buffer.from(frames).toString('base64');
}
await writeFile(new URL('trainer/audio-levels.js',root),'export const audioLevels = '+JSON.stringify(levels,null,2)+';\n');
console.log('Mouth movement prepared for '+Object.keys(levels).length+' recordings');
