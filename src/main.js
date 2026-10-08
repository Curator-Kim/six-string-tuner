import { createIcons, Guitar, Mic, MicOff, Volume2, Settings2, X, ArrowDown, ArrowUp } from 'lucide';
import { PitchDetector } from 'pitchy';
import { STRINGS, frequencyFor, centsBetween, matchString, tuningState } from './tuning.js';
import './style.css';

document.querySelector('#app').innerHTML = `
<header><a class="brand" href="/"><i data-lucide="guitar"></i><span>弦准<small>SIX STRING</small></span></a><div class="header-right"><span class="local-label"><b></b> 设备端音频处理</span><button class="icon-button" id="settings" title="调音设置" aria-label="调音设置"><i data-lucide="settings-2"></i></button></div></header>
<main>
 <div class="page-title"><div><div class="eyebrow">GUITAR TUNER</div><h1>吉他调音器</h1></div><span class="standard"><b></b> 标准调弦</span></div>
 <div class="workspace">
  <section class="instrument" aria-label="琴弦选择"><div class="instrument-top"><span>六弦木吉他</span><span>E A D G B E</span></div><div class="headstock"><canvas id="guitar-art" width="760" height="1100" aria-label="六琴钮吉他琴头"></canvas><div id="pegs"></div></div><div class="string-legend"><span>6 &nbsp; 粗弦</span><span class="legend-line"></span><span>细弦 &nbsp; 1</span></div></section>
  <section class="tuner" aria-label="调音仪">
   <div class="mode-switch" role="group" aria-label="调音模式"><button id="auto" class="active" aria-pressed="true">自动识别</button><button id="manual" aria-pressed="false">手动选弦</button></div>
   <div class="tuning-display"><div class="listening" id="listening"><b></b><span id="listen-text">准备就绪</span></div><div class="note-line"><span id="note">E</span><span id="octave">2</span></div><div id="string-name">第 6 弦 · 低音 E</div><div id="pitch-status">等待拨弦</div><div class="meter"><div class="meter-zone"></div><div class="meter-center"></div><div id="ticks"></div><div class="needle" id="needle"></div><div class="meter-labels"><span>−50</span><span>−25</span><span>0</span><span>+25</span><span>+50</span></div></div><div class="direction-labels"><span>偏低 <i data-lucide="arrow-down"></i></span><span id="cents">— <small>音分</small></span><span><i data-lucide="arrow-up"></i> 偏高</span></div></div>
   <div class="readings"><div><span>实测频率</span><strong id="frequency">— <small>Hz</small></strong></div><div><span>目标频率</span><strong id="target">82.41 <small>Hz</small></strong></div><div><span>基准音</span><strong id="reference-label">440 <small>Hz</small></strong></div></div>
   <div class="mic-area"><button id="mic" class="mic-button"><i data-lucide="mic"></i><span>开启麦克风</span></button><div id="message" role="status">麦克风尚未开启</div></div><div class="signal"><i data-lucide="mic"></i><div class="signal-track"><div id="signal-level"></div></div><span id="signal-label">输入信号</span></div>
  </section>
 </div>
 <section class="reference-section"><div class="reference-heading"><h2>标准音</h2><span>A4 = <span id="reference-foot">440</span> Hz</span></div><div class="reference-notes" id="reference-notes"></div></section>
</main><footer><span>弦准 / SIX STRING</span><span>每一根弦，都恰到好处。</span></footer>
<dialog id="settings-dialog"><div class="dialog-header"><h2>调音设置</h2><button class="icon-button" id="close-settings" aria-label="关闭设置"><i data-lucide="x"></i></button></div><label for="reference">基准音 A4 <span>Hz</span></label><input id="reference" type="number" min="420" max="460" step="1" value="440"><p>准确范围：±5 音分</p><button id="save-settings" class="mic-button">保存设置</button></dialog>`;

const $ = selector => document.querySelector(selector);
const updateIcons = () => createIcons({ icons: { Guitar, Mic, MicOff, Volume2, Settings2, X, ArrowDown, ArrowUp } });
let mode = 'auto', selected = STRINGS[0], reference = 440;
try { const saved = Number(localStorage.getItem('tuner-reference')); if (saved >= 420 && saved <= 460 && Number.isInteger(saved)) reference = saved; } catch {}
let stream, context, analyser, frame, source, running = false, starting = false, session = 0;
let history = [], lastValid = 0, lastFrame = 0, playback, playbackTimer, playbackUntil = 0;

