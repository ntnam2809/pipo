// Clip động tác tay: dữ liệu + nội suy thuần (không đụng DOM). Mọi skin dùng chung một "không gian tay".
//
// Không gian tay: gốc ở tâm mặt, x dương = bên phải màn hình, y dương = xuống. Đơn vị F = nửa bề rộng mặt
// (x = ±1 là mép ngoài hai mắt ở classic/pixel, và mép đầu ở Eve). Tay "cạnh mặt" ~ |x| 1.1–1.4; trên đầu y ≈ -1;
// cằm y ≈ +0.9. Tay trái = tay bên trái màn hình (L), tay phải = bên phải (R).
// Một tay: { x, y, rot (rad, dương = chiều kim đồng hồ, 0 = ngón hướng lên), shape, scale (1 = cỡ găng chuẩn; >1 = lại gần người xem), alpha }.
// shape ∈ SHAPES. Skin tự dịch không gian này ra pixel (classic/pixel vẽ găng; Eve đổi sang lift/spread/curl cho tay có sẵn).
//
// Clip = { name, dur, keys: [{ t, L?, R?, e? }], events?: [{ t, type, ... }], wait?, loop? }.
//   - key.L/R: trường nào bỏ trống thì giữ như key trước của tay đó (key đầu: tay ẩn ngoài rìa, alpha 0); nhắc tới tay mà không ghi alpha = 1.
//   - key.e: easing của đoạn ĐI TỚI key này (lin · in · out · io · back · snap).
//   - events: { t, type: 'sound'|'fx'|'shake'|'say'|'hit'|'miss', name?, hand?, amt?, text? } — main.js xử lý.
//   - wait: { t0, t1, onHit } — cửa sổ chờ chạm (highfive): resolve(true) chuyển sang clip onHit, hết cửa sổ mà chưa chạm phát 'miss'.
//   - loop: { from, to } — giữ vòng [from, to] tới khi stop() (handsup); stop() thả cho clip chạy nốt phần đuôi.
export const SHAPES = ['open', 'fist', 'point', 'thumb', 'flat', 'gun'];
const SIDES = ['L', 'R'];
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const EASE = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  io: (u) => u * u * (3 - 2 * u),
  back: (u) => { const x = u - 1; return 1 + 2.9 * x * x * x + 1.9 * x * x; },   // vọt quá đích rồi về (easeOutBack)
  snap: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -11 * u)),                           // bật nhanh gần như tức thì
};

/** Tay ẩn: ngoài rìa dưới mặt, alpha 0. */
export const hiddenHand = (side) => ({ x: side === 'L' ? -1.7 : 1.7, y: 1.1, rot: 0, shape: 'open', scale: 1, alpha: 0 });

/** Biên dịch keyframe -> track đầy đủ trường cho từng tay. */
function compile(c) {
  const tracks = { L: [], R: [] };
  for (const side of SIDES) {
    let cur = hiddenHand(side);
    for (const k of c.keys) {
      const s = k[side]; if (!s) continue;
      cur = { ...cur, ...s, alpha: s.alpha ?? 1 };
      tracks[side].push({ t: k.t, st: { ...cur }, e: EASE[k.e] ? k.e : 'io' });
    }
  }
  return { ...c, tracks };
}

function sampleTrack(tr, t, side) {
  if (!tr.length) return hiddenHand(side);
  if (t <= tr[0].t) return { ...tr[0].st };
  const last = tr[tr.length - 1]; if (t >= last.t) return { ...last.st };
  let i = 0; while (i < tr.length - 2 && t >= tr[i + 1].t) i++;
  const a = tr[i], b = tr[i + 1], u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1), k = EASE[b.e](u);
  const L = (p, q) => p + (q - p) * k;
  return { x: L(a.st.x, b.st.x), y: L(a.st.y, b.st.y), rot: L(a.st.rot, b.st.rot), scale: L(a.st.scale, b.st.scale), alpha: clamp(L(a.st.alpha, b.st.alpha), 0, 1), shape: u < 0.35 ? a.st.shape : b.st.shape };
}

