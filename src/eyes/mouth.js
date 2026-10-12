// Schema tham số miệng nhỏ (§3.1b). Thuần dữ liệu, không DOM.
export const MOUTH_SHAPES = ['line', 'smile', 'cat', 'o', 'zigzag', 'triangle', 'dot'];

// [min, max, mặc định, nhóm lò xo]
export const MOUTH_PARAMS = {
  mw: [0.3, 1.4, 0.8, 'soft'],
  curve: [-1, 1, 0.3, 'soft'],
  open: [0, 1, 0, 'fast'],
  round: [0, 1, 0, 'soft'],
  skew: [-1, 1, 0, 'soft'],
  mx: [-1, 1, 0, 'fast'],
  my: [-1, 1, 0, 'soft'],
  tongue: [0, 1, 0, 'fast'],
  wobble: [0, 1, 0, 'soft'],
};
export const MOUTH_KEYS = Object.keys(MOUTH_PARAMS);
// nhanh cho cắn/nói, mềm cho cười
export const MOUTH_SPRING = { fast: { k: 700, zeta: 0.55 }, soft: { k: 170, zeta: 0.8 } };

// Kích thước: mw=1 ứng với 29% khoảng cách hai mắt.
export const MOUTH_BASE_FRAC = 0.29;
// Vị trí: dưới đáy mắt khoảng 0.55 chiều cao mắt.
export const MOUTH_DROP = 0.55;

export function defaultMouth() {
  const m = { shape: 'smile' };
  for (const k of MOUTH_KEYS) m[k] = MOUTH_PARAMS[k][2];
  return m;
}
export function clampMouth(p) {
  const out = { ...p };
  for (const k of MOUTH_KEYS) {
    const [lo, hi, def] = MOUTH_PARAMS[k];
    const v = Number(out[k]);
    out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  }
  if (!MOUTH_SHAPES.includes(out.shape)) out.shape = 'smile';
  return out;
}
export function lerpMouth(a, b, t) {
  const o = { shape: t >= 0.4 ? b.shape : a.shape };
  for (const k of MOUTH_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
export function validateMouth(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['mouth thiếu'];
  for (const k of MOUTH_KEYS) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`mouth.${k} không phải số`);
    else if (v < MOUTH_PARAMS[k][0] || v > MOUTH_PARAMS[k][1]) errs.push(`mouth.${k}=${v} ngoài khoảng`);
  }
  if (!MOUTH_SHAPES.includes(p.shape)) errs.push(`mouth.shape lạ: ${p.shape}`);
  return errs;
}
