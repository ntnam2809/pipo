import test from 'node:test';
import assert from 'node:assert/strict';
import { DanceDirector, NOTICE_SEC, OUTRO_SEC, MOVE_BEATS } from '../src/brain/dance.js';
import { Body, LIMITS, MOVES } from '../src/eyes/body.js';
import { EXPRESSION_IDS } from '../src/eyes/expressions.js';
import { SyntheticBeat, IDLE_BEAT } from '../src/audio/beat.js';

function rng(seed = 1) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const music = (o = {}) => ({ ...IDLE_BEAT, isMusic: true, confidence: 1, bpm: 120, energy: 0.7, ...o });

test('DanceDirector: im lặng thì không hoạt động', () => {
  const d = new DanceDirector({ rng: rng() }); const r = d.update(0.016, IDLE_BEAT, {});
  assert.equal(r.active, false); assert.equal(r.phaseName, 'idle'); assert.equal(r.dance, null);
});
test('chú ý (~1,2 s: tò mò + "?") -> nhảy -> thỏa mãn khi nhạc tắt -> idle', () => {
  const d = new DanceDirector({ rng: rng() }); const sb = new SyntheticBeat(120); const seen = []; let r;
  const run = (sec, on) => { for (let i = 0; i < sec * 60; i++) { r = d.update(1 / 60, on ? sb.update(1 / 60) : IDLE_BEAT, {}); if (!seen.length || seen[seen.length - 1] !== r.phaseName) seen.push(r.phaseName); } };
  run(0.5, true); assert.equal(r.phaseName, 'notice'); assert.equal(r.expression, 'curious'); assert.ok(r.fx.includes('question')); assert.equal(r.dance, null);
  run(NOTICE_SEC, true); assert.equal(r.phaseName, 'dance'); assert.equal(r.expression, 'groove'); assert.ok(r.dance && r.dance.bpm === 120);
  run(0.5, false); assert.equal(r.phaseName, 'outro'); assert.equal(r.expression, 'happy'); assert.equal(r.dance, null);
  run(OUTRO_SEC, false); assert.equal(r.phaseName, 'idle'); assert.deepEqual(seen, ['notice', 'dance', 'outro', 'idle']);
});
test('nhạc tắt giữa lúc chú ý -> về idle ngay', () => {
  const d = new DanceDirector({ rng: rng() }); d.update(0.1, music()); d.update(0.2, music()); assert.equal(d.phaseName, 'notice'); d.update(0.1, IDLE_BEAT); assert.equal(d.phaseName, 'idle');
});
test('động tác đổi mỗi 8 nhịp, chọn ngẫu nhiên (rng tiêm vào), không lặp liền kề', () => {
  const d = new DanceDirector({ rng: rng(4) }); const sb = new SyntheticBeat(120); const moves = [];
  for (let i = 0; i < 60 * 70; i++) { const r = d.update(1 / 60, sb.update(1 / 60), {}); if (r.moveId && (!moves.length || moves[moves.length - 1] !== r.moveId)) moves.push(r.moveId); }
  assert.ok(moves.length >= 6, 'số động tác ' + moves.length); for (let i = 1; i < moves.length; i++) assert.notEqual(moves[i], moves[i - 1]);
  assert.ok(new Set(moves).size >= 3); for (const m of moves) assert.ok(MOVES.includes(m));
  assert.equal(MOVE_BEATS, 8);
  // đúng 8 nhịp mỗi động tác (70 s ≈ 140 nhịp, trừ ~1,2 s chú ý) -> khoảng 16-17 lần đổi
  assert.ok(moves.length >= 10);
});
test('hype chỉ khi năng lượng cao; năng lượng nhu cầu thấp -> chỉ bob nhẹ + mắt lim dim', () => {
  const lo = new DanceDirector({ rng: rng(6) }), sb = new SyntheticBeat(110); const seen = new Set(); let r;
  for (let i = 0; i < 60 * 60; i++) { r = lo.update(1 / 60, { ...sb.update(1 / 60), energy: 0.3 }, {}); if (r.moveId) seen.add(r.moveId); }
  assert.ok(!seen.has('hype'));
  const tired = new DanceDirector({ rng: rng(6) }); const sb2 = new SyntheticBeat(110); const m2 = new Set(); let e2 = 0;
  for (let i = 0; i < 60 * 40; i++) { r = tired.update(1 / 60, sb2.update(1 / 60), { energyNeed: 0.1 }); if (r.moveId) m2.add(r.moveId); if (r.dance) e2 = Math.max(e2, r.dance.energy); }
  assert.deepEqual([...m2], ['bob']); assert.equal(r.expression, 'sleepy'); assert.ok(e2 < 0.4, 'biên độ ' + e2);
  const fresh = new DanceDirector({ rng: rng(6) }); const sb3 = new SyntheticBeat(110); let e3 = 0;
  for (let i = 0; i < 60 * 10; i++) { r = fresh.update(1 / 60, sb3.update(1 / 60), { energyNeed: 1 }); if (r.dance) e3 = Math.max(e3, r.dance.energy); } assert.ok(e3 > e2 + 0.3);
});
test('đang ngủ -> không nhảy', () => {
  const d = new DanceDirector({ rng: rng() }); const sb = new SyntheticBeat(120);
  for (let i = 0; i < 60 * 5; i++) assert.equal(d.update(1 / 60, sb.update(1 / 60), { asleep: true }).active, false);
  // đang nhảy mà ngủ thì dừng
  const d2 = new DanceDirector({ rng: rng() }); const s2 = new SyntheticBeat(120); for (let i = 0; i < 60 * 3; i++) d2.update(1 / 60, s2.update(1 / 60), {});
  assert.equal(d2.phaseName, 'dance'); assert.equal(d2.update(1 / 60, s2.update(1 / 60), { asleep: true }).active, false);
});
test('bpm > 140: nhảy nửa tốc (bpm và nhịp giảm một nửa, pha vẫn liên tục 0..1)', () => {
  const d = new DanceDirector({ rng: rng() }); const sb = new SyntheticBeat(160); let r, prev = null, jumps = 0;
  for (let i = 0; i < 60 * 8; i++) { r = d.update(1 / 60, sb.update(1 / 60), {}); if (r.dance) { assert.ok(r.dance.phase >= 0 && r.dance.phase <= 1); if (prev != null && r.dance.phase < prev - 0.5) jumps++; prev = r.dance.phase; } }
  assert.equal(r.dance.bpm, 80); assert.ok(jumps >= 7 && jumps <= 11, 'số vòng pha ' + jumps);
});

