// Body: sinh "tư thế" (pose) cho thân/đầu/tay từ biểu cảm + điệu nhảy, bằng lò xo. Thuần logic: không đụng DOM.
// pose = { bob, sway, tilt, squash, hover, armL:{lift,spread,curl}, armR:{...}, handL, handR }
//   handL/handR: tay "động tác" trong không gian tay (xem handclips.js) { x, y, rot, shape, scale, alpha } hoặc null khi đã ẩn hẳn.
//   fall: tư thế gục ngã (eyes/fall.js) { w, tilt, drop, sway, squash, shake, limp } hoặc null — vượt giới hạn tilt thường (tới ~1.45 rad); skin vẽ nằm ngang.
//   classic/pixel vẽ găng theo handL/handR; Eve không vẽ găng mà ghi đè armL/armR (thêm shape/sc/reach/front) bằng ánh xạ vị trí tay -> lift/spread/curl.
//   bob/sway/hover: phần của U (bob dương = hạ xuống); tilt: radian (dương = nghiêng sang phải màn hình);
//   squash: ~ ±0.15 (dương = ép dẹt); tay: lift -1 (rủ) .. +1 (giơ thẳng lên), spread -1 (khép/chéo vào) .. +1 (dang ra), curl -1..1 (cuộn đầu tay vào trong).
// Mọi skin áp bob/sway/tilt/squash lên khuôn mặt; chỉ skin có tay (eve) mới dùng arm*.
import { Spring } from '../core/spring.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const LIMITS = { bob: [-0.1, 0.14], sway: [-0.12, 0.12], tilt: [-0.4, 0.4], squash: [-0.16, 0.16], hover: [-0.05, 0.05], lift: [-1, 1], spread: [-1, 1], curl: [-1, 1] };

export const MOVES = ['bob', 'sway', 'step', 'tilt', 'hype'];

/** Tay: [lift, spread, curl, biên độ ngọ nguậy, tần số Hz]. */
const A = (lift, spread, curl = 0, wig = 0, hz = 3) => ({ lift, spread, curl, wig, hz });
const DOWN = A(-1, 0, 0), DROOP = A(-1, -0.12, 0.3), TIGHT = A(-0.9, -0.38, 0.8), CLOSE = A(-1, -0.4, 0.25);
const HANDS_UP = (wig = 0.25, hz = 3.2) => A(0.72, 0.5, 0.15, wig, hz);
const COVER = A(0.86, -0.6, 0.55), MOUTH = A(0.36, -0.58, 0.45), OPEN = A(-0.25, 0.45, 0, 0.08, 1.2);
const SCRATCH = A(0.86, -0.12, 0.62, 0.1, 5.5), HUG_SELF = A(-0.12, -0.9, 0.7, 0.05, 11);

