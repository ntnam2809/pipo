import test from 'node:test';
import assert from 'node:assert/strict';
import { FallDirector, FALL, lyingPose, risePose, dodgePose, IDLE_FALL } from '../src/eyes/fall.js';
import { Body, LIMITS } from '../src/eyes/body.js';
import { RuleBrain, SHOT_WINDOW_MS, SHOT_DEBOUNCE_MS } from '../src/brain/rules.js';
import { Reactions, DEFS } from '../src/brain/reactions.js';
import { Needs } from '../src/brain/needs.js';
import { Mood } from '../src/brain/mood.js';
import { Bus } from '../src/core/bus.js';
import { createHandSensor, HAND_EVENTS } from '../src/sensors/hands.js';
import { parseCommand } from '../src/audio/voice.js';
import { isExpression } from '../src/eyes/expressions.js';
import { makeHand } from './handfixtures.js';

const finitePose = (p) => { for (const k of ['w', 'tilt', 'drop', 'sway', 'squash', 'shake', 'limp']) assert.ok(Number.isFinite(p[k]), k); assert.ok(p.w >= 0 && p.w <= 1 && p.shake >= 0 && p.shake <= 1 && p.limp >= 0 && p.limp <= 1); };
const step = (d, sec, dt = 1 / 60) => { const ev = []; for (let t = 0; t < sec; t += dt) { const e = d.update(dt); if (e) ev.push(e); } return ev; };

test('fall: đường cong hữu hạn ở mọi thời điểm, giật lùi trước khi đổ, nằm ở góc ~1,45 rad về đúng hướng', () => {
  for (const dir of [-1, 1]) {
    for (let t = 0; t < 12; t += 0.02) { finitePose(lyingPose(t, dir)); finitePose(risePose(t, dir, 'touch')); finitePose(risePose(t, dir, 'self')); finitePose(dodgePose(t, dir)); }
    assert.ok(lyingPose(0.28, dir).tilt * dir < -0.3, 'giật lùi ngược hướng đổ');
    assert.ok(Math.abs(lyingPose(2, dir).tilt - dir * FALL.tilt) < 0.06); assert.ok(lyingPose(2, dir).drop > 0.2);
    let prev = -9; for (let t = FALL.recoil; t < FALL.recoil + FALL.fall; t += 0.02) { const v = lyingPose(t, dir).tilt * dir; assert.ok(v >= prev - 1e-9, 'đổ đơn điệu'); prev = v; }
    assert.ok(Math.abs(risePose(0, dir, 'touch').tilt - dir * FALL.tilt) < 0.05, 'dậy nối liền từ tư thế nằm');
    assert.ok(risePose(FALL.riseTouch, dir, 'touch').w < 0.01 && risePose(FALL.riseSelf, dir, 'self').w < 0.01, 'dậy xong thì trọng số về 0');
  }
});
test('fall: nằm co giật rõ trong ~3 s đầu rồi thưa dần', () => {
  const base = FALL.recoil + FALL.fall; let early = 0, late = 0;
  for (let t = 0; t < 3; t += 0.01) early = Math.max(early, lyingPose(base + t, 1).shake);
  for (let t = 4; t < 5.3; t += 0.01) late = Math.max(late, lyingPose(base + t, 1).shake);
  assert.ok(early > 0.9); assert.ok(late <= 0.6);
});
test('FallDirector: hit → fall → lie (sự kiện lie đúng một lần) → tự dậy sau 8 s (selfrise) → up', () => {
  const d = new FallDirector(() => 0.9); assert.equal(d.active, false); d.hit(); assert.equal(d.dir, 1); assert.ok(d.lying);
  let ev = step(d, 1.5); assert.deepEqual(ev, ['lie']); assert.equal(d.state, 'lie');
  ev = step(d, 6.0); assert.deepEqual(ev, []); assert.ok(d.lying);
  ev = step(d, 1.0); assert.deepEqual(ev, ['selfrise']); assert.equal(d.state, 'rise'); assert.equal(d.kind, 'self');
  ev = step(d, 1.0); assert.deepEqual(ev, ['up']); assert.equal(d.active, false); assert.deepEqual(d.pose, IDLE_FALL);
});
test('FallDirector: chạm lúc đang nằm → bật dậy chóng mặt (touch); chạm quá sớm (đang giật lùi) hoặc khi không nằm → không ăn', () => {
  const d = new FallDirector(() => 0.1); d.hit(); assert.equal(d.dir, -1); step(d, 0.15); assert.equal(d.touch(), false);
  step(d, 1.2); assert.equal(d.touch(), true); assert.equal(d.kind, 'touch'); assert.equal(d.lying, false);
  const ev = step(d, FALL.riseTouch + 0.2); assert.deepEqual(ev, ['up']); assert.equal(d.touch(), false);
  const e = new FallDirector(); assert.equal(e.touch(), false);
});
test('FallDirector: né xong tự về; dt xấu (NaN, âm, lớn) không làm hỏng', () => {
  const d = new FallDirector(); d.dodge(1); const ev = step(d, 1.2); assert.deepEqual(ev, ['dodged']); assert.equal(d.active, false);
  const b = new FallDirector(); b.hit(1); for (const dt of [NaN, -1, 5, undefined, 0.016]) { b.update(dt); finitePose(b.pose); }
});

