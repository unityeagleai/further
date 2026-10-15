/* FURTHER · core: renderer, VR entry, input, audio, media, shaders, transitions, HUD, live channel.
   Rooms live in rooms.js and register themselves in FURTHER.ROOMS. main.js starts everything. */
(function () {
'use strict';
const F = window.FURTHER = window.FURTHER || {};
const QS = new URLSearchParams(location.search), UA = navigator.userAgent || '';
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const isHeadset = /OculusBrowser|Quest|Pico|Wolvic/i.test(UA) || QS.has('quest');
const VER = window.FURTHER_VER || '1';
F.QS = QS; F.isTouch = isTouch; F.isHeadset = isHeadset;
F.asset = p => 'assets/' + p + '?v=' + VER;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
F.clamp = clamp; F.smooth = smooth;

// ---------------------------------------------------------------- renderer (Quest lessons from Liminal)
// Headset: plain XRWebGLLayer path, no antialias (heavy on Quest), framebuffer 0.8, foveation on.
const renderer = new THREE.WebGLRenderer({ antialias: !isHeadset, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isHeadset ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
if (isHeadset) { window.__xrBaseLayer = true; window.__xrAA = false; renderer.xr.setFramebufferScaleFactor(0.8); }
renderer.xr.setFoveation(1);
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
F.renderer = renderer; F.scene = scene; F.camera = camera; F.rig = rig;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------------------------------------------------------------- shared uniforms + shader kit
const U = F.U = {
  uTime: { value: 0 }, uTT: { value: 0 }, uDis: { value: 0 }, uCalm: { value: 0 }, uK: { value: 1 }, uAmp: { value: 0 },
  uFogC: { value: new THREE.Color(0, 0, 0) }, uFogD: { value: 0.04 }, uEdge: { value: new THREE.Color(1, 0.7, 0.3) },
  uHue: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uLoop: { value: 0 }
};
const GL_COMMON = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
float fbm3(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v/0.875; }
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b*cos(6.28318*(c*t+d)); }
vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
float glyph(vec2 uv, float seed){
  vec2 id = floor(uv); vec2 f = fract(uv) - 0.5; float d = 1e3; float s = seed + h21(id)*91.0;
  if (h21(id+3.1) > 0.82) return 1e3;
  for (int k=0;k<4;k++){
    float a = h21(vec2(s, float(k))); float b = h21(vec2(float(k), s+7.0));
    vec2 p0 = (vec2(h21(vec2(a,b)), h21(vec2(b,a))) - 0.5)*0.62; vec2 p1 = (vec2(h21(vec2(a+1.,b)), h21(vec2(b+2.,a))) - 0.5)*0.62;
    if (h21(vec2(a*3.0,s)) > 0.5) p1.x = p0.x; else p1.y = p0.y;
    d = min(d, segD(f, p0, p1));
  }
  return d;
}
`;
F.GL_COMMON = GL_COMMON;
const VHEAD = `uniform float uTime, uTT, uDis, uCalm, uK, uAmp, uLoop; uniform vec3 uPlayer;
varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying float vDist;
`;
const FHEAD = `uniform float uTime, uTT, uDis, uCalm, uK, uAmp, uFogD, uHue, uLoop; uniform vec3 uFogC, uEdge, uPlayer;
varying vec3 vWp; varying vec3 vN; varying vec2 vUv; varying float vDist;
`;
// tmat: every room surface is one of these. o.frag must define vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha).
// Shared: slow global hue turn, the dissolve that eats rooms during transitions (with glowing edges), fog.
F.tmat = function (o) {
  const uniforms = Object.assign({}, U, o.uniforms || {});
  const defs = (o.noDissolve ? '#define NO_DISSOLVE\n' : '') + (o.noFog ? '#define NO_FOG\n' : '');
  const vs = defs + VHEAD + (o.needCommonV ? GL_COMMON : '') + (o.vpars || '') + `
void main(){
  vec3 p = position; vec3 nn = normal; vUv = uv;
#ifdef USE_INSTANCING
  mat4 mm = modelMatrix * instanceMatrix;
#else
  mat4 mm = modelMatrix;
#endif
  ${o.local || ''}
  vec4 wp = mm * vec4(p, 1.0); vN = normalize(mat3(mm) * nn);
  ${o.disp || ''}
  vWp = wp.xyz; vec4 mv = viewMatrix * wp; vDist = length(mv.xyz); gl_Position = projectionMatrix * mv;
}`;
  const fs = defs + FHEAD + GL_COMMON + (o.fpars || '') + o.frag + `
void main(){
  float alpha = 1.0;
  vec3 col = shade(vWp, normalize(vN), vUv, alpha);
  col = hue(col, uHue);
#ifndef NO_DISSOLVE
  if (uDis > 0.001) {
    float dn = noise3(vWp*1.25)*0.65 + noise3(vWp*4.3+7.0)*0.35;
    float th = uDis*1.22 - 0.11;
    if (dn < th) discard;
    col += uEdge * smoothstep(0.07, 0.0, dn - th) * 1.5;
  }
#endif
#ifndef NO_FOG
  float fg = 1.0 - exp(-uFogD*uFogD*vDist*vDist); col = mix(col, uFogC, clamp(fg, 0.0, 1.0));
#endif
  gl_FragColor = vec4(max(col, 0.0), alpha);
}`;
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, side: o.side || THREE.FrontSide,
    transparent: !!o.transparent, depthWrite: o.depthWrite !== undefined ? o.depthWrite : !o.transparent, blending: o.blending || THREE.NormalBlending });
  return m;
};

// ---------------------------------------------------------------- textures + video (one clip at a time, only when asked)
const texCache = {};
const tl = new THREE.TextureLoader();
F.tex = function (name) {
  if (texCache[name]) return texCache[name];
  const t = tl.load(F.asset('img/' + name + '.jpg'));
  t.encoding = THREE.sRGBEncoding; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  texCache[name] = t; return t;
};
let activeClip = null;
// a clip shows its still until play(); playing it stops any other clip; stop() frees the decoder.
F.clip = function (name, opt) {
  opt = opt || {};
  const c = { name, uniform: { value: F.tex('still_' + name) }, playing: false, v: null, vt: null, ended: false };
  c.play = function () {
    if (c.playing) return;
    if (activeClip && activeClip !== c) activeClip.stop();
    activeClip = c; c.playing = true; c.ended = false;
    const v = document.createElement('video');
    v.src = F.asset('video/' + name + '.mp4'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', '');
    v.loop = !!opt.loop; v.muted = !opt.sound; v.preload = 'auto';
    if (opt.sound) { v.volume = opt.volume || 0.8; }
    v.addEventListener('ended', () => { c.ended = true; c.stop(); if (opt.onEnd) opt.onEnd(); });
    const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    const vt = new THREE.VideoTexture(v); vt.encoding = THREE.sRGBEncoding; vt.minFilter = THREE.LinearFilter; vt.generateMipmaps = false;
    c.v = v; c.vt = vt; c.uniform.value = vt; F.stats.clips++;
  };
  c.stop = function () {
    if (!c.playing) return; c.playing = false;
    try { c.v.pause(); c.v.removeAttribute('src'); c.v.load(); } catch (e) {}
    if (c.vt) c.vt.dispose(); c.v = null; c.vt = null; c.uniform.value = F.tex('still_' + name);
    if (activeClip === c) activeClip = null;
  };
  return c;
};
F.stats = { clips: 0 };

// ---------------------------------------------------------------- audio
const AC = window.AudioContext || window.webkitAudioContext;
const actx = new AC();
const master = actx.createGain(); master.gain.value = 0.9;
const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
master.connect(comp); comp.connect(actx.destination);
const musicBus = actx.createGain(); musicBus.gain.value = 1;
const analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
musicBus.connect(analyser); musicBus.connect(master);
const sfx = actx.createGain(); sfx.gain.value = 1; sfx.connect(master);
F.actx = actx; F.sfx = sfx; F.analyser = analyser; F.musicBus = musicBus;
let muted = false;
F.setMuted = m => { muted = m; master.gain.setTargetAtTime(m ? 0 : 0.9, actx.currentTime, 0.1); };
F.isMuted = () => muted;
F.unlockAudio = () => { if (actx.state !== 'running') actx.resume().catch(() => {}); };
F.panner = function (x, y, z, ref) {
  const p = actx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref || 2; p.rolloffFactor = 1.1; p.maxDistance = 80;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  return p;
};
F.setPannerPos = function (p, x, y, z) {
  if (p.positionX) { const t = actx.currentTime; p.positionX.setTargetAtTime(x, t, 0.05); p.positionY.setTargetAtTime(y, t, 0.05); p.positionZ.setTargetAtTime(z, t, 0.05); } else p.setPosition(x, y, z);
};
// music: streamed <audio> (low memory on Quest), crossfaded; optionally from a point in the room
let music = null;
F.playMusic = function (name, opt) {
  opt = opt || {};
  F.stopMusic(2.0);
  const el = new Audio(); el.src = F.asset('audio/' + name + '.mp3'); el.crossOrigin = 'anonymous'; el.loop = opt.loop !== false; el.preload = 'auto';
  const src = actx.createMediaElementSource(el); const g = actx.createGain(); g.gain.value = 0;
  let out = g; src.connect(g);
  let pan = null;
  if (opt.pos) { pan = F.panner(opt.pos[0], opt.pos[1], opt.pos[2], opt.ref || 6); g.connect(pan); out = pan; }
  if (opt.filter) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.filter; out.connect(f); out = f; }
  out.connect(musicBus);
  g.gain.setTargetAtTime(opt.vol || 0.8, actx.currentTime + 0.05, 1.0);
  el.play().catch(() => {});
  music = { el, src, g, pan, name };
  return music;
};
F.stopMusic = function (fade) {
  if (!music) return; const m = music; music = null;
  m.g.gain.setTargetAtTime(0, actx.currentTime, (fade || 1.5) / 3);
  setTimeout(() => { try { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); m.src.disconnect(); m.g.disconnect(); if (m.pan) m.pan.disconnect(); } catch (e) {} }, (fade || 1.5) * 1000 + 300);
};
F.music = () => music;
const bufCache = {};
F.loadBuf = function (name) {
  if (!bufCache[name]) bufCache[name] = fetch(F.asset('audio/' + name + '.mp3')).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => actx.decodeAudioData(b, res, rej)));
  return bufCache[name];
};
F.playBuf = function (name, opt) {
  opt = opt || {};
  return F.loadBuf(name).then(buf => {
    let b = buf;
    if (opt.reverse) { b = actx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate); for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = b.getChannelData(c); for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; } }
    const s = actx.createBufferSource(); s.buffer = b; s.playbackRate.value = opt.rate || 1;
    const g = actx.createGain(); g.gain.value = opt.vol || 1; s.connect(g);
    let out = g; if (opt.pos) { const p = F.panner(opt.pos[0], opt.pos[1], opt.pos[2], 2.5); g.connect(p); out = p; }
    if (opt.echo) { const d = actx.createDelay(2); d.delayTime.value = 0.42; const fb = actx.createGain(); fb.gain.value = 0.45; out.connect(d); d.connect(fb); fb.connect(d); d.connect(sfx); }
    out.connect(sfx); s.start(); return s;
  }).catch(() => null);
};
// small synth voices
F.tone = function (freq, dur, opt) {
  opt = opt || {}; const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = opt.type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(opt.vol || 0.15, t + (opt.att || 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); let out = g; if (opt.pos) { const p = F.panner(opt.pos[0], opt.pos[1], opt.pos[2], 1.5); g.connect(p); out = p; }
  out.connect(sfx); o.start(t); o.stop(t + dur + 0.05);
};
let noiseBuf = null;
F.noiseBuf = function () {
  if (noiseBuf) return noiseBuf;
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0);
  let b = 0; for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3.2; }
  return noiseBuf;
};
// Shepard-Risset glissando: the endlessly rising (or falling) tone that carries you between rooms
const shep = { oscs: [], g: null, phase: 0, dir: 1, on: false };
F.shepardStart = function (dir) {
  F.shepardStop(0.01);
  shep.g = actx.createGain(); shep.g.gain.value = 0; shep.g.connect(sfx); shep.dir = dir || 1; shep.phase = 0; shep.on = true;
  shep.oscs = [];
  for (let i = 0; i < 7; i++) { const o = actx.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; const g = actx.createGain(); g.gain.value = 0; o.connect(g); g.connect(shep.g); o.start(); shep.oscs.push({ o, g }); }
  shep.g.gain.setTargetAtTime(0.11, actx.currentTime, 0.6);
};
F.shepardStop = function (fade) {
  if (!shep.g) return; const g = shep.g, oscs = shep.oscs; shep.on = false; shep.g = null;
  g.gain.setTargetAtTime(0, actx.currentTime, (fade || 1) / 3);
  setTimeout(() => { oscs.forEach(x => { try { x.o.stop(); x.o.disconnect(); } catch (e) {} }); g.disconnect(); }, (fade || 1) * 1000 + 400);
};
function shepardTick(dt) {
  if (!shep.on) return; shep.phase += dt * 0.09 * shep.dir; const t = actx.currentTime;
  shep.oscs.forEach((x, i) => {
    let ph = ((i / shep.oscs.length + shep.phase) % 1 + 1) % 1;
    const f = 55 * Math.pow(2, ph * 6); const a = Math.pow(Math.sin(Math.PI * ph), 2) * 0.32;
    x.o.frequency.setTargetAtTime(f, t, 0.03); x.g.gain.setTargetAtTime(a, t, 0.05);
  });
}

// ---------------------------------------------------------------- player + input
const P = F.player = { x: 0, z: 0, yaw: 0, pitch: 0, r: 0.32, eye: 1.6, vx: 0, vz: 0, still: 0, moved: 0 };
const keys = {};
let started = false, locked = false, inVR = false, frozen = false;
F.isVR = () => inVR;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyG') F.ground();
  if (e.code === 'KeyM') { F.setMuted(!muted); F.syncButtons(); }
  if (F.QS.has('debug') && /^Digit[0-6]$/.test(e.code)) F.goRoom(+e.code.slice(5));
});
addEventListener('keyup', e => { keys[e.code] = false; });
const cvs = renderer.domElement;
cvs.addEventListener('click', () => {
  if (!started || inVR) return;
  if (!isTouch && !locked) { cvs.requestPointerLock && cvs.requestPointerLock(); return; }
  if (locked) F.pickAt(0, 0);
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cvs; });
document.addEventListener('mousemove', e => { if (!locked || inVR) return; P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.35, 1.35); });
// touch: left half = walk stick, right half = look; a short tap picks
const touch = { move: null, look: null, mx: 0, my: 0 };
cvs.addEventListener('touchstart', e => {
  if (!started || inVR) return;
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && !touch.move) { touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY }; F.showStick(t.clientX, t.clientY, 0, 0); }
    else if (!touch.look) touch.look = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() };
  }
  e.preventDefault();
}, { passive: false });
cvs.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { let dx = t.clientX - touch.move.x0, dy = t.clientY - touch.move.y0; const L = Math.hypot(dx, dy), M = 60; if (L > M) { dx *= M / L; dy *= M / L; } touch.mx = dx / M; touch.my = dy / M; F.showStick(touch.move.x0, touch.move.y0, dx, dy); }
    if (touch.look && t.identifier === touch.look.id) { P.yaw -= (t.clientX - touch.look.x) * 0.0045; P.pitch = clamp(P.pitch - (t.clientY - touch.look.y) * 0.0045, -1.35, 1.35); touch.look.x = t.clientX; touch.look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
cvs.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.move = null; touch.mx = touch.my = 0; F.showStick(); }
    if (touch.look && t.identifier === touch.look.id) {
      const tap = performance.now() - touch.look.t0 < 300 && Math.hypot(t.clientX - touch.look.x0, t.clientY - touch.look.y0) < 12;
      if (tap) F.pickAt((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
      touch.look = null;
    }
  }
}, { passive: false });
F.showStick = function (x, y, dx, dy) {
  const b = document.getElementById('stick'), k = document.getElementById('knob');
  if (x === undefined) { b.style.display = 'none'; return; }
  b.style.display = 'block'; b.style.left = (x - 60) + 'px'; b.style.top = (y - 60) + 'px'; k.style.transform = `translate(${dx}px,${dy}px)`;
};
// picking (tap a screen, a crystal, an eye): rooms register meshes with F.pickable(mesh, fn)
const ray = new THREE.Raycaster(); let pickables = [];
F.pickable = (mesh, fn) => { mesh.userData.onPick = fn; pickables.push(mesh); };
F.clearPickables = () => { pickables = []; };
function pickRay(origin, dir) {
  ray.set(origin, dir); ray.far = 40;
  const hits = ray.intersectObjects(pickables, false);
  if (hits.length) { hits[0].object.userData.onPick(hits[0]); return true; }
  return false;
}
F.pickAt = function (nx, ny) { ray.setFromCamera({ x: nx, y: ny }, camera); return pickRay(ray.ray.origin.clone(), ray.ray.direction.clone()); };

// collision: rooms give shapes. in = stay inside circle; rect = stay inside box; c = keep out of circle; box = keep out of box; grid = many circles
function collide(sh) {
  for (const s of sh) {
    if (s.k === 'in') { const dx = P.x - (s.x || 0), dz = P.z - (s.z || 0), d = Math.hypot(dx, dz), m = s.r - P.r; if (d > m) { P.x = (s.x || 0) + dx / d * m; P.z = (s.z || 0) + dz / d * m; } }
    else if (s.k === 'rect') { P.x = clamp(P.x, s.x0 + P.r, s.x1 - P.r); P.z = clamp(P.z, s.z0 + P.r, s.z1 - P.r); }
    else if (s.k === 'c') { const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz) || 1e-4, m = s.r + P.r; if (d < m) { P.x = s.x + dx / d * m; P.z = s.z + dz / d * m; } }
    else if (s.k === 'box') {
      const x0 = s.x0 - P.r, x1 = s.x1 + P.r, z0 = s.z0 - P.r, z1 = s.z1 + P.r;
      if (P.x > x0 && P.x < x1 && P.z > z0 && P.z < z1) { const a = P.x - x0, b = x1 - P.x, c = P.z - z0, d = z1 - P.z, m = Math.min(a, b, c, d); if (m === a) P.x = x0; else if (m === b) P.x = x1; else if (m === c) P.z = z0; else P.z = z1; }
    }
    else if (s.k === 'grid') {
      const cx = Math.floor(P.x / s.size), cz = Math.floor(P.z / s.size);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = s.cells.get((cx + i) + ',' + (cz + j)); if (!L) continue; for (const o of L) { const dx = P.x - o[0], dz = P.z - o[1], d = Math.hypot(dx, dz) || 1e-4, m = o[2] + P.r; if (d < m) { P.x = o[0] + dx / d * m; P.z = o[1] + dz / d * m; } } }
    }
  }
}

// ---------------------------------------------------------------- VR controllers
const ctrls = [0, 1].map(i => { const c = renderer.xr.getController(i); rig.add(c); c.addEventListener('select', () => onSelect(c)); return c; });
F.controllers = ctrls;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function onSelect(c) {
  F.unlockAudio();
  c.getWorldPosition(_o); c.getWorldQuaternion(_q); _d.set(0, 0, -1).applyQuaternion(_q);
  if (!pickRay(_o.clone(), _d.clone())) { /* nothing hit */ }
}
let snapReady = true, groundReady = true;
function readXRInput(dt) {
  const s = renderer.xr.getSession(); if (!s) return { mx: 0, my: 0 };
  let mx = 0, my = 0;
  for (const src of s.inputSources) {
    const gp = src.gamepad; if (!gp) continue; const ax = gp.axes || [];
    const x = ax.length >= 4 ? ax[2] : (ax[0] || 0), y = ax.length >= 4 ? ax[3] : (ax[1] || 0);
    if (src.handedness === 'left' || (src.handedness !== 'right' && s.inputSources.length === 1)) { if (Math.abs(x) > 0.15) mx = x; if (Math.abs(y) > 0.15) my = y; }
    if (src.handedness === 'right') {
      if (Math.abs(x) > 0.7 && snapReady) { snapReady = false; P.yaw -= Math.sign(x) * Math.PI / 6; }
      if (Math.abs(x) < 0.3) snapReady = true;
    }
    const bB = gp.buttons && gp.buttons[5] && gp.buttons[5].pressed; // B or Y
    if (bB && groundReady) { groundReady = false; F.ground(); }
    if (!bB && gp.buttons && gp.buttons[5]) groundReady = true;
  }
  return { mx, my };
}

// ---------------------------------------------------------------- HUD (DOM in flat mode, a floating panel in VR)
const hudName = document.getElementById('rname'), hudLine = document.getElementById('rline'), hudMsg = document.getElementById('msg');
let msgT = 0;
F.message = function (txt, secs) { hudMsg.textContent = txt; hudMsg.style.opacity = 1; msgT = secs || 6; vrHud.msg = txt; vrHud.msgT = msgT; vrHud.dirty = true; };
F.roomTitle = function (name, line) { hudName.textContent = name; hudLine.textContent = line; const h = document.getElementById('hud'); h.style.opacity = 1; h.dataset.t = 9; vrHud.name = name; vrHud.line = line; vrHud.nameT = 9; vrHud.dirty = true; };
const vrHud = { name: '', line: '', msg: '', nameT: 0, msgT: 0, dirty: true };
const hudCanvas = document.createElement('canvas'); hudCanvas.width = 1024; hudCanvas.height = 320;
const hudTex = new THREE.CanvasTexture(hudCanvas); hudTex.encoding = THREE.sRGBEncoding;
const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3125), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false }));
hudMesh.renderOrder = 999; hudMesh.position.set(0, -0.28, -1.15); hudMesh.rotation.x = -0.25; hudMesh.visible = false; camera.add(hudMesh);
function drawVRHud() {
  const g = hudCanvas.getContext('2d'); g.clearRect(0, 0, 1024, 320);
  const a1 = clamp(vrHud.nameT / 1.5, 0, 1), a2 = clamp(vrHud.msgT / 1.5, 0, 1);
  g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 14;
  if (a1 > 0) { g.fillStyle = `rgba(255,236,200,${a1})`; g.font = '600 54px Georgia, serif'; g.fillText(vrHud.name, 512, 70); g.font = 'italic 34px Georgia, serif'; g.fillStyle = `rgba(230,220,255,${a1 * 0.9})`; wrap(g, vrHud.line, 512, 120, 960, 40); }
  if (a2 > 0) { g.font = '36px Georgia, serif'; g.fillStyle = `rgba(255,255,255,${a2})`; wrap(g, vrHud.msg, 512, 230, 960, 42); }
  if (F.QS.has('stats')) { g.textAlign = 'left'; g.font = '28px monospace'; g.fillStyle = '#7f7'; g.fillText(fpsTxt, 10, 310); }
  hudTex.needsUpdate = true; hudMesh.visible = a1 > 0 || a2 > 0 || F.QS.has('stats');
}
function wrap(g, txt, x, y, w, lh) { const words = (txt || '').split(' '); let line = ''; for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w && line) { g.fillText(line, x, y); line = wd; y += lh; } else line = t; } if (line) g.fillText(line, x, y); }

// ---------------------------------------------------------------- veil: the colour field between rooms (slow, soft, never a flash)
const veilMat = new THREE.ShaderMaterial({
  uniforms: { uV: { value: 0 }, uTime: U.uTime, uStyle: { value: 0 }, uA: { value: new THREE.Color(1, 0.6, 0.2) }, uB: { value: new THREE.Color(0.2, 0.1, 0.5) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: GL_COMMON + `uniform float uV, uTime, uStyle; uniform vec3 uA, uB; varying vec3 vP;
void main(){
  vec3 d = normalize(vP); float an = atan(d.x, d.z), el = d.y; float t = uTime;
  float v;
  if (uStyle < 0.5) v = 0.5 + 0.5*sin(length(d.xy)*6.0 - t*0.8 + fbm(d.xz*3.0)*2.0);                  // exhale
  else if (uStyle < 1.5) { float a = abs(mod(an, 1.0472) - 0.5236); v = 0.5 + 0.5*sin(a*14.0 + el*6.0 + t*0.4); }   // mirrors
  else if (uStyle < 2.5) v = 0.5 + 0.5*sin(acos(clamp(-d.z,-1.0,1.0))*9.0 + t*1.1);                  // rewind: rings fall inward
  else if (uStyle < 3.5) v = smoothstep(-0.6, 0.6, -el + 0.2*fbm(d.xz*4.0 + t*0.05));                 // flip
  else if (uStyle < 4.5) v = 0.5 + 0.5*sin(an*5.0 + fbm(vec2(an*2.0, el*4.0) + t*0.1)*6.0);            // sound to light
  else if (uStyle < 5.5) v = fbm(d.xy*4.0 + vec2(t*0.05, -t*0.04) + fbm(d.yz*3.0)*2.0);                // dissolve
  else { float g = glyph(vec2(an*4.0, el*6.0 + t*0.15), 3.0); v = 0.25 + 0.75*exp(-g*14.0); }            // the loop: glyphs
  vec3 col = mix(uB, uA, v) * 0.85;
  gl_FragColor = vec4(col, uV);
}`,
  side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false
});
const veil = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), veilMat); veil.renderOrder = 998; veil.frustumCulled = false; veil.visible = false; camera.add(veil);
F.veil = veilMat;

// ---------------------------------------------------------------- rooms + transitions
F.ROOMS = F.ROOMS || [];
let cur = null, curIdx = -1, trans = null, loop = 0;
F.cur = () => cur; F.curIdx = () => curIdx; F.loopCount = () => loop;
function disposeRoom(r) {
  if (!r) return;
  try { r.onLeave && r.onLeave(); } catch (e) { console.error(e); }
  (r.clips || []).forEach(c => c.stop());
  scene.remove(r.group);
  r.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.dispose()); } });
  (r.disposables || []).forEach(d => d.dispose && d.dispose());
  F.clearPickables();
}
function buildRoom(i) {
  const def = F.ROOMS[i];
  const r = def.build({ loop });
  r.def = def; r.idx = i; r.t = 0;
  scene.add(r.group);
  const fc = r.fog || [0, 0, 0, 0.04]; U.uFogC.value.setRGB(fc[0], fc[1], fc[2]); U.uFogD.value = fc[3]; scene.background.setRGB(fc[0], fc[1], fc[2]);
  P.x = r.start[0]; P.z = r.start[1]; P.yaw = r.start[2]; P.pitch = 0;
  if (def.music) F.playMusic(def.music, r.music || {});
  return r;
}
const STYLE = [6, 0, 1, 2, 3, 4, 5]; // transition style used when arriving in room i
F.goRoom = function (to, opt) {
  opt = opt || {};
  to = ((to % F.ROOMS.length) + F.ROOMS.length) % F.ROOMS.length;
  if (trans) return false;
  if (!cur) { curIdx = to; cur = buildRoom(to); enterRoom(); return true; }
  const nextDef = F.ROOMS[to];
  const st = opt.style !== undefined ? opt.style : STYLE[to];
  trans = { to, t: 0, swapped: false, loopBack: !!opt.loopBack };
  veilMat.uniforms.uStyle.value = st;
  const ec = nextDef.edge || [1, 0.7, 0.3]; U.uEdge.value.setRGB(ec[0], ec[1], ec[2]);
  const va = nextDef.veil || [[1, 0.6, 0.2], [0.2, 0.1, 0.5]]; veilMat.uniforms.uA.value.setRGB(...va[0]); veilMat.uniforms.uB.value.setRGB(...va[1]);
  F.shepardStart(st === 2 ? -1 : 1);
  F.stopMusic(2.4);
  return true;
};
function enterRoom() {
  const d = cur.def;
  const name = (curIdx === 0 && loop > 0) ? d.name + ' · LOOP ' + (loop + 1) : d.name;
  F.roomTitle(name, (curIdx === 0 && loop > 0) ? d.lineLoop : d.line);
  try { cur.onEnter && cur.onEnter(); } catch (e) { console.error(e); }
  // light prefetch of the next room's pictures (images only; clips and songs stream on demand)
  const nx = F.ROOMS[(curIdx + 1) % F.ROOMS.length]; (nx.prefetch || []).forEach(n => F.tex(n));
  F.onRoom && F.onRoom(curIdx);
}
function transTick(dt) {
  if (!trans) return;
  trans.t += dt; const t = trans.t;
  const A = 2.6, SW = 2.75, B = 3.3;
  if (!trans.swapped) {
    U.uDis.value = smooth(t / A);
    veilMat.uniforms.uV.value = 0.93 * smooth((t - 0.9) / 1.7);
    frozen = t > 2.2;
    if (t >= SW) {
      disposeRoom(cur);
      if (trans.loopBack) loop++;
      U.uLoop.value = loop;
      curIdx = trans.to; cur = buildRoom(curIdx); trans.swapped = true; U.uDis.value = 1;
    }
  } else {
    U.uDis.value = 1 - smooth((t - B) / 3.0);
    veilMat.uniforms.uV.value = 0.93 * (1 - smooth((t - 2.9) / 2.6));
    frozen = t < 3.4;
    if (t > 3.6 && !trans.entered) { trans.entered = true; enterRoom(); F.shepardStop(2.5); }
    if (t > 6.4) { trans = null; U.uDis.value = 0; veilMat.uniforms.uV.value = 0; frozen = false; }
  }
  veil.visible = veilMat.uniforms.uV.value > 0.002;
}
F.inTransition = () => !!trans;
// a quick soft dip (Echo Hall's loop): dim, move, undim
let dip = null;
F.dip = function (fn) { if (dip) return; dip = { t: 0, fn, done: false }; veilMat.uniforms.uStyle.value = 2; };
function dipTick(dt) {
  if (!dip) return; dip.t += dt;
  const v = dip.t < 0.5 ? smooth(dip.t / 0.5) : 1 - smooth((dip.t - 0.7) / 0.6);
  veilMat.uniforms.uV.value = 0.85 * v; veil.visible = v > 0.002;
  if (dip.t >= 0.55 && !dip.done) { dip.done = true; dip.fn(); }
  if (dip.t > 1.4) { dip = null; veilMat.uniforms.uV.value = 0; veil.visible = false; }
}

// ---------------------------------------------------------------- grounding: B/Y in VR, G on a keyboard, the ◎ button on screen
let groundT = 0;
F.ground = function () {
  groundT = 22; F.message('Grounding. Everything slows down and goes soft for a while. Breathe out.', 6);
  musicBus.gain.setTargetAtTime(0.55, actx.currentTime, 0.8);
};
let intensity = QS.has('gentle') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0.6 : 1.0;
F.setIntensity = v => { intensity = clamp(v, 0.3, 1.6); };
F.getIntensity = () => intensity;
let timeScale = 1, hueTarget = 0;
F.setTimeScale = v => { timeScale = clamp(v, 0.4, 1.6); };
F.setHue = v => { hueTarget = clamp(v, -1, 1) * Math.PI; };

// ---------------------------------------------------------------- frame loop
let last = performance.now(), simT = 0, fpsAcc = 0, fpsN = 0, fpsTxt = '', fpsT = 0;
F.fps = 0; F.frameMs = [];
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), _cam = new THREE.Vector3(), _cq = new THREE.Quaternion();
function frame() {
  const now = performance.now(); let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
  F.frameMs.push(dt * 1000); if (F.frameMs.length > 240) F.frameMs.shift();
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { F.fps = fpsN / fpsAcc; fpsTxt = F.fps.toFixed(0) + ' fps · room ' + curIdx; fpsAcc = 0; fpsN = 0; const s = document.getElementById('stats'); if (s) s.textContent = fpsTxt; vrHud.dirty = true; }
  simT += dt * timeScale; U.uTime.value = simT;
  // grounding curve: in over 2 s, hold, out over 8 s
  if (groundT > 0) { groundT -= dt; if (groundT <= 0) musicBus.gain.setTargetAtTime(1, actx.currentTime, 2.0); }
  const calmTarget = groundT > 8 ? 1 : groundT > 0 ? groundT / 8 : 0;
  U.uCalm.value += (calmTarget - U.uCalm.value) * Math.min(1, dt * 1.5);
  U.uK.value = intensity * (1 + 0.12 * Math.min(loop, 3)) * (1 - 0.75 * U.uCalm.value);
  U.uTT.value += dt * timeScale * U.uK.value;
  U.uHue.value += (hueTarget - U.uHue.value) * Math.min(1, dt * 0.25);
  // movement
  let mx = 0, my = 0;
  if (inVR) { const r = readXRInput(dt); mx = r.mx; my = r.my; }
  else {
    if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1;
    if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    if (keys.ArrowLeft) P.yaw += 1.8 * dt; if (keys.ArrowRight) P.yaw -= 1.8 * dt;
    if (touch.move) { mx = touch.mx; my = touch.my; }
  }
  let headYaw = P.yaw;
  if (inVR) { camera.getWorldQuaternion(_cq); const e = new THREE.Euler().setFromQuaternion(_cq, 'YXZ'); headYaw = e.y; }
  const sp = (inVR ? 1.7 : 2.4) * (keys.ShiftLeft ? 1.6 : 1);
  const L = Math.hypot(mx, my); if (L > 1) { mx /= L; my /= L; }
  if (frozen) { mx = my = 0; }
  const ox = P.x, oz = P.z;
  if (mx || my) { const s = Math.sin(headYaw), c = Math.cos(headYaw); P.x += (mx * c + my * s) * sp * dt; P.z += (-mx * s + my * c) * sp * dt; }
  if (cur) collide(cur.solids || []);
  const moved = Math.hypot(P.x - ox, P.z - oz); P.moved += moved; P.still = moved < 0.002 ? P.still + dt : 0;
  // place the rig. VR: the rig carries position + snap-turn yaw, the headset adds its own height and look.
  if (inVR) { rig.position.set(P.x, rigY, P.z); rig.rotation.set(0, P.yaw, 0); }
  else { rig.position.set(P.x, 0, P.z); rig.rotation.set(0, 0, 0); camera.position.set(0, P.eye, 0); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); }
  camera.getWorldPosition(_cam); U.uPlayer.value.copy(_cam);
  F.headPos = _cam;
  // audio listener follows the head
  const Lr = actx.listener; camera.getWorldQuaternion(_cq); fwd.set(0, 0, -1).applyQuaternion(_cq);
  if (Lr.positionX) { const t = actx.currentTime; Lr.positionX.setTargetAtTime(_cam.x, t, 0.02); Lr.positionY.setTargetAtTime(_cam.y, t, 0.02); Lr.positionZ.setTargetAtTime(_cam.z, t, 0.02); Lr.forwardX.setTargetAtTime(fwd.x, t, 0.02); Lr.forwardY.setTargetAtTime(fwd.y, t, 0.02); Lr.forwardZ.setTargetAtTime(fwd.z, t, 0.02); Lr.upX.value = 0; Lr.upY.value = 1; Lr.upZ.value = 0; }
  else if (Lr.setPosition) { Lr.setPosition(_cam.x, _cam.y, _cam.z); Lr.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  shepardTick(dt);
  // room logic + portals
  if (cur) {
    cur.t += dt;
    try { cur.update && cur.update(dt, simT); } catch (e) { console.error(e); }
    if (!trans && !dip && started) for (const pt of (cur.portals || [])) {
      if ((pt.open === undefined || pt.open()) && Math.hypot(P.x - pt.x, P.z - pt.z) < pt.r) { if (pt.onCross) { pt.onCross(); } else F.goRoom(pt.to, { loopBack: !!pt.loopBack }); break; }
    }
  }
  transTick(dt); dipTick(dt);
  // HUD fades
  if (msgT > 0) { msgT -= dt; if (msgT <= 1.2) hudMsg.style.opacity = Math.max(0, msgT / 1.2); }
  const hud = document.getElementById('hud'); if (+hud.dataset.t > 0) { hud.dataset.t = +hud.dataset.t - dt; if (+hud.dataset.t < 2) hud.style.opacity = Math.max(0, +hud.dataset.t / 2); }
  if (inVR) { const was = vrHud.nameT > 0 || vrHud.msgT > 0; if (vrHud.nameT > 0) vrHud.nameT -= dt; if (vrHud.msgT > 0) vrHud.msgT -= dt; if (vrHud.nameT > 0 || vrHud.msgT > 0 || was || vrHud.dirty) { if ((fpsT += dt) > 0.1 || vrHud.dirty) { fpsT = 0; drawVRHud(); vrHud.dirty = false; } } }
  F.live && F.live.tick(dt);
  renderer.render(scene, camera);
}
F.start = function (room) {
  started = true; F.unlockAudio();
  F.goRoom(room || 0);
  renderer.setAnimationLoop(frame);
};
F.preview = function () { renderer.setAnimationLoop(frame); };

// ---------------------------------------------------------------- entering VR (the Quest-safe way that Liminal ended up with)
// basic session (no optional features), local-floor; the world idles while the Allow prompt is up and starts 1.5 s after VR begins.
let vrPending = false, rigY = 0;
F.vrPending = () => vrPending;
F.enterVR = async function () {
  if (!navigator.xr) { F.message('This browser has no VR. Open the link in the Quest browser.', 6); return; }
  if (vrPending || inVR) return;
  F.unlockAudio();
  vrPending = true; F.syncVRButton && F.syncVRButton();
  const giveUp = setTimeout(() => { if (vrPending) { vrPending = false; F.syncVRButton && F.syncVRButton(); F.message('VR did not start. Tap ENTER VR again; if a prompt shows, choose Allow once and wait a few seconds.', 9); } }, 25000);
  let session = null;
  try {
    renderer.setAnimationLoop(null); // idle while the headset's Allow prompt is up
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    clearTimeout(giveUp);
    try { localStorage.setItem('further_vr_last', String(Date.now())); } catch (e) {}
    session.addEventListener('select', () => F.unlockAudio());
    let space = 'local-floor';
    try { await session.requestReferenceSpace('local-floor'); } catch (e) { space = 'local'; }
    rigY = space === 'local' ? 1.6 : 0;
    renderer.xr.setReferenceSpaceType(space);
    await renderer.xr.setSession(session);
    inVR = true; vrPending = false; hudMesh.visible = true; document.body.classList.add('invr'); F.syncVRButton && F.syncVRButton();
    session.addEventListener('end', () => { inVR = false; hudMesh.visible = false; document.body.classList.remove('invr'); camera.position.set(0, P.eye, 0); camera.quaternion.identity(); F.syncVRButton && F.syncVRButton(); renderer.setAnimationLoop(started ? frame : null); });
    try { if (session.updateTargetFrameRate && session.supportedFrameRates && Array.from(session.supportedFrameRates).indexOf(72) >= 0) session.updateTargetFrameRate(72).catch(() => {}); } catch (e) {}
    camera.position.set(0, 1.6, 0); camera.quaternion.identity();
    // let the headset settle on a quiet scene first, then wake the sound and the world
    setTimeout(() => {
      if (!inVR) return; F.unlockAudio();
      if (!started) F.start(F.startRoom); else renderer.setAnimationLoop(frame);
      F.message('Left stick walks. Right stick turns. Trigger touches things. B or Y grounds you if it gets too much.', 9);
    }, 1500);
  } catch (e) {
    clearTimeout(giveUp); vrPending = false; F.syncVRButton && F.syncVRButton();
    try { if (session) await session.end(); } catch (er) {}
    F.message('VR could not start (' + (e && e.message ? e.message : e) + '). Flat mode still works.', 9);
    renderer.setAnimationLoop(started ? frame : null);
  }
};
F.syncButtons = function () { const b = document.getElementById('bSound'); if (b) b.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; };
})();
