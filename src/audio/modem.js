// Modem âm thanh: hai Pipo nói chuyện bằng tiếng bíp nghe được. Logic thuần (không đụng WebAudio/DOM), test bằng PCM tổng hợp.
//
// Điều chế MFSK 16 tông (4 bit/ký hiệu) trong 1,8–4,2 kHz (cách nhau 160 Hz), ký hiệu 60 ms có đường bao nâng cosin (không click), nghe như robot bíp.
// Khung phát:  [im lặng] [tiền đồng bộ: chirp lên 1,6→4,4 kHz rồi chirp xuống, mỗi cái 140 ms] [guard] [header: độ dài L, 2 nibble × 3 lần xen kẽ]
//              [thân: nibble của payload + CRC-8, phát hai bản — bản B xáo trộn theo bước nguyên tố cùng nhau] [im lặng]
// Payload ≤ 24 byte; CRC-8 (đa thức 0x07) phủ [L, payload]. Hai bản + xáo trộn: bộ giải mã cộng năng lượng đã chuẩn hóa từng ký hiệu của hai bản,
// nên một cụm tiếng nói/nhiễu chen ngang chỉ phá một bản.
// Bộ giải mã: hạ tần (FIR lọc thấp) về ~11–12 kHz, tương quan chuẩn hóa với hai chirp để dò tiền đồng bộ (và đo luôn tỉ lệ tốc độ mẫu từ khoảng cách hai chirp),
// rồi Goertzel 16 tông cho từng ký hiệu (cửa sổ Hann ở 80% giữa ký hiệu). Không có tiền đồng bộ thì không bao giờ thử giải mã (nhiễu thuần không ra gói).
const TAU = Math.PI * 2;
export const MODEM = { tones: 16, f0: 1800, df: 160, sym: 0.06, ramp: 0.008, preF1: 1600, preF2: 4400, preDur: 0.14, guard: 0.03, lead: 0.06, hdrReps: 3, maxPayload: 24, amp: 0.7 };
export const toneFreq = (k) => MODEM.f0 + k * MODEM.df;

export function crc8(bytes) {
  let c = 0;
  for (const b of bytes) { c ^= b & 255; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; }
  return c;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** Bước xáo trộn cho n nibble: nguyên tố cùng nhau với n, xấp xỉ n/3 (rải đều cụm lỗi). */
export function interleaveStep(n) { if (n <= 2) return 1; let s = Math.max(2, Math.round(n / 3)); while (gcd(s, n) !== 1) s++; return s; }
/** Bản B: vị trí j mang nibble perm[j]. */
export function permutation(n) { const s = interleaveStep(n); return Array.from({ length: n }, (_, j) => (j * s) % n); }
/** Nibble (4 bit) của payload + CRC. */
export function bodyNibbles(payload) {
  const L = payload.length, crc = crc8([L, ...payload]), out = [];
  for (const b of [...payload, crc]) out.push(b >> 4, b & 15);
  return out;
}
/** Số ký hiệu của một gói payload L byte (header + hai bản thân). */
export function symbolCount(L) { return 2 * MODEM.hdrReps + 4 * (L + 1); }
/** Thời lượng phát (giây) của gói payload L byte, gồm cả đoạn im lặng hai đầu. */
export function airtime(L) { return 2 * MODEM.lead + 2 * MODEM.preDur + MODEM.guard + symbolCount(L) * MODEM.sym; }

function chirpAt(rate, f1, f2, dur, ramp) {
  const n = Math.round(dur * rate), out = new Float32Array(n), rn = Math.max(1, Math.round(ramp * rate));
  for (let i = 0; i < n; i++) {
    const t = i / rate, ph = TAU * (f1 * t + ((f2 - f1) * t * t) / (2 * dur)), e = Math.min(1, i / rn, (n - 1 - i) / rn);
    out[i] = Math.sin(ph) * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, e)));
  }
  return out;
}