STRINGS.forEach((string, index) => {
 const side = index < 3 ? 'left' : 'right', row = index < 3 ? 2 - index : index - 3;
 $('#pegs').insertAdjacentHTML('beforeend', `<button class="peg ${side}" style="--row:${row}" data-string="${string.number}" aria-label="选择第 ${string.number} 弦 ${string.note}${string.octave}" aria-pressed="false"><span class="peg-number">${string.number}</span><span class="peg-note">${string.note}<small>${string.octave}</small></span><span class="peg-frequency"></span></button>`);
 $('#reference-notes').insertAdjacentHTML('beforeend', `<button class="reference-note" data-tone="${string.number}" title="播放第 ${string.number} 弦标准音" aria-label="播放第 ${string.number} 弦 ${string.note}${string.octave} 标准音"><span class="reference-number">${string.number} 弦</span><strong>${string.note}<small>${string.octave}</small></strong><span class="reference-frequency"></span><i data-lucide="volume-2"></i></button>`);
});
for (let i = 0; i <= 40; i++) $('#ticks').insertAdjacentHTML('beforeend', `<span class="tick ${i % 10 === 0 ? 'major' : ''}" style="left:${i * 2.5}%"></span>`);

function renderSelection() {
 $('#note').textContent = selected.note; $('#octave').textContent = selected.octave;
 $('#string-name').textContent = `第 ${selected.number} 弦 · ${selected.number === 6 ? '低音 ' : selected.number === 1 ? '高音 ' : ''}${selected.note}`;
 $('#target').innerHTML = `${frequencyFor(selected, reference).toFixed(2)} <small>Hz</small>`;
 document.querySelectorAll('.peg').forEach(button => { const active = Number(button.dataset.string) === selected.number; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', active); });
}
function renderReference() {
 $('#reference-label').innerHTML = `${reference} <small>Hz</small>`; $('#reference-foot').textContent = reference;
 STRINGS.forEach(string => {
  $(`[data-string="${string.number}"] .peg-frequency`).textContent = `${frequencyFor(string, reference).toFixed(2)} Hz`;
  $(`[data-tone="${string.number}"] .reference-frequency`).textContent = `${frequencyFor(string, reference).toFixed(2)} Hz`;
 }); renderSelection();
}
function clearReading() {
 history = []; $('.tuning-display').dataset.state = 'waiting'; $('#pitch-status').textContent = '等待拨弦';
 $('#cents').innerHTML = '— <small>音分</small>'; $('#frequency').innerHTML = '— <small>Hz</small>';
 $('#needle').style.left = '50%'; $('#needle').classList.remove('visible');
}
function setMode(next) {
 mode = next;
 ['auto', 'manual'].forEach(name => { $(`#${name}`).classList.toggle('active', name === mode); $(`#${name}`).setAttribute('aria-pressed', name === mode); }); clearReading();
}
$('#auto').onclick = () => setMode('auto'); $('#manual').onclick = () => setMode('manual');
document.querySelectorAll('.peg').forEach(button => button.onclick = () => {
 selected = STRINGS.find(string => string.number === Number(button.dataset.string)); setMode('manual'); renderSelection();
});
function readPitch(frequency) {
 if (mode === 'auto') { const match = matchString(frequency, reference); if (selected !== match) { selected = match; history = []; renderSelection(); } }
 history.push(frequency); if (history.length > 5) history.shift();
 const median = [...history].sort((a, b) => a - b)[Math.floor(history.length / 2)];
 const cents = centsBetween(median, frequencyFor(selected, reference)), state = tuningState(cents);
 $('.tuning-display').dataset.state = state;
 $('#pitch-status').textContent = state === 'accurate' ? '音准准确' : state === 'low' ? '偏低 · 拧紧琴弦' : '偏高 · 放松琴弦';
 $('#cents').innerHTML = `${cents >= 0 ? '+' : '−'}${Math.abs(cents).toFixed(1)} <small>音分</small>`;
 $('#frequency').innerHTML = `${median.toFixed(2)} <small>Hz</small>`;
 $('#needle').style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`; $('#needle').classList.add('visible');
}
function releaseMicrophone() {
 running = false; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop());
 source?.disconnect(); source = null; stream = null; analyser = null;
}
function stoppedUI(message = '麦克风已关闭') {
 $('#mic').innerHTML = '<i data-lucide="mic"></i><span>开启麦克风</span>'; $('#mic').classList.remove('recording');
 $('#listening').classList.remove('on'); $('#listen-text').textContent = '准备就绪'; $('#message').textContent = message;
 $('#signal-level').style.width = '0%'; $('#signal-label').textContent = '输入信号'; clearReading(); updateIcons();
}
async function ensureContext() { if (!context || context.state === 'closed') context = new AudioContext(); if (context.state === 'suspended') await context.resume(); return context; }
async function startMicrophone() {
 if (starting) return;
 if (running) { session++; releaseMicrophone(); stoppedUI(); return; }
 if (!navigator.mediaDevices?.getUserMedia) { stoppedUI('当前浏览器不支持麦克风，请使用 localhost 或 HTTPS 访问'); return; }
 starting = true; $('#mic').disabled = true; $('#message').textContent = '正在请求麦克风权限…';
 const token = ++session; let incoming;
 try {
  await ensureContext();
  incoming = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  if (token !== session) { incoming.getTracks().forEach(track => track.stop()); return; }
  stream = incoming; analyser = context.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0;
  source = context.createMediaStreamSource(stream); source.connect(analyser);
  const input = new Float32Array(analyser.fftSize), detector = PitchDetector.forFloat32Array(input.length);
  running = true; lastValid = performance.now(); lastFrame = 0;
  stream.getAudioTracks()[0].onended = () => { session++; releaseMicrophone(); stoppedUI('麦克风连接已断开'); };
  $('#mic').innerHTML = '<i data-lucide="mic-off"></i><span>停止调音</span>'; $('#mic').classList.add('recording');
  $('#listening').classList.add('on'); $('#listen-text').textContent = '正在聆听'; $('#message').textContent = '麦克风已开启'; updateIcons();
  const loop = now => {
   if (!running) return;
   frame = requestAnimationFrame(loop); if (now - lastFrame < 65) return; lastFrame = now;
   analyser.getFloatTimeDomainData(input);
   const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
   $('#signal-level').style.width = `${Math.min(100, rms * 600)}%`;
   $('#signal-label').textContent = now < playbackUntil ? '标准音播放中' : rms > 0.008 ? '收到声音' : '输入信号';
   if (now < playbackUntil) { clearReading(); return; }
   const [pitch, clarity] = rms > 0.008 ? detector.findPitch(input, context.sampleRate) : [0, 0];
   if (clarity >= 0.9 && pitch >= 55 && pitch <= 450) { lastValid = now; readPitch(pitch); }
   else if (now - lastValid > 900) clearReading();
  }; frame = requestAnimationFrame(loop);
 } catch (error) {
  incoming?.getTracks().forEach(track => track.stop()); releaseMicrophone();
  stoppedUI(error.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器设置中允许访问' : error.name === 'NotFoundError' ? '未找到麦克风，请连接音频输入设备' : error.name === 'NotReadableError' ? '麦克风无法使用，请检查是否被其他应用占用' : '无法开启麦克风，请检查设备后重试');
 } finally { starting = false; $('#mic').disabled = false; }
}
$('#mic').onclick = startMicrophone;
function stopTone() {
 clearTimeout(playbackTimer);
 if (playback) { playback.osc.stop(); playback.osc.disconnect(); playback.gain.disconnect(); playback = null; }
 document.querySelectorAll('[data-tone]').forEach(button => button.classList.remove('playing'));
}
document.querySelectorAll('[data-tone]').forEach(button => button.onclick = async () => {
 try {
  await ensureContext(); stopTone();
  const string = STRINGS.find(item => item.number === Number(button.dataset.tone));
  const osc = context.createOscillator(), gain = context.createGain(); osc.type = 'triangle'; osc.frequency.value = frequencyFor(string, reference);
  gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(0.14, context.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 2);
  osc.connect(gain); gain.connect(context.destination); osc.start(); playback = { osc, gain }; playbackUntil = performance.now() + 2400;
  clearReading(); button.classList.add('playing'); playbackTimer = setTimeout(stopTone, 2200);
 } catch { $('#message').textContent = '标准音播放失败，请检查浏览器音频设置'; }
});
$('#settings').onclick = () => { $('#reference').value = reference; $('#settings-dialog').showModal(); };
$('#close-settings').onclick = () => $('#settings-dialog').close();
$('#save-settings').onclick = () => {
 if (!$('#reference').reportValidity()) return;
 reference = Number($('#reference').value); try { localStorage.setItem('tuner-reference', reference); } catch {}
 stopTone(); clearReading(); renderReference(); $('#settings-dialog').close();
};
document.addEventListener('visibilitychange', () => { if (document.hidden) { session++; releaseMicrophone(); stopTone(); stoppedUI('页面已暂停，点击开启麦克风继续'); } });
window.addEventListener('pagehide', () => { session++; releaseMicrophone(); stopTone(); context?.close(); });

function drawHeadstock() {
 const c = $('#guitar-art').getContext('2d'); c.scale(2, 2);
 const body = new Path2D('M 129 42 Q 135 23 153 29 Q 190 46 227 29 Q 245 23 251 42 L 266 246 Q 265 268 249 299 L 240 330 L 240 550 L 140 550 L 140 330 L 131 299 Q 115 267 114 246 Z');
 c.shadowColor = '#0009'; c.shadowBlur = 25; c.shadowOffsetY = 12;
 const wood = c.createLinearGradient(110, 0, 270, 0);
 wood.addColorStop(0, '#533527'); wood.addColorStop(.22, '#987456'); wood.addColorStop(.55, '#bc9c72'); wood.addColorStop(.8, '#896547'); wood.addColorStop(1, '#493225');
 c.fillStyle = wood; c.fill(body); c.shadowBlur = 0; c.shadowOffsetY = 0; c.save(); c.clip(body);
 let seed = 38;
 for (let i = 0; i < 125; i++) { seed = (seed * 16807) % 2147483647; const x = 110 + seed % 170; c.strokeStyle = i % 2 ? '#edd5ac18' : '#301a1c24'; c.lineWidth = .6; c.beginPath(); c.moveTo(x, 15); c.bezierCurveTo(x-12,190,x+10,210,x-4,550); c.stroke(); }
 c.restore(); c.strokeStyle = '#d6b38470'; c.lineWidth = 1.5; c.stroke(body);
 c.fillStyle = '#251e19'; c.fillRect(141,335,98,215);
 for (const y of [370,415,465,522]) { c.fillStyle = '#b5b4a0'; c.fillRect(141,y,98,2); }
 c.fillStyle = '#ede8d6'; c.fillRect(137,326,106,7);
 c.fillStyle = '#ead3a1'; c.font = 'italic 20px Georgia'; c.textAlign = 'center'; c.fillText('Six String',190,88); c.font = '8px sans-serif'; c.fillText('EST. 2026',190,105);
 [[129,249],[124,184],[126,119],[254,119],[256,184],[251,249]].forEach(([x,y],i) => {
  const left = i < 3, metal = c.createLinearGradient(0,y-10,0,y+10);
  metal.addColorStop(0,'#d8dadd'); metal.addColorStop(.45,'#6c7374'); metal.addColorStop(.6,'#c4c9ca'); metal.addColorStop(1,'#414747');
  c.fillStyle = metal; c.fillRect(left ? x-28 : x,y-4,28,8); c.beginPath(); c.roundRect(left ? x-45 : x+28,y-15,19,30,7); c.fill();
  c.fillStyle = '#444a4a'; c.beginPath(); c.arc(x,y,10,0,Math.PI*2); c.fill(); c.strokeStyle = '#c5c9bd'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#a6aca8'; c.beginPath(); c.arc(x,y,5,0,Math.PI*2); c.fill();
  c.strokeStyle = i < 3 ? '#cfbf95' : '#ece9da'; c.lineWidth = 1.7-i*.17; c.beginPath(); c.moveTo(x,y); c.lineTo(160+i*12,328); c.lineTo(160+i*12,550); c.stroke();
 });
 c.fillStyle = '#d4c9a5'; c.beginPath(); c.arc(190,442,3,0,Math.PI*2); c.fill();
}
drawHeadstock(); renderReference(); updateIcons();
