import { roles, sources } from './data.js?v=37fc0b99684d';
import { audioMap } from './audio-map.js?v=37fc0b99684d';
export { roles, sources };
const byId = new Map(sources.map(source => [source.id, source]));
const portalBase = new URL('../', import.meta.url);
export function publicSource(id) {
  const source = byId.get(id);
  if (!source) return null;
  return { id, title: source.type === 'lesson_text' ? `Урок ${source.lesson} · слайд ${source.slide}` : source.title,
    text: source.text, url: source.type === 'lesson_text' ? new URL(source.reference, portalBase).href : null };
}
export function voiceText(response) { return response.speech + ' ' + response.question; }
function result(role, speech, question, ids, stage = 'reflection') {
  const response = { role, mode: 'guided', speech, question, stage, sources: [...new Set(ids)].map(publicSource).filter(Boolean) };
  const file = audioMap[voiceText(response)];
  if (file) response.audioUrl = new URL(file, import.meta.url).href;
  return response;
}
const handoff='Клиент просит подобрать 1С:УАТ для 60 автомобилей. Расчёт нужен до пятницы. В профильный отдел написали только: «Клиенту нужен расчёт по УАТ». На следующий день неизвестно, кто принял обращение.';
export function guidedTurn({role,action,text=''}){
 const p=roles[role];if(!p)throw new Error('Unknown role');
 if(action==='intro')return result(role,p.opening,p.question,p.sources,'question');
 if(action==='case')return result(role,handoff+' '+(role==='dispatcher'?'Для вашей роли важно передать полную задачу и убедиться в принятии конкретным исполнителем.':role==='controller'?'Сопоставьте исходный запрос с переданной задачей и подтверждением принятия.':role==='manager'?'Нужно восстановить контекст и организовать принятие конкретным сотрудником.':'Посмотрите, какие сведения и подтверждение ответственности здесь потерялись.'),'Как вы продолжите работу в своей роли?',['lesson-2-slide-27','lesson-2-slide-28','confirmed-role-policy'],'case');
 const t=text.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 if(/(sla|сла|отклик|срок).*(провер|контрол)|провер.*(отклик|sla|сла)/.test(t))return result(role,'Первый отклик выполняет назначенный исполнитель. Проверку первого отклика и SLA выполняют контролёр и РОП. Диспетчер сохраняет контроль передачи до принятия обращения конкретным исполнителем.','Что должно подтвердить принятие обращения?',['lesson-1-slide-18','lesson-2-slide-18','confirmed-role-policy']);
 if(/сколько|норматив|минут|часов/.test(t))return result(role,'Точные сроки нужно брать из действующего стандарта для конкретного канала и ситуации. Нормативы первого отклика можно проверить в полном тексте стандарта № 2. Здесь мы разбираем смысл процесса и распределение ответственности по урокам 1 и 2.','Разберём, кто выполняет действие и кто его проверяет?',['lesson-1-slide-05','confirmed-role-policy']);
 if(/зачем|почему|смысл|стандарт/.test(t))return result(role,'Стандарты помогают сохранить запрос клиента, контекст разговора, ответственность и следующий шаг. В уроке клиенту быстро ответили, но через неделю нет предложения и никто не назначил продолжение. Поэтому вместе со скоростью нужны правильный маршрут и понятная история. Для вашей роли главный акцент: '+p.focus.toLocaleLowerCase('ru-RU')+'.',p.question,['lesson-1-slide-02','lesson-1-slide-04','lesson-1-slide-05',...p.sources]);
 if(/кейс|пример|ситуаци|автомоб|уат/.test(t))return guidedTurn({role,action:'case'});
 if(role==='dispatcher'){
  if(/отклик|sla|сла/.test(t))return result(role,p.correction,'А чем вы подтвердите принятие обращения конкретным исполнителем?',['confirmed-role-policy','lesson-2-slide-18']);
  return result(role,'Сравните свой ответ с решением из урока. Получателю нужно передать полный контекст: 60 автомобилей, расчёт до пятницы и подробности задачи. Затем нужно убедиться, что обращение принял конкретный исполнитель. Отправка в группу этого не подтверждает. До принятия контроль передачи остаётся; при задержке обращаются к руководителю.','Какие сведения вы передадите исполнителю вместе с запросом?',['lesson-2-slide-27','lesson-2-slide-28','confirmed-role-policy']);
 }
 if(role==='employee')return result(role,'Сравните своё решение с тремя опорами: содержание запроса и фактический результат, реально подготовленные или направленные документы, конкретный следующий шаг с ответственным и датой. Просьба о КП и счёте ещё не доказывает, что документы отправлены. Формальная запись «Поговорили» не позволяет коллеге восстановить договорённость.','Как будет звучать ваш следующий шаг в этой ситуации?',['lesson-1-slide-28','lesson-1-slide-18']);
 if(role==='controller')return result(role,'В разборе урока есть два конкретных расхождения: получателю не передали число автомобилей и срок расчёта, а принятие конкретным сотрудником не подтверждено. Зафиксируйте эти факты для РОПа. Коммерческий исход и работу продавца контролёр не выбирает вместо исполнителя.','Какие подтверждения нужны для такого вывода?',['lesson-2-slide-18','lesson-2-slide-27','lesson-2-slide-28','confirmed-role-policy']);
 if(role==='manager')return result(role,'В разборе важно восстановить полную задачу клиента, определить конкретного компетентного получателя и организовать подтверждённое принятие. Руководитель решает спорный маршрут и устраняет разрыв ответственности. После принятия исполнитель продолжает работу по понятному следующему шагу.','По какому факту вы убедитесь, что проблема передачи устранена?',['lesson-1-slide-18','lesson-2-slide-17','lesson-2-slide-28']);
 return result(role,'В уроке показаны две потери: контекст задачи и подтверждение ответственности. Получателю не сообщили про 60 автомобилей и срок до пятницы. Затем никто не мог назвать сотрудника, который принял запрос. Стандарт помогает сохранить и смысл обращения, и его движение к конкретному исполнителю.','Какое действие предотвратило бы каждую из этих потерь?',['lesson-2-slide-27','lesson-2-slide-28']);
}