/** Lấy mẫu clip ở thời điểm tSec -> { L, R, done }. Luôn trả số hữu hạn. */
export function sampleClip(clip, tSec) {
  const t = clamp(num(tSec), 0, clip.dur);
  return { L: sampleTrack(clip.tracks.L, t, 'L'), R: sampleTrack(clip.tracks.R, t, 'R'), done: num(tSec) >= clip.dur };
}

/** Đổi tay: trái <-> phải, x và rot đổi dấu. */
export function mirror(clip) {
  const flip = (h) => (h ? { ...h, x: h.x == null ? h.x : -h.x, rot: h.rot == null ? h.rot : -h.rot } : h);
  const keys = clip.keys.map((k) => ({ ...k, L: flip(k.R), R: flip(k.L) }));
  const events = (clip.events || []).map((ev) => (ev.hand ? { ...ev, hand: ev.hand === 'L' ? 'R' : 'L' } : ev));
  const { tracks, ...rest } = clip; void tracks;
  return compile({ ...rest, keys, events });
}

/** Sự kiện rơi trong (t0, t1]; t0 < 0 thì gồm cả t = 0. */
export function eventsIn(clip, t0, t1) {
  return (clip.events || []).filter((ev) => (ev.t > t0 || (t0 < 0 && ev.t >= 0)) && ev.t <= t1);
}

// ---------------- thư viện clip ----------------
const h = (x, y, shape = 'open', o = {}) => ({ x, y, shape, ...o });
const OUT = (side, shape = 'open', o = {}) => h(side === 'L' ? -1.7 : 1.7, 1.0, shape, { alpha: 0, ...o });
const pw = (t, hand, amt = 1, name = 'pow') => [{ t, type: 'sound', name }, { t, type: 'fx', name, hand }, { t, type: 'shake', amt }];

/** Các nhịp lắc cổ tay quanh vị trí (x, y), xen dấu (phase đảo pha). */
function wagKeys(side, t0, n, per, x, y, amp, shape = 'open', phase = 1, scale = 1) {
  const sg = side === 'L' ? -1 : 1, ks = [];
  for (let i = 0; i < n; i++) ks.push({ t: t0 + i * per, [side]: h(x + sg * 0.05 * (i % 2 ? -1 : 1) * phase, y, shape, { scale, rot: amp * (i % 2 ? -1 : 1) * phase }), e: 'io' });
  return ks;
}

function punchKeys(side, tHit, power = 1, guard = null) {
  const sg = side === 'L' ? -1 : 1, g = guard || h(sg * 1.2, 0.5, 'fist', { scale: 0.9, rot: -sg * 0.25 });
  return [
    { t: tHit - 0.2, [side]: { ...g, x: sg * 1.4, y: 0.62, scale: 0.8, rot: -sg * 0.4 }, e: 'out' },                                                       // lấy đà
    { t: tHit, [side]: h(sg * 0.22, 0.02, 'fist', { scale: 1.9 + 0.7 * power, rot: -sg * 0.1 }), e: 'snap' },                                         // đấm thẳng vào người xem
    { t: tHit + 0.3, [side]: { ...g }, e: 'io' },
  ];
}

function makeClap(per = 0.5, n = 4) {
  const keys = [{ t: 0, L: OUT('L', 'flat', { rot: 0.2 }), R: OUT('R', 'flat', { rot: -0.2 }) }], events = [];
  const apart = (t, e) => ({ t, L: h(-1.0, 0.45, 'flat', { rot: 0.12, scale: 1.1 }), R: h(1.0, 0.45, 'flat', { rot: -0.12, scale: 1.1 }), e });
  keys.push(apart(0.3, 'back'));
  let t = 0.3;
  for (let i = 0; i < n; i++) {
    t += per * 0.5; keys.push({ t, L: h(-0.2, 0.42, 'flat', { rot: 0.05, scale: 1.2 }), R: h(0.2, 0.42, 'flat', { rot: -0.05, scale: 1.2 }), e: 'in' });
    events.push({ t, type: 'sound', name: 'slap' }, { t, type: 'fx', name: 'slap', hand: 'M' });
    t += per * 0.5; if (i < n - 1) keys.push(apart(t, 'out'));
  }
  keys.push({ t: t + 0.25, L: h(-1.1, 0.5, 'flat', { rot: 0.12, scale: 1.1 }), R: h(1.1, 0.5, 'flat', { rot: -0.12, scale: 1.1 }), e: 'out' });
  keys.push({ t: t + 0.55, L: OUT('L', 'flat', { rot: 0.2 }), R: OUT('R', 'flat', { rot: -0.2 }), e: 'in' });
  return { name: 'clap', dur: t + 0.55, keys, events };
}

