import { roles, sources, voiceCases } from './data.js?v=a9fec2e1de8d';
import { audioMap } from './audio-map.js?v=a9fec2e1de8d';
import { audioLevels } from './audio-levels.js?v=a9fec2e1de8d';
import { roleCaseViews } from './role-cases.js?v=a9fec2e1de8d';
export { roles, sources, voiceCases };
const byId = new Map(sources.map(source => [source.id, source]));
const portalBase = new URL('../', import.meta.url);
function portalURL(reference){
 if(typeof document!=='undefined'&&globalThis.location?.href==='about:srcdoc'&&reference.startsWith('index.html#'))return new URL(reference.slice('index.html'.length),document.baseURI).href;
 return new URL(reference,portalBase).href;
}
voiceCases.forEach(c=>c.caseUrl=portalURL(c.caseUrl));
export function publicSource(id) {
  const source = byId.get(id);
  if (!source) return null;
  return { id, title: source.type === 'lesson_text' ? `Урок ${source.lesson} · слайд ${source.slide}` : source.title,
    text: source.text, url: ['lesson_text','portal_rule'].includes(source.type) ? portalURL(source.reference) : null };
}
// The written materials keep their terms; speech expands abbreviations and numbers.
export function voiceText(response) {
  return (response.speech + '\n\n' + response.question)
    .replace(/1С\s*:\s*УАТ/giu, 'один эс, управление автотранспортом')
    .replace(/ПП(?=$|[^а-яё])/gu, 'программных продуктов')
    .replace(/[вВ] ЕИС/gu, 'в единой информационной системе')
    .replace(/правилам ЕИС/gu, 'правилам единой информационной системы')
    .replace(/ИТС(?=$|[^а-яё])/gu, 'и тэ эс')
    .replace(/CRM/giu, 'си эр эм')
    .replace(/email/giu, 'адрес электронной почты')
    .replace(/о КП/g, 'о коммерческом предложении')
    .replace(/КП(?=$|[^а-яё])/gu, 'коммерческое предложение')
    .replace(/РОПа(?=$|[^а-яё])/giu, 'руководителя отдела продаж')
    .replace(/РОПу(?=$|[^а-яё])/giu, 'руководителю отдела продаж')
    .replace(/РОПом(?=$|[^а-яё])/giu, 'руководителем отдела продаж')
    .replace(/РОП(?=$|[^а-яё])/giu, 'руководитель отдела продаж')
    .replace(/ОП(?=$|[^а-яё])/gu, 'отдела продаж')
    .replace(/Проверку первого отклика и SLA выполняют/gu, 'Первый ответ клиенту и соблюдение сроков проверяют')
    .replace(/SLA/gi, 'сроков первого ответа')
    .replace(/для 60 автомобилей/gu, 'для шестидесяти автомобилей')
    .replace(/60 автомобилей/gu, 'шестьдесят автомобилей')
    .replace(/№\s*2/gu, 'номер два')
    .replace(/[«»]/gu, '')
    .replace(/[—–]/gu, ',')
    .replace(/[^\S\n]+/gu, ' ')
    .trim();
}
function result(role, speech, question, ids, stage = 'reflection') {
  const response = { role, mode: 'guided', speech, question, stage, sources: [...new Set(ids)].map(publicSource).filter(Boolean) };
  const file = audioMap[voiceText(response)];
  if(file){
    const url=new URL(file, import.meta.url);
    if(typeof document!=='undefined'&&url.protocol!=='data:'){
      const script=document.querySelector('script[type="module"][src]');
      const version=script&&new URL(script.src,document.baseURI).searchParams.get('v');
      if(version)url.searchParams.set('v',version);
    }
    response.audioUrl=url.href;
    response.audioLevels=audioLevels[voiceText(response)] || '';
  }
  return response;
}
function caseResult(role, topic, action) {
 const id=topic?.id||'handoff-default';
 if(topic&&role!=='general'&&!topic.roles.includes(role))throw new RangeError('Case is unavailable for this role');
 const v=roleCaseViews[id]?.[role];
 const ids=topic?topic.sources:['lesson-2-slide-27','lesson-2-slide-28','confirmed-role-policy'];
 const policy=['controller','manager','dispatcher'].includes(role)?['lesson-2-slide-18','confirmed-role-policy']:[];
 if(!v&&role!=='general')throw new Error('Missing role case view: '+id+'/'+role);
 if(action==='case')return result(role,v?.situation||topic.question,v?.prompt||topic.prompt||'Как вы поступите в этой ситуации?',[...ids,...policy],'case');
 return result(role,v?.answer||(topic.answer+' '+(topic.recordLabel||'Важно сохранить')+': '+topic.record),v?.question||'Какой шаг важно не пропустить?',[...ids,...policy],'review');
}
const roleExplanations={
 employee: {
  why:'Стандарты помогают продолжить работу с клиентом без потерь. Сохраните, что ему нужно, о чём вы договорились и что сделаете дальше. Для новой продажи сначала нужен Лид и его квалификация. По уже активной продаже продолжайте работу в её объекте.',
  response:'Первый ответ клиенту даёт назначенный исполнитель. Если это вы, ответьте по существу и сохраните результат. Соблюдение срока проверяют контролёр и руководитель отдела продаж.',
  timing:'Найдите срок первого ответа для своего канала в стандарте номер два. Отсчёт не начинается заново из-за передачи обращения.'
 },
 dispatcher:{
  why:'Ваша задача — не потерять обращение при передаче. Сохраните просьбу клиента, направьте её нужному сотруднику и убедитесь, что он принял запрос. До принятия следите за передачей.',
  response:'Первый ответ и его срок проверяют контролёр и руководитель отдела продаж. Ваша задача — убедиться, что обращение принял конкретный сотрудник. Отправки в группу недостаточно.',
  timing:'В своей роли проверяйте принятие обращения сотрудником. Проверка срока первого ответа относится к контролёру и руководителю отдела продаж. Нормативы для каналов указаны в стандарте номер два.'
 },
 controller:{
  why:'Стандарты дают основания для проверки фактов: что запросил клиент, кому передали обращение и чем подтверждён результат. Сопоставляйте историю и реальные коммуникации. Расхождение передавайте руководителю; действия за владельца объекта не выбирайте.',
  response:'Сопоставьте исходное время обращения, содержательный первый ответ и применимый норматив. Первый ответ выполняет исполнитель; его срок проверяете вы и руководитель отдела продаж. Контроль диспетчера заканчивается подтверждённым принятием.',
  timing:'Для проверки выберите норматив по каналу и ситуации из стандарта номер два. Восстановите исходное время поступления и фактический ответ. Регистрация и передача не обнуляют отсчёт.'
 },
 manager:{
  why:'Стандарты помогают выявлять разрывы в обработке клиентского запроса. Организуйте понятную ответственность, решение по квалификации и конкретный следующий шаг. Разбирайте подтверждённые отклонения и проверяйте результат исправления.',
  response:'Организуйте первый ответ исполнителем и контроль срока вместе с контролёром. Разделяйте подтверждённое принятие обращения и фактический ответ клиенту. Диспетчер отвечает за контроль передачи до принятия сотрудником.',
  timing:'Норматив первого ответа определяется каналом и ситуацией по стандарту номер два. При разборе восстанавливайте исходное событие, фактический ответ и ответственность. Передача не должна скрывать просрочку.'
 },
 general:{
  why:'Стандарты сохраняют путь запроса клиента: понятную задачу, ответственного, результат разговора и следующий шаг. Быстрого ответа недостаточно, если дальнейшая работа потеряна. У каждой роли своя часть этого пути.',
  response:'Первый ответ даёт назначенный исполнитель. Срок и содержание ответа проверяют контролёр и руководитель отдела продаж. Диспетчер контролирует передачу до принятия обращения конкретным сотрудником.',
  timing:'Срок первого ответа зависит от канала и ситуации. Норматив нужно смотреть в стандарте номер два. Регистрация обращения и передача исполнителю не начинают отсчёт заново.'
 }
};
roles.employee.opening='Разберём, как не потерять задачу клиента. Вам нужно понять его просьбу, сохранить договорённость и назначить следующий шаг с датой. Для новой продажи сначала проверьте активные Лиды и Интересы. Если по этой потребности их нет, начните с Лида и квалификации.';
roles.employee.question='Какой следующий шаг вы согласуете с клиентом?';
roles.dispatcher.opening='Вы помогаете обращению попасть к нужному человеку. Сохраните, что хочет клиент и к какому сроку. Передайте запрос и убедитесь, что его принял конкретный сотрудник. До принятия контроль передачи остаётся у вас. Первый ответ клиенту проверяют контролёр и руководитель отдела продаж.';
roles.dispatcher.question='Кто конкретно принял обращение?';
export function guidedTurn({role,action,text='',caseId=''}){
 const p=roles[role];if(!p)throw new Error('Unknown role');
 if(action==='voice-preview')return result(role,'Здравствуйте. Сегодня разберём, как квалифицировать Лид и не потерять запрос клиента.','',['lesson-1-slide-02'],'preview');
 const topic=voiceCases.find(c=>c.id===caseId);
 const t=text.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 if(role==='dispatcher'&&action==='message'&&/^(сколько|какой норматив|каков норматив)/.test(t))return result(role,roleExplanations.dispatcher.timing,'Как вы определите применимый норматив?',['lesson-1-slide-05','confirmed-role-policy']);
 if(role==='dispatcher'&&action==='message'&&/(отклик|sla|сла|первый ответ)/.test(t))return result(role,roleExplanations.dispatcher.response,'Кто конкретно принял обращение?',['confirmed-role-policy','lesson-2-slide-18']);
 if(topic&&['case','case-answer','message'].includes(action))return caseResult(role,topic,action);
 if(caseId==='handoff-default'&&['case','case-answer','message'].includes(action))return caseResult(role,null,action);
 if(action==='case-answer')return caseResult(role,null,action);
 if(action==='intro')return result(role,p.opening,p.question,p.sources,'question');
 if(action==='case')return caseResult(role,null,action);
 if(/сколько|норматив|минут|часов/.test(t))return result(role,roleExplanations[role].timing,'Как вы определите применимый норматив?',['lesson-1-slide-05','confirmed-role-policy']);
 if(/отклик|sla|сла|первый ответ/.test(t))return result(role,roleExplanations[role].response,'За какой факт отвечает ваша роль?',['lesson-1-slide-18','lesson-2-slide-18','confirmed-role-policy']);
 if(/зачем|почему|смысл|стандарт/.test(t))return result(role,roleExplanations[role].why,p.question,['lesson-1-slide-02','lesson-1-slide-04','lesson-1-slide-05',...p.sources]);
 if(/кейс|пример|ситуаци|автомоб|уат/.test(t))return guidedTurn({role,action:'case'});
 return caseResult(role,null,'case-answer');
}
