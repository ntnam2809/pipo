import test from 'node:test';
import assert from 'node:assert/strict';
import { Needs, circadian, RESUME_FLOOR } from '../src/brain/needs.js';
import { Mood, pickBase, needCue } from '../src/brain/mood.js';
import { Reactions, pokeLadder } from '../src/brain/reactions.js';
import { RuleBrain, FOODS } from '../src/brain/rules.js';
import { StrokeDetector, HugDetector } from '../src/brain/gestures.js';
import { isExpression } from '../src/eyes/expressions.js';

const H = 3600 * 1000;
test('needs: decay theo thời gian thực (giờ để 1 -> 0.3)', () => {
  const n = new Needs({ hunger: 1, thirst: 1, affection: 1, fun: 1, energy: 1 });
  n.tick(6 * 3600); assert.ok(Math.abs(n.get('hunger') - 0.3) < 1e-6);
  assert.ok(Math.abs(n.get('thirst') - (1 - 0.7 * 6 / 4)) < 1e-6 || n.get('thirst') <= 0.06);
  assert.ok(n.get('fun') <= 0.06 + 1e-9);
});
test('needs: resume có sàn 0.15, không kéo thấp hơn mức đang có', () => {
  const n = new Needs({ hunger: 0.8, thirst: 0.1, affection: 0.5, fun: 0.5, energy: 0.5 });
  n.resume(100 * H); assert.ok(n.get('hunger') >= RESUME_FLOOR - 1e-9); assert.equal(n.get('thirst'), 0.1);
  for (const k of ['hunger', 'affection', 'fun']) assert.ok(n.get(k) >= 0.1);
  n.resume(-5); n.resume(NaN);
});
test('needs: năng lượng hồi khi ngủ, giảm khi thức; resume lâu thì tỉnh', () => {
  const n = new Needs({ energy: 0.3 }); n.tick(3600, { sleeping: true }); assert.ok(n.get('energy') > 0.55);
  const m = new Needs({ energy: 0.9 }); m.tick(3600, { sleeping: false, hour: 12 }); assert.ok(m.get('energy') < 0.9);
  const k = new Needs({ energy: 0.2 }); k.resume(8 * H); assert.ok(k.get('energy') >= 0.8);
});
test('circadian: tối muộn buồn ngủ, sáng tỉnh', () => { assert.equal(circadian(12), 0); assert.equal(circadian(2), 1); assert.ok(circadian(21) > 0 && circadian(21) < 1); assert.ok(circadian(6) > 0 && circadian(6) < 1); });
test('mood: bám nhu cầu và pickBase theo vùng', () => {
  const lo = new Needs({ hunger: 0.1, thirst: 0.1, affection: 0.1, fun: 0.1 }), hi = new Needs({ hunger: 1, thirst: 1, affection: 1, fun: 1 });
  const a = new Mood(), b = new Mood(); for (let i = 0; i < 60 * 40; i++) { a.update(1 / 10, lo); b.update(1 / 10, hi); }
  assert.ok(a.valence < -0.3 && b.valence > 0.5); assert.ok(['sad', 'annoyed'].includes(pickBase(a.valence, a.arousal)));
  assert.equal(pickBase(0.9, 0.9), 'joy'); assert.equal(pickBase(0.4, 0.5), 'happy'); assert.equal(pickBase(0, 0.1), 'bored');
  const m = new Mood(); m.bump(0.9, 0); assert.ok(m.vb > 0.8); m.update(60, hi); assert.ok(m.vb < 0.05);
});
test('needCue: nhu cầu < 0.3 chèn biểu cảm theo chu kỳ', () => {
  const n = new Needs({ hunger: 0.1, thirst: 0.9, energy: 0.9 }); assert.equal(needCue(n, 1, 12), 'hungry'); assert.equal(needCue(n, 10, 12), null);
  assert.equal(needCue(new Needs({ hunger: 1, thirst: 1, energy: 1, affection: 1, fun: 1 }), 1, 12), null);
  assert.equal(needCue(new Needs({ hunger: 1, thirst: 1, energy: 0.2 }), 1, 12), 'sleepy');
});
test('habituation: chọc leo thang surprised -> suspicious -> annoyed -> angry + quay đi', () => {
  const r = new Reactions(); const seq = []; let t = 1000;
  for (let i = 1; i <= 12; i++) { const it = r.fire('poke', {}, t); seq.push(it && it.expression); t += 400; }
  assert.equal(seq[0], 'surprised'); assert.equal(seq[2], 'suspicious'); assert.equal(seq[5], 'annoyed'); assert.equal(seq[9], 'angry'); assert.ok(pokeLadder(10).lookAt && Math.abs(pokeLadder(10).lookAt.x) === 1);
  assert.equal(pokeLadder(1).expression, 'surprised');
  // quên sau ~20-40s
  assert.equal(r.fire('poke', {}, t + 60000).expression, 'surprised');
});
test('reactions: priority, duration, cooldown', () => {
  const r = new Reactions(); const a = r.fire('freefall', {}, 0); assert.equal(a.priority, 9);
  assert.equal(r.fire('poke', {}, 100), null, 'ưu tiên thấp bị chặn'); assert.equal(r.active(500).name, 'freefall');
  assert.equal(r.fire('freefall', {}, 600), null, 'cooldown'); assert.equal(r.active(2500), null, 'hết duration');
  const e = r.fire('eat', { item: 'cookie' }, 10000); assert.equal(e.expression, 'eating'); assert.equal(r.active(10000 + 2700).expression, 'joy', 'chuỗi then'); assert.equal(r.active(10000 + 2600 + 1900), null);
});
test('reactions: hardshake chuỗi dizzy -> glitch -> annoyed', () => {
  const r = new Reactions(); r.fire('hardshake', {}, 0); assert.equal(r.active(100).expression, 'dizzy'); assert.equal(r.active(2300).expression, 'glitch'); assert.equal(r.active(2600).expression, 'annoyed');
});

