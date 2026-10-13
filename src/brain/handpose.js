// Nhận dáng tay từ 21 điểm mốc MediaPipe HandLandmarker — logic thuần, không đụng DOM/camera (test bằng landmark tổng hợp).
//   classifyHand(lm, aspect) -> 'open' | 'fist' | 'point' | 'gun' | 'thumbsup' | 'peace' | 'unknown'
//   GestureTracker: theo thời gian -> sự kiện 'wave' · 'gun:aim' · 'gun:fire' · 'gun:lower' · 'fist:toward' · 'thumbsup' · 'open:hold'
// lm[i] = {x, y, z?}: x,y chuẩn hóa theo ảnh (y hướng xuống). aspect = rộng/cao của khung ảnh để khoảng cách không bị méo.
export const LM = { WRIST: 0, THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12, RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16, PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20 };
const FINGERS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };   // [mcp, pip, tip]
export const POSES = ['open', 'fist', 'point', 'gun', 'thumbsup', 'peace', 'unknown'];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Hợp lệ: đủ 21 điểm có x,y hữu hạn. */
export function validHand(lm) { return Array.isArray(lm) && lm.length >= 21 && lm.slice(0, 21).every((p) => p && finite(p.x) && finite(p.y)); }

/** Đo hình học một bàn tay (đơn vị: kích cỡ lòng bàn tay S = cổ tay → khớp ngón giữa). */
export function measureHand(lm, aspect = 1) {
  const P = (i) => ({ x: lm[i].x * aspect, y: lm[i].y, z: (finite(lm[i].z) ? lm[i].z : 0) * aspect });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const w = P(0), S = Math.max(1e-6, d(w, P(9))), palmW = Math.max(1e-6, d(P(5), P(17)));
  const ext = {}, reach = {};
  for (const [name, [mcp, pip, tip]] of Object.entries(FINGERS)) {
    const tw = d(P(tip), w), pw = d(P(pip), w); reach[name] = tw / S;
    ext[name] = tw > pw * 1.12 && tw / S > 1.32;                       // ngón duỗi: đầu ngón xa cổ tay hơn khớp giữa và đủ xa
    void mcp;
  }
  const thumbExt = d(P(4), P(17)) / palmW;                              // đầu ngón cái xa gốc ngón út bao nhiêu (đo bề rộng bàn tay)
  const thumbOut = thumbExt > 1.28;
  const thumbUp = thumbOut && P(4).y < Math.min(P(5).y, w.y) - 0.25 * S;
  const idxRel = (P(8).y - P(5).y) / S;                                // đầu ngón trỏ so với khớp gốc (âm = hướng lên)
  const c = { x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5, y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5 };
  return { S, ext, reach, thumbExt, thumbOut, thumbUp, idxRel, cx: c.x, cy: c.y, s: S / aspect };
}

/** Dáng tay từ số đo. */
export function poseOf(m) {
  const { index, middle, ring, pinky } = m.ext, n = +index + +middle + +ring + +pinky;
  if (n === 4) return 'open';
  if (index && middle && !ring && !pinky) return 'peace';
  if (index && !middle && !ring && !pinky) return m.thumbOut ? 'gun' : 'point';
  if (n === 0) return m.thumbUp ? 'thumbsup' : 'fist';
  return 'unknown';
}
export const MIN_PALM = 0.012;   // nhỏ hơn mức này (theo đơn vị ảnh) là nhiễu/điểm suy biến
export function classifyHand(lm, aspect = 1) { if (!validHand(lm)) return 'unknown'; const m = measureHand(lm, aspect); return m.S < MIN_PALM ? 'unknown' : poseOf(m); }

export const TRACK = {
  aimHold: 0.4,        // dáng súng giữ ≥ 0,4 s mới là chĩa
  grace: 0.18,         // mất dáng ngắn hơn mức này (nhiễu 1–2 khung) không tính
  lowerAfter: 0.7,     // bỏ dáng súng/trỏ quá lâu thì hạ súng
  fireCool: 1.2,       // sau mỗi phát bắn
  thumbFold: 1.08,     // ngón cái gập: thumbExt tụt dưới mức này (đang chĩa thì ≥ 1.28)
  flick: 0.3,          // đầu ngón trỏ giật lên: idxRel giảm ≥ 0,3 S trong flickWin
  flickWin: 0.25,
  waveWin: 1.5, waveSegs: 3, waveAmp: 0.45,   // vẫy: ≥ 3 đoạn qua lại, mỗi đoạn ≥ 0,45 S
  waveCool: 3, holdCool: 5,
  thumbHold: 0.6, openHold: 1.0, fistGrow: 1.3, fistWin: 0.6,
  lostAfter: 0.6,
};

/**
 * Theo dõi theo thời gian một bàn tay chính (to nhất). Gọi update(t giây, danh sách landmark, aspect) mỗi khung ~12 fps,
 * micOnset(t)/voiceBang(t) khi có tiếng động đột ngột/tiếng "pằng". Trả mảng sự kiện { name, t }.
 */
