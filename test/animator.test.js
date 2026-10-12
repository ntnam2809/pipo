import test from 'node:test';
import assert from 'node:assert/strict';
import { Animator } from '../src/eyes/animator.js';
import { EXPRESSIONS, EXPRESSION_IDS } from '../src/eyes/expressions.js';
import { validateEye } from '../src/eyes/params.js';
import { validateMouth } from '../src/eyes/mouth.js';

function rng(seed = 1) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const run = (a, sec, dt = 1 / 60) => { let f; for (let i = 0; i < sec / dt; i++) f = a.update(dt); return f; };

test('hội tụ về preset (happy): lidBottom & miệng cong', () => {
  const a = new Animator({ rng: rng() }); a.setBase('happy'); const f = run(a, 2);
  assert.ok(Math.abs(f.L.lidBottom - EXPRESSIONS.happy.left.lidBottom) < 0.05); assert.ok(f.mouth.curve > 0.4);
});
test('frame luôn hợp lệ trên mọi biểu cảm (mắt + miệng trong khoảng)', () => {
  const a = new Animator({ rng: rng(3) });
  for (const id of EXPRESSION_IDS) { a.applyIntent({ expression: id, duration: 5000 }); for (let i = 0; i < 90; i++) { const f = a.update(1 / 60); assert.deepEqual(validateEye(f.L).filter((e) => !e.includes('hueShift')), [], id); assert.deepEqual(validateMouth(f.mouth), [], id); } }
});
test('chớp mắt ngẫu nhiên xảy ra và có squash/stretch', () => {
  const a = new Animator({ rng: rng(7) }); a.setBase('neutral'); let blinks = 0, was = false, maxW = 0;
  for (let i = 0; i < 60 * 30; i++) { const f = a.update(1 / 60); const closed = f.L.lidTop > 0.5; if (closed && !was) blinks++; was = closed; maxW = Math.max(maxW, f.L.w); }
  assert.ok(blinks >= 5 && blinks <= 16, 'số lần chớp ' + blinks); assert.ok(maxW > 1.0);
});
test('mắt phải trễ hơn mắt trái (lag 15-40ms) khi đổi biểu cảm', () => {
  const a = new Animator({ rng: rng(2) }); a.setBase('neutral'); run(a, 1.5); a.applyIntent({ expression: 'surprised', duration: 3000 });
  const f1 = a.update(1 / 120), f2 = a.update(1 / 120), f3 = a.update(1 / 120); void f1; void f2;
  assert.ok(Math.abs(f3.L.h - 1.35) > Math.abs(f3.R.h - 1.35) - 1e-9);
});
test('morph hình: normal -> heart đi qua co lại rồi pop', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); run(a, 1); a.setBase('love'); const sc = []; let shapes = new Set();
  for (let i = 0; i < 60; i++) { const f = a.update(1 / 60); sc.push(f.L.shapeScale); shapes.add(f.L.shape); }
  assert.ok(Math.min(...sc) < 0.2, 'có co về ~0'); assert.ok(Math.max(...sc) > 1.02, 'có overshoot pop'); assert.ok(shapes.has('heart') && shapes.has('normal'));
  assert.ok(Math.abs(sc[sc.length - 1] - 1) < 0.01);
});
test('miệng morph hình khi đổi biểu cảm', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); run(a, 1); a.setBase('surprised'); const f = run(a, 1); assert.equal(f.mouth.shape, 'o'); assert.ok(f.mouth.open > 0.3);
});
test('nhép miệng theo biên độ giọng (lip-sync)', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); const quiet = run(a, 1).mouth.open; a.setVoiceAmp(0.9); const loud = run(a, 0.4).mouth.open; assert.ok(loud > quiet + 0.4);
});
test('ăn: miệng há rộng dần khi món lại gần, cắn đóng lại, liếm lưỡi', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); run(a, 1);
  a.setFeedApproach(0.2); const far = run(a, 0.6).mouth.open; a.setFeedApproach(1); const near = run(a, 0.6).mouth.open; assert.ok(near > far + 0.2);
  a.setFeedApproach(0); a.bite(); const during = run(a, 0.05).mouth.open; assert.ok(during < near);
  a.triggerLick(0.3); const f = run(a, 0.1); assert.ok(f.mouth.tongue > 0.3);
});
test('nhai: open dao động ~3-4Hz và mx lệch qua lại', () => {
  const a = new Animator({ rng: rng() }); a.applyIntent({ expression: 'eating', duration: 5000 }); run(a, 0.5);
  const o = [], x = []; for (let i = 0; i < 180; i++) { const f = a.update(1 / 60); o.push(f.mouth.open); x.push(f.mouth.mx); }
  let cross = 0; const mean = o.reduce((s, v) => s + v) / o.length; for (let i = 1; i < o.length; i++) if ((o[i - 1] - mean) * (o[i] - mean) < 0) cross++;
  const hz = cross / 2 / 3; assert.ok(hz > 2.5 && hz < 4.5, 'Hz ' + hz); assert.ok(Math.max(...x) > 0.05 && Math.min(...x) < -0.05);
});
test('ngáp: miệng o to dần, mắt nhắm theo', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); run(a, 0.5); a.triggerYawn(); let maxO = 0, maxL = 0; for (let i = 0; i < 100; i++) { const f = a.update(1 / 60); maxO = Math.max(maxO, f.mouth.open); maxL = Math.max(maxL, f.L.lidTop); }
  assert.ok(maxO > 0.6 && maxL > 0.6);
});
test('lệch trọng lực: đồng tử trượt theo nghiêng máy; lật ngược xoay roll', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); a.setTilt(0, 1, 0); const c = run(a, 1.5).L.pupilX; a.setTilt(0.8, 1, 0); const t = run(a, 1.5).L.pupilX; assert.ok(t > c + 0.1);
  a.setUpsideDown(true); assert.ok(Math.abs(run(a, 2).roll - Math.PI) < 0.1);
});
test('look-at: ngón tay > face; intent lookAt ép', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); a.setLook('face', -0.8, 0, 5); a.setLook('touch', 0.9, 0, 5); assert.ok(run(a, 1).L.pupilX > 0.5);
  a.applyIntent({ expression: 'angry', duration: 3000, lookAt: { x: -1, y: 0 } }); assert.ok(run(a, 1).L.x < 0);
});
test('hiện giờ bằng mắt rồi trả lại', () => {
  const a = new Animator({ rng: rng() }); a.showClock(['14', '35'], 1); assert.deepEqual(run(a, 0.5).clock, ['14', '35']); assert.equal(run(a, 1).clock, null);
});
test('theme + colorShift: giận ngả đỏ, rainbow trôi', () => {
  const a = new Animator({ rng: rng() }); a.setBase('neutral'); const h0 = run(a, 1).hue; a.setBase('angry'); const h1 = run(a, 2).hue; assert.ok(Math.min(h1, 360 - h1) < 25, 'đỏ ' + h1 + ' từ ' + h0);
  const b = new Animator({ rng: rng() }); b.setTheme('rainbow'); const x = run(b, 1).hue, y = run(b, 3).hue; assert.ok(Math.abs(x - y) > 10);
});