/** [tay trái, tay phải] theo biểu cảm (không có = rủ xuống). */
export const ARM_POSES = {
  neutral: [DOWN, DOWN],
  happy: [A(0.5, 0.45, 0.1, 0.22, 2.6), A(0.5, 0.45, 0.1, 0.22, 2.6)],
  joy: [HANDS_UP(0.3, 4), HANDS_UP(0.3, 4)], excited: [HANDS_UP(0.35, 5.5), HANDS_UP(0.35, 5.5)], groove: [A(0.55, 0.55, 0.1, 0.3, 2), A(0.55, 0.55, 0.1, 0.3, 2)],
  love: [OPEN, OPEN], blush: [COVER, COVER],
  wink: [DOWN, A(0.62, 0.5, 0.2, 0.3, 3.6)], smug: [CLOSE, CLOSE], cool: [A(-0.3, -0.7, 0.4), A(-0.3, -0.7, 0.4)],
  curious: [DOWN, SCRATCH], confused: [DOWN, A(0.7, -0.05, 0.55, 0.12, 3)], suspicious: [A(-0.2, -0.8, 0.4), A(-0.2, -0.8, 0.4)],
  surprised: [A(0.6, 0.7, 0.1, 0.05, 8), A(0.6, 0.7, 0.1, 0.05, 8)], shocked: [A(0.75, 0.62, 0.2, 0.08, 14), A(0.75, 0.62, 0.2, 0.08, 14)],
  scared: [COVER, COVER], sad: [DROOP, DROOP], cry: [A(-0.95, -0.15, 0.4, 0.06, 6), A(-0.95, -0.15, 0.4, 0.06, 6)],
  angry: [TIGHT, TIGHT], annoyed: [A(-0.7, -0.5, 0.5), A(-0.7, -0.5, 0.5)],
  dizzy: [A(0.1, 0.8, 0.2, 0.45, 2.2), A(0.1, 0.8, 0.2, 0.45, 2.2)],
  sleepy: [DROOP, DROOP], sleeping: [CLOSE, CLOSE], bored: [DROOP, DROOP],
  hungry: [MOUTH, MOUTH], thirsty: [MOUTH, MOUTH], eating: [A(0.38, -0.6, 0.5, 0.1, 3.6), A(0.38, -0.6, 0.5, 0.1, 3.6)], drinking: [A(0.4, -0.55, 0.5, 0.06, 3), A(0.4, -0.55, 0.5, 0.06, 3)],
  cold: [HUG_SELF, HUG_SELF], hot: [A(0.12, 0.72, 0.1, 0.25, 4.5), A(0.12, 0.72, 0.1, 0.25, 4.5)], rainy: [A(0.88, -0.05, 0.1), A(0.88, -0.05, 0.1)],
  focus: [A(-0.6, -0.3, 0.3), A(-0.6, -0.3, 0.3)], scanning: [A(-0.5, 0.2, 0.1), A(-0.5, 0.2, 0.1)],
  glitch: [A(0.2, 0.5, 0.3, 0.6, 17), A(0.2, 0.5, 0.3, 0.6, 13)],
};

/** Thân theo biểu cảm: bob/tilt tĩnh + nảy (bounce) + rung (shake). */
const BODY_EXPR = {
  happy: { bounce: [2.2, 0.012] }, joy: { bounce: [3, 0.03] }, excited: { bounce: [4.5, 0.04] }, love: { sway: [1.1, 0.02], tilt: 0.04 }, groove: { bounce: [2, 0.02] },
  sad: { bob: 0.022, tilt: -0.05, hover: 0.4 }, cry: { bob: 0.024, tilt: -0.05, shake: [7, 0.005], hover: 0.4 }, sleepy: { bob: 0.018, tilt: 0.07, hover: 0.6 }, sleeping: { bob: 0.03, tilt: 0.12, hover: 0.15 },
  bored: { bob: 0.012, tilt: 0.06 }, scared: { shake: [38, 0.006], bob: 0.01 }, cold: { shake: [34, 0.007] }, angry: { bob: 0.012, shake: [26, 0.002] },
  curious: { tilt: 0.1 }, confused: { tilt: -0.09 }, suspicious: { tilt: -0.05, sway: [0, 0] }, dizzy: { sway: [2.4, 0.04], tilt: 0.0, wobbleTilt: [2.4, 0.14] },
  surprised: { bob: -0.02, squash: -0.08 }, shocked: { bob: -0.03, squash: -0.1, shake: [30, 0.004] }, smug: { tilt: 0.05 }, cool: { tilt: -0.04 },
  eating: { bounce: [3.4, 0.01] }, drinking: { bounce: [3.2, 0.008] }, blush: { tilt: 0.06, sway: [1.4, 0.008] }, glitch: { shake: [60, 0.012] },
};

// ---- tay động tác (clip) ----
const HAND_KEYS = ['x', 'y', 'rot', 'scale', 'alpha'];
const HAND_LIMITS = { x: [-3, 3], y: [-3, 3], rot: [-3.2, 3.2], scale: [0.3, 3.2], alpha: [0, 1] };
const mkHand = (side) => ({ sp: { x: new Spring(side * 1.7, 900, 0.78), y: new Spring(1.1, 900, 0.78), rot: new Spring(0, 900, 0.78), scale: new Spring(1, 800, 0.55), alpha: new Spring(0, 1600, 1) }, shape: 'open', has: false });

