import { guidedTurn, roles, voiceCases } from './engine.js?v=779c332f5140';

const $ = id => document.getElementById(id);
const audio = $('speechAudio'), scene = $('avatarScene');
const embedded = window.parent !== window;
const portalOrigin = new URL(document.baseURI).origin;
document.documentElement.classList.toggle('embedded', embedded);
const state = { role: 'general', voice: true, busy: false, request: 0, caseMode: false };
let meter, playback = 0, mouthLevels = '';
const roleIcons = {
  general: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  employee: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M9 18h6"/>',
  dispatcher: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h7a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 4h7M16 3l3 3-3 3"/>',
  manager: '<circle cx="12" cy="5" r="3"/><path d="M12 8v5M5 17v-4h14v4"/><circle cx="5" cy="20" r="2"/><circle cx="19" cy="20" r="2"/>',
  controller: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM8 12l3 3 5-6"/>',
};
function notify(type, detail = {}) {
  if (embedded) window.parent.postMessage({ type: 'rarus-trainer:' + type, ...detail }, portalOrigin === 'null' ? '*' : portalOrigin);
}
function resize() {
  notify('height', { height: Math.ceil(document.querySelector('.layout').getBoundingClientRect().bottom + 8) });
}
function status(text, speaking = false) {
  $('voiceStatus').replaceChildren(document.createElement('span'), document.createTextNode(text));
  scene.classList.toggle('is-speaking', speaking);
  $('stop').disabled = !speaking;
  if (!speaking) { cancelAnimationFrame(meter); scene.style.setProperty('--mouth-open', '0'); }
}
function animate() {
  if (!scene.classList.contains('is-speaking')) return;
  const value = mouthLevels ? (mouthLevels.charCodeAt(Math.floor(audio.currentTime / .08)) || 0) / 255 : 0;
  scene.style.setProperty('--mouth', value);
  scene.style.setProperty('--mouth-open', Math.min(1, value * 2));
  meter = requestAnimationFrame(animate);
}
function stopVoice(clear = false) {
  playback++;
  cancelAnimationFrame(meter);
  audio.pause();
  if (clear) {
    audio.removeAttribute('src');
    audio.load();
  } else if (audio.readyState) audio.currentTime = 0;
  status('Готов к разговору');
}
function showPlayback() {
  cancelAnimationFrame(meter); status('Тренер говорит', true); animate();
  $('connectionStatus').textContent = 'Запись воспроизводится';
}
audio.addEventListener('playing', showPlayback);
audio.addEventListener('seeked', () => { if (!audio.paused && !audio.ended) showPlayback(); });
for (const event of ['pause', 'ended', 'waiting', 'seeking']) audio.addEventListener(event, () => {
  cancelAnimationFrame(meter);
  status(event === 'waiting' ? 'Загружаю запись…' : 'Слушаю ваш ответ');
});
audio.addEventListener('error', () => {
  if (!audio.hasAttribute('src')) return;
  status('Запись не загрузилась');
  $('connectionStatus').textContent = 'Не удалось загрузить запись. Нажмите «Прослушать» под ответом, чтобы повторить.';
});
async function say(response) {
  if (!state.voice) return;
  stopVoice(true);
  const request = playback;
  if (response.audioUrl) {
    mouthLevels = response.audioLevels ? atob(response.audioLevels) : '';
    $('audioTitle').textContent = (response.stage === 'case' ? 'Условие ситуации' : response.stage === 'review' ? 'Разбор решения' : 'Объяснение тренера')+' · '+roles[state.role].label;
    $('audioPlayer').hidden = false;
    audio.src = response.audioUrl;
    status('Загружаю запись…');
    try { await audio.play(); }
    catch (error) {
      if (request !== playback || error.name === 'AbortError') return;
      status('Нажмите ▶ для воспроизведения');
      $('connectionStatus').textContent = audio.error ? 'Не удалось загрузить запись. Повторите прослушивание.' : 'Нажмите ▶ в плеере или «Прослушать» под ответом.';
    }
    return;
  }
  $('audioPlayer').hidden = true;
  $('connectionStatus').textContent = 'Для этого ответа запись пока недоступна. Прочитайте текст разбора.';
}
function showSource(source) {
  $('sourceTitle').textContent = source.title;
  $('sourceText').textContent = source.text;
  const link = $('sourceLink');
  link.hidden = !source.url;
  if (source.url) {
    link.href = source.url;
    link.textContent = source.url.includes('#standard/') ? 'Открыть правило ↗' : 'Открыть слайд ↗';
  }
  else link.removeAttribute('href');
  $('sourceDialog').showModal();
}
$('closeSource').onclick = () => $('sourceDialog').close();
function message(kind, text, response) {
  const article = document.createElement('article'); article.className = 'message ' + kind;
  const speaker = document.createElement('span'); speaker.className = 'speaker';
  speaker.textContent = kind === 'user' ? 'ВЫ' : response?.stage==='review'?'ТРЕНЕР · РЕШЕНИЕ':'ТРЕНЕР'; article.append(speaker);
  const paragraph = document.createElement('p'); paragraph.textContent = text; article.append(paragraph);
  if (response?.question) {
    const question = document.createElement('p'); question.className = 'question';
    question.textContent = response.question; article.append(question);
  }
  if (response?.sources?.length) {
    const list = document.createElement('div'); list.className = 'sources';
    for (const source of response.sources) {
      const button = document.createElement('button'); button.textContent = source.title;
      button.onclick = () => showSource(source); list.append(button);
    }
    article.append(list);
  }
  if (response) {
    const replay = document.createElement('button'); replay.className = 'replay'; replay.textContent = '▷ Прослушать';
    replay.onclick = () => { if (!state.voice) setVoice(true); say(response); };
    article.append(replay);
  }
  $('messages').append(article); $('messages').scrollTop = $('messages').scrollHeight;
}
async function turn(action, text = '') {
  if (state.busy) return;
  state.busy = true;
  const request = ++state.request;
  stopVoice(true);
  try {
    if(action==='case'||action==='case-answer')state.caseMode=true;
    if(action==='intro')state.caseMode=false;
    const response = guidedTurn({ role: state.role, action, text, caseId:state.caseMode?($('caseTopic').value||'handoff-default'):'' });
    if (text) message('user', text);
    message('tutor', response.speech, response);
    $('connectionStatus').textContent = state.caseMode?'Разбор рабочей ситуации':'Объяснение по материалам уроков';
    await say(response);
  } finally { if (request === state.request) state.busy = false; }
}
function chooseRole(role, announce = true) {
  if (!Object.hasOwn(roles, role)) return;
  const previousTopic=$('caseTopic').value, previousCase=state.caseMode;
  state.request++; stopVoice(true); state.role = role; state.busy = false; state.caseMode=false;
  $('caseTopic').replaceChildren(...[{id:'',title:'Передача запроса по 1С:УАТ'},...voiceCases.filter(c=>role==='general'||c.roles.includes(role))].map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.title;return o}));
  const keepCase=previousCase&&[...$('caseTopic').options].some(o=>o.value===previousTopic);
  if(keepCase)$('caseTopic').value=previousTopic;
  $('casePracticeLink').hidden=true;
  $('audioPlayer').hidden=true;
  $('role').value = role;
  document.documentElement.dataset.role = role;
  const profile = roles[role];
  $('roleFocus').textContent = profile.focus;
  $('roleLabel').textContent = profile.label;
  $('roleIcon').innerHTML = '<svg viewBox="0 0 24 24">' + roleIcons[role] + '</svg>';
  $('messages').replaceChildren();
  message('tutor', 'Здравствуйте! Ваша роль — ' + profile.label + '. Начнём с короткого объяснения смысла стандартов или разберём рабочую ситуацию.');
  if(keepCase){updateCaseLink();$('messages').replaceChildren();turn('case');}
  if (embedded) { if (announce) notify('role', { role }); }
  else { try { localStorage.setItem('dvis-role', JSON.stringify(role)); } catch {} }
  resize();
}
function voiceLabel(on) {
  $('voiceToggle').setAttribute('aria-pressed', String(on));
  $('voiceToggle').textContent = on ? 'Звук включён' : 'Звук выключен';
}
function setVoice(on) {
  state.voice = on; voiceLabel(on);
  audio.muted = !on;
  if (on && audio.volume === 0) audio.volume = 1;
  if (!on) stopVoice();
}
audio.addEventListener('volumechange', () => {
  state.voice = !audio.muted && audio.volume > 0; voiceLabel(state.voice);
  if (!state.voice) status('Звук выключен');
  else if (!audio.paused) showPlayback();
});
$('role').replaceChildren(...Object.entries(roles).map(([id, profile]) => {
  const option = document.createElement('option'); option.value = id; option.textContent = profile.label; return option;
}));
let initial = new URLSearchParams(location.search).get('role');
if (!Object.hasOwn(roles, initial)) { try { initial = JSON.parse(localStorage.getItem('dvis-role')); } catch {} }
chooseRole(Object.hasOwn(roles, initial) ? initial : 'general', false);
$('role').onchange = event => chooseRole(event.target.value);
$('start').onclick = () => turn('intro');
$('caseButton').onclick = () => { setVoice(true); turn('case', 'Разберём рабочую ситуацию'); };
$('caseAnswer').onclick=()=>{ setVoice(true); turn('case-answer'); };
function updateCaseLink(){const topic=voiceCases.find(c=>c.id===$('caseTopic').value);const link=$('casePracticeLink');link.hidden=!topic;if(topic)link.href=topic.caseUrl;}
$('caseTopic').onchange=()=>{state.request++;state.busy=false;stopVoice(true);state.caseMode=false;updateCaseLink();$('messages').replaceChildren();turn('case');};
$('stop').onclick = () => stopVoice();
$('voiceToggle').onclick = () => setVoice(!state.voice);
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => {state.caseMode=false;turn('message', button.dataset.prompt);};
$('chatForm').onsubmit = event => {
  event.preventDefault(); const text = $('messageInput').value.trim();
  if (!text || state.busy) return;
  $('messageInput').value = ''; turn('message', text);
};
$('messageInput').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chatForm').requestSubmit(); }
};
function selectLinkedCase(id){const value=id==='handoff-default'?'':id;if(![...$('caseTopic').options].some(o=>o.value===value))return;if($('caseTopic').value===value&&state.caseMode)return;$('caseTopic').value=value;$('caseTopic').onchange();}
window.addEventListener('message', event => {
  if (!embedded || event.source !== window.parent || event.origin !== portalOrigin) return;
  if (event.data?.type === 'rarus-portal:stop') stopVoice();
  if (event.data?.type === 'rarus-portal:case') selectLinkedCase(event.data.caseId);
  if (event.data?.type === 'rarus-portal:role' && event.data.role !== state.role) chooseRole(event.data.role, false);
});
window.addEventListener('pagehide', stopVoice);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
new ResizeObserver(resize).observe(document.querySelector('.layout'));
notify('ready', { role: state.role });
