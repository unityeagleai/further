/* FURTHER · the seven rooms. Each build() returns { group, solids, portals, start:[x,z,yaw], update, onEnter, onLeave, clips, fog }.
   uTT = trip time (slows down when grounding), uK = intensity (lower when grounding), uTime = clock time. */
(function () {
'use strict';
const F = window.FURTHER, T = THREE;
const PI = Math.PI;
function mesh(g, geo, mat, x, y, z) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; }
function room() { return { group: new T.Group(), solids: [], portals: [], clips: [], disposables: [], t: 0 }; }
const col3 = a => new T.Color(a[0], a[1], a[2]);

// a doorway / pupil / ring that shows the colours of the next room as a slow tunnel
function portalMat(a, b, sq) {
  return F.tmat({
    uniforms: { uCA: { value: col3(a) }, uCB: { value: col3(b) }, uOpen: { value: 1 }, uSq: { value: sq || 0 } },
    fpars: 'uniform vec3 uCA, uCB; uniform float uOpen, uSq;\n',
    frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 c = (uv-0.5)*2.0; float r = mix(length(c), max(abs(c.x),abs(c.y)), uSq); float an = atan(c.y,c.x);
      float z = 0.35/(r+0.07) - uTT*0.3;
      float v = 0.5+0.5*sin(z*3.0 + an*3.0 + fbm3(vec2(an*2.0, z))*3.0);
      vec3 col = mix(uCB, uCA, v) * (0.45 + 1.2*smoothstep(1.0,0.0,r));
      col += uCA*exp(-r*5.0)*1.2;
      alpha = smoothstep(1.0, 0.84, r) * uOpen;
      return col * (0.35 + 0.65*uOpen);
    }`, transparent: true, noFog: true, side: T.DoubleSide
  });
}
function glowMat(c, pulse) {
  return F.tmat({ uniforms: { uC: { value: col3(c) }, uP: { value: pulse || 0 } }, fpars: 'uniform vec3 uC; uniform float uP;\n',
    frag: 'vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){ return uC*(1.0 - uP*0.35 + uP*0.35*sin(uTT*1.3 + wp.y*2.0)); }' });
}
// plain shaded solid lit from a direction (furniture, pedestals)
function solidMat(c, lightDir) {
  const L = lightDir || [0.3, 1, 0.4];
  return F.tmat({ uniforms: { uC: { value: col3(c) }, uL: { value: new T.Vector3(...L).normalize() } }, fpars: 'uniform vec3 uC, uL;\n',
    frag: 'vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){ float l = 0.35 + 0.65*clamp(dot(n,uL)*0.5+0.5,0.0,1.0); return uC*l*(0.92+0.08*noise(wp.xz*9.0+wp.y*7.0)); }' });
}
// a video/picture screen (texture uniform shared with an F.clip)
function screenMat(texU, flip) {
  return F.tmat({ uniforms: { uTex: texU, uOn: { value: 0 }, uFlip: { value: flip ? 1 : 0 } }, fpars: 'uniform sampler2D uTex; uniform float uOn, uFlip;\n',
    frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 u = mix(uv, 1.0-uv, uFlip); u.x += (noise(vec2(uv.y*40.0, uTime*1.5))-0.5)*0.005*uK;
      vec3 c = texture2D(uTex, u).rgb * (0.7 + 0.35*uOn);
      float e = smoothstep(0.0,0.03,uv.x)*smoothstep(1.0,0.97,uv.x)*smoothstep(0.0,0.04,uv.y)*smoothstep(1.0,0.96,uv.y);
      return c*e; }`, noFog: true });
}