/** Mô hình thân Eve theo đơn vị F (nửa rộng đầu): vai, chiều dài tay. Dùng để đổi vị trí tay mục tiêu -> lift/spread/curl. */
export const EVE_ARM = { shoulderX: 0.91, shoulderY: 1.34, len: 1.03 };
const EVE_Y_BIAS = -0.14;   // đầu Eve cao hơn khuôn mặt classic/pixel: cùng clip, tay Eve nhắm cao hơn một chút
const SHAPE_CURL = { open: 0.12, flat: 0.0, fist: 0.3, point: 0.26, thumb: 0.3, gun: 0.3 };

/**
 * Tay mục tiêu (không gian tay) -> tư thế tay Eve. side = -1 (trái màn hình) | +1 (phải).
 * Hướng cánh tay theo góc từ vai tới tay; rot của tay lắc cánh tay quanh vai; tay quá xa thì cánh tay duỗi dài và gập khuỷu về phía đích.
 */
export function handToArm(hd, side) {
  const out = side * hd.x - EVE_ARM.shoulderX, up = EVE_ARM.shoulderY - (hd.y + EVE_Y_BIAS), d = Math.hypot(out, up);
  const ar = Math.abs(hd.rot), swing = clamp(hd.rot, -0.5, 0.5) * (1 - clamp((ar - 0.6) / 0.4, 0, 1));   // lắc cổ tay -> lắc cánh tay; tay xoay hẳn (chào, đưa trán) thì không kéo cánh tay theo
  const phi = Math.atan2(out, -up) - 0.85 * swing * side;      // 0 = thẳng xuống, π = thẳng lên, nhỏ hơn π = chếch ra ngoài
  const lift = -Math.cos(phi), sideOut = Math.max(-0.62, Math.sin(phi)), spread = (sideOut - 0.3) / 0.95;
  const bend = clamp(-out * 2.2, 0, 1) * 0.85 + clamp((d - EVE_ARM.len * 1.6) / 1.2, 0, 1) * 0.3;   // đích nằm phía trong vai thì gập khuỷu vào trong
  const curl = Math.cos(phi) * ((SHAPE_CURL[hd.shape] ?? 0.1) + bend);   // dấu cos: tay hướng lên thì gập vào trong là curl âm
  return { lift, spread, curl, shape: hd.shape, sc: hd.scale, reach: clamp(d / EVE_ARM.len, 0.62, 1.55), front: hd.scale > 1.35 };
}

const LIMP_ARM = { lift: -0.62, spread: 0.42, curl: 0.5 };
const mkFall = () => ({ tilt: new Spring(0, 300, 0.5), drop: new Spring(0, 260, 0.5), sway: new Spring(0, 240, 0.6), squash: new Spring(0, 320, 0.45), w: new Spring(0, 520, 1), limp: new Spring(0, 160, 0.8), shake: 0 });
const mkArm = () => ({ lift: new Spring(-1, 150, 0.62), spread: new Spring(0, 150, 0.62), curl: new Spring(0, 150, 0.7) });

export class Body {
  constructor() {
    this.sp = { bob: new Spring(0, 260, 0.55), sway: new Spring(0, 220, 0.6), tilt: new Spring(0, 200, 0.62), squash: new Spring(0, 320, 0.5), hover: new Spring(0, 40, 0.8) };
    this.armL = mkArm(); this.armR = mkArm(); this.mix = new Spring(0, 40, 1);
    this.handL = mkHand(-1); this.handR = mkHand(1); this.fl = mkFall();
    this.t = 0;
  }