export class GestureTracker {
  constructor(cfg = {}) { this.c = { ...TRACK, ...cfg }; this.reset(); }
  reset() {
    this.hist = []; this.gunSince = null; this.lastGun = -1e9; this.aimed = false; this.aimThumb = 0; this.needRelease = false; this.lastFire = -1e9;
    this.lastWave = -1e9; this.lastHold = {}; this.poseSince = {}; this.lastSeen = -1e9; this.lastPose = 'unknown';
  }
  get aiming() { return this.aimed; }
  _fire(t, why) {
    if (t - this.lastFire < this.c.fireCool) return [];
    this.lastFire = t; this.aimed = false; this.gunSince = null; this.needRelease = true; return [{ name: 'gun:fire', t, why }];
  }
  micOnset(t) { return this.aimed ? this._fire(t, 'mic') : []; }
  voiceBang(t) { return this.aimed ? this._fire(t, 'voice') : []; }
  update(t, hands, aspect = 1) {
    const c = this.c, ev = [];
    let best = null;
    for (const lm of hands || []) { if (!validHand(lm)) continue; const m = measureHand(lm, aspect); if (m.S >= MIN_PALM && (!best || m.S > best.S)) best = m; }
    if (!best) {
      if (this.aimed && t - this.lastSeen > c.lostAfter) { this.aimed = false; ev.push({ name: 'gun:lower', t }); }
      if (t - this.lastSeen > c.lostAfter) { this.hist = []; this.gunSince = null; this.poseSince = {}; }
      return ev;
    }
    this.lastSeen = t;
    const m = best, pose = poseOf(m); this.lastPose = pose;
    this.hist.push({ t, pose, cx: m.cx, cy: m.cy, s: m.s, idx: m.idxRel, th: m.thumbExt });
    while (this.hist.length > 2 && this.hist[0].t < t - 2.2) this.hist.shift();
    const since = (p) => { if (pose !== p) return 0; const r = this.poseSince[p]; if (!r || t - r.last > c.grace) this.poseSince[p] = { start: t, last: t }; else r.last = t; return t - this.poseSince[p].start; };

    // ---- súng ----
    const gunish = pose === 'gun' || pose === 'point';
    if (pose === 'gun') {
      this.lastGun = t;
      if (this.needRelease) { /* chờ nhả dáng */ } else {
        if (this.gunSince == null) this.gunSince = t;
        if (!this.aimed && t - this.gunSince >= c.aimHold && t - this.lastFire > 0.3) { this.aimed = true; this.aimThumb = m.thumbExt; ev.push({ name: 'gun:aim', t }); }
        if (this.aimed) this.aimThumb = Math.max(this.aimThumb, m.thumbExt);
      }
    } else {
      if (this.gunSince != null && t - this.lastGun > c.grace && !(this.aimed && gunish)) this.gunSince = null;
      if (!gunish && t - this.lastGun > c.grace) this.needRelease = false;
    }
    if (this.aimed && gunish) {
      // ngón cái gập xuống trong lúc ngón trỏ còn duỗi
      if (pose === 'point' && this.aimThumb >= 1.28 && m.thumbExt < c.thumbFold) ev.push(...this._fire(t, 'thumb'));
      // đầu ngón trỏ giật lên nhanh (so với khớp gốc)
      if (this.aimed) { let hi = -9; for (const h of this.hist) if (t - h.t <= c.flickWin) hi = Math.max(hi, h.idx); if (hi - m.idxRel >= c.flick) ev.push(...this._fire(t, 'flick')); }
    } else if (this.aimed && t - this.lastGun > c.lowerAfter) { this.aimed = false; this.gunSince = null; ev.push({ name: 'gun:lower', t }); }

    // ---- vẫy tay: lòng bàn tay mở dao động ngang ----
    const win = this.hist.filter((h) => t - h.t <= c.waveWin);
    if (pose === 'open' && win.length >= 6 && win.filter((h) => h.pose === 'open').length >= win.length * 0.7 && t - this.lastWave > c.waveCool) {
      const s = win.reduce((a, h) => a + h.s, 0) / win.length, thr = c.waveAmp * s * 0.9;
      let lo = win[0].cx, hi = win[0].cx, ext = win[0].cx, dir = 0, segs = 0;   // đếm các đoạn di chuyển một chiều dài ≥ thr (phải-trái-phải = 3 đoạn)
      for (const h of win) {
        const x = h.cx;
        if (dir === 0) { lo = Math.min(lo, x); hi = Math.max(hi, x); if (x - lo >= thr) { dir = 1; ext = x; segs++; } else if (hi - x >= thr) { dir = -1; ext = x; segs++; } }
        else if (dir === 1) { if (x > ext) ext = x; else if (ext - x >= thr) { dir = -1; ext = x; segs++; } }
        else if (x < ext) ext = x; else if (x - ext >= thr) { dir = 1; ext = x; segs++; }
      }
      if (segs >= c.waveSegs) { this.lastWave = t; ev.push({ name: 'wave', t }); }
    }
    // ---- bắt chước: ngón cái · nắm đấm đưa tới · lòng bàn tay mở giữ yên ----
    const cool = (k) => t - (this.lastHold[k] ?? -1e9) > c.holdCool;
    const tHold = since('thumbsup'), oHold = since('open');
    if (pose === 'thumbsup' && tHold >= c.thumbHold && cool('thumbsup')) { this.lastHold.thumbsup = t; ev.push({ name: 'thumbsup', t }); }
    if (pose === 'fist') {
      const old = this.hist.find((h) => t - h.t <= c.fistWin + 0.15 && t - h.t >= c.fistWin * 0.6);
      if (old && old.pose === 'fist' && m.s / old.s >= c.fistGrow && cool('fist')) { this.lastHold.fist = t; ev.push({ name: 'fist:toward', t }); }
    }
    if (pose === 'open' && oHold >= c.openHold && cool('open')) {
      const w2 = this.hist.filter((h) => t - h.t <= c.openHold), sAvg = w2.reduce((a, h) => a + h.s, 0) / w2.length;
      const xs = w2.map((h) => h.cx), range = Math.max(...xs) - Math.min(...xs);
      if (range < 0.4 * sAvg) { this.lastHold.open = t; ev.push({ name: 'open:hold', t }); }
    }
    return ev;
  }
}
