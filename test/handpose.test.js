import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHand, measureHand, validHand, GestureTracker, POSES, TRACK } from '../src/brain/handpose.js';
import { makeHand } from './handfixtures.js';

const run = (tr, frames, dt = 1 / 12, t0 = 0) => { const ev = []; let t = t0; for (const f of frames) { ev.push(...tr.update(t, f.hands || [f], f.aspect || 1)); t += dt; } return { ev, t }; };
const names = (ev) => ev.map((e) => e.name);

test('classifyHand: mỗi dáng nhận đúng, kể cả xoay/nghiêng/to-nhỏ/khung 4:3', () => {
  for (const pose of ['open', 'fist', 'point', 'gun', 'thumbsup', 'peace']) {
    for (const o of [{}, { scale: 0.08, cx: 0.2, cy: 0.3 }, { scale: 0.3 }, { angle: 0.4 }, { angle: -0.35 }, { aspect: 4 / 3 }]) {
      assert.equal(classifyHand(makeHand(pose, o), o.aspect || 1), pose, `${pose} ${JSON.stringify(o)}`);
    }
  }
});
test('classifyHand: dữ liệu hỏng -> unknown, không ném lỗi', () => {
  for (const bad of [null, undefined, [], [1, 2], Array(21).fill(null), Array(21).fill({ x: NaN, y: 0 }), 'x', Array(20).fill({ x: 0, y: 0 })]) assert.equal(classifyHand(bad), 'unknown');
  assert.ok(!validHand(null)); assert.ok(validHand(makeHand('open')));
  assert.equal(classifyHand(Array(21).fill({ x: 0.5, y: 0.5 })), 'unknown');   // mọi điểm trùng nhau
  assert.ok(POSES.includes(classifyHand(makeHand('open'))));
});
test('measureHand: ngón cái gập/duỗi và đầu trỏ giật lên đo được', () => {
  const g = measureHand(makeHand('gun')), p = measureHand(makeHand('point'));
  assert.ok(g.thumbExt > 1.28 && p.thumbExt < 1.08, `${g.thumbExt} ${p.thumbExt}`);
  const up = measureHand(makeHand('gun', { lift: 0.4 })); assert.ok(up.idxRel < g.idxRel - 0.3);
  assert.ok(measureHand(makeHand('thumbsup')).thumbUp && !measureHand(makeHand('fist')).thumbUp);
});

