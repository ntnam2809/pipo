// Animator: blend preset + lớp "sống" (thở, chớp, saccade, nhìn, lệch hai mắt) -> lò xo -> frame cho renderer.
// Thuần logic: không đụng DOM/window.
import { Spring } from '../core/spring.js';
import { PARAMS, KEYS, GROUP_SPRING, defaultEye, clampEye, lerpEye, clamp } from './params.js';
import { MOUTH_PARAMS, MOUTH_KEYS, MOUTH_SPRING, defaultMouth, clampMouth, lerpMouth } from './mouth.js';
import { getExpression, isExpression } from './expressions.js';

export const THEMES = {
  cyan: { label: 'Cyan', h: 188, s: 95, l: 58 },
  pink: { label: 'Hồng', h: 330, s: 88, l: 68 },
  amber: { label: 'Hổ phách', h: 38, s: 100, l: 58 },
  green: { label: 'Xanh lá', h: 138, s: 80, l: 56 },
  white: { label: 'Trắng', h: 200, s: 10, l: 88 },
  rainbow: { label: 'Cầu vồng', h: 0, s: 90, l: 62, rainbow: true },
};

const hueLerp = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
const ease = (x) => x * x * (3 - 2 * x);

class EyeState {
  constructor() {
    const d = defaultEye();
    this.sp = {};
    for (const k of KEYS) this.sp[k] = new Spring(d[k], 200, 0.8);
    this.shape = 'normal'; this.morph = null; this.shapeScale = 1; this.spin = 0;
  }
}
class MouthState {
  constructor() {
    const d = defaultMouth();
    this.sp = {};
    for (const k of MOUTH_KEYS) this.sp[k] = new Spring(d[k], 200, 0.8);
    this.shape = 'smile'; this.morph = null; this.shapeScale = 1;
  }
}

function stepMorph(st, wanted, dt, canMorph = true) {
  if (!canMorph) { st.shape = wanted; st.morph = null; st.shapeScale = 1; return; }
  if (!st.morph && wanted !== st.shape) st.morph = { phase: 1, t: 0 };
  if (st.morph) {
    st.morph.t += dt;
    if (st.morph.phase === 1) {
      const u = Math.min(1, st.morph.t / 0.11);
      st.shapeScale = 1 - ease(u);
      if (u >= 1) { st.shape = wanted; st.morph = { phase: 2, t: 0 }; }
    } else {
      const u = Math.min(1, st.morph.t / 0.18);
      // ease-out-back: nở ra có overshoot nhẹ (pop)
      const c1 = 2.2, c3 = c1 + 1;
      st.shapeScale = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
      if (u >= 1) { st.morph = null; st.shapeScale = 1; if (wanted !== st.shape) st.morph = { phase: 1, t: 0 }; }
    }
  } else st.shapeScale = 1;
}