test('Body: pose.fall hữu hạn, vượt giới hạn tilt thường (nằm ngang) nhưng pose thường vẫn trong LIMITS; hết gục thì về null', () => {
  const b = new Body(), d = new FallDirector(() => 0.9); d.hit(); let p, max = 0;
  for (let t = 0; t < 4; t += 1 / 60) { d.update(1 / 60); p = b.update(1 / 60, { expression: 'ko', fall: d.pose }); for (const k of ['bob', 'sway', 'tilt', 'squash', 'hover']) assert.ok(p[k] >= LIMITS[k][0] && p[k] <= LIMITS[k][1]); if (p.fall) { finitePose(p.fall); max = Math.max(max, Math.abs(p.fall.tilt)); } for (const a of [p.armL, p.armR]) for (const k of ['lift', 'spread', 'curl']) assert.ok(Number.isFinite(a[k]) && Math.abs(a[k]) <= 1); }
  assert.ok(max > 1.3 && p.fall && p.fall.limp > 0.9, `tilt tối đa ${max}`); assert.ok(p.armL.lift < -0.4 && p.armL.spread > 0.2, 'tay rũ: ' + JSON.stringify(p.armL));
  d.cancel(); for (let t = 0; t < 3; t += 1 / 60) p = b.update(1 / 60, { expression: 'neutral', fall: d.pose }); assert.equal(p.fall, null);
  assert.equal(new Body().update(0.016, {}).fall, null);
});