/** Phát bytes (≤ 24) thành PCM float [-1, 1] tốc độ mẫu sr. */
export function encode(bytes, sr) {
  const payload = Array.from(bytes, (b) => b & 255);
  if (payload.length > MODEM.maxPayload) throw new RangeError('payload > ' + MODEM.maxPayload + ' byte');
  const L = payload.length, nib = bodyNibbles(payload), n = nib.length, perm = permutation(n);
  const syms = [];
  for (let r = 0; r < MODEM.hdrReps; r++) syms.push(L >> 4, L & 15);
  for (let j = 0; j < n; j++) syms.push(nib[j]);
  for (let j = 0; j < n; j++) syms.push(nib[perm[j]]);
  const T = Math.round(MODEM.sym * sr), lead = Math.round(MODEM.lead * sr), pre = Math.round(MODEM.preDur * sr), guard = Math.round(MODEM.guard * sr);
  const out = new Float32Array(lead * 2 + 2 * pre + guard + syms.length * T);
  let o = lead;
  const up = chirpAt(sr, MODEM.preF1, MODEM.preF2, MODEM.preDur, 0.006), dn = chirpAt(sr, MODEM.preF2, MODEM.preF1, MODEM.preDur, 0.006);
  for (let i = 0; i < up.length; i++) out[o + i] = MODEM.amp * up[i]; o += pre;
  for (let i = 0; i < dn.length; i++) out[o + i] = MODEM.amp * dn[i]; o += pre + guard;
  const rn = Math.max(1, Math.round(MODEM.ramp * sr));
  for (let s = 0; s < syms.length; s++) {
    const w = TAU * toneFreq(syms[s]) / sr;
    for (let i = 0; i < T; i++) { const e = Math.min(1, i / rn, (T - 1 - i) / rn); out[o + i] = MODEM.amp * Math.sin(w * i) * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, e))); }
    o += T;
  }
  return out;
}

const gHann = (N) => { const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((TAU * (i + 0.5)) / N); return w; };

const SEGS = 8;           // dò tiền đồng bộ: mỗi chirp cắt 8 đoạn ~17 ms, tương quan vuông pha từng đoạn rồi cộng biên độ (không nhạy pha, chịu lệch tốc độ mẫu tới ~0,5%)
const HYP_STEP = 0.0005, HYP_N = 16;   // tinh chỉnh: ngân hàng giả thuyết tỉ lệ tốc độ mẫu 0,992 … 1,008