export class Animator {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.t = 0;
    this.L = new EyeState(); this.R = new EyeState(); this.M = new MouthState();
    this.base = { id: 'neutral', intensity: 1 };
    this.overlay = null;
    this.curId = 'neutral'; this.loopStart = 0;
    this.theme = THEMES.cyan; this.themeKey = 'cyan'; this.style = 'solid';
    this.color = { h: 188, s: 95, l: 58 };
    this.looks = {}; // nguồn nhìn: {touch:{x,y,t}, face, motion, compass}
    this.grav = { x: 0, y: 1, z: 0 };
    this.gravS = { x: new Spring(0, 90, 0.8), y: new Spring(0, 90, 0.8) };
    this.upsideDown = false; this.roll = new Spring(0, 60, 0.7);
    this.blink = null; this.nextBlink = 2 + this.rng() * 3; this.pendingDouble = null;
    this.lag = 0.025; this.hist = [];
    this.sacc = { x: 0, y: 0, rx: 1, ry: 1, next: 0.8 }; this.explore = null; this.nextExplore = 9 + this.rng() * 6; this.lastLookT = 0;
    this.voiceAmp = 0; this.voiceAmpS = 0;
    this.clock = null; this.feed = 0; this.mouthOv = null; this.lick = 0; this.press = null; this.nextPress = 7 + this.rng() * 6;
    this.yawn = null; this.nextYawn = 6; this.fxExtra = [];
    this.dim = 0; this.pulse = 0;
  }

  // ---- API cho main/brain ----
  setTheme(key, style) { if (THEMES[key]) { this.theme = THEMES[key]; this.themeKey = key; } if (style) this.style = style; }
  setBase(id, intensity = 1) { this.base = { id: isExpression(id) ? id : 'neutral', intensity: clamp(intensity, 0, 1) }; }
  applyIntent(it) {
    if (!it) return;
    const id = isExpression(it.expression) ? it.expression : 'neutral';
    const dur = clamp(Number(it.duration) || 2000, 150, 60000) / 1000;
    this.overlay = {
      id, intensity: clamp(it.intensity ?? 1, 0, 1), until: this.t + dur, lookAt: it.lookAt || null,
      headShake: !!it.headShake, fx: it.fx || [], seq: it.lookSeq ? { t0: this.t, steps: it.lookSeq } : null, bounce: !!it.bounce, tag: it.tag || null,
    };
  }
  clearOverlay() { this.overlay = null; }
  setLook(src, x, y, ttl = 1.5) { this.looks[src] = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: this.t + ttl }; this.lastLookT = this.t; }
  clearLook(src) { delete this.looks[src]; }
  setTilt(gx, gy, gz = 0) { this.grav.x = gx; this.grav.y = gy; this.grav.z = gz; }
  setUpsideDown(b) { this.upsideDown = !!b; }
  setVoiceAmp(a) { this.voiceAmp = clamp(a, 0, 1); }
  showClock(texts, sec = 3) { this.clock = { texts, until: this.t + sec }; }
  setFeedApproach(p) { this.feed = clamp(p, 0, 1); }
  bite() { this.mouthOv = { until: this.t + 0.16, p: { open: 0, curve: 0.35, shape: 'smile', mw: 0.7 } }; this.lickAt = this.t + 1.1; this.blinkNow(); }
  triggerLick(sec = 0.3) { this.lick = this.t + sec; }
  /** Đổi dáng miệng tức thời một lúc (hát: o <-> cười theo nhịp). */
  pulseMouth(shape = 'o', sec = 0.18) { const p = shape === 'o' ? { shape: 'o', round: 0.85, open: 0.5, mw: 0.58, curve: 0 } : { shape, open: 0.3 }; this.mouthOv = { until: this.t + sec, p }; }
  get overlayTag() { return this.overlay ? this.overlay.tag : null; }
  get overlayLeft() { return this.overlay ? this.overlay.until - this.t : 0; }
  triggerYawn() { this.yawn = { t0: this.t }; }
  blinkNow() { if (!this.blink) this.blink = { t0: this.t, dur: 0.13 }; }
  jolt(amount = 0.5) { this.pulse = amount; }
  get expressionId() { return this.curId; }

  // ---- nội bộ ----
  _active() {
    if (this.overlay && this.t > this.overlay.until) this.overlay = null;
    return this.overlay || this.base;
  }
  _lookVec() {
    if (this.overlay && this.overlay.seq) {
      const u = (this.t - this.overlay.seq.t0) * 1000; let cur = null;
      for (const s of this.overlay.seq.steps) if (u >= s.t) cur = s;
      if (cur) return { x: cur.x, y: cur.y, forced: true };
    }
    if (this.overlay && this.overlay.lookAt) return { ...this.overlay.lookAt, forced: true };
    for (const k of ['touch', 'face', 'motion', 'compass']) {
      const s = this.looks[k];
      if (s && this.t < s.until) return { x: s.x, y: s.y, src: k };
    }
    if (this.explore) return { x: this.explore.x, y: this.explore.y, src: 'explore' };
    return null;
  }

  _blend(preset, k) {
    const nL = defaultEye(), nM = defaultMouth();
    return { L: lerpEye(nL, preset.left, k), R: lerpEye(nL, preset.right, k), M: lerpMouth(nM, preset.mouth, k) };
  }

  _loop(preset, tl, tg) {
    const lp = preset.loop; if (!lp) return;
    const d = {}; const u = tl;
    const osc = (period, abs) => { const s = Math.sin((2 * Math.PI * u) / period); return abs ? Math.abs(s) : s; };
    const a = osc(lp.period || 1, lp.abs);
    for (const k of ['w', 'h', 'x', 'tilt', 'lidTop', 'pupilX', 'pupilY']) if (lp[k]) { tg.L[k] += lp[k] * a; tg.R[k] += lp[k] * a; }
    if (lp.y) { const dy = lp.abs ? -lp.y * a : lp.y * a; tg.L.y += dy; tg.R.y += dy; }
    if (lp.open) tg.M.open += lp.open * a;
    if (lp.round) tg.M.round += lp.round * a;
    if (lp.my) tg.M.my += lp.my * (lp.abs ? -a : a);
    if (lp.mx) tg.M.mx += lp.mx * osc(lp.mxPeriod || lp.period || 1, false);
    if (lp.spin) { this.L.spin += lp.spin * this._dt; this.R.spin += lp.spin * this._dt; }
  }

  update(dtIn) {
    const dt = clamp(dtIn, 0.0005, 0.05); this._dt = dt; this.t += dt; const t = this.t;
    if (this.clock && t > this.clock.until) this.clock = null;
    const act = this._active();
    if (this.curId !== act.id) { this.curId = act.id; this.loopStart = t; if (act.id === 'sleepy') this.nextYawn = t + 3 + this.rng() * 3; }
    const preset = getExpression(act.id);
    const tg = this._blend(preset, act.intensity);
    const tl = t - this.loopStart;
    this._loop(preset, tl, tg);
    const calm = !['surprised', 'shocked', 'angry', 'scared', 'glitch'].includes(act.id);

    // --- nhìn ---
    // tự liếc khám phá khi idle lâu
    if (!this._lookVec() && !this.explore && t - this.lastLookT > this.nextExplore) {
      const c = [[0.8, -0.5], [-0.8, -0.5], [0.8, 0.45], [-0.8, 0.45], [0, -0.8], [-0.9, 0]];
      const p = c[Math.floor(this.rng() * c.length)];
      this.explore = { x: p[0], y: p[1], until: t + 1 + this.rng() * 0.9 };
    }
    if (this.explore && t > this.explore.until) { this.explore = null; this.lastLookT = t; this.nextExplore = 8 + this.rng() * 8; }
    const lv = this._lookVec();
    const lx = lv ? lv.x : 0, ly = lv ? lv.y : 0;
    // micro-saccade
    this.sacc.next -= dt;
    if (this.sacc.next <= 0) {
      const amp = lv && !lv.forced ? 0.05 : 0.11;
      this.sacc.x = (this.rng() - 0.5) * 2 * amp; this.sacc.y = (this.rng() - 0.5) * 2 * amp * 0.7;
      this.sacc.rx = 0.85 + this.rng() * 0.3; this.sacc.ry = 0.85 + this.rng() * 0.3;
      this.sacc.next = 0.4 + this.rng() * 1.1;
    }
    // trọng lực: đồng tử trượt theo
    const upright = clamp(1 - Math.abs(this.grav.z) / 0.9, 0, 1);
    const gLx = this.grav.x * 0.3 * upright, gLy = (this.grav.y - 1) * 0.3 * upright;
    this.gravS.x.update(this.grav.x, dt); this.gravS.y.update(this.grav.y - 1, dt);

    // --- thở ---
    const sleepy = ['sleepy', 'sleeping', 'bored'].includes(act.id), excited = ['excited', 'joy', 'love', 'scared'].includes(act.id);
    const bp = sleepy ? 5.5 : excited ? 2.2 : 4.2;
    const breath = Math.sin((2 * Math.PI * t) / bp);

    // --- chớp ---
    const canBlink = preset.blink > 0 && !['arc', 'line', 'x', 'spiral'].includes(tg.L.shape) && !this.clock;
    if (!this.blink && canBlink && t >= this.nextBlink) {
      this.blink = { t0: t, dur: (sleepy ? 0.24 : 0.13) };
      this.lag = 0.015 + this.rng() * 0.025;
      if (this.rng() < 0.15) this.pendingDouble = t + this.blink.dur + 0.07;
      this.nextBlink = t + (2 + this.rng() * 4) / Math.max(0.2, preset.blink);
    } else if (!this.blink && this.pendingDouble && t >= this.pendingDouble) { this.blink = { t0: t, dur: 0.11 }; this.pendingDouble = null; }
    let b = 0;
    if (this.blink) {
      const u = (t - this.blink.t0) / this.blink.dur;
      if (u >= 1) this.blink = null; else b = u < 0.38 ? ease(u / 0.38) : 1 - ease((u - 0.38) / 0.62);
    }

    // --- ngáp ---
    if (act.id === 'sleepy' && !this.yawn && t > this.nextYawn) { this.yawn = { t0: t }; this.nextYawn = t + 9 + this.rng() * 6; }
    let yawn = 0;
    if (this.yawn) { const u = (t - this.yawn.t0) / 1.7; if (u >= 1) this.yawn = null; else yawn = Math.pow(Math.sin(Math.PI * u), 1.3); }

    // --- áp lớp lên từng mắt ---
    const fxTemp = [];
    for (const [side, e] of [['L', tg.L], ['R', tg.R]]) {
      const sg = side === 'R' ? 1.0 : 1.0;
      if (e.shape === 'normal') {
        e.lidTop = Math.max(e.lidTop, b * 1.12, yawn * 0.95);
        e.w *= 1 + 0.08 * b; e.h *= 1 - 0.1 * b;
      } else if (e.shape === 'heart' || e.shape === 'star') { e.h *= 1 - 0.55 * b; e.w *= 1 + 0.05 * b; }
      e.h *= 1 + 0.015 * breath;
      const wob = e.wobble;
      if (wob > 0) { e.x += (Math.sin(t * 61 + (side === 'R' ? 2 : 0)) * 0.6 + Math.sin(t * 37.3)) * 0.03 * wob; e.y += Math.sin(t * 53 + (side === 'R' ? 1 : 0)) * 0.025 * wob; }
      const kx = side === 'R' ? this.sacc.rx : 1, ky = side === 'R' ? this.sacc.ry : 1;
      e.pupilX += lx + this.sacc.x * kx + gLx; e.pupilY += ly + this.sacc.y * ky + gLy;
      e.x += (lx * 0.14 + this.sacc.x * 0.5) * (e.shape === 'normal' ? 1 : 0.6); e.y += (ly * 0.1 + this.sacc.y * 0.5);
      if (act.headShake) e.x += Math.sin(tl * 22) * 0.1 * Math.min(1, tl * 5);
      if (act.bounce) e.y -= Math.abs(Math.sin(tl * 9)) * 0.1;
      if (this.voiceAmpS > 0.02) { e.h *= 1 + 0.2 * this.voiceAmpS; e.pupil += 0.3 * this.voiceAmpS; e.glow += 0.3 * this.voiceAmpS; }
      if (this.pulse > 0.01) { e.w *= 1 + this.pulse * 0.12; e.h *= 1 + this.pulse * 0.12; }
      if (this.feed > 0 && act.id !== 'eating') { e.h *= 1 + 0.1 * this.feed; e.pupil += 0.2 * this.feed; e.shine = 1; e.pupilY += 0.5 * this.feed; }
      if (this.clock) { Object.assign(e, { shape: 'normal', w: 1.2, h: 1.4, lidTop: 0, lidTopAngle: 0, lidBottom: 0, lidBottomCurve: 0, tilt: 0, radius: 0.5, x: 0, y: 0, pupilX: 0, pupilY: 0 }); }
      void sg;
    }
    this.pulse *= Math.exp(-dt * 6);
    this.voiceAmpS += (this.voiceAmp - this.voiceAmpS) * (1 - Math.exp(-dt * 25));

    // --- miệng: lớp sống ---
    const M = tg.M;
    const idleish = calm && !['eating', 'drinking'].includes(act.id);
    if (idleish) {
      M.my += 0.04 * breath; M.curve += 0.05 * Math.sin(t * 0.9) * (act.id === 'neutral' ? 1 : 0.4);
      M.mx += 0.03 * Math.sin(t * 0.6);
      if (!this.press && t > this.nextPress && ['neutral', 'bored', 'happy'].includes(act.id)) { this.press = { t0: t }; this.nextPress = t + 7 + this.rng() * 8; }
    }
    if (this.press) { const u = (t - this.press.t0) / 0.8; if (u >= 1) this.press = null; else { const a = Math.sin(Math.PI * u); M.curve -= 0.35 * a; M.mw *= 1 - 0.25 * a; M.shape = M.shape === 'smile' ? 'line' : M.shape; } }
    if (this.feed > 0 && act.id !== 'eating') { Object.assign(M, { shape: 'o', round: 0.7, open: 0.2 + 0.7 * this.feed, mw: 0.55 + 0.45 * this.feed, curve: 0 }); }
    if (yawn > 0) { Object.assign(M, { shape: 'o', round: 1, open: 0.95 * yawn, mw: 0.55 + 0.6 * yawn, curve: 0 }); }
    if (this.mouthOv && t < this.mouthOv.until) Object.assign(M, this.mouthOv.p); else this.mouthOv = null;
    if (this.lickAt && t > this.lickAt) { this.lick = t + 0.3; this.lickAt = 0; }
    if (this.lick > t) M.tongue = 1;
    if (this.voiceAmpS > 0.02) { M.open = Math.max(M.open, this.voiceAmpS * 0.95); if (M.shape === 'line' || M.shape === 'smile') M.shape = 'smile'; M.mw *= 1 + 0.15 * this.voiceAmpS; }
    if (this.clock) { M.shape = 'smile'; M.curve = 0.3; M.open = 0; M.mw = 0.6; }

    // --- chuẩn hóa + lag mắt phải ---
    const tL = clampEye(tg.L), tR = clampEye(tg.R), tM = clampMouth(M);
    this.hist.push({ t, p: tR }); while (this.hist.length > 2 && this.hist[1].t <= t - this.lag) this.hist.shift();
    const tRd = this.hist[0].t <= t - this.lag * 0.5 || this.hist.length === 1 ? this.hist[0].p : tR;

    // --- lò xo ---
    const sov = preset.spring || {};
    const gs = (g) => {
      const base = GROUP_SPRING[g]; const o = sov[g] || sov.all;
      return o ? { k: base.k * o[0], zeta: o[1] } : base;
    };
    const lidFast = this.blink ? 2.4 : yawn > 0 ? 0.35 : 1;
    for (const [st, tar] of [[this.L, tL], [this.R, tRd]]) {
      for (const k of KEYS) {
        const g = PARAMS[k][3]; const s = gs(g); const km = g === 'lid' ? lidFast : 1;
        st.sp[k].update(tar[k], dt, s.k * km, s.zeta);
      }
      stepMorph(st, tar.shape, dt, true);
      if (st.shape === 'normal') st.spin *= 0.9;
    }
    for (const k of MOUTH_KEYS) {
      const g = MOUTH_PARAMS[k][3]; const s = MOUTH_SPRING[g];
      this.M.sp[k].update(tM[k], dt, s.k * (sov.all ? Math.min(sov.all[0], 1.5) : 1), g === 'fast' && k === 'open' ? 0.5 : s.zeta);
    }
    stepMorph(this.M, tM.shape, dt, true);

    // --- màu ---
    const th = this.theme; let baseH = th.h;
    if (th.rainbow) baseH = (t * 18) % 360;
    const cs = preset.colorShift; const mix = cs ? cs.mix * act.intensity : 0;
    const th2 = cs && cs.hue != null ? hueLerp(baseH, cs.hue, mix) : baseH;
    const ts = th.s * (cs && cs.sat != null ? cs.sat : 1);
    const tlg = clamp(th.l * (preset.light || 1), 0, 95);
    const kc = 1 - Math.exp(-dt * 5);
    this.color.h = hueLerp(this.color.h, th2, kc); this.color.s += (ts - this.color.s) * kc; this.color.l += (tlg - this.color.l) * kc;

    // --- roll ---
    this.roll.update(this.upsideDown ? Math.PI : 0, dt);

    const out = (st) => {
      const o = { shape: st.shape, shapeScale: st.shapeScale, spin: st.spin };
      for (const k of KEYS) o[k] = clamp(st.sp[k].x, PARAMS[k][0], PARAMS[k][1]);
      return o;
    };
    const mo = { shape: this.M.shape, shapeScale: this.M.shapeScale };
    for (const k of MOUTH_KEYS) mo[k] = clamp(this.M.sp[k].x, MOUTH_PARAMS[k][0], MOUTH_PARAMS[k][1]);
    const fx = [...preset.fx, ...(act.fx || [])];
    return {
      t, L: out(this.L), R: out(this.R), mouth: mo,
      hue: this.color.h, sat: this.color.s, light: this.color.l, style: this.style,
      expression: act.id, intensity: act.intensity, fx, fxOn: fxTemp,
      parallax: { x: this.gravS.x.x, y: this.gravS.y.x, upright },
      roll: this.roll.x, clock: this.clock && t < this.clock.until ? this.clock.texts : null,
      voice: this.voiceAmpS,
    };
  }
}
