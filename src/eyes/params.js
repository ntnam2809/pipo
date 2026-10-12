// Schema tham số một con mắt + clamp. Thuần dữ liệu.
export const SHAPES = ['normal', 'heart', 'star', 'spiral', 'x', 'arc', 'line', 'dot'];

// [min, max, mặc định, nhóm lò xo]
export const PARAMS = {
  w: [0.05, 1.6, 1.0, 'size'],
  h: [0.05, 1.6, 1.35, 'size'],
  radius: [0, 1, 0.85, 'size'],
  x: [-1, 1, 0, 'pos'],
  y: [-1, 1, 0, 'pos'],
  tilt: [-0.6, 0.6, 0, 'pos'],
  lidTop: [0, 1, 0, 'lid'],
  lidTopAngle: [-1, 1, 0, 'lid'],
  lidBottom: [0, 1, 0, 'lid'],
  lidBottomCurve: [-1, 1, 0, 'lid'],
  pupil: [0, 1, 0.5, 'look'],
  pupilX: [-1, 1, 0, 'look'],
  pupilY: [-1, 1, 0, 'look'],
  glow: [0, 1, 0.6, 'color'],
  shine: [0, 1, 0.8, 'color'],
  wobble: [0, 1, 0, 'color'],
  hueShift: [-180, 180, 0, 'color'],
};
export const KEYS = Object.keys(PARAMS);

// Độ cứng + tỉ số tắt mặc định theo nhóm: mí nhanh, kích thước vừa, vị trí mềm.
export const GROUP_SPRING = {
  lid: { k: 900, zeta: 0.75 },
  size: { k: 320, zeta: 0.55 },
  pos: { k: 140, zeta: 0.65 },
  look: { k: 520, zeta: 0.8 },
  color: { k: 120, zeta: 1.0 },
};

export function defaultEye() {
  const e = { shape: 'normal' };
  for (const k of KEYS) e[k] = PARAMS[k][2];
  return e;
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function clampEye(p) {
  const out = { ...p };
  for (const k of KEYS) {
    const [lo, hi, def] = PARAMS[k];
    const v = Number(out[k]);
    out[k] = Number.isFinite(v) ? clamp(v, lo, hi) : def;
  }
  if (!SHAPES.includes(out.shape)) out.shape = 'normal';
  return out;
}
export function mergeEye(base, over) { return { ...base, ...(over || {}) }; }
export function lerpEye(a, b, t) {
  const o = { shape: t >= 0.4 ? b.shape : a.shape };
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
export function validateEye(p) {
  const errs = [];
  for (const k of KEYS) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${k} không phải số`);
    else if (v < PARAMS[k][0] || v > PARAMS[k][1]) errs.push(`${k}=${v} ngoài khoảng`);
  }
  if (!SHAPES.includes(p.shape)) errs.push(`shape lạ: ${p.shape}`);
  return errs;
}
