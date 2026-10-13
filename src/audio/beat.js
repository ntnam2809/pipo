// Theo dõi nhịp từ phổ âm thanh: onset (spectral flux) -> tempo (tự tương quan) -> pha (PLL) -> nhận diện nhạc.
// Thuần logic (không DOM/WebAudio): gọi push(tSec, mags) mỗi ~20 ms với mags = biên độ phổ tuyến tính (nửa FFT).
const FS = 50, DT = 1 / FS;               // lưới onset 50 Hz
const LMIN = 16, LMAX = 43;               // lag ứng với ~187..70 BPM
const MAXN = 360;                         // giữ ~7 s onset cho tự tương quan
const MINN = 90;                          // cần >= 1,8 s mới phân tích
const AN_EVERY = 12;                      // phân tích mỗi 12 ô (~0,24 s)
const GAMMA = 300;                        // nén log: ln(1 + GAMMA * mag)
const BANDS = [[40, 160], [160, 2000], [2000, 8000]];   // kick · giữa (snare) · cao (hi-hat)
const WGT = [1.5, 0.6, 0.35];
const FLOOR_REF = 0.8;                    // sàn tuyệt đối của chuẩn hóa onset (nhiễu nền không bị khuếch đại)
const ON_HOLD = 1.5, OFF_HOLD = 2.4;      // giữ liên tục (s) để vào/ra trạng thái nhạc
const LOCK_SEC = 2.5;                     // đổi tempo cần bền vững ngần này giây
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Ưu tiên log-Gauss quanh 120 BPM (σ ~ 1 octave). */
export function tempoPrior(bpm) { const o = Math.log2(bpm / 120); return Math.exp(-0.5 * o * o); }