function mk() { const needs = new Needs({ hunger: 0.5, thirst: 0.5, energy: 0.9, affection: 0.5, fun: 0.5 }); return new RuleBrain({ needs, mood: new Mood(), reactions: new Reactions(), rng: () => 0.3 }); }
test('rule brain: bảng tương tác -> intent hợp lệ', () => {
  const T = [
    ['touch:poke', {}, 'surprised'], ['touch:tap', { x: 0.5, y: 0 }, 'curious'], ['touch:pet', { count: 3 }, 'happy'], ['touch:hug', {}, 'blush'],
    ['motion:shake', {}, 'excited'], ['motion:hardshake', {}, 'dizzy'], ['motion:freefall', {}, 'shocked'], ['motion:upsidedown', {}, 'confused'],
    ['geo:newplace', {}, 'curious'], ['geo:home', {}, 'joy'], ['camera:peekaboo', {}, 'surprised'], ['mic:clap', {}, 'surprised'], ['mic:clap2', {}, 'excited'],
    ['battery:low', {}, 'hungry'], ['battery:charging', { charging: true }, 'eating'], ['voice:name', {}, 'happy'], ['camera:expression', { kind: 'wink' }, 'wink'],
  ];
  for (const [ev, p, ex] of T) { const b = mk(); const it = b.handle(ev, p, 1000); assert.ok(it, ev); assert.equal(it.expression, ex, ev); assert.ok(isExpression(it.expression)); }
  let b = mk(); assert.equal(b.handle('motion:impact', {}, 1000).expression, 'dizzy');
  b = mk(); assert.equal(b.handle('camera:face', { present: true, size: 0.2 }, 1000).expression, 'happy');
  b = mk(); b.handle('camera:face', { present: true, size: 0.2 }, 1000); assert.equal(b.handle('camera:face', { present: true, size: 0.6 }, 20000).expression, 'blush');
  b = mk(); assert.equal(b.handle('camera:facelost', {}, 1000).expression, 'sad');
});
test('rule brain: nựng tăng affection và xóa habituation chọc', () => {
  const b = mk(); for (let i = 0; i < 4; i++) b.handle('touch:poke', {}, i * 300); assert.ok(b.reactions.count('poke') >= 3);
  const a0 = b.needs.get('affection'); b.handle('touch:pet', { count: 3 }, 5000); assert.ok(b.needs.get('affection') > a0); assert.equal(b.reactions.count('poke'), 0);
});
test('rule brain: cho ăn tăng nhu cầu; no rồi từ chối (annoyed + lắc đầu); uống', () => {
  const b = mk(); const h0 = b.needs.get('hunger'); const it = b.handle('feed:drop', { kind: 'food', item: 'sushi' }, 1000); assert.equal(it.expression, 'eating'); assert.ok(it.bite);
  assert.ok(b.needs.get('hunger') > h0 + 0.25); assert.ok(FOODS.icecream.fun > FOODS.screw.fun, 'mỗi món khác nhau');
  b.needs.set('hunger', 1); const f = b.handle('feed:drop', { kind: 'food', item: 'cookie' }, 9000); assert.equal(f.expression, 'annoyed'); assert.ok(f.headShake); assert.equal(b.needs.get('hunger'), 1);
  const d = mk().handle('feed:drop', { kind: 'drink', item: 'cup' }, 1000); assert.equal(d.expression, 'drinking');
  assert.equal(mk().handle('feed:drop', { kind: 'food', item: 'khongco' }, 0), null);
});
test('rule brain: úp mặt ngủ, ngửa lại thức; chạm khi ngủ thì thức', () => {
  const b = mk(); assert.equal(b.handle('motion:facedown', {}, 100).expression, 'sleeping'); assert.ok(b.asleep); assert.equal(b.baseExpression(200).id, 'sleeping');
  assert.equal(b.handle('motion:faceup', {}, 500).expression, 'surprised'); assert.ok(!b.asleep);
  const c = mk(); c.handle('voice:cmd', { cmd: 'sleep' }, 0); assert.ok(c.asleep); assert.equal(c.handle('touch:tap', {}, 1000).expression, 'surprised'); assert.ok(!c.asleep);
});
test('rule brain: lệnh giọng nói', () => {
  const m = { sleep: 'sleeping', feed: 'hungry', dance: 'joy', angry: 'angry', look: 'happy' };
  for (const [cmd, ex] of Object.entries(m)) assert.equal(mk().handle('voice:cmd', { cmd }, 0).expression, ex, cmd);
  const b = mk(); b.handle('voice:cmd', { cmd: 'sleep' }, 0); assert.equal(b.handle('voice:cmd', { cmd: 'wake' }, 100).expression, 'surprised');
});
test('rule brain: idle theo thời tiết/nhàm chán/đêm', () => {
  let b = mk(); b.setWorld({ weather: { rain: true, temp: 25 }, hour: 12 }); assert.equal(b.idle(1000).expression, 'rainy');
  b = mk(); b.setWorld({ weather: { temp: 38, isDay: true }, hour: 12 }); assert.equal(b.idle(1000).expression, 'hot');
  b = mk(); b.setWorld({ weather: { temp: 8, isDay: true }, hour: 12 }); assert.equal(b.idle(1000).expression, 'cold');
  b = mk(); b.setWorld({ weather: { clear: true, isDay: true, temp: 27 }, hour: 12 }); b.mood.valence = 0.8; assert.equal(b.idle(1000).expression, 'cool');
  b = mk(); b.lastTouch = 0; assert.equal(b.idle(130000).expression, 'bored');
  b = mk(); b.setWorld({ hour: 2 }); assert.equal(b.baseExpression(200000).id, 'sleepy');
  b = mk(); b.needs.set('hunger', 0.1); assert.equal(b.baseExpression(1000).id, 'hungry');
});
test('gestures: nựng = vuốt qua lại >= 3 lượt; ôm = 2 ngón giữ lâu', () => {
  const s = new StrokeDetector(); let fired = []; let t = 0; for (const x of [0, 60, 120, 60, 0, 60, 120, 60, 0]) { const n = s.push(x, (t += 120)); if (n) fired.push(n); }
  assert.ok(fired.length >= 1 && fired[0] >= 3); const s2 = new StrokeDetector(); assert.equal([0, 10, 20, 15, 22].map((x, i) => s2.push(x, i * 100)).filter(Boolean).length, 0, 'rung nhỏ không tính');
  const h = new HugDetector(1000); assert.equal(h.update(2, 0), false); assert.equal(h.update(2, 1100), true); assert.equal(h.update(2, 1500), false); assert.equal(h.update(1, 1600), false);
});
