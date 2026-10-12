// Tiếng robot tổng hợp bằng oscillator (kiểu R2), không file âm thanh. Miệng nhép theo biên độ qua level().
import { SOUND_IDS } from './sounds.js';
export { SOUND_IDS };

// Mỗi âm: danh sách nốt {f: tần số, to?: trượt tới, d: giây, at: trễ, type, v: âm lượng, vib?: độ rung}
const N = (f, d, at = 0, o = {}) => ({ f, d, at, ...o });
export const PATTERNS = {
  beep: [N(880, 0.08, 0, { type: 'square', v: 0.5 })],
  happy: [N(520, 0.09, 0, { type: 'triangle' }), N(660, 0.09, 0.1, { type: 'triangle' }), N(880, 0.14, 0.2, { type: 'triangle' })],
  joy: [N(600, 0.07), N(800, 0.07, 0.08), N(1000, 0.07, 0.16), N(1300, 0.07, 0.24), N(1000, 0.05, 0.32), N(1500, 0.14, 0.38)].map((n) => ({ type: 'triangle', ...n })),
  love: [N(500, 0.45, 0, { to: 900, type: 'sine', vib: 8 }), N(900, 0.3, 0.45, { to: 700, type: 'sine', vib: 8 })],
  sad: [N(620, 0.7, 0, { to: 280, type: 'triangle', v: 0.45 })],
  surprise: [N(1500, 0.1, 0, { to: 1900, type: 'square', v: 0.4 })],
  scream: [N(900, 0.3, 0, { to: 2300, type: 'sawtooth', vib: 30, v: 0.4 }), N(2300, 0.25, 0.3, { to: 1000, type: 'sawtooth', vib: 30, v: 0.4 })],
  angry: [N(150, 0.22, 0, { to: 110, type: 'sawtooth', v: 0.5 }), N(140, 0.25, 0.3, { to: 100, type: 'sawtooth', v: 0.5 })],
  annoyed: [N(320, 0.1, 0, { type: 'square', v: 0.4 }), N(260, 0.14, 0.14, { type: 'square', v: 0.4 })],
  curious: [N(500, 0.16, 0, { to: 900, type: 'sine' }), N(700, 0.14, 0.24, { to: 1050, type: 'sine' })],
  confused: [N(700, 0.2, 0, { to: 480, type: 'triangle', vib: 12 }), N(520, 0.25, 0.22, { to: 800, type: 'triangle', vib: 12 })],
  dizzy: [N(600, 0.9, 0, { to: 1000, type: 'sine', vib: 7 }), N(1000, 0.5, 0.9, { to: 450, type: 'sine', vib: 7 })],
  yawn: [N(480, 1.0, 0, { to: 180, type: 'sine', v: 0.4, vib: 3 })],
  hello: [N(700, 0.08, 0, { type: 'triangle' }), N(900, 0.08, 0.1, { type: 'triangle' }), N(1250, 0.14, 0.2, { type: 'triangle' })],
  wake: [N(400, 0.12, 0, { type: 'triangle' }), N(560, 0.12, 0.16, { type: 'triangle' }), N(840, 0.2, 0.32, { type: 'triangle' })],
  sleep: [N(500, 0.25, 0, { type: 'sine', v: 0.3 }), N(400, 0.25, 0.3, { type: 'sine', v: 0.25 }), N(300, 0.4, 0.6, { type: 'sine', v: 0.2 })],
  cold: Array.from({ length: 10 }, (_, i) => N(800, 0.04, i * 0.07, { type: 'square', v: 0.3 })),
  gulp: [N(420, 0.13, 0, { to: 160, type: 'sine', v: 0.6 }), N(900, 0.04, 0.14, { to: 1500, type: 'sine', v: 0.25 }), N(420, 0.13, 0.4, { to: 160, type: 'sine', v: 0.6 }), N(900, 0.04, 0.54, { to: 1500, type: 'sine', v: 0.25 })],
};

export class Chirp {
  constructor() { this.ctx = null; this.master = null; this.an = null; this.enabled = true; this.buf = null; this.noise = null; this.unlocked = false; }
  supported() { return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); }
  /** Gọi trong cử chỉ người dùng (luật autoplay). */
  unlock() {
    try {
      if (!this.supported()) return false;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
        this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
        this.an = this.ctx.createAnalyser(); this.an.fftSize = 512; this.buf = new Float32Array(this.an.fftSize);
        this.master.connect(comp); comp.connect(this.an); comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5, nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = nb.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = nb;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      this.unlocked = true; return true;
    } catch { return false; }
  }
  /** Biên độ RMS hiện tại 0..1 (cho nhép miệng). */
  level() {
    if (!this.an) return 0;
    try { this.an.getFloatTimeDomainData(this.buf); let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i]; return Math.min(1, Math.sqrt(s / this.buf.length) * 5); } catch { return 0; }
  }
  tone(n, t0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = n.type || 'sine';
    const t = t0 + (n.at || 0); o.frequency.setValueAtTime(n.f, t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
    if (n.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = n.vib; lg.gain.value = n.f * 0.03; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + n.d + 0.05); }
    const v = (n.v ?? 0.6) * 0.5; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + n.d + 0.03);
  }
  click(t, f = 1800) {
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2;
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.06);
  }
  play(id) {
    if (!this.enabled || !this.unlocked || !this.ctx) return false;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime + 0.01;
      if (id === 'purr') { this._purr(t0); return true; }
      if (id === 'chew') { for (let i = 0; i < 6; i++) this.click(t0 + i * 0.145, 1400 + (i % 2) * 500); return true; }
      if (id === 'glitch') { for (let i = 0; i < 6; i++) { this.click(t0 + i * 0.04, 800 + Math.random() * 3000); this.tone({ f: 200 + Math.random() * 1800, d: 0.04, at: i * 0.045, type: 'square', v: 0.4 }, t0); } return true; }
      const p = PATTERNS[id] || PATTERNS.beep; for (const n of p) this.tone(n, t0); return true;
    } catch { return false; }
  }
  _purr(t0) {
    const c = this.ctx, o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), g = c.createGain(), lf = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 78; m.frequency.value = 31; mg.gain.value = 25; m.connect(mg); mg.connect(o.frequency);
    lf.frequency.value = 24; lg.gain.value = 0.25; g.gain.value = 0.3; lf.connect(lg); lg.connect(g.gain); lp.type = 'lowpass'; lp.frequency.value = 420;
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(0.9, t0 + 0.15); env.gain.setValueAtTime(0.9, t0 + 1.0); env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    o.connect(g); g.connect(lp); lp.connect(env); env.connect(this.master); for (const x of [o, m, lf]) { x.start(t0); x.stop(t0 + 1.5); }
  }
}