// ============================================================ 0 · THE ANCIENT SIGNAL
F.ROOMS.push({
  name: 'THE ANCIENT SIGNAL', music: 'r0',
  line: 'Your favourite room, rebuilt from memory. The glyphs are still awake. Walk past the monolith.',
  lineLoop: 'You came back different. So did the room.',
  edge: [1, 0.75, 0.35], veil: [[0.95, 0.62, 0.25], [0.12, 0.05, 0.25]], prefetch: ['atlas', 'unity'],
  build(ctx) {
    const r = room(), g = r.group, H = 11, z0 = -24, z1 = 2;
    const wall = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = vec2(abs(n.x)>0.5 ? wp.z : wp.x, wp.y);
      q.x += 0.08*uK*sin(q.y*1.7 + uTT*0.45);            // the wall breathes sideways, slowly
      vec3 col = vec3(0.09,0.07,0.14) + 0.06*fbm3(q*1.3);
      vec2 gu = q*(1.1 + 0.07*sin(uTT*0.25)) + vec2(0.0, 0.3);
      float gd = glyph(gu, 2.0 + floor(uLoop)); float on = h21(floor(gu)+41.0);
      float glow = smoothstep(0.045,0.0,gd) + 0.35*exp(-gd*22.0);
      float gate = 0.55 + 0.45*sin(uTT*1.0 + on*20.0);
      vec3 gc = mix(vec3(1.0,0.72,0.28), vec3(0.3,1.0,0.85), 0.5+0.5*sin(uTT*0.35 + wp.z*0.18));
      gc = mix(gc, vec3(0.95,0.35,0.9), clamp(uLoop,0.0,1.0)*0.5);
      col += gc*glow*gate*1.35;
      col *= 0.55 + 0.45*smoothstep(H_, 1.0, wp.y);
      return col; }`.replace('H_', H.toFixed(1)) });
    const W = 14, L = z1 - z0;
    mesh(g, new T.PlaneGeometry(L, H), wall, -7, H / 2, (z0 + z1) / 2).rotation.y = PI / 2;
    mesh(g, new T.PlaneGeometry(L, H), wall, 7, H / 2, (z0 + z1) / 2).rotation.y = -PI / 2;
    mesh(g, new T.PlaneGeometry(W, H), wall, 0, H / 2, z0);
    mesh(g, new T.PlaneGeometry(W, H), wall, 0, H / 2, z1).rotation.y = PI;
    const floor = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz; float d = length(q - vec2(0.0,-12.0));
      vec3 col = vec3(0.045,0.035,0.07) + 0.05*fbm3(q*0.7);
      float ring = pow(0.5+0.5*sin(d*2.6 - uTT*1.1), 10.0) * exp(-d*0.11);
      col += vec3(0.95,0.55,0.2)*ring*0.9;
      float gd = glyph(q*0.8, 5.0); col += vec3(0.3,0.9,0.8)*exp(-gd*30.0)*0.22*(0.55+0.45*sin(uTT*0.6+q.x));
      col += vec3(0.6,0.4,1.0)*exp(-length(q-uPlayer.xz)*1.4)*0.22;
      return col; }` });
    mesh(g, new T.PlaneGeometry(W, L), floor, 0, 0, (z0 + z1) / 2).rotation.x = -PI / 2;
    const ceil = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz*0.6; float gd = glyph(q, 11.0);
      return vec3(0.02,0.015,0.04) + vec3(0.5,0.4,1.0)*exp(-gd*40.0)*0.25*(0.5+0.5*sin(uTT*0.4+q.y)); }` });
    mesh(g, new T.PlaneGeometry(W, L), ceil, 0, H, (z0 + z1) / 2).rotation.x = PI / 2;
    // the monolith, with Neural Monastery on its face
    const mono = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec3 col = vec3(0.015,0.012,0.02) + 0.03*fbm3(wp.xy*3.0);
      float seam = smoothstep(0.02,0.0,abs(fract(wp.y*0.8 + 0.1*sin(wp.x*4.0+uTT*0.2))-0.5)-0.47);
      col += vec3(1.0,0.6,0.25)*seam*0.5*(0.6+0.4*sin(uTT*0.8));
      return col; }` });
    mesh(g, new T.BoxGeometry(1.8, 5.2, 0.7), mono, 0, 2.6, -12);
    const clip = F.clip('monastery', { sound: true, volume: 0.9, onEnd: () => { F.musicBus.gain.setTargetAtTime(1, F.actx.currentTime, 1.0); armed = false; } });
    r.clips.push(clip);
    const scr = screenMat(clip.uniform);
    const sm = mesh(g, new T.PlaneGeometry(1.52, 0.855), scr, 0, 2.3, -11.64);
    let armed = true;
    const play = () => { if (clip.playing) return; clip.play(); scr.uniforms.uOn.value = 1; F.musicBus.gain.setTargetAtTime(0.45, F.actx.currentTime, 0.6); };
    F.pickable(sm, play);
    r.solids.push({ k: 'rect', x0: -7, x1: 7, z0: z0, z1: z1 }, { k: 'box', x0: -0.9, x1: 0.9, z0: -12.35, z1: -11.65 });
    // drifting glyph shards orbiting the monolith
    const shardM = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      float gd = glyph(uv*1.0 + vec2(0.0,0.0), floor(wp.x*3.0)); float a = smoothstep(0.06,0.0,gd);
      alpha = a*0.9; if (alpha < 0.02) discard; return vec3(1.0,0.75,0.35)*1.6; }`, transparent: true, side: T.DoubleSide, blending: T.AdditiveBlending });
    const NS = 36, shards = new T.InstancedMesh(new T.PlaneGeometry(0.5, 0.5), shardM, NS); g.add(shards);
    const sd = []; for (let i = 0; i < NS; i++) sd.push({ a: Math.random() * PI * 2, rad: 1.6 + Math.random() * 4, y: 0.6 + Math.random() * 7, sp: (0.03 + Math.random() * 0.06) * (Math.random() < 0.5 ? -1 : 1), rot: Math.random() * 6 });
    const dm = new T.Object3D();
    // the exit: a glyph gate in the far wall
    const pm = portalMat([1, 0.55, 0.25], [0.5, 0.05, 0.25], 1);
    mesh(g, new T.PlaneGeometry(2.4, 3.6), pm, 0, 1.8, z0 + 0.03);
    const fr = glowMat([1, 0.7, 0.3], 1);
    mesh(g, new T.BoxGeometry(0.12, 3.8, 0.12), fr, -1.26, 1.9, z0 + 0.06); mesh(g, new T.BoxGeometry(0.12, 3.8, 0.12), fr, 1.26, 1.9, z0 + 0.06); mesh(g, new T.BoxGeometry(2.64, 0.12, 0.12), fr, 0, 3.76, z0 + 0.06);
    r.portals.push({ x: 0, z: z0 + 0.8, r: 1.0, to: 1 });
    r.start = [0, 0, 0]; r.fog = [0.02, 0.012, 0.04, 0.035];
    // the monolith hums from where it stands
    let hum = null;
    r.onEnter = () => {
      const a = F.actx, p = F.panner(0, 2.4, -12, 3), gg = a.createGain(); gg.gain.value = 0; gg.connect(p); p.connect(F.sfx);
      const os = [55, 55.6, 110.3, 164.8].map((f, i) => { const o = a.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; const og = a.createGain(); og.gain.value = [0.5, 0.4, 0.18, 0.08][i]; o.connect(og); og.connect(gg); o.start(); return o; });
      gg.gain.setTargetAtTime(0.16, a.currentTime, 2); hum = { p, gg, os };
      if (ctx.loop > 0) setTimeout(() => { if (F.curIdx() === 0) F.playBuf('whisper', { pos: [F.player.x - 1.4, 1.6, F.player.z + 1.2], vol: 1.3 }); }, 3800);
    };
    r.onLeave = () => { if (!hum) return; const h = hum; h.gg.gain.setTargetAtTime(0, F.actx.currentTime, 0.4); setTimeout(() => { h.os.forEach(o => o.stop()); h.p.disconnect(); }, 2000); F.musicBus.gain.setTargetAtTime(1, F.actx.currentTime, 0.5); };
    r.update = (dt, t) => {
      const P = F.player, d = Math.hypot(P.x, P.z + 12);
      if (armed && d < 4.2 && P.z > -12) play();
      if (!armed && d > 7.5) armed = true;
      for (let i = 0; i < NS; i++) { const s = sd[i]; s.a += s.sp * dt * F.U.uK.value; dm.position.set(Math.cos(s.a) * s.rad, s.y + Math.sin(t * 0.3 + i) * 0.2, -12 + Math.sin(s.a) * s.rad); dm.rotation.set(t * 0.05 + s.rot, s.a, 0); dm.updateMatrix(); shards.setMatrixAt(i, dm.matrix); }
      shards.instanceMatrix.needsUpdate = true;
    };
    return r;
  }
});

// ============================================================ 1 · THE LUNG
F.ROOMS.push({
  name: 'THE LUNG', music: 'r1',
  line: 'Something is breathing. It might be the room. It might be you.',
  edge: [1, 0.35, 0.4], veil: [[1.0, 0.45, 0.35], [0.35, 0.05, 0.18]], prefetch: ['still_trail'],
  build() {
    const r = room(), g = r.group;
    const B = { uBreath: { value: 0 }, uBreathN: { value: 0.5 } };
    const lung = F.tmat({
      uniforms: Object.assign({ uAtlas: { value: F.tex('atlas') } }, B),
      vpars: 'uniform float uBreath;\n', needCommonV: true,
      disp: `vec3 dd = normalize(wp.xyz - vec3(0.0,1.0,0.0));
        float w = noise(dd.xz*2.2 + dd.y*1.5 + uTT*0.03);
        float up = smoothstep(0.2, 2.2, wp.y);
        wp.xyz += dd * uBreath * (0.22 + 0.45*w) * up * uK;`,
      fpars: 'uniform sampler2D uAtlas; uniform float uBreath, uBreathN;\n',
      frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        vec3 d = normalize(wp - vec3(0.0,1.6,0.0));
        float an = atan(d.x, d.z);
        vec2 p = vec2(an*1.6, d.y*2.6);
        // lighter for the headset: one warp layer (3 noise fields instead of 6), same slow flesh-and-paint look
        vec2 r2 = vec2(fbm3(p + uTT*0.02), noise(p*1.3 + vec2(5.2,1.3) - uTT*0.017));
        float v = fbm3(p + 2.4*r2);
        vec3 col = pal(v*1.3 + uTT*0.012, vec3(0.5), vec3(0.5), vec3(1.0,1.0,0.8), vec3(0.0,0.15,0.3));
        float vein = smoothstep(0.04, 0.0, abs(v - 0.5));
        col = mix(col*0.55, vec3(1.0,0.32,0.38), vein*0.55);
        // Charlie's paintings, melting through the walls
        float seg = floor((an + 3.14159)/1.5708); seg = clamp(seg, 0.0, 3.0);
        vec2 pu = vec2(fract((an + 3.14159)/1.5708), clamp(d.y*1.5 + 0.38, 0.0, 1.0)) + (r2 - 0.5)*0.3*uK;
        pu = clamp(pu, 0.01, 0.99);
        vec3 pt = texture2D(uAtlas, (vec2(mod(seg,2.0), 1.0 - floor(seg/2.0)) + vec2(pu.x, pu.y))*0.5).rgb;
        float pmk = smoothstep(0.42, 0.72, noise(p*0.6 + vec2(uTT*0.015, 3.0))) * smoothstep(-0.3,0.1,d.y) * smoothstep(0.8,0.45,d.y);
        col = mix(col, pt*1.15, pmk*0.8);
        col *= 0.62 + 0.42*uBreathN;
        return col; }`, side: T.BackSide
    });
    mesh(g, new T.SphereGeometry(9, 48, 28, 0, PI * 2, 0, PI * 0.62), lung, 0, 1.0, 0);
    const floor = F.tmat({ uniforms: B, fpars: 'uniform float uBreath, uBreathN;\n', frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz; float v = fbm3(q*0.55 + uTT*0.02);
      float vein = smoothstep(0.05, 0.0, abs(noise(q*1.2 + v*2.0) - 0.5));
      vec3 col = mix(vec3(0.16,0.025,0.05), vec3(0.42,0.08,0.12), v);
      col += vec3(1.0,0.35,0.3)*vein*(0.3 + 0.3*uBreathN);
      col += vec3(0.9,0.6,0.3)*exp(-length(q - vec2(0.0,-7.6))*0.7)*0.25;
      return col*(0.7 + 0.3*uBreathN); }` });
    mesh(g, new T.CircleGeometry(9.2, 48), floor).rotation.x = -PI / 2;
    // the way out is an eye. its iris is made of Unity's photo; the pupil opens as you come close
    const eyeM = F.tmat({
      uniforms: { uTex: { value: F.tex('unity') }, uPupil: { value: 0 }, uCA: { value: col3([0.4, 0.95, 1.0]) }, uCB: { value: col3([0.05, 0.1, 0.35]) } },
      fpars: 'uniform sampler2D uTex; uniform float uPupil; uniform vec3 uCA, uCB;\n',
      frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        vec2 c = (uv - 0.5)*2.0; float r = length(c); float an = atan(c.y, c.x);
        vec3 col = vec3(0.86,0.78,0.72)*(0.85 + 0.15*noise(c*7.0));
        float vs = smoothstep(0.03, 0.0, abs(fbm3(c*4.0 + 3.0) - 0.5)) * smoothstep(0.45, 0.95, r);
        col = mix(col, vec3(0.75,0.12,0.15), vs*0.8 + smoothstep(0.75,1.0,r)*0.4);
        float ir = 0.74, pr = mix(0.16, 0.6, uPupil);
        vec2 pu = vec2(fract(an/6.28318 + uTT*0.004), clamp((r - pr)/(ir - pr), 0.0, 1.0));
        vec3 ph = texture2D(uTex, vec2(pu.x, 0.15 + 0.7*pu.y)).rgb;
        float fib = 0.65 + 0.35*sin(an*48.0 + fbm3(vec2(an*6.0, r*5.0))*5.0);
        vec3 iris = mix(ph*1.25, hue(vec3(0.15,0.65,0.6), uTT*0.04)*fib, 0.4) * (0.6 + 0.4*pu.y);
        col = mix(col, iris, smoothstep(ir + 0.03, ir - 0.02, r));
        float z = 0.3/(r + 0.05) - uTT*0.35; float tv = 0.5 + 0.5*sin(z*3.0 + an*2.0);
        vec3 tun = mix(uCB, uCA, tv) * (0.3 + 1.2*smoothstep(pr, 0.0, r));
        col = mix(col, tun, smoothstep(pr + 0.02, pr - 0.02, r));
        alpha = smoothstep(1.0, 0.95, r);
        return col; }`, transparent: true, noFog: true
    });
    const eye = mesh(g, new T.CircleGeometry(1.5, 64), eyeM, 0, 1.75, -8.15);
    r.solids.push({ k: 'in', r: 8.2 });
    r.portals.push({ x: 0, z: -7.55, r: 0.95, to: 2, open: () => eyeM.uniforms.uPupil.value > 0.75 });
    r.start = [0, 5.5, 0]; r.fog = [0.12, 0.02, 0.05, 0.02];
    // breathing: faster while you walk, slower when you stand still (~6 breaths a minute or slower)
    let phase = 0, rate = 1 / 7, told = false, br = null;
    r.onEnter = () => {
      const a = F.actx, s = a.createBufferSource(); s.buffer = F.noiseBuf(); s.loop = true;
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 400;
      const gg = a.createGain(); gg.gain.value = 0; s.connect(bp); bp.connect(gg); gg.connect(F.sfx); s.start(); br = { s, bp, gg };
    };
    r.onLeave = () => { if (!br) return; const b = br; b.gg.gain.setTargetAtTime(0, F.actx.currentTime, 0.4); setTimeout(() => { try { b.s.stop(); } catch (e) {} }, 2000); };
    r.update = (dt) => {
      const P = F.player;
      const target = P.still > 3 ? 1 / 12 : P.still > 0.5 ? 1 / 8 : 1 / 5.5;
      rate += (target - rate) * Math.min(1, dt * 0.4);
      phase += dt * rate * F.U.uK.value / Math.max(0.3, F.getIntensity());
      const b = Math.sin(phase * PI * 2);
      B.uBreath.value = b; B.uBreathN.value = 0.5 + 0.5 * b;
      if (br) { const t = F.actx.currentTime, inh = Math.cos(phase * PI * 2); br.bp.frequency.setTargetAtTime(380 + 420 * (0.5 + 0.5 * inh), t, 0.1); br.gg.gain.setTargetAtTime(0.05 + 0.1 * Math.abs(inh) * (P.still > 3 ? 1.3 : 1), t, 0.15); }
      if (!told && P.still > 6 && r.t > 8) { told = true; F.message('It slowed down when you did.', 5); }
      const d = Math.hypot(P.x, P.z + 8.15);
      const pt = F.clamp((4.2 - d) / 2.4, 0, 1);
      eyeM.uniforms.uPupil.value += (pt - eyeM.uniforms.uPupil.value) * Math.min(1, dt * 1.2);
    };
    return r;
  }
});

