// Gục ngã kiểu hoạt hình (giả chết, không máu): bộ điều phối trạng thái + đường cong tư thế. Thuần logic, không đụng DOM.
//
// Trạng thái: idle → hit (giật lùi) → fall (đổ) → lie (nằm, co giật nhẹ) → rise (bật dậy) → idle; hoặc idle → dodge (né) → idle.
// pose = { w, tilt, drop, sway, squash, shake, limp } — w 0..1 là trọng số trộn vào tư thế thường; tilt rad (dương = đổ sang phải màn hình, tới ~1.45),
// drop/sway theo U (drop dương = tụt xuống), squash như pose thường, shake = biên độ co giật 0..1, limp = tay rũ 0..1.
// Skin vẽ pose.fall: classic/pixel xoay cả mặt nằm ngang; Eve đổ cả người quanh đáy thân xuống sàn.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeBack = (u) => { const x = u - 1; return 1 + 2.4 * x * x * x + 1.4 * x * x; };
const smooth = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };

export const FALL = {
  recoil: 0.3,          // giật lùi
  fall: 0.6,            // đổ xuống sàn (gia tốc như rơi)
  twitchFor: 3,         // co giật rõ trong ~3 s đầu nằm
  selfRiseAt: 8,        // không ai chạm: tự dậy sau 8 s kể từ lúc trúng
  riseTouch: 1.6,       // bật dậy chóng mặt khi được chạm
  riseSelf: 0.6,        // tự bật dậy gọn
  dodge: 0.85,
  tilt: 1.45, drop: 0.26,
};
export const IDLE_FALL = Object.freeze({ w: 0, tilt: 0, drop: 0, sway: 0, squash: 0, shake: 0, limp: 0 });

/** Tư thế trong lúc trúng đạn → nằm. t = giây kể từ lúc trúng; dir = ±1 (hướng đổ). */
export function lyingPose(t, dir) {
  t = Math.max(0, t);
  const R = FALL.recoil, F = FALL.fall, T = FALL.tilt, D = FALL.drop;
  if (t < R) { const e = easeOut(t / R); return { w: 1, tilt: -dir * 0.45 * e, drop: -0.02 * e, sway: -dir * 0.07 * e, squash: -0.08 * e, shake: 0, limp: 0.2 * e }; }
  if (t < R + F) {
    const u = (t - R) / F, e = Math.pow(u, 1.6), land = Math.sin(Math.PI * clamp((u - 0.82) / 0.18, 0, 1));
    return { w: 1, tilt: lerp(-dir * 0.45, dir * T, e), drop: lerp(-0.02, D, e), sway: lerp(-dir * 0.07, dir * 0.12, e), squash: lerp(-0.08, 0.04, e) + 0.18 * land, shake: 0, limp: lerp(0.2, 1, u) };
  }
  const L = t - R - F;                                                   // thời gian đã nằm
  const burst = L < FALL.twitchFor ? Math.pow(Math.max(0, Math.sin((2 * Math.PI * L) / 1.1 - 0.4)), 5) : 0.55 * Math.pow(Math.max(0, Math.sin((2 * Math.PI * L) / 2.6)), 24);
  return { w: 1, tilt: dir * T + 0.045 * burst * Math.sin(L * 41), drop: D + 0.006 * burst * Math.sin(L * 37 + 1), sway: dir * 0.12, squash: 0.04 + 0.03 * burst * Math.sin(L * 29), shake: burst, limp: 1 };
}