export class Decoder {
  /** sr: tốc độ mẫu đầu vào (Hz). o.thr: ngưỡng điểm dò tiền đồng bộ (0,32). */
  constructor(sr = 48000, o = {}) {
    this.sr = sr; this.thr = o.thr ?? 0.32;
    this.dec = Math.max(1, Math.floor(sr / 11000)); this.er = sr / this.dec;
    const taps = 12 * this.dec + 1, fc = (0.45 * this.er) / sr, c = (taps - 1) / 2; this.fir = new Float32Array(taps); let sum = 0;
    for (let i = 0; i < taps; i++) { const x = i - c, s = x === 0 ? 2 * fc : Math.sin(TAU * fc * x) / (Math.PI * x); this.fir[i] = s * (0.54 - 0.46 * Math.cos((TAU * i) / (taps - 1))); sum += this.fir[i]; }
    for (let i = 0; i < taps; i++) this.fir[i] /= sum;
    const er = this.er;
    this.M = Math.round((MODEM.preDur * er) / SEGS / 2) * 2 * SEGS;         // độ dài chirp ở tốc độ đã hạ (chia hết cho số đoạn, chẵn)
    this.L = this.M / SEGS; this.step = 4;
    this.segU = this._segTpl(MODEM.preF1, MODEM.preF2); this.segD = this._segTpl(MODEM.preF2, MODEM.preF1);
    this.hyp = []; for (let h = -HYP_N; h <= HYP_N; h++) { const r = 1 + h * HYP_STEP; this.hyp.push({ r, tu: this._tpl(MODEM.preF1, MODEM.preF2, r), td: this._tpl(MODEM.preF2, MODEM.preF1, r) }); }
    this.T = MODEM.sym * er; this.G = MODEM.guard * er;
    this.hann = gHann(Math.round(this.T * 0.8)); this.cosK = Array.from({ length: MODEM.tones }, (_, k) => 2 * Math.cos((TAU * toneFreq(k)) / er));
    this.cap = Math.ceil(16 * er); this.reset();
  }
  _unit(t) { let e = 0; for (let i = 0; i < t.length; i++) e += t[i] * t[i]; const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < t.length; i++) t[i] *= k; return t; }
  /** Chirp giả định phát ở độ dài M·r mẫu (r: tỉ lệ tốc độ mẫu) — mẫu để tương quan kết hợp. */
  _tpl(f1, f2, r) { return this._unit(chirpAt(this.er, f1, f2, (this.M * r) / this.er, 0.006)); }
  /** Chirp cắt SEGS đoạn; mỗi đoạn hai mẫu vuông pha (cos/sin) chuẩn hóa năng lượng. */
  _segTpl(f1, f2) {
    const dur = this.M / this.er, out = [];
    for (let j = 0; j < SEGS; j++) {
      const a = new Float32Array(this.L), b = new Float32Array(this.L);
      for (let i = 0; i < this.L; i++) { const t = (j * this.L + i) / this.er, ph = TAU * (f1 * t + ((f2 - f1) * t * t) / (2 * dur)); a[i] = Math.sin(ph); b[i] = Math.cos(ph); }
      out.push([this._unit(a), this._unit(b)]);
    }
    return out;
  }
  reset() {
    this.x = new Float32Array(this.cap); this.pe = new Float64Array(this.cap + 1); this.cu = new Float32Array(this.cap); this.cd = new Float32Array(this.cap);
    this.n = 0; this.scan = 0; this.from = 0; this.best = null; this.sync = null; this.hist = new Float32Array(this.fir.length - 1); this.ph = 0; this.accepted = 0; this.rejected = 0;
  }
  /** Đang nhận dở một gói (đã dò thấy tiền đồng bộ): dùng để nghe-trước-khi-nói. */
  get busy() { return !!(this.best || this.sync); }
  _compact(need) {
    const keep = Math.max(0, Math.floor(Math.min(this.scan, this.sync ? this.sync.start : this.scan, this.best ? this.best.p : this.scan) - 2 * this.M - 8));
    if (keep <= 0 && this.n + need <= this.cap) return;
    const drop = Math.max(keep, this.n + need - this.cap); if (drop <= 0) return;
    this.x.copyWithin(0, drop, this.n); this.cu.copyWithin(0, drop, this.n); this.cd.copyWithin(0, drop, this.n);
    const base = this.pe[Math.min(drop, this.n)]; for (let i = 0; i <= this.n - drop; i++) this.pe[i] = this.pe[i + drop] - base;
    this.n -= drop; this.scan = Math.max(0, this.scan - drop); this.from = Math.max(0, this.from - drop); if (this.best) this.best.p -= drop; if (this.sync) { this.sync.start -= drop; this.sync.pu -= drop; if (this.sync.end != null) this.sync.end -= drop; }
  }
  /** Đẩy một khung PCM. Trả mảng gói hợp lệ (Uint8Array payload). */
  push(frame) {
    const out = [], F = this.fir, taps = F.length, dec = this.dec;
    const src = frame instanceof Float32Array ? frame : Float32Array.from(frame || []);
    if (!src.length) return out;
    this._compact(Math.ceil(src.length / dec) + 4);
    // hạ tần: FIR lọc thấp rồi lấy mỗi dec mẫu (giữ đuôi khung trước)
    const h = this.hist, N = src.length, ext = new Float32Array(h.length + N); ext.set(h); ext.set(src, h.length);
    let i = this.ph;
    for (; i < N; i += dec) {
      let s = 0; const b = i + h.length;   // mẫu mới nhất của cửa sổ FIR = ext[i + h.length]
      for (let k = 0; k < taps; k++) s += F[k] * ext[b - k];
      if (this.n < this.cap) { this.x[this.n] = s; this.pe[this.n + 1] = this.pe[this.n] + s * s; this.n++; }
    }
    this.ph = i - N;
    h.set(ext.subarray(ext.length - h.length));
    this._scan(out);
    return out;
  }
  _energy(a, b) { return this.pe[b] - this.pe[a]; }
  /** Nhảy tới vị trí quét v (làm tròn lên bội của bước); các giá trị cũ trước đó bị bỏ. */
  _setScan(v) { v = Math.max(this.scan, Math.ceil(v)); const r = v % this.step; if (r) v += this.step - r; this.scan = v; this.from = v; }
  /** Điểm khớp chirp ở vị trí p: trung bình biên độ tương quan vuông pha các đoạn (0..1). */
  _rho(seg, p) {
    const L = this.L, x = this.x; let tot = 0;
    for (let j = 0; j < SEGS; j++) {
      const o = p + j * L, a = seg[j][0], b = seg[j][1]; let sa = 0, sb = 0;
      for (let i = 0; i < L; i++) { const v = x[o + i]; sa += v * a[i]; sb += v * b[i]; }
      const e = this._energy(o, o + L); tot += e > 1e-12 ? Math.sqrt(sa * sa + sb * sb) / Math.sqrt(e) : 0;
    }
    return tot / SEGS;
  }
  /** Tương quan kết hợp chuẩn hóa với mẫu độ dài bất kỳ. */
  _corr(tpl, p) { const M = tpl.length, x = this.x; let s = 0; for (let i = 0; i < M; i++) s += x[p + i] * tpl[i]; const e = this._energy(p, p + M); return e > 1e-10 ? s / Math.sqrt(e) : 0; }
  _scan(out) {
    const M = this.M;
    for (let guard = 0; guard < 1e6; guard++) {
      if (this.sync) { const r = this._tryDecode(); if (r === 'wait') return; if (r) out.push(r); continue; }
      const q = this.scan;
      if (q + M > this.n) return;
      this.cu[q] = this._rho(this.segU, q); this.cd[q] = this._rho(this.segD, q);
      const p = q - M;
      if (p >= this.from) {
        const s = Math.min(this.cu[p], this.cd[q]);
        if (s > this.thr && (!this.best || s > this.best.s)) this.best = { p, s };
      }
      this.scan += this.step;
      if (this.best && q - M - this.best.p > 0.03 * this.er) {
        // đỉnh thô đã qua: tinh chỉnh kết hợp tới từng mẫu + ngân hàng giả thuyết tỉ lệ tốc độ mẫu
        if (this.n < this.best.p + 2 * M + 80 + HYP_N * 4) { this.scan -= this.step; return; }
        const b = this.best; this.best = null;
        const sy = this._sync(b.p); if (sy) { this.sync = sy; this._setScan(sy.start); }
      }
    }
  }
  _sync(p0) {
    const M = this.M; let best = null;
    const search = Math.round(0.006 * this.er) + 8;                              // ±6 ms quanh đỉnh thô
    for (const H of this.hyp) {
      const Mr = H.tu.length; let bu = -1, pu = p0;
      for (let p = Math.max(0, p0 - search); p <= p0 + search; p++) { if (p + Mr > this.n) break; const c = this._corr(H.tu, p); if (c > bu) { bu = c; pu = p; } }
      if (bu <= 0) continue;
      let bd = -1, pd = pu + Mr;
      for (let p = pu + Mr - 10; p <= pu + Mr + 10; p++) { if (p < 0 || p + H.td.length > this.n) continue; const c = this._corr(H.td, p); if (c > bd) { bd = c; pd = p; } }
      const sc = Math.min(bu, bd); if (!best || sc > best.sc) best = { sc, pu, pd, r: H.r, bu, bd };
    }
    if (!best || best.bu < this.thr + 0.1 || best.bd < this.thr + 0.1) { this.rejected++; return null; }
    const r = best.r;
    return { pu: best.pu, r, start: best.pu + (2 * M + this.G) * r, stage: 'hdr', q: best.sc };
  }
  /** Năng lượng chuẩn hóa 16 tông của ký hiệu thứ i (đã bù tỉ lệ r, lệch d theo đơn vị ký hiệu). */
  _sym(i, d = 0) {
    const s = this.sync, W = this.hann.length, c = s.start + (i + 0.5 + d) * this.T * s.r, a = Math.round(c - W / 2), K = MODEM.tones, E = new Float64Array(K);
    if (a < 0 || a + W > this.n) return null;
    const x = this.x; let tot = 0;
    for (let k = 0; k < K; k++) {
      const cc = this.cosK[k]; let s1 = 0, s2 = 0;
      for (let j = 0; j < W; j++) { const v = x[a + j] * this.hann[j] + cc * s1 - s2; s2 = s1; s1 = v; }
      E[k] = s1 * s1 + s2 * s2 - cc * s1 * s2; tot += E[k];
    }
    if (tot > 0) for (let k = 0; k < K; k++) E[k] /= tot;
    return E;
  }
  _argmax(E) { let b = 0; for (let k = 1; k < E.length; k++) if (E[k] > E[b]) b = k; return b; }
  _decodeBody(n, d) {
    const H = MODEM.hdrReps * 2, perm = permutation(n), K = MODEM.tones, acc = Array.from({ length: n }, () => new Float64Array(K));
    for (let j = 0; j < n; j++) { const e = this._sym(H + j, d); if (!e) return null; for (let k = 0; k < K; k++) acc[j][k] += e[k]; }
    for (let j = 0; j < n; j++) { const e = this._sym(H + n + j, d); if (!e) return null; for (let k = 0; k < K; k++) acc[perm[j]][k] += e[k]; }
    return acc.map((a) => this._argmax(a));
  }
  _tryDecode() {
    const s = this.sync, H = MODEM.hdrReps * 2;
    if (s.stage === 'hdr') {
      if (s.start + (H + 0.5) * this.T * s.r > this.n) return 'wait';
      const hv = [0, 0];
      const acc = [new Float64Array(16), new Float64Array(16)];
      for (let rep = 0; rep < MODEM.hdrReps; rep++) for (let h = 0; h < 2; h++) { const e = this._sym(rep * 2 + h); if (!e) return 'wait'; for (let k = 0; k < 16; k++) acc[h][k] += e[k]; }
      hv[0] = this._argmax(acc[0]); hv[1] = this._argmax(acc[1]);
      const L = (hv[0] << 4) | hv[1];
      if (L > MODEM.maxPayload) { this.rejected++; this.sync = null; this._setScan(s.pu + 2 * this.M); return null; }
      s.L = L; s.stage = 'body'; s.end = s.start + (H + 4 * (L + 1) + 0.6) * this.T * s.r;
    }
    if (s.end > this.n) return 'wait';
    const n = 2 * (s.L + 1); let pkt = null;
    for (const d of [0, -0.07, 0.07, -0.14, 0.14]) {
      const nib = this._decodeBody(n, d); if (!nib) break;
      const bytes = []; for (let i = 0; i < n; i += 2) bytes.push((nib[i] << 4) | nib[i + 1]);
      const crc = bytes.pop(); if (crc === crc8([s.L, ...bytes])) { pkt = Uint8Array.from(bytes); break; }
    }
    this._setScan(s.end); this.sync = null;
    if (pkt) this.accepted++; else this.rejected++;
    return pkt;
  }
}