// ============================================================ 2 · THE KALEIDOSCOPE CHAPEL
F.ROOMS.push({
  name: 'THE KALEIDOSCOPE CHAPEL', music: 'r2',
  line: 'Every window is a mirror of a mirror of your trail. Touch the crystal.',
  edge: [0.6, 0.95, 1.0], veil: [[0.55, 0.9, 1.0], [0.25, 0.05, 0.4]], prefetch: ['unity', 'atlas'],
  build() {
    const r = room(), g = r.group;
    const clip = F.clip('trail', { loop: true }); r.clips.push(clip);
    const K = { uNa: { value: 6 }, uNb: { value: 8 }, uNm: { value: 0 } };
    const kal = F.tmat({
      uniforms: Object.assign({ uTex: clip.uniform }, K),
      fpars: 'uniform sampler2D uTex; uniform float uNa, uNb, uNm;\n',
      frag: `vec3 kal(vec3 d, float N){
        float an = atan(d.x, d.z) + uTT*0.012; float el = asin(clamp(d.y,-1.0,1.0));
        float seg = 6.28318/N; float a = mod(an, seg); a = abs(a - seg*0.5);
        float rr = 1.5708 - el;
        float lz = log(rr + 0.08)*1.1 - uTT*0.02;
        vec2 tuv = vec2(a/seg*1.6, fract(lz)); tuv = abs(fract(tuv*0.5 + 0.25)*2.0 - 1.0);
        vec3 tc = pow(texture2D(uTex, tuv*0.86 + 0.07).rgb, vec3(0.72));
        float lead = smoothstep(0.012, 0.0, a) + smoothstep(0.035, 0.0, 0.5 - abs(fract(lz) - 0.5));
        vec3 c = hue(tc*1.55 + vec3(0.07,0.06,0.1), uTT*0.04 + rr*0.7);
        // stained glass is lit from behind: the leading glows faintly gold instead of going black
        return mix(c, vec3(0.22,0.16,0.08), clamp(lead,0.0,1.0)*0.6);
      }
      vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        vec3 d = normalize(wp - vec3(0.0,1.6,0.0));
        vec3 col = mix(kal(d, uNa), kal(d, uNb), uNm);
        col *= 0.95 + 0.25*smoothstep(-0.3, 0.9, d.y);
        col += vec3(0.08,0.07,0.13);
        // painted doors in every wall; only one is real
        float an = atan(wp.x, wp.z); float fa = mod(an + 0.3927, 0.7854) - 0.3927; float off = fa*7.39;
        float arch = step(abs(off), 0.9) * step(wp.y, 2.4 + 0.6*sqrt(max(0.0, 1.0 - off*off/0.81)));
        float edge = arch * (1.0 - step(abs(off), 0.8) * step(wp.y, 2.35 + 0.55*sqrt(max(0.0, 1.0 - off*off/0.64))));
        if (wp.y < 3.2 && length(wp.xz) > 7.0) { col = mix(col, vec3(0.06,0.04,0.09), arch*0.75); col += vec3(0.9,0.8,0.5)*edge*1.3; }
        return col; }`, side: T.BackSide
    });
    const walls = mesh(g, new T.CylinderGeometry(8, 8, 8, 8, 1, true), kal, 0, 4, 0); walls.rotation.y = PI / 8;
    const dome = mesh(g, new T.SphereGeometry(8, 8, 10, 0, PI * 2, 0, PI / 2), kal, 0, 8, 0); dome.rotation.y = PI / 8;
    const floor = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz; float r = length(q); float an = atan(q.y, q.x);
      float seg = 0.7854; float a = abs(mod(an, seg) - seg*0.5);
      vec2 pu = vec2(a*r*1.6, r*1.6);
      float gd = glyph(pu, 21.0);
      vec3 col = vec3(0.13,0.1,0.18) + vec3(0.08,0.06,0.04)*fbm3(q*1.5);
      col += vec3(0.45,0.4,0.62)*exp(-r*0.45)*0.3;
      float wave = 0.5 + 0.5*sin(r*2.2 - uTT*0.8);
      col += mix(vec3(1.0,0.75,0.3), vec3(0.4,0.6,1.0), wave)*exp(-gd*26.0)*(0.4 + 0.55*wave);
      col += vec3(0.9,0.85,1.0)*smoothstep(0.03,0.0,abs(r-2.2))*0.5;
      return col; }` });
    const fl = mesh(g, new T.CircleGeometry(7.6, 8), floor); fl.rotation.x = -PI / 2; fl.rotation.z = PI / 8;
    // pillars at the corners
    const pil = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      float gd = glyph(vec2(uv.x*4.0, wp.y*1.6), 31.0);
      vec3 col = vec3(0.17,0.14,0.24) + vec3(0.9,0.75,1.0)*exp(-gd*30.0)*(0.45 + 0.3*sin(uTT*0.7 + wp.y));
      return col; }` });
    for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4, x = Math.sin(a) * 6.6, z = Math.cos(a) * 6.6; mesh(g, new T.CylinderGeometry(0.32, 0.4, 8, 10), pil, x, 4, z); r.solids.push({ k: 'c', x, z, r: 0.4 }); }
    // the altar and its crystal
    mesh(g, new T.CylinderGeometry(0.45, 0.6, 1.0, 8), solidMat([0.34, 0.26, 0.45]), 0, 0.5, 0);
    const cry = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec3 v = normalize(cameraPosition - wp); float f = 1.0 - abs(dot(n, v));
      return pal(f*1.5 + uTT*0.05 + wp.y, vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.0,0.33,0.67)) * (0.5 + 1.2*f); }` });
    const crystal = mesh(g, new T.OctahedronGeometry(0.4, 0), cry, 0, 1.6, 0);
    let started = false;
    const go = () => { if (started) return; started = true; clip.play(); F.tone(523.25, 5, { vol: 0.12, pos: [0, 1.6, 0], att: 0.01 }); F.tone(784, 4, { vol: 0.06, pos: [0, 1.6, 0] }); F.message('The trail is in every window now. Walk to the middle and the windows split finer.', 6); };
    F.pickable(crystal, go);
    r.solids.push({ k: 'in', r: 7.15 }, { k: 'c', x: 0, z: 0, r: 0.6 });
    // the real door, at the far side
    const pm = portalMat([0.55, 0.95, 1.0], [0.3, 0.02, 0.35], 0);
    const door = mesh(g, new T.PlaneGeometry(1.8, 3.0), pm, 0, 1.5, -7.3);
    r.portals.push({ x: 0, z: -6.75, r: 0.75, to: 3 });
    r.start = [0, 5.4, 0]; r.fog = [0.16, 0.12, 0.22, 0.01];
    r.update = (dt) => {
      const P = F.player, d = Math.hypot(P.x, P.z);
      if (!started && d < 2.0) go();
      crystal.rotation.y += dt * 0.35 * F.U.uK.value; crystal.rotation.x = Math.sin(r.t * 0.3) * 0.3;
      const n = 6 + 10 * F.clamp((6 - d) / 5, 0, 1) * F.U.uK.value / Math.max(0.3, F.getIntensity());
      const na = Math.floor(n); K.uNa.value = na; K.uNb.value = na + 1; K.uNm.value = F.smooth(n - na);
    };
    return r;
  }
});

// ============================================================ 3 · ECHO HALL
F.ROOMS.push({
  name: 'ECHO HALL', music: 'r3',
  line: 'Time runs the wrong way in here. Walk to the far door. Then look ahead.',
  edge: [0.8, 0.6, 1.0], veil: [[0.7, 0.55, 1.0], [0.05, 0.03, 0.12]], prefetch: ['still_dreamina'],
  build() {
    const r = room(), g = r.group, H = 6, z0 = -36, z1 = 2;
    const wall = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = vec2(abs(n.x)>0.5 ? wp.z : wp.x, wp.y);
      float m = fbm3(q*vec2(0.5,1.2) + fbm3(q*0.8)*1.5);
      vec3 col = vec3(0.05,0.045,0.07) + vec3(0.12,0.1,0.16)*smoothstep(0.45,0.8,m);
      col += vec3(0.5,0.4,0.9)*smoothstep(0.02,0.0,abs(fract(q.x/3.0)-0.5)-0.48)*0.35;
      float band = pow(0.5+0.5*sin(wp.z*0.9 + uTT*1.2), 14.0);   // light runs back toward the entrance
      col += vec3(0.6,0.5,1.0)*band*smoothstep(0.03,0.0,abs(wp.y-2.6)-0.02)*0.9;
      return col; }` });
    mesh(g, new T.PlaneGeometry(z1 - z0, H), wall, -3.5, H / 2, (z0 + z1) / 2).rotation.y = PI / 2;
    mesh(g, new T.PlaneGeometry(z1 - z0, H), wall, 3.5, H / 2, (z0 + z1) / 2).rotation.y = -PI / 2;
    mesh(g, new T.PlaneGeometry(7, H), wall, 0, H / 2, z0);
    mesh(g, new T.PlaneGeometry(7, H), wall, 0, H / 2, z1).rotation.y = PI;
    const floor = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 c = floor(wp.xz*0.8); float ch = mod(c.x + c.y, 2.0);
      vec3 col = mix(vec3(0.03,0.025,0.04), vec3(0.11,0.1,0.13), ch);
      float lamp = exp(-abs(fract((wp.z + 2.0)/4.0) - 0.5)*7.0) * exp(-abs(wp.x)*0.6);
      col += vec3(0.5,0.45,0.75)*lamp*0.28;
      return col; }` });
    mesh(g, new T.PlaneGeometry(7, z1 - z0), floor, 0, 0, (z0 + z1) / 2).rotation.x = -PI / 2;
    const ceil = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 l = vec2(wp.x, fract((wp.z + 2.0)/4.0)*4.0 - 2.0); float d = length(l);
      return vec3(0.02,0.018,0.03) + vec3(0.9,0.85,1.0)*smoothstep(0.32,0.28,d) + vec3(0.4,0.35,0.7)*exp(-d*2.0)*0.3; }` });
    mesh(g, new T.PlaneGeometry(7, z1 - z0), ceil, 0, H, (z0 + z1) / 2).rotation.x = PI / 2;
    // Droste frames: each picture holds itself, forever, spiralling inward
    const dro = (tex, quad) => F.tmat({
      uniforms: { uTex: { value: F.tex(tex) }, uQ: { value: new T.Vector4(...quad) } },
      fpars: 'uniform sampler2D uTex; uniform vec4 uQ;\n',
      frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        vec2 z = uv - 0.5; float r = length(z); float an = atan(z.y, z.x);
        const float RATIO = 2.4; float k = log(RATIO);
        float al = atan(k/6.28318); float ca = cos(al), sa = sin(al);
        vec2 lp = vec2(log(max(r,1e-4)), an);
        lp = vec2(ca*lp.x - sa*lp.y, sa*lp.x + ca*lp.y) * ca;
        lp.x = mod(lp.x - uTT*0.06, k) - k;
        vec2 w = exp(lp.x) * vec2(cos(lp.y), sin(lp.y));
        vec2 tuv = clamp(w*0.5 + 0.5, 0.0, 1.0);
        vec3 c = texture2D(uTex, uQ.xy + tuv*uQ.zw).rgb;
        float rim = smoothstep(0.012, 0.0, abs(length(w) - 1.0/RATIO*1.0) - 0.004);
        c = mix(c, vec3(0.95,0.8,0.45), rim*0.6);
        float frame = 1.0 - step(0.47, max(abs(z.x),abs(z.y)));
        c = mix(vec3(0.75,0.6,0.3)*(0.6+0.4*noise(uv*40.0)), c, frame);
        return c*1.05; }`, noFog: true });
    const dm = [dro('unity', [0.22, 0, 0.56, 1]), dro('atlas', [0, 0.5, 0.5, 0.5]), dro('atlas', [0.5, 0.5, 0.5, 0.5]), dro('atlas', [0, 0, 0.5, 0.5]), dro('atlas', [0.5, 0, 0.5, 0.5])];
    [-5, -11, -17, -23, -29].forEach((z, i) => {
      mesh(g, new T.PlaneGeometry(2.0, 2.0), dm[i % 5], -3.48, 2.0, z).rotation.y = PI / 2;
      mesh(g, new T.PlaneGeometry(2.0, 2.0), dm[(i + 2) % 5], 3.48, 2.0, z - 3).rotation.y = -PI / 2;
    });
    // the clock over the far door runs backwards
    const clockM = F.tmat({ uniforms: { uSpin: { value: 0 } }, fpars: 'uniform float uSpin;\n', frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 c = (uv - 0.5)*2.0; float r = length(c); float an = atan(c.x, c.y);
      vec3 col = vec3(0.85,0.82,0.75)*(0.9+0.1*noise(c*20.0));
      float tick = step(0.82, r)*step(r, 0.95)*smoothstep(0.06,0.0,abs(fract(an/0.5236 + 0.5)-0.5));
      col = mix(col, vec3(0.1), tick);
      float mA = -uSpin, hA = -uSpin/12.0;
      vec2 md = vec2(sin(mA), cos(mA)), hd = vec2(sin(hA), cos(hA));
      float mh = segD(c, vec2(0.0), md*0.78), hh = segD(c, vec2(0.0), hd*0.5);
      col = mix(col, vec3(0.05), smoothstep(0.035,0.02,mh)); col = mix(col, vec3(0.05), smoothstep(0.05,0.035,hh));
      col = mix(col, vec3(0.5,0.35,0.15), smoothstep(0.96,0.99,r));
      alpha = smoothstep(1.0,0.99,r); return col; }`, transparent: true, noFog: true });
    mesh(g, new T.CircleGeometry(1.0, 48), clockM, 0, 4.4, z0 + 0.03);
    const pm = portalMat([0.75, 0.6, 1.0], [0.05, 0.02, 0.15], 1);
    const farDoor = mesh(g, new T.PlaneGeometry(2.0, 3.0), pm, 0, 1.5, z0 + 0.03);
    const backM = portalMat([0.3, 0.25, 0.5], [0.02, 0.01, 0.05], 1); backM.uniforms.uOpen.value = 0.5;
    mesh(g, new T.PlaneGeometry(2.0, 3.0), backM, 0, 1.5, z1 - 0.03).rotation.y = PI;
    // your echoes: where you were 3.5, 7, 10.5 ... seconds ago
    const NG = 6, ghosts = [];
    const capG = new T.CapsuleGeometry(0.2, 0.85, 4, 10), headG = new T.SphereGeometry(0.15, 14, 10);
    for (let i = 0; i < NG; i++) {
      const gm = F.tmat({ uniforms: { uA: { value: 0 }, uC: { value: new T.Color().setHSL(0.72 - i * 0.09, 0.8, 0.6) } }, fpars: 'uniform float uA; uniform vec3 uC;\n',
        frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){ vec3 v = normalize(cameraPosition - wp); float f = pow(1.0 - abs(dot(n, v)), 1.6);
          alpha = uA*(0.25 + 0.75*f)*(0.8 + 0.2*sin(wp.y*30.0 + uTime*2.0)); return uC*(0.6 + 1.2*f); }`, transparent: true, blending: T.AdditiveBlending, noFog: true });
      const gg = new T.Group(); mesh(gg, capG, gm, 0, 0.88, 0); mesh(gg, headG, gm, 0, 1.58, 0); g.add(gg); gg.visible = false; ghosts.push({ g: gg, m: gm });
    }
    const hist = []; let histT = 0, lap = 0, whisperDone = false;
    r.solids.push({ k: 'rect', x0: -3.5, x1: 3.5, z0: z0, z1: z1 });
    r.portals.push({ x: 0, z: z0 + 0.7, r: 0.9, onCross: () => {
      if (lap === 0) {
        lap = 1;
        F.dip(() => { F.player.z += 35.0; });
        F.message('Again.', 3);
        F.playBuf('whisper', { reverse: true, vol: 1.0, echo: true });
      } else F.goRoom(4);
    } });
    r.start = [0, 0.6, 0]; r.fog = [0.02, 0.015, 0.035, 0.03];
    r.update = (dt, t) => {
      const P = F.player;
      histT += dt; if (histT >= 0.1) { histT = 0; hist.push([P.x, P.z, F.headPos ? F.headPos.y : 1.6]); if (hist.length > 260) hist.shift(); }
      for (let i = 0; i < NG; i++) {
        const back = Math.round(35 * (i + 1)), idx = hist.length - 1 - back, gh = ghosts[i];
        if (idx < 0 || P.moved < 1.5) { gh.g.visible = false; continue; }
        const h = hist[idx], nx = hist[Math.min(idx + 3, hist.length - 1)];
        gh.g.visible = true; gh.g.position.set(h[0], 0, h[1]);
        const dx = nx[0] - h[0], dz = nx[1] - h[1]; if (Math.hypot(dx, dz) > 0.02) gh.g.rotation.y = Math.atan2(-dx, -dz);
        const dd = Math.hypot(h[0] - P.x, h[1] - P.z);
        gh.m.uniforms.uA.value = (0.75 - i * 0.08) * F.smooth((dd - 0.7) / 0.9);
      }
      clockM.uniforms.uSpin.value += dt * (0.6 + lap * 1.4) * F.U.uK.value;
      if (lap === 1 && !whisperDone && P.z < -17 && ghosts[0].g.visible) { whisperDone = true; const gp = ghosts[0].g.position; F.playBuf('whisper', { pos: [gp.x, 1.6, gp.z], vol: 1.4 }); }
    };
    return r;
  }
});

// ============================================================ 4 · THE UPSIDE LOBBY
F.ROOMS.push({
  name: 'THE UPSIDE LOBBY', music: 'r4',
  line: 'Gravity went home early. The Roomba didn\'t. Mind the missing ceiling tiles.',
  edge: [1.0, 0.9, 0.5], veil: [[1.0, 0.85, 0.45], [0.95, 0.5, 0.65]], prefetch: [],
  build() {
    const r = room(), g = r.group, H = 4.2, X = 9, z0 = -18, z1 = 2;
    r.music = { pos: [0, 4.0, -8], ref: 7, vol: 0.9 };
    // the sky underneath you
    const sky = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec3 d = normalize(wp); float h = -d.y;
      vec3 col = mix(vec3(1.0,0.72,0.62), vec3(0.45,0.35,0.85), smoothstep(0.0, 0.9, h));
      vec2 cp = d.xz/max(h, 0.06)*2.0 + vec2(uTT*0.02, uTT*0.012);
      float cl = smoothstep(0.45, 0.8, fbm(cp*0.6));
      col = mix(col, vec3(1.0,0.95,0.92), cl*smoothstep(0.02,0.25,h)*0.85);
      col += vec3(1.0,0.75,0.4)*pow(max(dot(d, normalize(vec3(0.3,-0.8,-0.5))),0.0), 30.0)*1.2;
      if (d.y > 0.05) col = vec3(0.1,0.08,0.05);
      return col; }`, side: T.BackSide, noFog: true });
    mesh(g, new T.SphereGeometry(70, 32, 18), sky);
    // the floor is the lobby's drop ceiling: tiles, light panels, and holes
    const tiles = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 c = floor(wp.xz/1.2); vec2 f = fract(wp.xz/1.2);
      float miss = step(0.86, h21(c + 7.0)) * step(2.5, length(wp.xz - vec2(0.0,0.5)));
      if (miss > 0.5) discard;
      vec3 col = vec3(0.78,0.76,0.7)*(0.85 + 0.15*noise(wp.xz*30.0));
      float grid = smoothstep(0.03,0.0,min(min(f.x,1.0-f.x),min(f.y,1.0-f.y)));
      col = mix(col, vec3(0.35,0.33,0.3), grid);
      float panel = step(mod(c.x, 3.0), 0.5)*step(mod(c.y, 4.0), 0.5);
      col = mix(col, vec3(1.0,1.0,0.94)*(1.25 + 0.05*sin(uTime*0.7 + c.x)), panel*(1.0-grid));
      return col; }` });
    mesh(g, new T.PlaneGeometry(2 * X, z1 - z0), tiles, 0, 0, (z0 + z1) / 2).rotation.x = -PI / 2;
    const carpet = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      float v = fbm3(wp.xz*3.0); vec3 col = mix(vec3(0.45,0.38,0.18), vec3(0.6,0.52,0.25), v);
      col *= 0.45 + 0.15*noise(wp.xz*40.0); return col; }` });
    mesh(g, new T.PlaneGeometry(2 * X, z1 - z0), carpet, 0, H, (z0 + z1) / 2).rotation.x = PI / 2;
    const wallpaper = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      float s = abs(n.x)>0.5 ? wp.z : wp.x;
      vec3 col = vec3(0.78,0.7,0.36);
      col *= 0.92 + 0.08*step(0.5, fract(s*2.5));
      float chev = abs(fract(s*1.2 + abs(fract(wp.y*1.2)-0.5)) - 0.5); col *= 0.94 + 0.06*smoothstep(0.1,0.0,chev);
      col *= 0.55 + 0.6*smoothstep(4.0, 0.2, wp.y);
      col *= 0.85 + 0.15*fbm3(vec2(s, wp.y)*1.5);
      col = mix(col, vec3(0.3,0.2,0.1), step(4.02, wp.y));                     // the baseboard, at the top
      vec2 o = vec2(fract(s/5.0)*5.0 - 2.5, wp.y - 3.75);                       // outlets near the ceiling, upside down
      float plate = step(abs(o.x), 0.06)*step(abs(o.y), 0.09);
      float slot = step(abs(abs(o.x)-0.02), 0.006)*step(abs(o.y+0.02), 0.025);
      col = mix(col, vec3(0.9,0.88,0.8), plate); col = mix(col, vec3(0.1), slot*plate);
      return col; }` });
    const wallBox = (x0, x1, za, zb) => { const w = x1 - x0, d = zb - za; mesh(g, new T.BoxGeometry(w, H, d), wallpaper, (x0 + x1) / 2, H / 2, (za + zb) / 2); r.solids.push({ k: 'box', x0, x1, z0: za, z1: zb }); };
    mesh(g, new T.PlaneGeometry(z1 - z0, H), wallpaper, -X, H / 2, (z0 + z1) / 2).rotation.y = PI / 2;
    mesh(g, new T.PlaneGeometry(z1 - z0, H), wallpaper, X, H / 2, (z0 + z1) / 2).rotation.y = -PI / 2;
    mesh(g, new T.PlaneGeometry(2 * X, H), wallpaper, 0, H / 2, z0);
    mesh(g, new T.PlaneGeometry(2 * X, H), wallpaper, 0, H / 2, z1).rotation.y = PI;
    wallBox(-9, -3.4, -6.3, -5.9); wallBox(3.2, 9, -11.3, -10.9); wallBox(-4.4, -3.6, -14.4, -13.6); wallBox(4.6, 5.4, -3.4, -2.6);
    r.solids.push({ k: 'rect', x0: -X, x1: X, z0, z1 });
    // upside-down furniture hanging from the carpet
    const wood = solidMat([0.42, 0.3, 0.18], [0, -1, 0.2]), grey = solidMat([0.25, 0.25, 0.28], [0, -1, 0.2]), blue = solidMat([0.3, 0.45, 0.75], [0, -1, 0.2]);
    const desk = new T.Group(); g.add(desk); desk.position.set(-1.0, 0, -3.5);
    mesh(desk, new T.BoxGeometry(1.5, 0.05, 0.75), wood, 0, H - 0.75, 0);
    [[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]].forEach(([x, z]) => mesh(desk, new T.BoxGeometry(0.05, 0.75, 0.05), wood, x, H - 0.375, z));
    mesh(desk, new T.BoxGeometry(0.62, 0.5, 0.5), grey, 0.25, H - 0.775 - 0.25, 0);
    const clip = F.clip('dreamina', { loop: true }); r.clips.push(clip);
    const tvM = screenMat(clip.uniform, true);
    const tv = mesh(desk, new T.PlaneGeometry(0.5, 0.3), tvM, 0.25, H - 0.775 - 0.25, 0.252);
    F.pickable(tv, () => { if (!clip.playing) { clip.play(); tvM.uniforms.uOn.value = 1; } });
    const chair = (x, z, s, rot) => { const c = new T.Group(); c.position.set(x, 0, z); c.rotation.y = rot; c.scale.setScalar(s); g.add(c);
      c.position.y = H - H * s; // hang from the carpet
      mesh(c, new T.CylinderGeometry(0.03, 0.03, 0.45, 6), grey, 0, H - 0.225, 0); mesh(c, new T.BoxGeometry(0.5, 0.07, 0.5), blue, 0, H - 0.47, 0); mesh(c, new T.BoxGeometry(0.5, 0.6, 0.06), blue, 0, H - 0.47 - 0.33, 0.24); return c; };
    chair(-1.0, -2.8, 1, PI); chair(2.5, -7, 1, 0.6); chair(-6.2, -13, 3.2, 0.4); // and one giant chair
    mesh(g, new T.CylinderGeometry(0.16, 0.16, 1.0, 12), solidMat([0.75, 0.85, 0.95], [0, -1, 0]), 7.5, H - 0.5, -15);
    // the crowned Roomba, cruising the carpet upside down
    const rb = new T.Group(); g.add(rb);
    mesh(rb, new T.CylinderGeometry(0.17, 0.17, 0.08, 24), solidMat([0.12, 0.12, 0.13], [0, -1, 0]), 0, H - 0.04, 0);
    mesh(rb, new T.CylinderGeometry(0.1, 0.075, 0.08, 6, 1, true), glowMat([1.0, 0.8, 0.25]), 0, H - 0.12, 0);
    mesh(rb, new T.SphereGeometry(0.018, 8, 6), glowMat([0.2, 1.0, 0.4]), 0.12, H - 0.085, 0);
    // paper falling up
    const paperM = F.tmat({ frag: 'vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){ vec3 c = vec3(0.95,0.94,0.9); c *= 1.0 - 0.5*step(0.5, fract(uv.y*12.0))*step(0.1, uv.x)*step(uv.x, 0.9)*0.3; return c; }', side: T.DoubleSide });
    const NPp = 28, papers = new T.InstancedMesh(new T.PlaneGeometry(0.21, 0.297), paperM, NPp); g.add(papers);
    const pd = []; const spawn = (p, y) => { p.x = -8 + Math.random() * 16; p.z = -17 + Math.random() * 18; p.y = y; p.v = 0.12 + Math.random() * 0.2; p.a = Math.random() * 6; p.s = 0.5 + Math.random(); };
    for (let i = 0; i < NPp; i++) { const p = {}; spawn(p, Math.random() * 4); pd.push(p); }
    const dm = new T.Object3D();
    // the exit sign is upside down too
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96; const sg = sc.getContext('2d');
    sg.fillStyle = '#100'; sg.fillRect(0, 0, 256, 96); sg.translate(128, 48); sg.rotate(PI); sg.fillStyle = '#ff3b2f'; sg.font = 'bold 64px Arial'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('EXIT', 0, 4);
    const st = new T.CanvasTexture(sc); st.encoding = T.sRGBEncoding; r.disposables.push(st);
    mesh(g, new T.PlaneGeometry(0.6, 0.22), screenMat({ value: st }), 5.5, 2.75, z0 + 0.03).material.uniforms.uOn.value = 1;
    const pm = portalMat([1.0, 0.75, 0.6], [0.45, 0.35, 0.85], 1);
    mesh(g, new T.PlaneGeometry(1.4, 2.3), pm, 5.5, 1.15, z0 + 0.03);
    r.portals.push({ x: 5.5, z: z0 + 0.7, r: 0.85, to: 5 });
    r.start = [0, 0.5, 0]; r.fog = [0.25, 0.2, 0.12, 0.03];
    let beepT = 4;
    r.update = (dt, t) => {
      const P = F.player;
      const rx = -0.6 + Math.sin(t * 0.11) * 2.0, rz = -8 + Math.sin(t * 0.07) * 6.5, rx2 = -0.6 + Math.sin((t + 0.1) * 0.11) * 2.0, rz2 = -8 + Math.sin((t + 0.1) * 0.07) * 6.5;
      rb.position.set(rx, 0, rz); rb.rotation.y = Math.atan2(rx2 - rx, rz2 - rz);
      if ((beepT -= dt) < 0) { beepT = 7 + Math.random() * 6; F.tone(880, 0.12, { type: 'square', vol: 0.04, pos: [rx, H - 0.1, rz] }); setTimeout(() => F.tone(1320, 0.14, { type: 'square', vol: 0.04, pos: [rx, H - 0.1, rz] }), 150); }
      for (let i = 0; i < NPp; i++) { const p = pd[i]; p.y += p.v * dt * (0.4 + 0.6 * F.U.uK.value); if (p.y > H - 0.05) spawn(p, 0.05); dm.position.set(p.x + Math.sin(t * 0.6 + p.a) * 0.15, p.y, p.z); dm.rotation.set(Math.sin(t * 0.5 + p.a) * 0.9 + 1.2, p.a + t * 0.2 * p.s, Math.cos(t * 0.4 + p.a) * 0.4); dm.updateMatrix(); papers.setMatrixAt(i, dm.matrix); }
      papers.instanceMatrix.needsUpdate = true;
      const dtv = Math.hypot(P.x + 0.75, P.z + 3.25);
      if (!clip.playing && dtv < 3.0) { clip.play(); tvM.uniforms.uOn.value = 1; }
      if (clip.playing && dtv > 7) { clip.stop(); tvM.uniforms.uOn.value = 0; }
    };
    return r;
  }
});

// ============================================================ 5 · THE SONG IS THE ROOM
F.ROOMS.push({
  name: 'THE SONG IS THE ROOM', music: 'r5',
  line: 'Check the Papers, Miles, turned into a landscape. The music starts where you stand and ripples out.',
  edge: [0.5, 1.0, 0.7], veil: [[0.4, 1.0, 0.7], [0.15, 0.05, 0.4]], prefetch: ['still_eagle'],
  build() {
    const r = room(), g = r.group;
    r.music = { vol: 0.95, loop: true };
    const NB = 32, NR = 24, data = new Uint8Array(NB * NR * 4);
    const spec = new T.DataTexture(data, NB, NR, T.RGBAFormat); spec.magFilter = T.LinearFilter; spec.minFilter = T.LinearFilter; spec.needsUpdate = true; r.disposables.push(spec);
    const A = { uSpec: { value: spec }, uBass: { value: 0 }, uMid: { value: 0 } };
    // obelisks
    const pos = [], cells = new Map(), SZ = 2;
    for (let x = -21; x <= 21; x += 1.9) for (let z = -21; z <= 21; z += 1.9) {
      const px = x + (Math.random() - 0.5) * 0.7, pz = z + (Math.random() - 0.5) * 0.7, d = Math.hypot(px, pz);
      if (d > 20.5 || Math.hypot(px, pz - 15) < 3 || Math.hypot(px, pz + 18) < 3.2) continue;
      pos.push([px, pz]); const k = Math.floor(px / SZ) + ',' + Math.floor(pz / SZ); if (!cells.has(k)) cells.set(k, []); cells.get(k).push([px, pz, 0.3]);
    }
    const ob = F.tmat({
      uniforms: A,
      vpars: 'uniform sampler2D uSpec; attribute float aSeed; varying float vV, vBin, vH;\n',
      local: `float hh = 1.0; vV = 0.0; vBin = 0.0;
#ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); vec2 rel = ip - uPlayer.xz; float dd = length(rel);
        float an = atan(rel.y, rel.x); float bin = abs(fract(an/6.28318 + 0.25)*2.0 - 1.0);
        float row = clamp(dd/26.0, 0.0, 1.0);
        float v = texture2D(uSpec, vec2(bin*0.94 + 0.03, row*0.94 + 0.03)).r;
        hh = 0.35 + (3.4*v + 0.35*aSeed)*clamp(uK, 0.25, 1.6); vV = v; vBin = bin;
#endif
        p.y *= hh; vH = hh;`,
      fpars: 'varying float vV, vBin, vH;\n',
      frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        vec3 c = pal(vBin*0.85 + uTT*0.012, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0,0.33,0.67));
        float gl = exp(-glyph(vec2(uv.x*3.0, wp.y*2.2), 9.0)*25.0);
        vec3 col = c*(0.1 + 0.75*vV) + c*gl*(0.2 + 0.8*vV);
        col *= 0.55 + 0.45*smoothstep(0.0, vH, wp.y);
        return col; }`
    });
    const geo = new T.CylinderGeometry(0.16, 0.3, 1, 4, 1); geo.translate(0, 0.5, 0); geo.rotateY(PI / 4);
    const seeds = new Float32Array(pos.length); for (let i = 0; i < pos.length; i++) seeds[i] = Math.random();
    geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 1));
    const inst = new T.InstancedMesh(geo, ob, pos.length); const dm = new T.Object3D();
    pos.forEach((p, i) => { dm.position.set(p[0], 0, p[1]); dm.rotation.y = Math.random() * PI; dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); });
    inst.frustumCulled = false; g.add(inst);
    const ground = F.tmat({ uniforms: A, fpars: 'uniform float uBass, uMid;\n', frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz; float d = length(q - uPlayer.xz);
      vec3 col = vec3(0.02,0.018,0.03) + 0.03*fbm3(q*0.5);
      float ring = pow(0.5+0.5*sin((d - uTT*1.4)*1.8), 14.0) * exp(-d*0.09);
      col += pal(d*0.04 + uTT*0.01, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0,0.33,0.67))*ring*(0.12 + 0.45*uBass);
      float gd = glyph(q*0.7, 4.0); col += vec3(0.4,0.9,0.7)*exp(-gd*30.0)*0.08;
      return col; }` });
    mesh(g, new T.CircleGeometry(60, 48), ground).rotation.x = -PI / 2;
    const sky = F.tmat({ uniforms: A, fpars: 'uniform float uBass, uMid;\n', frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec3 d = normalize(wp); float h = d.y;
      float band = fbm3(vec2(atan(d.x, d.z)*2.5, h*3.5 - uTT*0.025));
      vec3 au = pal(band + uTT*0.01, vec3(0.5), vec3(0.5), vec3(1.0,0.7,0.4), vec3(0.0,0.15,0.2));
      vec3 col = au*smoothstep(0.03,0.45,h)*smoothstep(1.0,0.35,h)*(0.12 + 0.35*uMid)*smoothstep(0.3,0.7,band);
      col += vec3(0.8,0.85,1.0)*step(0.9965, h21(floor(d.xy*260.0 + d.z*97.0)))*step(0.05,h)*0.8;
      return col; }`, side: T.BackSide, noFog: true });
    mesh(g, new T.SphereGeometry(55, 32, 16), sky);
    // the ring to the last room
    mesh(g, new T.TorusGeometry(1.7, 0.1, 8, 64), glowMat([0.6, 1.0, 0.8], 1), 0, 1.8, -18);
    const pm = portalMat([0.85, 0.75, 1.0], [0.25, 0.05, 0.45], 0);
    mesh(g, new T.CircleGeometry(1.62, 48), pm, 0, 1.8, -18);
    r.solids.push({ k: 'in', r: 22 }, { k: 'grid', cells, size: SZ });
    r.portals.push({ x: 0, z: -18, r: 1.0, to: 6 });
    r.start = [0, 15, 0]; r.fog = [0.01, 0.01, 0.025, 0.028];
    // listen: 32 bands, newest row first; every 1/30 s the old rows move one step outward
    const fd = new Uint8Array(F.analyser.frequencyBinCount), sm = new Float32Array(NB);
    const edges = []; for (let i = 0; i <= NB; i++) edges.push(Math.round(1 + (200 - 1) * (Math.pow(2, i / NB * 7) - 1) / 127));
    let acc = 0, quiet = 0, bass = 0, mid = 0;
    r.update = (dt, t) => {
      acc += dt; if (acc < 1 / 30) return; acc = 0;
      F.analyser.getByteFrequencyData(fd);
      let sum = 0; for (let i = 0; i < fd.length; i++) sum += fd[i];
      quiet = sum < 50 ? quiet + 1 / 30 : 0;
      data.copyWithin(NB * 4, 0, NB * 4 * (NR - 1));
      for (let b = 0; b < NB; b++) {
        let v = 0, n = 0; for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) { v += fd[k]; n++; } v = n ? v / n : 0;
        let x = F.clamp((v - 70) / 150, 0, 1) * (0.8 + 0.4 * b / NB);
        if (quiet > 1.5) x = 0.35 + 0.3 * Math.sin(t * 1.3 + b * 0.4) * Math.sin(t * 0.37 + b * 0.11); // no signal: dream one up
        sm[b] += (x - sm[b]) * (x > sm[b] ? 0.45 : 0.12);
        const by = Math.round(F.clamp(sm[b], 0, 1) * 255); data[b * 4] = by; data[b * 4 + 1] = by; data[b * 4 + 2] = by; data[b * 4 + 3] = 255;
      }
      spec.needsUpdate = true;
      const nb = (sm[0] + sm[1] + sm[2] + sm[3]) / 4, nm = (sm[10] + sm[12] + sm[14] + sm[16]) / 4;
      bass += (nb - bass) * (nb > bass ? 0.3 : 0.08); mid += (nm - mid) * 0.08;
      A.uBass.value = bass; A.uMid.value = mid;
    };
    return r;
  }
});

