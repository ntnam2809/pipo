// Bảng preset biểu cảm: dữ liệu thuần. Mỗi preset: {left, right, mouth, fx?, spring?, colorShift?, loop?, blink?, light?}
import { defaultEye, clampEye } from './params.js';
import { defaultMouth, clampMouth } from './mouth.js';

/**
 * Dựng preset. `s` = tham số chung hai mắt; `l`/`r` ghi đè riêng.
 * `s.tilt` theo quy ước "nghiêng vào trong dương": mắt trái giữ nguyên, mắt phải đảo dấu.
 */
function P({ s = {}, l = {}, r = {}, mouth = {}, fx = [], spring, colorShift, loop, blink = 1, light = 1, label }) {
  const mk = (side, o) => {
    const merged = { ...s };
    if (side === 'R' && typeof s.tilt === 'number') merged.tilt = -s.tilt;
    return clampEye({ ...defaultEye(), ...merged, ...o });
  };
  return {
    label, left: mk('L', l), right: mk('R', r),
    mouth: clampMouth({ ...defaultMouth(), ...mouth }),
    fx, spring, colorShift, loop, blink, light,
  };
}

export const EXPRESSIONS = {
  neutral: P({ label: 'Bình thường', mouth: { curve: 0.25, mw: 0.72 } }),
  happy: P({
    label: 'Vui', s: { h: 1.2, lidBottom: 0.26, lidBottomCurve: 0.55, shine: 1, glow: 0.7 },
    mouth: { curve: 0.55, mw: 0.85 },
  }),
  joy: P({
    label: 'Hớn hở', s: { shape: 'arc', w: 1.1, h: 0.8, glow: 0.8 }, fx: ['sparkles'], blink: 0,
    mouth: { shape: 'triangle', open: 0.7, mw: 0.95 },
    loop: { period: 0.5, y: 0.09, abs: true, my: 0.12 },
  }),
  love: P({
    label: 'Yêu', s: { shape: 'heart', w: 1.05, h: 1.0, glow: 0.9 }, fx: ['hearts', 'blush'], blink: 0,
    colorShift: { hue: 338, mix: 0.9 }, mouth: { shape: 'cat', mw: 0.9, curve: 0.6 },
    loop: { period: 0.72, w: 0.05, h: 0.05 },
  }),
  excited: P({
    label: 'Phấn khích', s: { shape: 'star', w: 1.1, h: 1.1, glow: 0.95 }, fx: ['sparkles'], blink: 0,
    colorShift: { hue: 48, mix: 1 }, spring: { all: [1.4, 0.45] },
    mouth: { shape: 'triangle', open: 0.85, mw: 1.0 },
    loop: { period: 0.34, w: 0.06, h: 0.06, y: 0.04, spin: 0.9 },
  }),
  wink: P({
    label: 'Nháy mắt', s: { lidBottom: 0.12, lidBottomCurve: 0.4 },
    r: { shape: 'arc', w: 1.0, h: 0.6 }, blink: 0.4,
    mouth: { curve: 0.7, skew: 0.5, mw: 0.85, tongue: 0.5, open: 0.12 },
  }),
  smug: P({
    label: 'Đắc ý', s: { h: 1.1, lidTop: 0.4, lidBottom: 0.16, lidBottomCurve: 0.45, pupilY: -0.15 },
    l: { lidTopAngle: -0.12 }, r: { lidTopAngle: -0.12, lidTop: 0.5 }, blink: 0.6,
    mouth: { curve: 0.5, skew: 0.8, mw: 0.7, mx: 0.15 },
  }),
  curious: P({
    label: 'Tò mò', l: { w: 1.12, h: 1.55, tilt: -0.07, pupilY: -0.3 }, r: { w: 0.85, h: 1.1, tilt: 0.1, lidTop: 0.12, pupilY: -0.3 },
    s: { pupil: 0.55 }, fx: [], mouth: { shape: 'o', open: 0.25, round: 0.8, mw: 0.5, skew: 0.3, curve: 0 },
  }),
  suspicious: P({
    label: 'Nghi ngờ', s: { h: 0.95, lidTop: 0.45, lidTopAngle: -0.25, lidBottom: 0.22, lidBottomCurve: -0.2, pupilX: 0.85, pupil: 0.45 },
    l: { lidTop: 0.5 }, mouth: { shape: 'line', curve: -0.08, skew: 0.5, mw: 0.5, mx: 0.15 },
  }),
  surprised: P({
    label: 'Ngạc nhiên', s: { w: 1.04, h: 1.6, radius: 1, pupil: 0.3, glow: 0.8, shine: 1 },
    spring: { all: [1.7, 0.33] }, mouth: { shape: 'o', open: 0.45, round: 1, mw: 0.45, curve: 0 },
  }),
  shocked: P({
    label: 'Sốc', s: { w: 0.62, h: 0.75, radius: 1, pupil: 0.2, wobble: 0.3, glow: 0.5, shine: 0.6 }, fx: ['exclaim'],
    spring: { all: [2.0, 0.28] }, light: 1.1, colorShift: { hue: 52, mix: 0.9 },
    mouth: { shape: 'o', open: 0.8, round: 1, mw: 0.55, curve: 0, wobble: 0.3 },
  }),
  scared: P({
    label: 'Sợ', s: { w: 0.78, h: 1.0, wobble: 0.7, lidTopAngle: 0.4, lidTop: 0.08, shine: 0.45, pupil: 0.3 }, fx: ['sweat'],
    colorShift: { hue: 195, mix: 0.3, sat: 0.7 }, spring: { all: [1.2, 0.35] }, light: 0.95,
    mouth: { shape: 'zigzag', mw: 0.55, curve: -0.2, wobble: 0.85, open: 0.1 },
  }),
  sad: P({
    label: 'Buồn', s: { h: 1.25, lidTop: 0.22, lidTopAngle: 0.45, tilt: -0.1, y: 0.1, pupilY: 0.45, shine: 1, glow: 0.45 },
    colorShift: { hue: 215, mix: 0.55 }, spring: { all: [0.65, 0.9] }, light: 0.9, blink: 0.7,
    mouth: { shape: 'smile', curve: -0.6, mw: 0.55, wobble: 0.15, my: 0.1 },
  }),
  cry: P({
    label: 'Khóc', s: { h: 1.2, lidTop: 0.24, lidTopAngle: 0.48, lidBottom: 0.1, lidBottomCurve: -0.2, tilt: -0.1, y: 0.1, pupilY: 0.4, shine: 1, wobble: 0.28, glow: 0.45 },
    fx: ['tears'], colorShift: { hue: 210, mix: 0.6 }, spring: { all: [0.8, 0.7] }, light: 0.9,
    mouth: { shape: 'smile', curve: -0.8, mw: 0.7, wobble: 0.8, open: 0.2, my: 0.1 },
    loop: { period: 0.8, y: 0.025, my: 0.06 },
  }),
  angry: P({
    label: 'Giận', s: { h: 1.0, lidTop: 0.42, lidTopAngle: -0.95, tilt: 0.14, lidBottom: 0.1, lidBottomCurve: -0.3, wobble: 0.1, glow: 0.9, pupil: 0.4 },
    fx: ['anger'], colorShift: { hue: 2, mix: 0.92 }, spring: { all: [1.5, 0.5] }, blink: 0.4,
    mouth: { shape: 'line', curve: -0.12, mw: 0.45, skew: -0.6, mx: -0.12 },
  }),
  annoyed: P({
    label: 'Bực', s: { h: 1.0, lidTop: 0.55, lidBottom: 0.1, lidBottomCurve: -0.3, pupilX: -0.7, pupilY: -0.25 }, blink: 0.5,
    mouth: { shape: 'line', curve: -0.15, mw: 0.5, skew: 0.4, mx: 0.1 },
  }),
  confused: P({
    label: 'Bối rối', l: { w: 1.0, h: 1.35, tilt: 0.1, lidTop: 0.1 }, r: { w: 0.8, h: 0.9, tilt: -0.04, lidTop: 0.28, lidTopAngle: -0.3 },
    fx: ['question'], loop: { period: 1.3, pupilX: 0.55 },
    mouth: { shape: 'zigzag', mw: 0.5, curve: 0, wobble: 0.1, skew: -0.3 },
  }),
  dizzy: P({
    label: 'Chóng mặt', s: { shape: 'spiral', w: 1.15, h: 1.15, wobble: 0.35 }, fx: ['orbit'], blink: 0,
    loop: { period: 1, spin: 6, x: 0.02 }, spring: { all: [0.8, 0.5] },
    mouth: { shape: 'zigzag', mw: 0.75, curve: 0, open: 0.2, wobble: 0.5 },
  }),
  sleepy: P({
    label: 'Buồn ngủ', s: { h: 1.15, lidTop: 0.48, lidBottom: 0.1, pupilY: 0.3, glow: 0.45 },
    spring: { all: [0.5, 1.0] }, blink: 0.5, light: 0.85,
    mouth: { shape: 'o', open: 0.15, round: 0.6, mw: 0.5, curve: 0 },
    loop: { period: 4.5, lidTop: 0.1, yawn: true },
  }),
  sleeping: P({
    label: 'Ngủ', s: { shape: 'line', w: 1.0, h: 0.5, glow: 0.35 }, fx: ['zzz', 'sleepbubble'], blink: 0, light: 0.65,
    spring: { all: [0.5, 1.0] }, mouth: { shape: 'smile', curve: 0.2, open: 0.18, mw: 0.5 },
    loop: { period: 4.2, h: 0.15, open: 0.1 },
  }),
  hungry: P({
    label: 'Đói', s: { pupil: 0.8, pupilY: 0.85, shine: 1, tilt: -0.08, lidBottom: 0.08, lidBottomCurve: 0.2, glow: 0.7 },
    fx: ['sparkles'], mouth: { shape: 'o', open: 0.3, round: 0.6, mw: 0.55, curve: 0.15, tongue: 0.2, wobble: 0.2 },
  }),
  thirsty: P({
    label: 'Khát', s: { lidTop: 0.25, lidBottom: 0.1, pupilX: 0.5, pupilY: 0.5, shine: 0.9 },
    fx: ['drop'], mouth: { shape: 'line', curve: -0.1, open: 0.12, mw: 0.5, tongue: 0.5, wobble: 0.2 },
    spring: { all: [0.8, 0.8] },
  }),
  eating: P({
    label: 'Nhai', s: { lidBottom: 0.52, lidBottomCurve: 0.75, h: 1.1 }, fx: ['crumbs'], blink: 0,
    mouth: { shape: 'smile', curve: 0.2, open: 0.3, mw: 0.7 },
    loop: { period: 0.58, y: 0.06, h: 0.08, abs: true, open: 0.28, mx: 0.35, mxPeriod: 1.1 },
  }),
  drinking: P({
    label: 'Uống', s: { shape: 'arc', w: 1.05, h: 0.75, glow: 0.8 }, fx: ['bubbles'], blink: 0, colorShift: { hue: 190, mix: 0.3 },
    mouth: { shape: 'o', open: 0.35, round: 0.9, mw: 0.5, curve: 0 },
    loop: { period: 0.62, y: 0.05, abs: true, round: -0.3, open: 0.15 },
  }),
  cold: P({
    label: 'Lạnh', s: { w: 0.92, h: 1.2, lidTop: 0.25, lidTopAngle: 0.3, wobble: 0.8 }, fx: ['coldbreath'],
    colorShift: { hue: 205, mix: 0.6 }, loop: { period: 0.09, x: 0.012 }, light: 1.05,
    mouth: { shape: 'zigzag', mw: 0.6, curve: -0.2, wobble: 0.9, open: 0.15 },
  }),
  hot: P({
    label: 'Nóng', s: { lidTop: 0.4, lidTopAngle: 0.25, lidBottom: 0.15, h: 1.15 }, fx: ['sweat'], colorShift: { hue: 22, mix: 1 },
    loop: { period: 2.6, lidTop: 0.1 }, spring: { all: [0.8, 0.8] },
    mouth: { shape: 'o', open: 0.5, round: 0.35, mw: 0.7, curve: -0.2, tongue: 0.7 },
  }),
  cool: P({
    label: 'Ngầu', s: { lidTop: 0.35, h: 1.1, glow: 0.5 }, fx: ['sunglasses'], blink: 0.4,
    mouth: { curve: 0.45, skew: 0.7, mw: 0.7 },
  }),
  rainy: P({
    label: 'Mưa', s: { lidTop: 0.45, lidTopAngle: 0.5, pupilY: -0.4, glow: 0.4 }, fx: ['umbrella'],
    colorShift: { hue: 205, mix: 0.4 }, light: 0.9,
    mouth: { shape: 'smile', curve: -0.2, mw: 0.5 },
  }),
  blush: P({
    label: 'Ngượng', s: { h: 1.15, lidBottom: 0.3, lidBottomCurve: 0.5, pupilX: -0.4, pupilY: 0.3, shine: 1 }, fx: ['blush'],
    mouth: { shape: 'cat', mw: 0.8, curve: 0.5, my: 0.05 },
  }),
  bored: P({
    label: 'Chán', s: { lidTop: 0.5, lidTopAngle: 0.1, shine: 0.5, glow: 0.4 }, blink: 0.6, colorShift: { sat: 0.6, mix: 0 },
    loop: { period: 2.6, pupilX: 0.55, pupilY: 0.2, mxPeriod: 5, mx: 0.1 },
    mouth: { shape: 'line', curve: -0.02, mw: 0.55 },
  }),
  focus: P({
    label: 'Chăm chú', s: { w: 1.1, h: 0.95, pupil: 0.55, glow: 0.8, lidTop: 0.08, lidTopAngle: -0.15 }, colorShift: { hue: 160, mix: 0.2 },
    mouth: { shape: 'o', open: 0.12, round: 0.5, mw: 0.45, curve: 0 },
  }),
  scanning: P({
    label: 'Quét', s: { w: 1.25, h: 0.55, radius: 0.5, pupil: 0.3, glow: 0.9 }, fx: ['scan'], colorShift: { hue: 150, mix: 0.45 }, blink: 0.3,
    loop: { period: 1.6, pupilX: 0.75 }, mouth: { shape: 'line', mw: 0.55, curve: 0 },
  }),
  glitch: P({
    label: 'Nhiễu', s: { w: 1.1, h: 0.9, wobble: 1, glow: 1 }, fx: ['glitch'], blink: 0, spring: { all: [2.2, 0.4] },
    loop: { period: 0.06, x: 0.1, mx: 0.2 }, mouth: { shape: 'zigzag', mw: 0.9, curve: 0, open: 0.3, wobble: 1 },
  }),
};

export const EXPRESSION_IDS = Object.keys(EXPRESSIONS);
export function getExpression(id) { return EXPRESSIONS[id] || EXPRESSIONS.neutral; }
export function isExpression(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPRESSIONS, id); }

export const FX_NAMES = ['sparkles', 'hearts', 'blush', 'exclaim', 'sweat', 'tears', 'anger', 'question', 'orbit', 'zzz', 'sleepbubble', 'drop', 'crumbs', 'bubbles', 'coldbreath', 'sunglasses', 'umbrella', 'scan', 'glitch'];
