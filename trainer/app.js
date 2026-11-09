import { guidedTurn, roles, voiceText } from './engine.js?v=6ddc595b5532';

const $ = id => document.getElementById(id);
const audio = $('speechAudio'), scene = $('avatarScene');
const embedded = window.parent !== window;
const portalOrigin = new URL(document.baseURI).origin;
document.documentElement.classList.toggle('embedded', embedded);
const state = { role: 'general', voice: true, busy: false, request: 0 };
let meter, context, analyser, mediaSource;
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
}
function animate() {
  if (!scene.classList.contains('is-speaking')) return;
  let value = .3 + Math.abs(Math.sin(performance.now() / 90)) * .7;
  if (analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    const energy = data.reduce((sum, x) => sum + (x - 128) ** 2, 0);
    value = Math.min(1.5, .15 + Math.sqrt(energy / data.length) / 18);
  }
  scene.style.setProperty('--mouth', value);
  meter = requestAnimationFrame(animate);
}
function audioContext() {
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!mediaSource) {
      mediaSource = context.createMediaElementSource(audio);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      mediaSource.connect(analyser);
      analyser.connect(context.destination);
    }
    context.resume().catch(() => {});
  } catch { /* Native audio still works if Web Audio is unavailable. */ }
}
function stopVoice() {
  cancelAnimationFrame(meter);
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  window.speechSynthesis?.cancel();
  status('Готов к разговору');
}
audio.addEventListener('play', () => { status('Тренер говорит', true); animate(); });
for (const event of ['pause', 'ended', 'error']) audio.addEventListener(event, () => {
  cancelAnimationFrame(meter);
  status('Слушаю ваш ответ');
});
async function say(response) {
  if (!state.voice) return;
  stopVoice();
  if (response.audioUrl) {
    audioContext();
    audio.src = response.audioUrl;
    try { await audio.play(); }
    catch { $('connectionStatus').textContent = 'Нажмите «Прослушать» под ответом, чтобы включить голос.'; }
    return;
  }
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(voiceText(response));
    utterance.lang = 'ru-RU'; utterance.rate = .95;
    const voice = speechSynthesis.getVoices().find(v => /^ru/.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { status('Тренер говорит', true); animate(); };
    utterance.onend = utterance.onerror = () => { cancelAnimationFrame(meter); status('Слушаю ваш ответ'); };
    speechSynthesis.speak(utterance);
  } else $('connectionStatus').textContent = 'Ответ показан текстом. Голос в этом браузере недоступен.';
}
function showSource(source) {
  $('sourceTitle').textContent = source.title;
  $('sourceText').textContent = source.text;
  const link = $('sourceLink');
  link.hidden = !source.url;
  if (source.url) link.href = source.url;
  else link.removeAttribute('href');
  $('sourceDialog').showModal();
}
$('closeSource').onclick = () => $('sourceDialog').close();
function message(kind, text, response) {
  const article = document.createElement('article'); article.className = 'message ' + kind;
  const speaker = document.createElement('span'); speaker.className = 'speaker';
  speaker.textContent = kind === 'user' ? 'ВЫ' : 'ТРЕНЕР'; article.append(speaker);
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
    replay.onclick = () => { if (!state.voice) setVoice(true); audioContext(); say(response); };
    article.append(replay);
  }
  $('messages').append(article); $('messages').scrollTop = $('messages').scrollHeight;
}
async function turn(action, text = '') {
  if (state.busy) return;
  state.busy = true;
  const request = ++state.request;
  audioContext(); stopVoice();
  try {
    const response = guidedTurn({ role: state.role, action, text });
    if (text) message('user', text);
    message('tutor', response.speech, response);
    $('connectionStatus').textContent = 'Учебный диалог по урокам 1 и 2';
    await say(response);
  } finally { if (request === state.request) state.busy = false; }
}
function chooseRole(role, announce = true) {
  if (!Object.hasOwn(roles, role)) return;
  state.request++; stopVoice(); state.role = role; state.busy = false;
  $('role').value = role;
  document.documentElement.dataset.role = role;
  const profile = roles[role];
  $('roleFocus').textContent = profile.focus;
  $('roleLabel').textContent = profile.label;
  $('roleIcon').innerHTML = '<svg viewBox="0 0 24 24">' + roleIcons[role] + '</svg>';
  $('messages').replaceChildren();
  message('tutor', 'Здравствуйте! Ваша роль — ' + profile.label + '. Начнём с короткого объяснения смысла стандартов или разберём рабочую ситуацию.');
  if (embedded) { if (announce) notify('role', { role }); }
  else { try { localStorage.setItem('dvis-role', JSON.stringify(role)); } catch {} }
  resize();
}
function setVoice(on) {
  state.voice = on; $('voiceToggle').setAttribute('aria-pressed', String(on));
  $('voiceToggle').textContent = on ? 'Звук включён' : 'Звук выключен';
  if (!on) stopVoice();
}
$('role').replaceChildren(...Object.entries(roles).map(([id, profile]) => {
  const option = document.createElement('option'); option.value = id; option.textContent = profile.label; return option;
}));
let initial = new URLSearchParams(location.search).get('role');
if (!Object.hasOwn(roles, initial)) { try { initial = JSON.parse(localStorage.getItem('dvis-role')); } catch {} }
chooseRole(Object.hasOwn(roles, initial) ? initial : 'general', false);
$('role').onchange = event => chooseRole(event.target.value);
$('start').onclick = () => turn('intro');
$('caseButton').onclick = () => turn('case', 'Разберём рабочую ситуацию');
$('stop').onclick = stopVoice;
$('voiceToggle').onclick = () => setVoice(!state.voice);
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => turn('message', button.dataset.prompt);
$('chatForm').onsubmit = event => {
  event.preventDefault(); const text = $('messageInput').value.trim();
  if (!text || state.busy) return;
  $('messageInput').value = ''; turn('message', text);
};
$('messageInput').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chatForm').requestSubmit(); }
};
window.addEventListener('message', event => {
  if (!embedded || event.source !== window.parent || event.origin !== portalOrigin) return;
  if (event.data?.type === 'rarus-portal:stop') stopVoice();
  if (event.data?.type === 'rarus-portal:role' && event.data.role !== state.role) chooseRole(event.data.role, false);
});
window.addEventListener('pagehide', stopVoice);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
new ResizeObserver(resize).observe(document.querySelector('.layout'));
notify('ready', { role: state.role });