  /** dt giây; ctx = { expression, dance, t, clip, fall }. fall = pose của FallDirector (hoặc null). clip = mẫu clip hiện tại { L, R } (handclips.sampleClip) hoặc null. Trả pose (số hữu hạn, trong khoảng). */
  update(dtIn, ctx = {}) {
    const dt = clamp(Number(dtIn) || 0, 0.0005, 0.05);
    this.t += dt; const t = Number.isFinite(ctx.t) ? ctx.t : this.t;
    const ex = ctx.expression || 'neutral', be = BODY_EXPR[ex] || {};
    const dance = ctx.dance && Number.isFinite(ctx.dance.phase) ? ctx.dance : null;

    // ---- đích theo biểu cảm (nền) ----
    let bob = (be.bob || 0) + Math.sin(TAU * t / 4.2) * 0.003, sway = 0, tilt = be.tilt || 0, squash = be.squash || 0;
    let hover = (0.012 * Math.sin(t * 1.35) + 0.005 * Math.sin(t * 2.1 + 1.3)) * (be.hover ?? 1);
    if (be.bounce) { const [hz, amp] = be.bounce; bob -= Math.abs(Math.sin(Math.PI * hz * t)) * amp; squash += Math.cos(TAU * hz * t * 0.5) * amp * 1.2; }
    if (be.sway) sway += Math.sin(TAU * be.sway[0] * t) * be.sway[1];
    if (be.shake) { const [hz, amp] = be.shake; sway += Math.sin(t * hz) * amp; bob += Math.sin(t * hz * 1.3 + 1) * amp * 0.6; }
    if (be.wobbleTilt) tilt += Math.sin(TAU * be.wobbleTilt[0] * t) * be.wobbleTilt[1];
    const pose = ARM_POSES[ex] || ARM_POSES.neutral;
    const arm = (a, idx) => {
      const w = a.wig ? Math.sin(TAU * a.hz * t + idx * 1.7) : 0;
      return { lift: a.lift + a.wig * w, spread: a.spread + a.wig * 0.6 * Math.cos(TAU * a.hz * t + idx * 1.7), curl: a.curl + a.wig * 0.25 * w };
    };
    let aL = arm(pose[0], 0), aR = arm(pose[1], 1);

    // ---- điệu nhảy ----
    const m = this.mix.update(dance ? 1 : 0, dt); const mix = clamp(m, 0, 1);
    if (dance) {
      const bpm = clamp(dance.bpm || 120, 40, 240), e = clamp(dance.energy ?? 0.6, 0, 1), a = 0.3 + 0.7 * e;
      // bù độ trễ của lò xo: đẩy pha tới trước một chút
      const x = (dance.beatIndex | 0) + clamp(dance.phase, 0, 1) + 0.045 * bpm / 60, bi = Math.floor(x), p = x - bi, par = bi & 1;
      const dip = 0.5 + 0.5 * Math.cos(TAU * p), pulse = dip * dip, alt = -Math.cos(Math.PI * (par + p));
      let dB = 0.05 * a * dip, dS = 0, dT = 0, dQ = 0.1 * a * pulse, dL = { lift: -0.78 + 0.4 * (1 - dip), spread: 0.15, curl: 0.15 }, dR = dL;
      switch (dance.move) {
        case 'sway': dS = 0.085 * a * alt; dT = -dS * 2.3; dB = 0.03 * a * dip; dQ = 0.06 * a * pulse; dL = { lift: -0.7 + 0.95 * Math.max(0, -alt), spread: 0.2, curl: 0.15 }; dR = { lift: -0.7 + 0.95 * Math.max(0, alt), spread: 0.2, curl: 0.15 }; break;
        case 'step': dS = 0.065 * a * alt; dB = 0.06 * a * dip; dQ = 0.12 * a * pulse; dT = -dS * 0.8; dL = { lift: -0.35 + 0.9 * Math.max(0, -alt), spread: 0.25, curl: 0.25 }; dR = { lift: -0.35 + 0.9 * Math.max(0, alt), spread: 0.25, curl: 0.25 }; break;
        case 'tilt': dT = 0.3 * a * alt; dS = 0.02 * a * alt; dB = 0.03 * a * dip; dQ = 0.05 * a * pulse; dL = { lift: -0.7 + 0.35 * Math.max(0, -alt), spread: 0.4, curl: 0.15 }; dR = { lift: -0.7 + 0.35 * Math.max(0, alt), spread: 0.4, curl: 0.15 }; break;
        case 'hype': dB = 0.075 * a * dip; dQ = 0.14 * a * pulse; dT = 0.1 * a * alt; dS = 0.03 * a * alt; dL = dR = { lift: 0.45 + 0.4 * (1 - dip), spread: 0.35, curl: 0.2 }; break;
        default: break; // bob
      }
      bob = lerp(bob, dB, mix); sway = lerp(sway, dS, mix); tilt = lerp(tilt, dT, mix); squash = lerp(squash, dQ, mix); hover = lerp(hover, hover * 0.4, mix);
      const mixArm = (cur, d) => ({ lift: lerp(cur.lift, d.lift, mix), spread: lerp(cur.spread, d.spread, mix), curl: lerp(cur.curl, d.curl, mix) });
      aL = mixArm(aL, dL); aR = mixArm(aR, dR);
    }

    // ---- tay động tác: lò xo bám clip; không clip thì giữ chỗ cũ và mờ dần ----
    const clip = ctx.clip && typeof ctx.clip === 'object' ? ctx.clip : null, hands = {}, wts = {};
    for (const [key, side, st] of [['L', -1, this.handL], ['R', 1, this.handR]]) {
      const src = clip && clip[key];
      if (src) for (const k of HAND_KEYS) { const v = Number.isFinite(src[k]) ? src[k] : st.sp[k].x; st.sp[k].update(clamp(v, HAND_LIMITS[k][0], HAND_LIMITS[k][1]), dt); }
      else { for (const k of ['x', 'y', 'rot', 'scale']) st.sp[k].update(st.sp[k].x, dt); st.sp.alpha.update(0, dt, 700, 1); }
      if (src && SHAPES_OK.has(src.shape)) st.shape = src.shape;
      const al = clamp(st.sp.alpha.x, 0, 1);
      hands[key] = al > 0.012 ? { x: clamp(st.sp.x.x, -3, 3), y: clamp(st.sp.y.x, -3, 3), rot: clamp(st.sp.rot.x, -3.2, 3.2), shape: st.shape, scale: clamp(st.sp.scale.x, 0.3, 3.2), alpha: al } : null;
      wts[key] = al * al * (3 - 2 * al);
    }
    const wmax = Math.max(wts.L, wts.R);
    if (wts.L > 0.004) aL = overrideArm(aL, hands.L || { ...handNow(this.handL), alpha: 0 }, -1, wts.L);
    if (wts.R > 0.004) aR = overrideArm(aR, hands.R || { ...handNow(this.handR), alpha: 0 }, 1, wts.R);
    // clip chỉ dùng một tay: tay kia thả lỏng thay vì giữ tư thế biểu cảm (giơ ngang khi vui...)
    if (wts.R > 0.004 && wts.L <= 0.004) aL = relaxArm(aL, wts.R); else if (wts.L > 0.004 && wts.R <= 0.004) aR = relaxArm(aR, wts.L);

    // ---- gục ngã: lò xo mềm (đáp xuống nảy nhẹ), tay rũ ----
    const fi = ctx.fall && typeof ctx.fall === 'object' ? ctx.fall : null, F = this.fl;
    const fz = (k) => (fi && Number.isFinite(fi[k]) ? fi[k] : 0);
    F.tilt.update(clamp(fz('tilt'), -1.7, 1.7), dt); F.drop.update(clamp(fz('drop'), -0.3, 0.5), dt); F.sway.update(clamp(fz('sway'), -0.5, 0.5), dt);
    F.squash.update(clamp(fz('squash'), -0.3, 0.4), dt); F.w.update(clamp(fz('w'), 0, 1), dt); F.limp.update(clamp(fz('limp'), 0, 1), dt); F.shake = clamp(fz('shake'), 0, 1);
    if (F.limp.x > 0.01) {
      const k = clamp(F.limp.x, 0, 1), tw = F.shake * 0.35 * Math.sin(this.t * 40);
      aL = { lift: lerp(aL.lift, LIMP_ARM.lift + tw, k), spread: lerp(aL.spread, LIMP_ARM.spread, k), curl: lerp(aL.curl, LIMP_ARM.curl, k) };
      aR = { lift: lerp(aR.lift, LIMP_ARM.lift - tw, k), spread: lerp(aR.spread, LIMP_ARM.spread, k), curl: lerp(aR.curl, LIMP_ARM.curl, k) };
    }

    // ---- lò xo (khi nhảy cứng hơn để bám nhịp) ----
    const hard = mix > 0.3, kb = hard ? 700 : 260, kz = hard ? 0.72 : 0.55;
    const S = this.sp;
    const out = {
      bob: S.bob.update(bob, dt, kb, kz), sway: S.sway.update(sway, dt, hard ? 520 : 220, hard ? 0.7 : 0.6), tilt: S.tilt.update(tilt, dt, hard ? 420 : 200, hard ? 0.7 : 0.62),
      squash: S.squash.update(squash, dt, hard ? 800 : 320, hard ? 0.62 : 0.5), hover: S.hover.update(hover, dt),
    };
    const ka = Math.max(hard ? 380 : 150, 150 + 420 * wmax);   // có clip: tay bám nhanh để vẫy/đấm kịp nhịp
    const armOut = (st, tg) => ({ lift: st.lift.update(tg.lift, dt, ka, 0.62), spread: st.spread.update(tg.spread, dt, ka, 0.62), curl: st.curl.update(tg.curl, dt, ka, 0.7), ex: tg.ex });
    const L = armOut(this.armL, aL), R = armOut(this.armR, aR);
    const lim = (k, v) => (Number.isFinite(v) ? clamp(v, LIMITS[k][0], LIMITS[k][1]) : 0);
    const fixArm = (a) => { const o = { lift: lim('lift', a.lift), spread: lim('spread', a.spread), curl: lim('curl', a.curl) }; if (a.ex) Object.assign(o, a.ex); return o; };
    return { bob: lim('bob', out.bob), sway: lim('sway', out.sway), tilt: lim('tilt', out.tilt), squash: lim('squash', out.squash), hover: lim('hover', out.hover), armL: fixArm(L), armR: fixArm(R), handL: hands.L, handR: hands.R, fall: F.w.x > 0.01 ? { w: clamp(F.w.x, 0, 1), tilt: clamp(F.tilt.x, -1.7, 1.7), drop: clamp(F.drop.x, -0.3, 0.5), sway: clamp(F.sway.x, -0.5, 0.5), squash: clamp(F.squash.x, -0.3, 0.4), shake: F.shake, limp: clamp(F.limp.x, 0, 1) } : null };
  }
}