const DEFS = {
  // chào: tay phải giơ cạnh mặt, lắc qua lại 3 nhịp
  wave: { dur: 2.3, keys: [
    { t: 0, R: OUT('R', 'open', { rot: 0.2 }) },
    { t: 0.3, R: h(1.25, -0.72, 'open', { scale: 1.15, rot: 0.05 }), e: 'back' },
    ...wagKeys('R', 0.52, 6, 0.24, 1.25, -0.72, 0.44, 'open', 1, 1.15),
    { t: 1.95, R: h(1.25, -0.72, 'open', { scale: 1.15, rot: 0.05 }), e: 'io' },
    { t: 2.3, R: OUT('R', 'open', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.5, type: 'sound', name: 'whoosh' }] },
  // tạm biệt: hai tay vẫy lệch pha
  bye: { dur: 2.7, keys: [
    { t: 0, L: OUT('L', 'open', { rot: -0.2 }), R: OUT('R', 'open', { rot: 0.2 }) },
    { t: 0.32, L: h(-1.25, -0.72, 'open', { rot: -0.05, scale: 1.1 }), R: h(1.25, -0.72, 'open', { rot: 0.05, scale: 1.1 }), e: 'back' },
    ...wagKeys('L', 0.55, 8, 0.24, -1.25, -0.72, 0.46, 'open', 1, 1.1),
    ...wagKeys('R', 0.55, 8, 0.24, 1.25, -0.72, 0.46, 'open', 1, 1.1),
    { t: 2.35, L: h(-1.25, -0.72, 'open', { rot: -0.05, scale: 1.1 }), R: h(1.25, -0.72, 'open', { rot: 0.05, scale: 1.1 }), e: 'io' },
    { t: 2.7, L: OUT('L', 'open', { rot: -0.2 }), R: OUT('R', 'open', { rot: 0.2 }), e: 'in' },
  ].sort((a, b) => a.t - b.t) },
  // tuân lệnh: bàn tay khép đưa lên trán, giữ ~1,2 s
  salute: { dur: 2.5, keys: [
    { t: 0, R: OUT('R', 'flat', { rot: -0.3 }) },
    { t: 0.3, R: h(0.74, -0.8, 'flat', { scale: 1.15, rot: -1.3 }), e: 'snap' },
    { t: 0.8, R: h(0.74, -0.82, 'flat', { scale: 1.15, rot: -1.33 }), e: 'io' },
    { t: 1.3, R: h(0.74, -0.79, 'flat', { scale: 1.15, rot: -1.28 }), e: 'io' },
    { t: 1.75, R: h(0.74, -0.81, 'flat', { scale: 1.15, rot: -1.32 }), e: 'io' },
    { t: 2.0, R: h(1.3, 0.1, 'flat', { scale: 1.0, rot: -0.3 }), e: 'snap' },
    { t: 2.5, R: OUT('R', 'flat', { rot: -0.2 }), e: 'in' },
  ], events: [{ t: 0.34, type: 'sound', name: 'salute' }, { t: 0.3, type: 'fx', name: 'slap', hand: 'R', amt: 0.5 }] },
  // đấm: rút nắm đấm về rồi đấm thẳng vào người xem
  punch: { dur: 1.75, keys: [
    { t: 0, R: OUT('R', 'fist', { rot: 0.2 }) },
    { t: 0.28, R: h(1.25, 0.55, 'fist', { scale: 0.85, rot: 0.3 }), e: 'back' },
    { t: 0.56, R: h(1.5, 0.64, 'fist', { scale: 0.76, rot: 0.42 }), e: 'out' },
    { t: 0.72, R: h(0.22, 0.02, 'fist', { scale: 2.5, rot: -0.1 }), e: 'snap' },
    { t: 1.0, R: h(0.22, 0.06, 'fist', { scale: 2.4, rot: -0.08 }), e: 'io' },
    { t: 1.32, R: h(1.25, 0.55, 'fist', { scale: 0.9, rot: 0.3 }), e: 'io' },
    { t: 1.75, R: OUT('R', 'fist', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.55, type: 'sound', name: 'whoosh' }, ...pw(0.72, 'R', 1)] },
  // đấm liền ba cú: trái - phải - trái
  combo: { dur: 2.55, keys: [
    { t: 0, L: OUT('L', 'fist', { rot: -0.2 }), R: OUT('R', 'fist', { rot: 0.2 }) },
    { t: 0.3, L: h(-1.2, 0.5, 'fist', { scale: 0.9, rot: 0.25 }), R: h(1.2, 0.5, 'fist', { scale: 0.9, rot: -0.25 }), e: 'back' },
    ...punchKeys('L', 0.75, 0.6), ...punchKeys('R', 1.15, 0.6), ...punchKeys('L', 1.55, 1),
    { t: 2.2, L: h(-1.2, 0.5, 'fist', { scale: 0.9, rot: 0.25 }), R: h(1.2, 0.5, 'fist', { scale: 0.9, rot: -0.25 }), e: 'io' },
    { t: 2.55, L: OUT('L', 'fist', { rot: -0.2 }), R: OUT('R', 'fist', { rot: 0.2 }), e: 'in' },
  ].sort((a, b) => a.t - b.t), events: [...pw(0.75, 'L', 0.7), ...pw(1.15, 'R', 0.7), ...pw(1.55, 'L', 1.2)] },
  // đập tay: giơ lòng bàn tay về phía người xem, chờ chạm (wait). Chạm -> highfiveHit; không chạm -> 'miss' rồi hạ tay buồn
  highfive: { dur: 3.15, wait: { t0: 0.5, t1: 2.55, onHit: 'highfiveHit' }, keys: [
    { t: 0, R: OUT('R', 'open', { rot: 0.2 }) },
    { t: 0.45, R: h(1.2, -0.82, 'open', { scale: 1.3, rot: 0.1 }), e: 'back' },
    { t: 1.0, R: h(1.2, -0.9, 'open', { scale: 1.3, rot: 0.04 }), e: 'io' },
    { t: 1.55, R: h(1.2, -0.8, 'open', { scale: 1.3, rot: 0.14 }), e: 'io' },
    { t: 2.1, R: h(1.2, -0.9, 'open', { scale: 1.3, rot: 0.04 }), e: 'io' },
    { t: 2.55, R: h(1.2, -0.82, 'open', { scale: 1.3, rot: 0.1 }), e: 'io' },
    { t: 3.15, R: h(1.35, 0.7, 'open', { scale: 1.0, rot: 1.0, alpha: 0 }), e: 'in' },
  ], events: [{ t: 0.4, type: 'sound', name: 'whoosh' }] },
  highfiveHit: { dur: 1.3, keys: [
    { t: 0, R: h(1.2, -0.82, 'open', { scale: 1.3, rot: 0.1 }) },
    { t: 0.1, R: h(0.7, -0.72, 'open', { scale: 1.95, rot: 0.0 }), e: 'snap' },
    { t: 0.38, R: h(1.2, -0.84, 'open', { scale: 1.35, rot: 0.1 }), e: 'back' },
    { t: 0.85, R: h(1.2, -0.82, 'open', { scale: 1.3, rot: 0.08 }), e: 'io' },
    { t: 1.3, R: OUT('R', 'open', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.08, type: 'sound', name: 'slap' }, { t: 0.08, type: 'fx', name: 'slap', hand: 'R' }, { t: 0.08, type: 'shake', amt: 0.6 }] },
  // cụng tay
  fistbump: { dur: 2.0, keys: [
    { t: 0, R: OUT('R', 'fist', { rot: 0.2 }) },
    { t: 0.32, R: h(1.3, 0.35, 'fist', { scale: 1.0, rot: 0.15 }), e: 'back' },
    { t: 0.62, R: h(1.5, 0.42, 'fist', { scale: 0.9, rot: 0.3 }), e: 'out' },
    { t: 0.76, R: h(0.5, 0.2, 'fist', { scale: 1.9, rot: -0.05 }), e: 'snap' },
    { t: 1.15, R: h(0.52, 0.22, 'fist', { scale: 1.85, rot: -0.04 }), e: 'io' },
    { t: 1.5, R: h(1.3, 0.35, 'fist', { scale: 1.0, rot: 0.15 }), e: 'io' },
    { t: 2.0, R: OUT('R', 'fist', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.6, type: 'sound', name: 'whoosh' }, { t: 0.76, type: 'sound', name: 'slap' }, { t: 0.76, type: 'fx', name: 'pow', hand: 'R' }, { t: 0.76, type: 'shake', amt: 0.5 }] },
  // ngón cái
  thumbsup: { dur: 2.3, keys: [
    { t: 0, R: OUT('R', 'thumb', { rot: 0.2 }) },
    { t: 0.38, R: h(1.2, -0.78, 'thumb', { scale: 1.45, rot: 0.1 }), e: 'back' },
    { t: 0.68, R: h(1.2, -0.94, 'thumb', { scale: 1.5, rot: -0.04 }), e: 'io' },
    { t: 0.95, R: h(1.2, -0.76, 'thumb', { scale: 1.45, rot: 0.1 }), e: 'io' },
    { t: 1.25, R: h(1.2, -0.94, 'thumb', { scale: 1.5, rot: -0.04 }), e: 'io' },
    { t: 1.75, R: h(1.2, -0.8, 'thumb', { scale: 1.45, rot: 0.06 }), e: 'io' },
    { t: 2.3, R: OUT('R', 'thumb', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.45, type: 'fx', name: 'sparkle', hand: 'R' }, { t: 0.7, type: 'fx', name: 'sparkle', hand: 'R' }, { t: 1.25, type: 'fx', name: 'sparkle', hand: 'R' }] },
  // vỗ tay (nhịp mặc định 0.5 s; ClipPlayer.play('clap', { period }) co giãn theo BPM)
  clap: makeClap(0.5, 4),
  // chỉ vào người xem
  point: { dur: 2.2, keys: [
    { t: 0, R: OUT('R', 'point', { rot: 0.2 }) },
    { t: 0.32, R: h(1.05, 0.45, 'point', { scale: 1.25, rot: 0.38 }), e: 'back' },
    { t: 0.62, R: h(0.55, 0.28, 'point', { scale: 2.0, rot: 0.12 }), e: 'snap' },
    { t: 0.92, R: h(1.0, 0.45, 'point', { scale: 1.3, rot: 0.35 }), e: 'io' },
    { t: 1.18, R: h(0.52, 0.26, 'point', { scale: 2.15, rot: 0.1 }), e: 'snap' },
    { t: 1.6, R: h(1.0, 0.45, 'point', { scale: 1.3, rot: 0.35 }), e: 'io' },
    { t: 2.2, R: OUT('R', 'point', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.6, type: 'sound', name: 'whoosh' }, { t: 1.16, type: 'sound', name: 'whoosh' }] },
  // ú òa: che mắt rồi mở
  peekaboo: { dur: 2.7, keys: [
    { t: 0, L: OUT('L', 'flat', { rot: 0.2 }), R: OUT('R', 'flat', { rot: -0.2 }) },
    { t: 0.34, L: h(-0.5, -0.04, 'flat', { scale: 1.75, rot: 0.2 }), R: h(0.5, -0.04, 'flat', { scale: 1.75, rot: -0.2 }), e: 'out' },
    { t: 1.5, L: h(-0.5, -0.02, 'flat', { scale: 1.75, rot: 0.2 }), R: h(0.5, -0.02, 'flat', { scale: 1.75, rot: -0.2 }), e: 'lin' },
    { t: 1.72, L: h(-1.3, -0.2, 'open', { scale: 1.25, rot: -0.3 }), R: h(1.3, -0.2, 'open', { scale: 1.25, rot: 0.3 }), e: 'back' },
    { t: 2.2, L: h(-1.32, -0.2, 'open', { scale: 1.25, rot: -0.22 }), R: h(1.32, -0.2, 'open', { scale: 1.25, rot: 0.22 }), e: 'io' },
    { t: 2.7, L: OUT('L', 'open', { rot: -0.2 }), R: OUT('R', 'open', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.3, type: 'sound', name: 'whoosh' }, { t: 1.72, type: 'say', text: 'Ú òa!' }, { t: 1.72, type: 'sound', name: 'happy' }] },
  // đầu hàng (phần B): hai tay giơ cao, run; giữ vòng tới khi stop()
  handsup: { dur: 1.9, loop: { from: 0.55, to: 1.25 }, keys: [
    { t: 0, L: OUT('L', 'open', { rot: -0.2 }), R: OUT('R', 'open', { rot: 0.2 }) },
    { t: 0.4, L: h(-1.1, -0.7, 'open', { scale: 1.1, rot: -0.22 }), R: h(1.1, -0.7, 'open', { scale: 1.1, rot: 0.22 }), e: 'back' },
    { t: 0.55, L: h(-1.1, -0.68, 'open', { scale: 1.1, rot: -0.2 }), R: h(1.1, -0.68, 'open', { scale: 1.1, rot: 0.2 }), e: 'io' },
    { t: 0.75, L: h(-1.14, -0.74, 'open', { scale: 1.1, rot: -0.28 }), R: h(1.14, -0.74, 'open', { scale: 1.1, rot: 0.28 }), e: 'io' },
    { t: 0.95, L: h(-1.06, -0.66, 'open', { scale: 1.1, rot: -0.16 }), R: h(1.06, -0.66, 'open', { scale: 1.1, rot: 0.16 }), e: 'io' },
    { t: 1.25, L: h(-1.1, -0.68, 'open', { scale: 1.1, rot: -0.2 }), R: h(1.1, -0.68, 'open', { scale: 1.1, rot: 0.2 }), e: 'io' },
    { t: 1.9, L: OUT('L', 'open', { rot: -0.2 }), R: OUT('R', 'open', { rot: 0.2 }), e: 'in' },
  ] },
  // bắn lại (phần B): chĩa tay hình súng về phía người xem, giật
  gun: { dur: 2.0, keys: [
    { t: 0, R: OUT('R', 'gun', { rot: 0.2 }) },
    { t: 0.32, R: h(1.1, 0.38, 'gun', { scale: 1.15, rot: -0.55 }), e: 'back' },
    { t: 0.65, R: h(0.62, 0.15, 'gun', { scale: 1.55, rot: -1.15 }), e: 'out' },
    { t: 0.82, R: h(0.7, 0.2, 'gun', { scale: 1.7, rot: -1.5 }), e: 'snap' },
    { t: 1.05, R: h(0.62, 0.15, 'gun', { scale: 1.55, rot: -1.15 }), e: 'out' },
    { t: 1.5, R: h(0.62, 0.17, 'gun', { scale: 1.5, rot: -1.1 }), e: 'io' },
    { t: 2.0, R: OUT('R', 'gun', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.82, type: 'sound', name: 'pew' }, { t: 0.82, type: 'fx', name: 'pow', hand: 'R', amt: 0.6 }, { t: 0.86, type: 'fx', name: 'slap', hand: 'R' }, { t: 0.82, type: 'shake', amt: 0.4 }] },
  // giơ nắm đấm ăn mừng (khi nhảy hype)
  fistpump: { dur: 2.0, keys: [
    { t: 0, R: OUT('R', 'fist', { rot: 0.2 }) },
    { t: 0.28, R: h(1.15, 0.12, 'fist', { scale: 1.1, rot: 0.1 }), e: 'back' },
    { t: 0.5, R: h(1.15, -0.8, 'fist', { scale: 1.15, rot: 0.05 }), e: 'out' },
    { t: 0.78, R: h(1.15, -0.1, 'fist', { scale: 1.1, rot: 0.1 }), e: 'io' },
    { t: 1.02, R: h(1.15, -0.8, 'fist', { scale: 1.15, rot: 0.05 }), e: 'out' },
    { t: 1.3, R: h(1.15, -0.1, 'fist', { scale: 1.1, rot: 0.1 }), e: 'io' },
    { t: 1.54, R: h(1.15, -0.85, 'fist', { scale: 1.2, rot: 0.05 }), e: 'out' },
    { t: 2.0, R: OUT('R', 'fist', { rot: 0.2 }), e: 'in' },
  ], events: [{ t: 0.5, type: 'sound', name: 'whoosh' }] },
};

/** Clip theo tên (đã biên dịch). */
export const CLIPS = {};
for (const [name, d] of Object.entries(DEFS)) { const c = compile({ name, ...d, keys: [...d.keys].sort((a, b) => a.t - b.t) }); CLIPS[name] = c; }
export const CLIP_NAMES = Object.keys(CLIPS);
/** Động tác người dùng gọi được (khay ✋ Động tác, LLM, giọng nói): không gồm highfiveHit/handsup/gun/fistpump (nội bộ). */
export const GESTURES = ['wave', 'bye', 'salute', 'punch', 'combo', 'highfive', 'fistbump', 'thumbsup', 'clap', 'point', 'peekaboo'];

/** Bộ phát clip: giữ thời gian, phát sự kiện đúng lúc, vòng lặp (handsup), cửa sổ chờ chạm (highfive). */
export class ClipPlayer {
  constructor(lib = CLIPS) { this.lib = lib; this.clip = null; this.name = null; this.t = 0; this.rate = 1; this.stopping = false; this.hitDone = false; }
  has(name) { return !!this.lib[name]; }
  get active() { return !!this.clip; }
  get waiting() { const w = this.clip && this.clip.wait; return !!(w && !this.hitDone && this.t >= w.t0 && this.t < w.t1); }
  /** o.rate: nhanh/chậm hơn; o.period: riêng clap — chu kỳ 1 cái vỗ (giây); o.mirror: đổi tay. */
  play(name, o = {}) {
    let c = this.lib[name]; if (!c) return false;
    if (name === 'clap' && o.period > 0) c = makeClapCompiled(clamp(o.period, 0.28, 1.2), o.count || 4);
    if (o.mirror) c = mirror(c);
    this.clip = c; this.name = name; this.t = 0; this._prev = -1e-6; this.rate = clamp(num(o.rate, 1), 0.3, 3); this.stopping = false; this.hitDone = false;
    return true;
  }
  /** Thả vòng lặp (handsup) hoặc cắt clip ngay. */
  stop(now = false) { if (!this.clip) return; if (now || !this.clip.loop) { this.clip = null; this.name = null; } else this.stopping = true; }
  /** Có người chạm đúng lúc chờ (highfive): chuyển sang clip onHit. */
  resolve(ok) {
    if (!this.waiting) return false;
    this.hitDone = true;
    if (ok && this.lib[this.clip.wait.onHit]) { const hit = this.clip.wait.onHit; this.clip = this.lib[hit]; this.name = hit; this.t = 0; this._prev = -1e-6; this.hitDone = true; return true; }
    return false;
  }
  update(dt) {
    if (!this.clip) return { active: false, name: null, L: hiddenHand('L'), R: hiddenHand('R'), done: false, events: [] };
    const c = this.clip, events = [], prev = this._prev, step = clamp(num(dt), 0, 0.1) * this.rate;
    let t = this.t + step;
    if (c.wait && !this.hitDone && this.t < c.wait.t1 && t >= c.wait.t1) { events.push({ type: 'miss', t: c.wait.t1 }); this.hitDone = true; }
    if (c.loop && !this.stopping && t >= c.loop.to) {
      events.push(...eventsIn(c, prev, c.loop.to)); t = c.loop.from + (t - c.loop.to); this.t = t; this._prev = c.loop.from - 1e-6;
      return { active: true, name: this.name, ...sampleClip(c, t), done: false, events };
    }
    events.push(...eventsIn(c, prev, Math.min(t, c.dur)));
    this.t = t; this._prev = t;
    const s = sampleClip(c, t);
    if (s.done) { this.clip = null; this.name = null; return { active: false, name: c.name, ...s, events }; }
    return { active: true, name: c.name, ...s, events };
  }
}
function makeClapCompiled(per, n) { return compile(makeClap(per, n)); }
