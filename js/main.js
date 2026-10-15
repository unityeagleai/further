/* FURTHER · start screen, buttons, and the live channel (Charlie can change the world during a call). */
(function () {
'use strict';
const F = window.FURTHER, QS = F.QS;
const $ = id => document.getElementById(id);
F.startRoom = Math.max(0, Math.min(F.ROOMS.length - 1, parseInt(QS.get('room') || '0', 10) || 0));
if (QS.has('stats')) $('stats').style.display = 'block';
if (!F.isTouch) document.body.classList.add('desk');
$('how').textContent = F.isTouch
  ? 'On a phone: left thumb walks, right thumb looks, tap things to touch them.'
  : 'On a computer: click to look with the mouse, W A S D or arrows to walk, Shift to hurry, click things to touch them, M for sound.';
const begin = () => { $('start').style.display = 'none'; document.body.classList.add('playing'); };
let xrOK = false;
const syncVR = F.syncVRButton = () => {
  const b = $('bEnterVR'); b.disabled = !xrOK || F.vrPending(); b.textContent = F.vrPending() ? 'STARTING VR…' : 'ENTER VR';
  $('bVR').style.display = xrOK ? '' : 'none';
};
if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-vr').then(ok => { xrOK = ok; syncVR(); }).catch(() => syncVR()); else syncVR();
$('bEnterVR').onclick = () => { begin(); F.enterVR(); };
$('bWalk').onclick = () => { begin(); F.start(F.startRoom); };
$('bVR').onclick = () => F.enterVR();
$('bGround').onclick = () => F.ground();
$('bSound').onclick = () => { F.unlockAudio(); F.setMuted(!F.isMuted()); F.syncButtons(); };
if (QS.has('autostart')) { begin(); F.start(F.startRoom); }

// ------------------------------------------------ live channel (off unless the link has ?live=<topic>)
// Charlie (or anyone with the topic) posts to https://ntfy.sh/<topic>; the world obeys a short list of safe commands.
// Text or JSON:  go 3 | next | say hello | calm | whisper | intensity 1.3 | hue 0.4 | tempo 0.8
const live = F.live = { tick() {}, connected: false, last: 0, handled: 0, log: [] };
const ROOM_COUNT = F.ROOMS.length;
function runCommand(raw) {
  let c = null;
  const txt = String(raw || '').trim().slice(0, 300);
  try { const j = JSON.parse(txt); if (j && typeof j === 'object') c = { cmd: String(j.cmd || ''), v: j.room !== undefined ? j.room : (j.v !== undefined ? j.v : j.text) }; } catch (e) {}
  if (!c) { const m = txt.match(/^(\w+)\s*(.*)$/); if (!m) return false; c = { cmd: m[1], v: m[2] }; }
  const now = performance.now(); if (now - live.last < 400) return false; live.last = now;
  const cmd = c.cmd.toLowerCase(), num = parseFloat(c.v);
  let ok = true;
  if (cmd === 'go' && isFinite(num)) F.goRoom(Math.max(0, Math.min(ROOM_COUNT - 1, Math.round(num))));
  else if (cmd === 'next') F.goRoom(F.curIdx() + 1);
  else if (cmd === 'say' && c.v) F.message('Charlie: ' + String(c.v).replace(/https?:\/\/\S+/g, '').slice(0, 140), 8);
  else if (cmd === 'calm' || cmd === 'ground') F.ground();
  else if (cmd === 'whisper') F.playBuf('whisper', { vol: 1.2, pos: [F.player.x + 1.2, 1.6, F.player.z + 1.2] });
  else if (cmd === 'intensity' && isFinite(num)) F.setIntensity(num);
  else if (cmd === 'hue' && isFinite(num)) F.setHue(num);
  else if (cmd === 'tempo' && isFinite(num)) F.setTimeScale(num);
  else ok = false;
  if (ok) { live.handled++; live.log.push(cmd); if (live.log.length > 20) live.log.shift(); }
  return ok;
}
F.runCommand = runCommand;
const topic = QS.get('live');
if (topic !== null) {
  const t = /^[A-Za-z0-9_-]{6,64}$/.test(topic) ? topic : 'further-unity-k7q2m9';
  live.topic = t;
  const connect = () => {
    const es = new EventSource('https://ntfy.sh/' + encodeURIComponent(t) + '/sse');
    es.onopen = () => { live.connected = true; $('live').style.display = 'block'; $('live').textContent = 'LIVE · Charlie can steer'; };
    es.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.event === 'message' && m.message) runCommand(m.message); } catch (e) {} };
    es.onerror = () => { live.connected = false; $('live').textContent = 'LIVE · reconnecting'; };
    live.es = es;
  };
  connect();
}
})();