test('chĩa súng: gun giữ ≥ 0,4 s mới phát gun:aim (đúng một lần); thoáng qua thì không', () => {
  const tr = new GestureTracker(); const g = makeHand('gun');
  let r = run(tr, Array(4).fill(g)); assert.deepEqual(names(r.ev), []);                  // 0,33 s
  r = run(tr, Array(2).fill(g), 1 / 12, r.t); assert.deepEqual(names(r.ev), ['gun:aim']); assert.ok(tr.aiming);
  r = run(tr, Array(12).fill(g), 1 / 12, r.t); assert.deepEqual(names(r.ev), []);          // không phát lại
  const t2 = new GestureTracker(); r = run(t2, [g, g, g, makeHand('fist'), makeHand('fist'), makeHand('fist'), makeHand('fist'), g, g], 1 / 12); assert.deepEqual(names(r.ev), []);
});
test('gun:fire bằng ngón cái gập (gun -> point) khi đang aim', () => {
  const tr = new GestureTracker(); let r = run(tr, Array(8).fill(makeHand('gun')));
  r = run(tr, [makeHand('point')], 1 / 12, r.t); assert.deepEqual(names(r.ev), ['gun:fire']); assert.equal(r.ev[0].why, 'thumb'); assert.ok(!tr.aiming);
});
test('gun:fire bằng đầu ngón trỏ giật lên nhanh', () => {
  const tr = new GestureTracker(); let r = run(tr, Array(8).fill(makeHand('gun')));
  r = run(tr, [makeHand('gun', { lift: 0.12 }), makeHand('gun', { lift: 0.4 })], 1 / 12, r.t); assert.deepEqual(names(r.ev), ['gun:fire']); assert.equal(r.ev[0].why, 'flick');
  const slow = new GestureTracker(); r = run(slow, Array(8).fill(makeHand('gun'))); r = run(slow, Array.from({ length: 12 }, (_, i) => makeHand('gun', { lift: i * 0.03 })), 1 / 12, r.t); assert.deepEqual(names(r.ev), [], 'nhúc nhích chậm không phải giật');
});
test('gun:fire bằng tiếng động đột ngột (mic) hoặc tiếng "pằng" — chỉ khi đang aim', () => {
  const a = new GestureTracker(); assert.deepEqual(a.micOnset(1), []); assert.deepEqual(a.voiceBang(1), []);
  let r = run(a, Array(8).fill(makeHand('gun'))); assert.equal(a.micOnset(r.t).length, 1); assert.ok(!a.aiming);
  const b = new GestureTracker(); r = run(b, Array(8).fill(makeHand('gun'))); const v = b.voiceBang(r.t); assert.equal(v.length, 1); assert.equal(v[0].why, 'voice');
});
test('gun:fire có cooldown; bắn xong phải nhả dáng rồi chĩa lại mới aim tiếp', () => {
  const tr = new GestureTracker(); let r = run(tr, Array(8).fill(makeHand('gun'))); let t = r.t;
  assert.equal(tr.micOnset(t).length, 1); assert.deepEqual(tr.micOnset(t + 0.1), []);
  // vẫn giữ dáng súng sau khi bắn: không aim lại
  r = run(tr, Array(14).fill(makeHand('gun')), 1 / 12, t); assert.deepEqual(names(r.ev), []);
  r = run(tr, Array(6).fill(makeHand('fist')), 1 / 12, r.t); r = run(tr, Array(8).fill(makeHand('gun')), 1 / 12, r.t); assert.ok(names(r.ev).includes('gun:aim'));
  assert.ok(tr.micOnset(r.t + 2).length === 1, 'sau cooldown bắn lại được');
});
test('hạ súng: bỏ dáng súng/trỏ quá lâu hoặc mất tay -> gun:lower', () => {
  const a = new GestureTracker(); let r = run(a, Array(8).fill(makeHand('gun'))); r = run(a, Array(12).fill(makeHand('open')), 1 / 12, r.t); assert.ok(names(r.ev).includes('gun:lower'));
  const b = new GestureTracker(); r = run(b, Array(8).fill(makeHand('gun'))); const ev = []; let t = r.t; for (let i = 0; i < 12; i++, t += 1 / 12) ev.push(...b.update(t, [])); assert.ok(names(ev).includes('gun:lower'));
});
test('vẫy tay: lòng bàn tay mở dao động ngang -> wave (một lần, có cooldown); đứng yên hay nắm đấm lắc thì không', () => {
  const frames = Array.from({ length: 24 }, (_, i) => makeHand('open', { cx: 0.5 + 0.1 * Math.sin(i * 0.9) }));
  const tr = new GestureTracker(); const r = run(tr, frames); assert.equal(names(r.ev).filter((n) => n === 'wave').length, 1);
  const still = new GestureTracker(); assert.ok(!names(run(still, Array(24).fill(makeHand('open'))).ev).includes('wave'));
  const fist = new GestureTracker(); assert.ok(!names(run(fist, frames.map((_, i) => makeHand('fist', { cx: 0.5 + 0.1 * Math.sin(i * 0.9) }))).ev).includes('wave'));
  const jitter = new GestureTracker(); assert.ok(!names(run(jitter, Array.from({ length: 24 }, (_, i) => makeHand('open', { cx: 0.5 + 0.004 * Math.sin(i * 3) }))).ev).includes('wave'));
});
test('bắt chước: ngón cái giữ ≥ 0,6 s -> thumbsup; nắm đấm đưa tới (lớn dần) -> fist:toward; mở tay giữ yên -> open:hold', () => {
  const th = new GestureTracker(); assert.ok(names(run(th, Array(10).fill(makeHand('thumbsup'))).ev).includes('thumbsup'));
  assert.ok(!names(run(new GestureTracker(), Array(4).fill(makeHand('thumbsup'))).ev).includes('thumbsup'));
  const fi = new GestureTracker(); assert.ok(names(run(fi, Array.from({ length: 12 }, (_, i) => makeHand('fist', { scale: 0.12 + 0.012 * i }))).ev).includes('fist:toward'));
  assert.ok(!names(run(new GestureTracker(), Array(14).fill(makeHand('fist'))).ev).includes('fist:toward'));
  const op = new GestureTracker(); assert.ok(names(run(op, Array(16).fill(makeHand('open'))).ev).includes('open:hold'));
});
test('nhiều tay: lấy tay to nhất; mất tay lâu thì reset; khung rỗng/hỏng không lỗi', () => {
  const tr = new GestureTracker(); const big = makeHand('gun', { scale: 0.25 }), small = makeHand('open', { scale: 0.07, cx: 0.8 });
  const r = run(tr, Array(8).fill({ hands: [small, big] })); assert.ok(names(r.ev).includes('gun:aim'));
  assert.deepEqual(names(tr.update(99, [null, [], 'x'])), ['gun:lower']);   // mất tay lâu: hạ súng, reset
  assert.deepEqual(tr.update(100, undefined), []); assert.equal(tr.hist.length, 0);
  assert.ok(TRACK.aimHold >= 0.4);
});