const mk = () => new RuleBrain({ needs: new Needs({ hunger: 0.5, thirst: 0.5, affection: 0.5, fun: 0.5, energy: 1 }), mood: new Mood(), reactions: new Reactions(), rng: () => 0.9 });
const tick = (b, sec, now0) => { let now = now0; for (let t = 0; t < sec; t += 0.05) { now += 50; b.tick(0.05, now); } return now; };
test('brain: bị chĩa súng → hoảng + giơ tay (handsup, giữ); hạ súng → huỷ; trúng đạn → ko + fall.hit', () => {
  const b = mk(), a = b.handle('hand:aim', {}, 0); assert.equal(a.name, 'aim'); assert.equal(a.expression, 'scared'); assert.equal(a.clip, 'handsup'); assert.ok(a.hold);
  b.handle('hand:lower', {}, 500); assert.equal(b.reactions.active(600), null);
  const c = mk(); c.handle('hand:aim', {}, 0); const s = c.handle('hand:fire', {}, 1000); assert.equal(s.name, 'shotHit'); assert.equal(s.expression, 'ko'); assert.ok(isExpression(s.expression)); assert.ok(c.fall.lying); assert.equal(c.reactions.cur.name, 'shotHit');
  assert.equal(c.handle('hand:aim', {}, 1500), null, 'đang nằm thì không aim');
});
const mk2 = (b) => (b.fall.lying && b.reactions.cur.name === 'shotHit' ? 'ok' : 'no');
test('brain: giả chết — chạm/nựng cứu dậy chóng mặt rồi vui; không ai chạm sau 8 s tự dậy nháy mắt "Hì, giả vờ đó!"', () => {
  const b = mk(); b.handle('hand:fire', {}, 0); let now = tick(b, 1.6, 0); assert.ok(b.pending.some((e) => e.sound === 'thud'), 'tiếng đập xuống đất'); assert.equal(mk2(b, now), 'ok');
  const r = b.handle('touch:pet', { count: 3 }, now + 10); assert.equal(r.name, 'reviveTouch'); assert.equal(r.expression, 'dizzy'); assert.equal(r.then.expression, 'happy'); assert.ok(b.needs.get('affection') > 0.5);
  assert.equal(b.fall.state, 'rise');
  const c = mk(); c.handle('hand:fire', {}, 0); let n = tick(c, 7.5, 0); assert.equal(c.reactions.active(n).name, 'shotHit');
  n = tick(c, 1.2, n); const cur = c.reactions.active(n); assert.equal(cur.name, 'reviveSelf'); assert.equal(cur.expression, 'wink'); assert.equal(cur.say, 'Hì, giả vờ đó!');
  n = tick(c, 1.5, n); assert.equal(c.fall.active, false);
});
test('brain: habituation — lần 3 trong 30 s né ("Hụt rồi!"), lần 4 bắn trả (clip gun + "Pew!") rồi tính lại từ đầu', () => {
  const b = mk(); let now = 0; const hitAndRevive = () => { const it = b.handle('hand:fire', {}, now); now = tick(b, 1.5, now); b.handle('touch:pet', {}, now); now = tick(b, 2.0, now); return it; };
  assert.equal(hitAndRevive().name, 'shotHit'); assert.equal(hitAndRevive().name, 'shotHit');
  const third = b.handle('hand:fire', {}, now); assert.equal(third.name, 'dodge'); assert.equal(third.say, 'Hụt rồi!'); assert.equal(b.fall.state, 'dodge'); assert.ok(!b.fall.lying);
  now = tick(b, 2.5, now); const fourth = b.handle('hand:fire', {}, now); assert.equal(fourth.name, 'counter'); assert.equal(fourth.clip, 'gun'); assert.equal(fourth.say, 'Pew!'); assert.equal(b.fall.active, false);
  now = tick(b, 3, now); assert.equal(b.handle('hand:fire', {}, now).name, 'shotHit', 'sau khi bắn trả: bình thường lại');
});
test('brain: quá 30 s không tính chung; nhiều phát dồn trong 0,8 s chỉ tính một; đang nằm bị bắn tiếp thì giật thêm; ngủ thì lờ', () => {
  const b = mk(); b.handle('hand:fire', {}, 0); assert.equal(b.handle('hand:fire', {}, SHOT_DEBOUNCE_MS - 100), null);
  let now = tick(b, 1.5, 0); b.handle('touch:pet', {}, now); now = tick(b, 2, now);
  b.handle('hand:fire', {}, now); now = tick(b, 1.5, now); b.handle('touch:pet', {}, now); now = tick(b, SHOT_WINDOW_MS / 1000, now + 0);
  assert.equal(b.handle('hand:fire', {}, now).name, 'shotHit', '3 phát nhưng cách quá 30 s: vẫn gục');
  const c = mk(); c.handle('hand:fire', {}, 0); const t2 = tick(c, 1.6, 0); const again = c.handle('hand:fire', {}, t2); assert.equal(again.name, 'shotHit'); assert.ok(c.fall.lying);
  const s = mk(); s.asleep = true; assert.equal(s.handle('hand:fire', {}, 0), null);
});
test('brain: không có camera — lệnh giọng "pằng/bùm" kích cảnh trúng đạn; đang gục thì không bốc chuyện chán/giấc ngủ', () => {
  assert.deepEqual(parseCommand('bùm', 'Pipo'), { type: 'cmd', cmd: 'shot' });
  const b = mk(); assert.equal(b.handle('voice:cmd', { cmd: 'shot' }, 0).name, 'shotHit');
  b.lastTouch = -1e9; assert.equal(b.idle(200000), null);
});
test('brain: bắt chước tay người — vẫy/cụng/ngón cái/đập tay → động tác tương ứng; không làm khi đang gục/ngủ', () => {
  for (const [ev, clip] of [['hand:wave', 'wave'], ['hand:fistbump', 'fistbump'], ['hand:thumbsup', 'thumbsup'], ['hand:highfive', 'highfive']]) assert.equal(mk().handle(ev, {}, 0).clip, clip, ev);
  const b = mk(); b.handle('hand:fire', {}, 0); assert.ok(!b.handle('hand:wave', {}, 100) || b.reactions.cur.name === 'shotHit');
  assert.equal(b.reactions.cur.name, 'shotHit');
});
test('reactions bắn súng: priority cao hơn mọi phản xạ thường, biểu cảm tồn tại', () => {
  for (const n of ['shotHit', 'reviveTouch', 'reviveSelf', 'dodge', 'counter']) assert.equal(DEFS[n].priority, 10, n);
  for (const n of ['aim', 'shotHit', 'reviveTouch', 'reviveSelf', 'dodge', 'counter']) assert.ok(isExpression(DEFS[n].build(1, {}).expression), n);
  const max = Math.max(...Object.entries(DEFS).filter(([k]) => !['shotHit', 'reviveTouch', 'reviveSelf', 'dodge', 'counter'].includes(k)).map(([, d]) => d.priority)); assert.ok(max < 10);
});

test('sensor nhận dáng tay: khung landmark → sự kiện bus (aim/fire/lower/wave...), không cần camera; chưa bật camera thì needcam', async () => {
  const bus = new Bus(), seen = []; bus.on('*', (n, p) => seen.push(n));
  const S = createHandSensor(bus, () => ({ status: 'off' })); assert.equal(await S.start(), globalThis.navigator && globalThis.navigator.mediaDevices ? 'needcam' : 'unsupported');
  let t = 0; const gun = makeHand('gun'); for (let i = 0; i < 8; i++, t += 1 / 12) S.feed([gun], 1, t);
  assert.deepEqual(seen, ['hand:aim']); S.micOnset(t); assert.deepEqual(seen, ['hand:aim', 'hand:fire']);
  for (let i = 0; i < 12; i++, t += 1 / 12) S.feed([makeHand('open', { cx: 0.5 + 0.1 * Math.sin(i * 0.9) })], 1, t + 5); assert.ok(seen.includes('hand:wave'));
  assert.deepEqual(Object.values(HAND_EVENTS).sort(), ['hand:aim', 'hand:fire', 'hand:fistbump', 'hand:highfive', 'hand:lower', 'hand:thumbsup', 'hand:wave']);
});