// ============================================================ 6 · THE SIGNAL SEES YOU
F.ROOMS.push({
  name: 'THE SIGNAL SEES YOU', music: 'r6',
  line: 'Stand still in the middle of the stone. Let it look at you.',
  edge: [0.95, 0.85, 1.0], veil: [[0.95, 0.85, 1.0], [0.3, 0.1, 0.45]], prefetch: ['still_monastery'],
  build() {
    const r = room(), g = r.group;
    const sky = F.tmat({ frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec3 d = normalize(wp - vec3(0.0,1.6,0.0));
      // lighter for the headset: a slow two-layer nebula instead of a 9-step fractal (no fine shimmer, steady frame rate)
      float an = atan(d.x, d.z); vec2 p = vec2(an*1.3, d.y*2.2);
      float w = fbm3(p*1.4 + vec2(uTT*0.006, 0.0));
      float v = fbm3(p*2.1 + w*1.8 - vec2(0.0, uTT*0.004));
      vec3 col = pal(v*0.9 + d.y*0.25 + uTT*0.006, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0,0.33,0.67));
      col *= 0.32 + 0.6*smoothstep(0.35, 0.85, v);
      col += vec3(0.55,0.45,0.75)*smoothstep(0.55, 1.0, d.y*0.5 + w*0.6)*0.18;
      col = col/(1.0 + col);
      return col*1.15; }`, side: T.BackSide, noFog: true });
    mesh(g, new T.SphereGeometry(90, 32, 16), sky);
    const trail = []; for (let i = 0; i < 12; i++) trail.push(new T.Vector3(0, 0, -99));
    const stone = F.tmat({ uniforms: { uTr: { value: trail } }, fpars: 'uniform vec3 uTr[12];\n', frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
      vec2 q = wp.xz; float r = length(q); float an = atan(q.y, q.x);
      vec3 col = vec3(0.16,0.14,0.13)*(0.6 + 0.6*fbm3(q*1.2)) ;
      float ringId = floor(r/1.4); float rf = fract(r/1.4);
      float gd = glyph(vec2(an*(ringId+1.0)*1.6 + uTT*0.05*(mod(ringId,2.0)*2.0-1.0), rf*1.0 + ringId*3.0), 13.0);
      col += vec3(1.0,0.75,0.35)*exp(-gd*28.0)*0.55*(0.6+0.4*sin(uTT*0.5 + ringId));
      col += vec3(0.4,0.9,1.0)*smoothstep(0.015,0.0,abs(rf-0.02))*0.5;
      float tr = 0.0; for (int i = 0; i < 12; i++) { vec3 t = uTr[i]; tr += exp(-length(q - t.xy)*3.0) * t.z; }
      col += pal(r*0.1 + uTT*0.02, vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.0,0.33,0.67))*tr*0.35;
      col += vec3(0.9,0.8,1.0)*exp(-r*2.2)*0.4;
      return col; }` });
    mesh(g, new T.CylinderGeometry(7, 5.4, 1.2, 48, 1), stone, 0, -0.6, 0);
    const rim = mesh(g, new T.TorusGeometry(7, 0.04, 6, 96), glowMat([0.9, 0.8, 1.0], 1), 0, 0.02, 0); rim.rotation.x = PI / 2;
    // the eye in the sky; its iris shows the eagle when it is looking at you properly
    const clip = F.clip('eagle', { loop: true }); r.clips.push(clip);
    const eyeM = F.tmat({
      uniforms: { uTex: clip.uniform, uPupil: { value: 0.2 } }, vpars: 'varying vec3 vL;\n', local: 'vL = normalize(position);',
      fpars: 'uniform sampler2D uTex; uniform float uPupil; varying vec3 vL;\n',
      frag: `vec3 shade(vec3 wp, vec3 n, vec2 uv, inout float alpha){
        float ang = acos(clamp(vL.z, -1.0, 1.0)); float ia = 0.62, pa = mix(0.1, 0.38, uPupil);
        vec3 col = vec3(0.82,0.78,0.9)*(0.85 + 0.15*noise(vL.xy*12.0));
        col = mix(col, vec3(0.7,0.15,0.35), smoothstep(0.03,0.0,abs(fbm3(vL.xy*5.0 + vL.z*3.0)-0.5))*smoothstep(0.8,1.6,ang)*0.7);
        vec2 su = vL.xy/sin(ia)*0.5 + 0.5;
        vec3 iris = texture2D(uTex, vec2(su.x, su.y)).rgb*1.2;
        float an = atan(vL.y, vL.x);
        iris = mix(iris, hue(vec3(0.9,0.6,0.2), uTT*0.05)*(0.6+0.4*sin(an*40.0)), 0.3);
        col = mix(col, iris, smoothstep(ia + 0.02, ia - 0.02, ang));
        vec3 deep = pal(ang*3.0 - uTT*0.1, vec3(0.3), vec3(0.3), vec3(1.0), vec3(0.6,0.4,0.2))*0.4;
        col = mix(col, deep, smoothstep(pa + 0.015, pa - 0.015, ang));
        return col; }`, noFog: true
    });
    const eye = mesh(g, new T.SphereGeometry(5, 32, 20), eyeM, 0, 11, -42);
    F.pickable(eye, () => clip.play());
    // the gate home
    mesh(g, new T.TorusGeometry(1.5, 0.08, 8, 64), glowMat([1.0, 0.75, 0.35], 1), 0, 1.6, 6.05);
    const pm = portalMat([1.0, 0.65, 0.3], [0.15, 0.05, 0.3], 0); pm.uniforms.uOpen.value = 0.2;
    mesh(g, new T.CircleGeometry(1.42, 48), pm, 0, 1.6, 6.05).rotation.y = PI;
    let seen = false, stillC = 0, nagT = 0;
    r.portals.push({ x: 0, z: 5.9, r: 0.85, onCross: () => {
      if (seen || r.t > 50) F.goRoom(0, { loopBack: true });
      else if (nagT <= 0) { nagT = 6; F.message('Not yet. Let it look at you first: stand still in the middle.', 5); }
    } });
    r.solids.push({ k: 'in', r: 6.6 });
    r.start = [0, 3.2, 0]; r.fog = [0.03, 0.02, 0.05, 0.0];
    // light trails from your hands, in VR
    const lines = F.controllers.map((c, i) => {
      const N = 40, geo = new T.BufferGeometry(), arr = new Float32Array(N * 3), colr = new Float32Array(N * 3);
      for (let k = 0; k < N; k++) { const cc = new T.Color().setHSL((i * 0.35 + k / N * 0.5) % 1, 0.9, 0.6); const f = 1 - k / N; colr[k * 3] = cc.r * f; colr[k * 3 + 1] = cc.g * f; colr[k * 3 + 2] = cc.b * f; }
      geo.setAttribute('position', new T.BufferAttribute(arr, 3)); geo.setAttribute('color', new T.BufferAttribute(colr, 3));
      const ln = new T.Line(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); ln.frustumCulled = false; g.add(ln); return { ln, arr, c, N, init: false };
    });
    const _v = new T.Vector3(), _t = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4();
    let trT = 0, ti = 0;
    r.update = (dt) => {
      const P = F.player, dc = Math.hypot(P.x, P.z);
      if (dc < 1.6 && P.still > 0.4) stillC += dt; else stillC = Math.max(0, stillC - dt * 0.5);
      if (!seen && stillC > 5) { seen = true; clip.play(); F.message('It sees you. The gate behind you is open now.', 7); F.tone(110, 6, { vol: 0.12, att: 2 }); F.tone(164.8, 6, { vol: 0.08, att: 2.5 }); }
      if (nagT > 0) nagT -= dt;
      const want = seen ? 0.85 : 0.15 + 0.5 * F.clamp(stillC / 5, 0, 1);
      eyeM.uniforms.uPupil.value += (want - eyeM.uniforms.uPupil.value) * Math.min(1, dt * 0.6);
      pm.uniforms.uOpen.value += ((seen || r.t > 50 ? 1 : 0.2) - pm.uniforms.uOpen.value) * Math.min(1, dt);
      // the eye turns, slowly, to look at you
      _t.copy(F.headPos || _t); _m.lookAt(_t, eye.position, eye.up); _q.setFromRotationMatrix(_m);
      // (Matrix4.lookAt(target, position) gives +z toward the target, the same as Object3D.lookAt: the iris faces you)
      eye.quaternion.slerp(_q, Math.min(1, dt * 0.5));
      // your footsteps glow on the stone and fade
      trT += dt; if (trT > 0.35) { trT = 0; const last = trail[(ti + 11) % 12]; if (Math.hypot(last.x - P.x, last.y - P.z) > 0.35) { trail[ti].set(P.x, P.z, 1); ti = (ti + 1) % 12; } }
      trail.forEach(t => { t.z = Math.max(0, t.z - dt / 6); });
      lines.forEach(L => {
        L.ln.visible = F.isVR();
        if (!L.ln.visible) return;
        L.c.getWorldPosition(_v);
        if (!L.init) { for (let k = 0; k < L.N; k++) L.arr.set([_v.x, _v.y, _v.z], k * 3); L.init = true; }
        L.arr.copyWithin(3, 0, (L.N - 1) * 3); L.arr[0] = _v.x; L.arr[1] = _v.y; L.arr[2] = _v.z; L.ln.geometry.attributes.position.needsUpdate = true;
      });
    };
    return r;
  }
});
})();