// ---- Body (pose) ----
const finitePose = (p) => { for (const k of ['bob', 'sway', 'tilt', 'squash', 'hover']) { assert.ok(Number.isFinite(p[k]), k); assert.ok(p[k] >= LIMITS[k][0] && p[k] <= LIMITS[k][1], k + '=' + p[k]); } for (const a of [p.armL, p.armR]) for (const k of ['lift', 'spread', 'curl']) { assert.ok(Number.isFinite(a[k])); assert.ok(a[k] >= -1 && a[k] <= 1, k); } };
const settle = (b, expression, sec = 2, dance = null) => { let p; for (let i = 0; i < sec * 60; i++) p = b.update(1 / 60, { expression, dance, t: i / 60 }); return p; };

test('Body: pose hữu hạn và trong khoảng trên mọi biểu cảm (kể cả khi nhảy mọi động tác)', () => {
  const b = new Body(); let t = 0;
  for (const id of EXPRESSION_IDS) for (let i = 0; i < 60; i++) { t += 1 / 60; finitePose(b.update(1 / 60, { expression: id, t })); }
  const sb = new SyntheticBeat(128);
  for (const move of MOVES) for (let i = 0; i < 180; i++) { t += 1 / 60; const s = sb.update(1 / 60); finitePose(b.update(1 / 60, { expression: 'groove', t, dance: { phase: s.phase, bpm: 128, energy: 1, beatIndex: s.beatIndex, move } })); }
  finitePose(b.update(1 / 60, {})); finitePose(b.update(NaN, { expression: 'nope', dance: { phase: NaN } }));
});
test('Body: tay theo biểu cảm (vui giơ lên, buồn rủ, sợ che mặt, giận hạ siết, ăn chụm, thương dang rộng, ngủ khép, tò mò gãi đầu)', () => {
  const arm = (id) => settle(new Body(), id, 2.5);
  const neutral = arm('neutral'), happy = arm('joy'), sad = arm('sad'), scared = arm('scared'), angry = arm('angry'), eat = arm('hungry'), love = arm('love'), sleep = arm('sleeping'), cur = arm('curious');
  assert.ok(neutral.armL.lift < -0.9);
  assert.ok(happy.armL.lift > 0.3 && happy.armR.lift > 0.3 && happy.armL.spread > 0);
  assert.ok(sad.armL.lift < -0.8 && sad.armR.lift < -0.8);
  assert.ok(scared.armL.lift > 0.6 && scared.armL.spread < 0 && scared.armR.spread < 0);
  assert.ok(angry.armL.lift < -0.6 && angry.armL.curl > 0.5 && angry.armL.spread < 0);
  assert.ok(eat.armL.lift > 0.15 && eat.armL.lift < 0.6 && eat.armL.spread < -0.3);
  assert.ok(love.armL.spread > 0.3 && love.armR.spread > 0.3 && love.armL.lift > -0.4);
  assert.ok(sleep.armL.lift < -0.9 && sleep.armL.spread < -0.2);
  assert.ok(cur.armR.lift > 0.6 && cur.armL.lift < -0.9, 'một tay gãi đầu');
});
test('Body: hover trôi nhẹ, buồn thì thân chùng xuống (bob dương)', () => {
  const b = new Body(); let min = 9, max = -9; for (let i = 0; i < 60 * 8; i++) { const p = b.update(1 / 60, { expression: 'neutral', t: i / 60 }); min = Math.min(min, p.hover); max = Math.max(max, p.hover); }
  assert.ok(max - min > 0.01 && max < 0.05);
  assert.ok(settle(new Body(), 'sad').bob > settle(new Body(), 'neutral').bob + 0.01);
});
test('Body: squash đạt đỉnh đúng nhịp (quanh pha 0) và bob hạ thấp nhất trên nhịp', () => {
  const b = new Body(), sb = new SyntheticBeat(120); let t = 0; const samples = [];
  for (let i = 0; i < 60 * 12; i++) { t += 1 / 60; const s = sb.update(1 / 60); const p = b.update(1 / 60, { expression: 'groove', t, dance: { phase: s.phase, bpm: 120, energy: 0.9, beatIndex: s.beatIndex, move: 'step' } }); if (t > 4) samples.push({ ph: s.phase, sq: p.squash, bob: p.bob }); }
  const peak = samples.reduce((a, x) => (x.sq > a.sq ? x : a)); const dist = Math.min(peak.ph, 1 - peak.ph); assert.ok(dist < 0.15, 'đỉnh squash ở pha ' + peak.ph);
  const lowest = samples.reduce((a, x) => (x.bob > a.bob ? x : a)); assert.ok(Math.min(lowest.ph, 1 - lowest.ph) < 0.2, 'bob thấp nhất ở pha ' + lowest.ph);
  const sq = samples.map((x) => x.sq); assert.ok(Math.max(...sq) - Math.min(...sq) > 0.05, 'squash phải dao động rõ');
});
test('Body: biên độ nhảy theo năng lượng; sway đổi chiều mỗi nhịp', () => {
  const amp = (energy) => { const b = new Body(), sb = new SyntheticBeat(120); let t = 0, m = 0; for (let i = 0; i < 60 * 8; i++) { t += 1 / 60; const s = sb.update(1 / 60); const p = b.update(1 / 60, { expression: 'groove', t, dance: { phase: s.phase, bpm: 120, energy, beatIndex: s.beatIndex, move: 'sway' } }); if (t > 3) m = Math.max(m, Math.abs(p.sway)); } return m; };
  assert.ok(amp(1) > amp(0.1) * 1.5);
  const b = new Body(), sb = new SyntheticBeat(120); let t = 0, pos = 0, neg = 0;
  for (let i = 0; i < 60 * 8; i++) { t += 1 / 60; const s = sb.update(1 / 60); const p = b.update(1 / 60, { expression: 'groove', t, dance: { phase: s.phase, bpm: 120, energy: 0.8, beatIndex: s.beatIndex, move: 'sway' } }); if (t > 3) { if (p.sway > 0.03) pos++; if (p.sway < -0.03) neg++; } }
  assert.ok(pos > 30 && neg > 30);
});
