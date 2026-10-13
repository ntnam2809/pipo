// Landmark bàn tay tổng hợp (21 điểm, hệ ảnh: y hướng xuống) để test handpose.js — không phải test (không đuôi .test.js).
const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const FING = { index: { mcp: { x: -0.32, y: -0.95 }, seg: [0.45, 0.28, 0.25], tilt: -0.06 }, middle: { mcp: { x: 0, y: -1 }, seg: [0.5, 0.31, 0.27], tilt: 0 }, ring: { mcp: { x: 0.3, y: -0.92 }, seg: [0.46, 0.29, 0.25], tilt: 0.06 }, pinky: { mcp: { x: 0.58, y: -0.78 }, seg: [0.36, 0.22, 0.2], tilt: 0.14 } };
function finger(f, extended, lift = 0) {
  const d = rot({ x: 0, y: -1 }, f.tilt), [a, b, c] = f.seg, pip = add(f.mcp, d, a);
  if (extended) { const dip = add(pip, d, b); return [f.mcp, pip, dip, add(dip, d, c)]; }
  const d2 = rot(d, 1.9), d3 = rot(d, 3.8), dip = add(pip, d2, b * 0.8);
  return [f.mcp, pip, dip, add(dip, d3, c * 0.8)];
}
const THUMB = {
  out: [{ x: -0.35, y: -0.25 }, { x: -0.55, y: -0.5 }, { x: -0.78, y: -0.72 }, { x: -0.97, y: -0.93 }],
  up: [{ x: -0.35, y: -0.25 }, { x: -0.5, y: -0.55 }, { x: -0.58, y: -0.95 }, { x: -0.62, y: -1.45 }],
  tucked: [{ x: -0.35, y: -0.25 }, { x: -0.4, y: -0.42 }, { x: -0.25, y: -0.55 }, { x: -0.12, y: -0.62 }],
};
const POSE = { open: ['out', 1, 1, 1, 1], fist: ['tucked', 0, 0, 0, 0], point: ['tucked', 1, 0, 0, 0], gun: ['out', 1, 0, 0, 0], thumbsup: ['up', 0, 0, 0, 0], peace: ['tucked', 1, 1, 0, 0] };
/** pose: open|fist|point|gun|thumbsup|peace. o: { cx, cy, scale (S theo đơn vị ảnh), thumb ('out'|'up'|'tucked' ghi đè), lift (đầu trỏ giật lên, đơn vị S), angle, aspect, z }. */
export function makeHand(pose, o = {}) {
  const [th, ...ex] = POSE[pose], { cx = 0.5, cy = 0.6, scale = 0.18, angle = 0, aspect = 1, lift = 0 } = o;
  const pts = [{ x: 0, y: 0 }, ...THUMB[o.thumb || th]];
  ['index', 'middle', 'ring', 'pinky'].forEach((n, i) => { const fp = finger(FING[n], !!ex[i]); pts.push(...fp); });
  if (lift) { pts[8] = add(pts[8], { x: 0, y: -1 }, lift); pts[7] = add(pts[7], { x: 0, y: -1 }, lift * 0.6); }
  return pts.map((p) => { const r = rot(p, angle); return { x: cx + (r.x * scale) / aspect, y: cy + r.y * scale, z: 0 }; });
}
