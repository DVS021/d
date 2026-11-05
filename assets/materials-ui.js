(() => {
'use strict';
const M=window.PORTAL_MATERIALS;
let H;
const standard=id=>M.standards.find(s=>s.id===+id);
const escape=value=>H.esc(value);
const blockText=b=>b.text||(b.rows||[]).flatMap(row=>row.flatMap(c=>c.blocks.map(blockText))).join(' ');
function sourceLink(source,label){return `<a class="button secondary small" href="${escape(source)}" download>${escape(label)} ${H.icon('external')}</a>`}
function renderBlock(b){
 const id=b.id?` id="${b.id}"`:'';
 const marker=b.marker?`<span class="source-marker" aria-hidden="true">${escape(b.marker)}</span>`:'';
 if(b.type==='table')return `<div class="source-table-wrap"${id} role="region" aria-label="Таблица стандарта" tabindex="0"><table class="source-table"><tbody>${b.rows.map((row,i)=>`<tr>${row.map(c=>`<${i===0?'th scope="col"':'td'} colspan="${c.span}">${c.blocks.map(renderBlock).join('')}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 if(b.type==='image')return `<figure class="source-diagram"${id}><a href="${escape(b.src)}" target="_blank" rel="noopener"><img src="${escape(b.src)}" alt="${escape(b.alt)}" loading="lazy"><span>Открыть исходную схему крупнее ${H.icon('external')}</span></a></figure>`;
 if(b.type==='title')return `<p class="source-document-title"${id}>${escape(b.text)}</p>`;
 if(b.type==='heading'){const level=Math.min(4,Math.max(2,b.level));return `<h${level}${id}>${marker}${escape(b.text)}</h${level}>`}
 return `<p${id} class="${b.marker?'source-list-item':''}"${b.marker?` style="--list-indent:${Math.min(b.indent,5)}"`:''}>${marker}<span>${escape(b.text)}</span></p>`;
}
function renderStandardText(id){
 const doc=standard(id);if(!doc)return '';
 const headings=doc.blocks.filter(b=>b.type==='heading');
 return `<div class="learning-source-bar final-source-bar"><span>${H.icon('checkcircle')} Окончательная редакция · 18.09.2026</span>${sourceLink(doc.source,'Скачать оригинал DOCX')}</div><div class="source-reader"><aside class="source-toc"><details${window.matchMedia('(min-width:1100px)').matches?' open':''}><summary>Оглавление документа</summary><nav aria-label="Оглавление стандарта №${doc.id}">${headings.map(b=>`<button class="source-toc-item source-depth-${b.level}" data-nav="standard/${doc.id}/text/${b.id}">${escape(b.text)}</button>`).join('')}</nav></details></aside><article class="source-document card" aria-label="Полный текст стандарта №${doc.id}">${doc.blocks.map(renderBlock).join('')}<footer>Полный текст окончательной редакции. Таблицы, приложения и исходные схемы сохранены. Формулировки первоисточника не сокращены.</footer></article></div>`;
}


function renderLessons(){return `<article class="lesson-card card"><img src="${M.lesson.cover}" alt="Обложка презентации урока 1"><div><span class="eyebrow">УРОК 1 · ТИРАЖИРОВАНИЕ СТАНДАРТОВ СМБ</span><h2>${escape(M.lesson.title)}</h2><p>${escape(M.lesson.subtitle)}. Презентация из ${M.lesson.slides.length} слайдов.</p><div class="head-actions">${sourceLink(M.lesson.source,'Скачать презентацию PPTX')}<a class="button secondary small" href="${M.lesson.pdf}" target="_blank" rel="noopener">Открыть PDF ${H.icon('external')}</a></div></div></article>`}

function search(query){
 const q=query.toLocaleLowerCase('ru-RU'),results=[];
 for(const doc of M.standards){let heading=doc.title,count=0;for(const b of doc.blocks){if(b.type==='heading')heading=b.text;const text=blockText(b);if(text.toLocaleLowerCase('ru-RU').includes(q)&&count<3){results.push({type:'Полный стандарт · ред. 2',title:`№${doc.id} · ${heading}`,desc:text.slice(0,180),nav:`standard/${doc.id}/text/${b.id}`});count++}}}
 if((M.lesson.title+' '+M.lesson.subtitle+' урок 1 тиражирование').toLocaleLowerCase('ru-RU').includes(q))results.push({type:'Презентация · урок 1',title:M.lesson.title,desc:M.lesson.subtitle,nav:'practice/lessons'});
 return results;
}
window.PORTAL_MATERIALS_UI={init:helpers=>{H=helpers},standard,renderStandardText,renderLessons,search};
})();
