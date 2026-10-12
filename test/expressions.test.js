import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSIONS, EXPRESSION_IDS, FX_NAMES, isExpression } from '../src/eyes/expressions.js';
import { validateEye, KEYS } from '../src/eyes/params.js';
import { validateMouth, MOUTH_KEYS } from '../src/eyes/mouth.js';

const REQUIRED = ['neutral', 'happy', 'joy', 'love', 'excited', 'wink', 'smug', 'curious', 'suspicious', 'surprised', 'shocked', 'scared', 'sad', 'cry', 'angry', 'annoyed', 'confused', 'dizzy', 'sleepy', 'sleeping', 'hungry', 'thirsty', 'eating', 'drinking', 'cold', 'hot', 'cool', 'rainy', 'blush', 'bored', 'focus', 'scanning', 'glitch'];

test('có đủ biểu cảm theo §3.4 (>= 26)', () => {
  assert.ok(EXPRESSION_IDS.length >= 26);
  for (const id of REQUIRED) assert.ok(isExpression(id), id);
});
test('mọi preset: mắt trái/phải + miệng hợp lệ, trong khoảng', () => {
  for (const id of EXPRESSION_IDS) {
    const p = EXPRESSIONS[id];
    assert.deepEqual(validateEye(p.left), [], `${id}.left`); assert.deepEqual(validateEye(p.right), [], `${id}.right`);
    assert.deepEqual(validateMouth(p.mouth), [], `${id}.mouth`);
    for (const f of p.fx) assert.ok(FX_NAMES.includes(f), `${id}: fx lạ ${f}`);
    assert.ok(p.blink >= 0 && p.light > 0);
  }
});
test('mọi preset có mouth (bắt buộc)', () => { for (const id of EXPRESSION_IDS) assert.ok(EXPRESSIONS[id].mouth && EXPRESSIONS[id].mouth.shape, id); });
test('các biểu cảm khác nhau rõ (chữ ký mắt + miệng + fx không trùng, khoảng cách tối thiểu)', () => {
  const sig = (id) => { const p = EXPRESSIONS[id]; const v = []; for (const k of KEYS) v.push(p.left[k], p.right[k]); for (const k of MOUTH_KEYS) v.push(p.mouth[k]); return v; };
  const seen = new Map();
  for (const id of EXPRESSION_IDS) {
    const p = EXPRESSIONS[id]; const key = JSON.stringify([p.left.shape, p.right.shape, p.mouth.shape, [...p.fx].sort(), p.loop ? Object.keys(p.loop).sort() : null, p.colorShift?.hue ?? null, sig(id).map((x) => Math.round(x * 20))]);
    assert.ok(!seen.has(key), `${id} trùng ${seen.get(key)}`); seen.set(key, id);
  }
  // mỗi cặp phải khác nhau ở >= 1 yếu tố "nhìn thấy": hình, fx, màu, hoặc tham số
  const ids = EXPRESSION_IDS;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = EXPRESSIONS[ids[i]], b = EXPRESSIONS[ids[j]]; const sa = sig(ids[i]), sb = sig(ids[j]);
    const d = Math.sqrt(sa.reduce((s, x, k) => s + (x - sb[k]) ** 2, 0));
    const vis = d > 0.25 || a.left.shape !== b.left.shape || a.fx.join() !== b.fx.join() || a.mouth.shape !== b.mouth.shape || a.colorShift?.hue !== b.colorShift?.hue;
    assert.ok(vis, `${ids[i]} ~ ${ids[j]} quá giống`);
  }
});
test('miệng nhỏ nhu mì: mw trong khoảng 0.3..1.4 và neutral cười nhẹ', () => {
  for (const id of EXPRESSION_IDS) assert.ok(EXPRESSIONS[id].mouth.mw <= 1.0 + 1e-9, id);
  assert.ok(EXPRESSIONS.neutral.mouth.curve > 0 && EXPRESSIONS.neutral.mouth.curve < 0.5);
});
test('đặc tả miệng theo hành vi §3.1b', () => {
  const m = (id) => EXPRESSIONS[id].mouth;
  assert.equal(m('joy').shape, 'triangle'); assert.equal(m('love').shape, 'cat'); assert.equal(m('blush').shape, 'cat');
  assert.ok(m('sad').curve < 0 && m('cry').curve < 0 && m('cry').wobble > 0.3);
  assert.equal(m('surprised').shape, 'o'); assert.equal(m('dizzy').shape, 'zigzag'); assert.ok(m('angry').skew !== 0 && m('angry').mw < m('neutral').mw);
  assert.equal(m('drinking').shape, 'o'); assert.ok(EXPRESSIONS.eating.loop.open > 0 && EXPRESSIONS.eating.loop.mx > 0);
  assert.ok(m('sleeping').curve > 0 && m('sleeping').open > 0);
});
test('hình đặc biệt có mặt trong bộ biểu cảm', () => {
  const shapes = new Set(EXPRESSION_IDS.map((i) => EXPRESSIONS[i].left.shape)); for (const s of ['heart', 'star', 'spiral', 'arc', 'line', 'normal']) assert.ok(shapes.has(s), s);
  assert.equal(EXPRESSIONS.wink.right.shape, 'arc'); assert.equal(EXPRESSIONS.wink.left.shape, 'normal');
});