const SHAPES_OK = new Set(['open', 'fist', 'point', 'thumb', 'flat', 'gun']);
const handNow = (st) => ({ x: st.sp.x.x, y: st.sp.y.x, rot: st.sp.rot.x, shape: st.shape, scale: st.sp.scale.x });
/** Trộn tư thế tay theo biểu cảm với tư thế đích của clip (trọng số w); ghi thêm shape/sc/reach/front cho skin có tay. */
const RELAX = { lift: -0.9, spread: 0.08, curl: 0.12 };
function relaxArm(cur, w) { const k = 0.85 * w; return { lift: lerp(cur.lift, RELAX.lift, k), spread: lerp(cur.spread, RELAX.spread, k), curl: lerp(cur.curl, RELAX.curl, k) }; }
function overrideArm(cur, hd, side, w) {
  const m = handToArm(hd, side), mix = (a, b) => lerp(a, b, w);
  return { lift: mix(cur.lift, m.lift), spread: mix(cur.spread, m.spread), curl: mix(cur.curl, m.curl), ex: { shape: m.shape, sc: lerp(1, m.sc, w), reach: lerp(1, m.reach, w), front: m.front && w > 0.3, w } };
}

export function restPose() {
  return { bob: 0, sway: 0, tilt: 0, squash: 0, hover: 0, armL: { lift: -1, spread: 0, curl: 0 }, armR: { lift: -1, spread: 0, curl: 0 }, handL: null, handR: null, fall: null };
}