/** Bật dậy từ tư thế nằm: p = giây kể từ lúc dậy; kind 'touch' (chóng mặt, lảo đảo) | 'self' (gọn). */
export function risePose(p, dir, kind) {
  const T = FALL.tilt, D = FALL.drop, pop = kind === 'self' ? 0.22 : 0.3, len = kind === 'self' ? FALL.riseSelf : FALL.riseTouch;
  const u = clamp(p / pop, 0, 1), e = easeBack(u);
  const wob = kind === 'self' ? 0.06 : 0.24, wobT = Math.max(0, p - pop * 0.7);
  const tilt = lerp(dir * T, 0, e) + dir * wob * Math.sin(wobT * 9) * Math.exp(-wobT * 2.1) * smooth(p / (pop * 0.8));
  const drop = D * (1 - easeOut(u));
  const sway = lerp(dir * 0.12, 0, easeOut(u)) + (kind === 'self' ? 0 : 0.045 * Math.sin(wobT * 7) * Math.exp(-wobT * 1.8));
  const squash = -0.08 * Math.sin(Math.PI * clamp(u * 1.2, 0, 1)) + 0.05 * Math.sin(wobT * 12) * Math.exp(-wobT * 4);
  const w = 1 - smooth((p - len * 0.7) / (len * 0.3));
  return { w, tilt, drop, sway, squash, shake: 0, limp: (1 - smooth(p / 0.35)) * 0.8 };
}

/** Né: nghiêng vọt sang bên rồi về. */
export function dodgePose(t, dir) {
  const u = clamp(t / FALL.dodge, 0, 1), k = u < 0.3 ? easeOut(u / 0.3) : 1 - smooth((u - 0.3) / 0.7);
  return { w: k > 0 ? 1 : 0, tilt: dir * 0.42 * k, drop: -0.025 * k, sway: dir * 0.22 * k, squash: 0.1 * k, shake: 0, limp: 0 };
}

export class FallDirector {
  constructor(rng = Math.random) { this.rng = rng; this.state = 'idle'; this.t = 0; this.dir = 1; this.kind = 'touch'; this.pose = IDLE_FALL; this.rt = 0; }
  get active() { return this.state !== 'idle'; }
  /** Đang nằm (kể cả đang đổ): chạm vào lúc này sẽ cứu dậy. */
  get lying() { return this.state === 'hit' || this.state === 'fall' || this.state === 'lie'; }
  /** Trúng đạn. dir ±1 hoặc ngẫu nhiên. */
  hit(dir) { this.state = 'hit'; this.t = 0; this.dir = dir === -1 || dir === 1 ? dir : this.rng() < 0.5 ? -1 : 1; this.pose = lyingPose(0, this.dir); }
  dodge(dir) { this.state = 'dodge'; this.t = 0; this.dir = dir === -1 || dir === 1 ? dir : this.rng() < 0.5 ? -1 : 1; this.pose = dodgePose(0, this.dir); }
  /** Có người chạm/nựng: bật dậy chóng mặt. Chỉ ăn khi đang nằm (sau khi đã đổ xuống một chút, để cảnh ngã còn kịp thấy). */
  touch() { if (this.state === 'lie' || (this.state === 'fall' && this.t > FALL.recoil + FALL.fall * 0.55)) { this._rise('touch'); return true; } return false; }
  cancel() { this.state = 'idle'; this.t = 0; this.pose = IDLE_FALL; }
  _rise(kind) { this.state = 'rise'; this.kind = kind; this.rt = 0; }
  /** Trả sự kiện: 'lie' (vừa nằm xuống) · 'selfrise' (hết giờ, tự dậy) · 'up' (dậy xong) · 'dodged' (né xong) · null. */
  update(dtIn) {
    const dt = clamp(Number(dtIn) || 0, 0, 0.1); let ev = null;
    if (this.state === 'idle') return null;
    if (this.state === 'dodge') { this.t += dt; this.pose = dodgePose(this.t, this.dir); if (this.t >= FALL.dodge) { this.cancel(); ev = 'dodged'; } return ev; }
    if (this.state === 'rise') {
      this.rt += dt; this.pose = risePose(this.rt, this.dir, this.kind);
      if (this.rt >= (this.kind === 'self' ? FALL.riseSelf : FALL.riseTouch)) { this.cancel(); ev = 'up'; }
      return ev;
    }
    this.t += dt; const prev = this.state;
    this.state = this.t < FALL.recoil ? 'hit' : this.t < FALL.recoil + FALL.fall ? 'fall' : 'lie';
    if (prev !== 'lie' && this.state === 'lie') ev = 'lie';
    this.pose = lyingPose(this.t, this.dir);
    if (this.state === 'lie' && this.t >= FALL.selfRiseAt) { this._rise('self'); ev = 'selfrise'; }
    return ev;
  }
}