export class BeatTracker {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 44100; this.fftSize = opts.fftSize || 2048;
    this.lead = opts.lead ?? 0.03;        // bắn nhịp sớm ~30 ms để chuyển động đón trước
    const bw = this.sampleRate / this.fftSize, maxBin = this.fftSize / 2 - 1;
    this.rng = BANDS.map(([a, b]) => [clamp(Math.round(a / bw), 1, maxBin - 1), clamp(Math.round(b / bw), 2, maxBin)]);
    this.hiBin = this.rng[2][1];
    this.cur = new Float32Array(this.hiBin + 2); this.prev = new Float32Array(this.hiBin + 2);
    this.reset();
  }

  reset() {
    this.started = false; this.lastT = 0; this.hasPrev = false;
    this.env = []; this.rawRecent = []; this.acc = 0; this.nextClose = 0; this.slot0 = 0; this.nSlots = 0; this.sinceAn = 0;
    this.fluxEma = 0; this.peakRef = 0; this.lvl = { low: 0, mid: 0, high: 0 }; this.lvlS = { e: 0, bass: 0, treble: 0 };
    this.onT = 0; this.offT = 0; this.isMusic = false; this.confidence = 0; this.strength = 0;
    this.bpm = 0; this.cand = 0; this.candT = 0;
    this.locked = false; this.nb = 0; this.beatIndex = 0; this.lastBeatT = -1e9; this.onBeat = false; this.energyOns = 0;
    this.state = this._mkState(0);
  }

  _mkState(t) {
    const P = this.bpm > 0 ? 60 / this.bpm : 0.5;
    let phase = 0;
    if (this.locked) phase = clamp(1 - (this.nb - this.lead - t) / P, 0, 0.999);
    return {
      isMusic: this.isMusic, confidence: this.confidence, bpm: this.bpm, phase, beatIndex: this.beatIndex,
      energy: clamp(this.lvlS.e, 0, 1), bass: clamp(this.lvlS.bass, 0, 1), treble: clamp(this.lvlS.treble, 0, 1), onBeat: this.onBeat,
    };
  }
  /** Trạng thái với pha ngoại suy tới thời điểm t (để đọc mỗi frame giữa hai lần push). */
  stateAt(t) { const s = this._mkState(t); s.onBeat = false; return s; }

  push(t, mags) {
    if (!(t >= 0) || !mags || !mags.length) return this.state;
    if (!this.started) { this.started = true; this.slot0 = t; this.nextClose = t + DT; this.lastT = t; }
    const dt = Math.max(0.001, t - this.lastT); this.lastT = t;
    this.onBeat = false;
    // ---- đặc trưng: log-nén, flux dương có max-filter lân cận, theo ba dải ----
    const cur = this.cur, prev = this.prev, hi = this.hiBin, n = Math.min(hi, mags.length - 1);
    for (let k = 1; k <= hi; k++) { const m = k <= n ? mags[k] : 0; cur[k] = m > 0 ? Math.log(1 + GAMMA * m) : 0; }
    const flux = [0, 0, 0], lv = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const [a, z] = this.rng[b]; let f = 0, l = 0;
      for (let k = a; k <= z; k++) {
        l += cur[k];
        if (this.hasPrev) { const pm = Math.max(prev[k - 1], prev[k], prev[k + 1]); const d = cur[k] - pm; if (d > 0) f += d; }
      }
      const c = z - a + 1; flux[b] = f / c; lv[b] = l / c;
    }
    this.prev = cur; this.cur = prev; this.hasPrev = true;
    const o = WGT[0] * flux[0] + WGT[1] * flux[1] + WGT[2] * flux[2];
    const oc = Math.max(0, o - this.fluxEma);
    this.fluxEma += (o - this.fluxEma) * (1 - Math.exp(-dt / 1.0));
    if (oc > this.acc) this.acc = oc;
    // mức (năng lượng) làm mượt
    const es = (lv[0] + lv[1] + 0.5 * lv[2]) / 2.5, kk = 1 - Math.exp(-dt / 0.25);
    this.lvlS.e += (clamp((es - 0.25) / 2.0, 0, 1) - this.lvlS.e) * kk;
    this.lvlS.bass += (clamp(lv[0] / 4, 0, 1) - this.lvlS.bass) * kk; this.lvlS.treble += (clamp(lv[2] / 3, 0, 1) - this.lvlS.treble) * kk;
    this.lvl.low = lv[0]; this.lvl.mid = lv[1]; this.lvl.high = lv[2];
    // ---- đóng ô lưới 50 Hz ----
    while (t >= this.nextClose) this._closeSlot();
    // ---- đồng hồ nhịp (PLL) ----
    this._tick(t);
    this.state = this._mkState(t);
    return this.state;
  }

  _closeSlot() {
    const raw = this.acc; this.acc = 0;
    this.peakRef = Math.max(this.peakRef * Math.exp(-DT / 6), raw);
    this.env.push(raw / Math.max(this.peakRef, FLOOR_REF)); if (this.env.length > MAXN) this.env.shift();
    this.rawRecent.push(raw); if (this.rawRecent.length > 45) this.rawRecent.shift();
    this.nextClose += DT; this.nSlots++;
    if (++this.sinceAn >= AN_EVERY) { this.sinceAn = 0; this._analyze(this.nextClose - DT); }
  }

  _tick(t) {
    if (!this.locked || !(this.bpm > 0)) return;
    const P = 60 / this.bpm;
    while (t >= this.nb - this.lead) {
      if (t - this.lastBeatT > 0.55 * P) { this.beatIndex++; this.onBeat = true; }
      this.lastBeatT = this.nb - this.lead; this.nb += P;
    }
  }

  _analyze(tEnd) {
    const env = this.env, N = env.length, adt = AN_EVERY * DT;
    if (N < MINN) { this.confidence = 0; return; }
    let m = 0; for (let i = 0; i < N; i++) m += env[i]; m /= N;
    let r0 = 0; for (let i = 0; i < N; i++) { const d = env[i] - m; r0 += d * d; }
    const maxLag = Math.min(3 * LMAX + 3, N - 24);
    let strength = 0, bpmEst = 0;
    if (r0 > 1e-6) {
      const ac = new Float32Array(maxLag + 2);
      for (let l = 1; l <= maxLag + 1; l++) { let s = 0; for (let i = l; i < N; i++) s += (env[i] - m) * (env[i - l] - m); ac[l] = (s / (N - l)) / (r0 / N); }
      // chọn lag tốt nhất bằng tổng lược (l, 2l, 3l) nhân ưu tiên tempo
      // khối lượng đỉnh trong (x-1, x+1): chu kỳ lẻ (vd. 21,4 ô) bị lưới 50 Hz xẻ vào hai ô kề nhau nên phải cộng lại
      const acI = (x) => { let s = 0; for (let j = Math.floor(x - 1) + 1; j < x + 1; j++) s += ac[j] || 0; return s; };
      let bestL = LMIN, bestS = -1;
      for (let l = LMIN; l <= LMAX; l += 0.25) {
        let s = 0, w = 0;
        for (let k = 1; k <= 3; k++) if (k * l <= maxLag) { const wk = k === 1 ? 1 : k === 2 ? 0.5 : 0.25; s += wk * acI(k * l); w += wk; }
        s = (s / w) * tempoPrior(60 * FS / l);
        if (s > bestS) { bestS = s; bestL = l; }
      }
      const best = Math.round(bestL);
      // tinh chỉnh: nội suy parabol quanh k*l, rồi lag = Σλ_k / Σk
      let sumLam = 0, sumK = 0, sumAc = 0, cnt = 0;
      for (let k = 1; k <= 3; k++) {
        const c = Math.round(k * bestL); if (c + 2 > maxLag) break;
        let pk = c; for (let j = c - 2; j <= c + 2; j++) if (ac[j] > ac[pk]) pk = j;
        const a = ac[pk - 1], b = ac[pk], d = ac[pk + 1], den = a - 2 * b + d;
        const off = den < -1e-9 ? clamp(0.5 * (a - d) / den, -1, 1) : 0;
        sumLam += pk + off; sumK += k; sumAc += Math.max(0, b + Math.max(a, d)); cnt++;
      }
      if (cnt) { strength = sumAc / cnt; bpmEst = 60 * FS * sumK / sumLam; }
    }
    this.strength = strength;
    // cổng hoạt động: 0,9 s gần nhất phải còn onset đáng kể
    let rp = 0; for (const v of this.rawRecent) if (v > rp) rp = v;
    const activity = rp / Math.max(this.peakRef, FLOOR_REF);
    const gate = clamp((activity - 0.12) / 0.25, 0, 1) * (this.lvlS.e > 0.03 ? 1 : 0);
    this.confidence = clamp((strength - 0.2) / 0.3, 0, 1) * gate;
    // ---- tempo mượt ----
    if (bpmEst > 0 && this.confidence > 0.25) {
      if (!this.bpm) this.bpm = bpmEst;
      else if (Math.abs(bpmEst - this.bpm) / this.bpm < 0.04) { this.bpm += (bpmEst - this.bpm) * 0.25; this.cand = 0; this.candT = 0; }
      else if (this.cand && Math.abs(bpmEst - this.cand) / this.cand < 0.04) { this.candT += adt; if (this.candT >= LOCK_SEC) { this.bpm = this.cand; this.cand = 0; this.candT = 0; } }
      else { this.cand = bpmEst; this.candT = 0; }
    }
    // ---- trễ hai chiều vào/ra trạng thái nhạc ----
    if (!this.isMusic) {
      if (this.confidence >= 0.5) this.onT += adt; else this.onT = Math.max(0, this.onT - 2 * adt);
      if (this.onT >= ON_HOLD) { this.isMusic = true; this.offT = 0; }
    } else {
      if (this.confidence < 0.35) this.offT += adt; else this.offT = 0;
      if (this.offT >= OFF_HOLD) { this.isMusic = false; this.onT = 0; this.locked = false; this.bpm = 0; this.cand = 0; }
    }
    if (this.bpm > 0 && this.confidence > 0.25) this._phase(tEnd);
  }

  /** Đo pha bằng lược nhịp trên onset gần nhất, rồi kéo đồng hồ nhịp về (PLL). */
  _phase(tEnd) {
    const env = this.env, N = env.length, Pn = FS * 60 / this.bpm, P = 60 / this.bpm;
    const at = (x) => { if (x < 0) return 0; const i = Math.floor(x), f = x - i; return env[i] * (1 - f) + (env[Math.min(N - 1, i + 1)] || 0) * f; };
    let bestO = 0, bestS = -1;
    for (let o = 0; o < Pn; o += 0.5) {
      let s = 0, w = 1;
      for (let k = 0; k < 14; k++) { const x = N - 1 - o - k * Pn; if (x < 0) break; s += w * at(x); w *= 0.9; }
      if (s > bestS) { bestS = s; bestO = o; }
    }
    const tb = tEnd - DT * 0.5 - bestO * DT;      // thời điểm (âm thanh) của nhịp gần nhất đo được
    if (!this.locked) {
      this.locked = true; this.nb = tb + P; while (this.nb - this.lead <= this.lastT) this.nb += P; this.lastBeatT = this.nb - this.lead - P;
    } else {
      let err = tb - this.nb; err -= P * Math.round(err / P);       // lệch pha trong (-P/2, P/2]
      this.nb += 0.3 * err;
    }
  }
}

/** Nguồn nhịp giả (debug / test): cùng dạng state với BeatTracker. */
export class SyntheticBeat {
  constructor(bpm = 120) { this.bpm = bpm; this.t = 0; this.beatIndex = 0; this.phase = 0; }
  update(dt) {
    this.t += dt; const P = 60 / this.bpm; let onBeat = false;
    this.phase += dt / P; while (this.phase >= 1) { this.phase -= 1; this.beatIndex++; onBeat = true; }
    const energy = 0.72 + 0.2 * Math.sin(this.t * 0.35), pulse = 0.5 + 0.5 * Math.cos(2 * Math.PI * this.phase);
    return { isMusic: true, confidence: 1, bpm: this.bpm, phase: this.phase, beatIndex: this.beatIndex, energy, bass: 0.4 + 0.5 * pulse * pulse, treble: 0.4, onBeat };
  }
}

export const IDLE_BEAT = Object.freeze({ isMusic: false, confidence: 0, bpm: 0, phase: 0, beatIndex: 0, energy: 0, bass: 0, treble: 0, onBeat: false });
