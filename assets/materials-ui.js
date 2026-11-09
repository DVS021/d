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
 if(b.type==='image')return `<figure class="source-diagram"${id}><a href="${escape(b.src)}" target="_blank" rel="noopener"><img src="${escape(b.src)}" alt="${escape(b.alt)}" loading="lazy"><span>Открыть схему крупнее ${H.icon('external')}</span></a></figure>`;
 if(b.type==='title')return `<p class="source-document-title"${id}>${escape(b.text)}</p>`;
 if(b.type==='heading'){const level=Math.min(4,Math.max(2,b.level));return `<h${level}${id}>${marker}${escape(b.text)}</h${level}>`}
 return `<p${id} class="${b.marker?'source-list-item':''}"${b.marker?` style="--list-indent:${Math.min(b.indent,5)}"`:''}>${marker}<span>${escape(b.text)}</span></p>`;
}
function renderStandardText(id){
 const doc=standard(id);if(!doc)return '';
 const headings=doc.blocks.filter(b=>b.type==='heading');
 return `<div class="learning-source-bar final-source-bar"><span>${H.icon('checkcircle')} ${escape(doc.edition)}</span>${sourceLink(doc.source,'Скачать DOCX')}</div><div class="source-reader"><aside class="source-toc"><details${window.matchMedia('(min-width:1100px)').matches?' open':''}><summary>Оглавление документа</summary><nav aria-label="Оглавление стандарта №${doc.id}">${headings.map(b=>`<button class="source-toc-item source-depth-${b.level}" data-nav="standard/${doc.id}/text/${b.id}">${escape(b.text)}</button>`).join('')}</nav></details></aside><article class="source-document card" aria-label="Полный текст стандарта №${doc.id}">${doc.blocks.map(renderBlock).join('')}</article></div>`;
}


function renderLessons(){const selected=location.hash.split('/')[2], slide=location.hash.split('/')[3];const lesson=M.lessons.find(l=>l.id===selected);return `<details class="learning-documents section-card" id="lesson-documents"${selected?' open':''}><summary>Учебные презентации</summary><div class="sources-list">${M.lessons.map(l=>`<div class="sources-item"><span class="source-number">${l.id.split('-')[0]}</span><span class="source-body"><strong>${escape(l.label||'Урок '+l.id)}. ${escape(l.title)}</strong><small>${escape(l.subtitle)}</small></span><div class="document-actions">${sourceLink(l.source,'Скачать PPTX')}${l.pdf?`<a class="button secondary small" href="${l.pdf}" target="_blank" rel="noopener">Открыть PDF</a>`:H.button('Читать урок','sources/lessons/'+l.id,'secondary small','book')}</div></div>`).join('')}<div class="sources-item"><span class="source-body"><strong>Урок 3. Материалы ведущего</strong><small>Тезисы и разбор усложнённых кейсов</small></span>${sourceLink('documents/lesson-3-presenter-notes.docx','Скачать DOCX')}</div></div></details>${lesson?`<section class="section-card" id="lesson-reader"><h2>${escape(lesson.label||'Урок '+lesson.id)}. ${escape(lesson.title)}</h2><nav class="tag-list">${lesson.slides.map(s=>H.button('Слайд '+s.number,'sources/lessons/'+lesson.id+'/'+s.number,'secondary small','')).join('')}</nav>${lesson.slides.filter(s=>!slide||s.number===+slide).map(s=>`<article class="section-card"><h3>Слайд ${s.number}. ${escape(s.title)}</h3>${s.paragraphs.filter(t=>t!==String(s.number)).map(t=>`<p style="white-space:pre-line">${escape(t)}</p>`).join('')}</article>`).join('')}</section>`:''}`}

function search(query){
 const q=query.toLocaleLowerCase('ru-RU'),results=[];
 for(const doc of M.standards){let heading=doc.title,count=0;for(const b of doc.blocks){if(b.type==='heading')heading=b.text;const text=blockText(b);if(text.toLocaleLowerCase('ru-RU').includes(q)&&count<3){results.push({type:'Полный стандарт · ред. 2',title:`№${doc.id} · ${heading}`,desc:text.slice(0,180),nav:`standard/${doc.id}/text/${b.id}`});count++}}}
 for(const lesson of M.lessons||[M.lesson])if((lesson.title+' '+lesson.subtitle+' урок '+lesson.id+' тиражирование').toLocaleLowerCase('ru-RU').includes(q))results.push({type:'Презентация · урок '+lesson.id,title:lesson.title,desc:lesson.subtitle,nav:'sources/lessons'});
 return results;
}
window.PORTAL_MATERIALS_UI={init:helpers=>{H=helpers},standard,renderStandardText,renderLessons,search};
})();
