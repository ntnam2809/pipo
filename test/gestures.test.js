import test from 'node:test';
import assert from 'node:assert/strict';
import { Body, LIMITS, handToArm, EVE_ARM, restPose } from '../src/eyes/body.js';
import { CLIPS, sampleClip, GESTURES, ClipPlayer } from '../src/eyes/handclips.js';
import { softLimit } from '../src/eyes/hands.js';
import { parseCommand } from '../src/audio/voice.js';
import { validateLLM, ACTIONS, HAND_ACTIONS, buildSystemPrompt } from '../src/brain/llm.js';
import { SOUND_IDS } from '../src/audio/sounds.js';
import { RuleBrain, GESTURE_REACTIONS, FACE_AWAY_MS } from '../src/brain/rules.js';
import { Reactions, DEFS } from '../src/brain/reactions.js';
import { Needs } from '../src/brain/needs.js';
import { Mood } from '../src/brain/mood.js';
import { Telemetry, EV_KEYS } from '../src/core/telemetry.js';

const run = (body, sec, ctx, dt = 1 / 60) => { let p; for (let i = 0; i < sec / dt; i++) p = body.update(dt, typeof ctx === 'function' ? ctx(i * dt) : ctx); return p; };
const okPose = (p) => { for (const k of ['bob', 'sway', 'tilt', 'squash', 'hover']) assert.ok(Number.isFinite(p[k]) && p[k] >= LIMITS[k][0] && p[k] <= LIMITS[k][1], k); for (const a of [p.armL, p.armR]) for (const k of ['lift', 'spread', 'curl']) assert.ok(Number.isFinite(a[k]) && a[k] >= -1 && a[k] <= 1, k); for (const h of [p.handL, p.handR]) if (h) for (const k of ['x', 'y', 'rot', 'scale', 'alpha']) assert.ok(Number.isFinite(h[k]), 'hand.' + k); };

test('body không clip: tay classic/pixel ẩn (handL/handR null), Eve giữ tư thế biểu cảm như cũ', () => {
  const a = new Body(), b = new Body(); const pa = run(a, 1.5, { expression: 'happy' }), pb = run(b, 1.5, { expression: 'happy', clip: null });
  assert.equal(pa.handL, null); assert.equal(pa.handR, null); assert.deepEqual(pa.armL, pb.armL); assert.equal(pa.armL.shape, undefined); okPose(pa);
  assert.deepEqual(Object.keys(restPose()).includes('handL'), true);
});
test('body với clip: tay hiện theo clip, đúng vị trí/dáng, rồi mờ dần về null khi hết clip', () => {
  const b = new Body(), c = CLIPS.punch; let p;
  for (let t = 0; t < 0.9; t += 1 / 60) p = b.update(1 / 60, { expression: 'neutral', clip: sampleClip(c, t) });
  okPose(p); assert.ok(p.handR && p.handR.shape === 'fist' && p.handR.scale > 1.8 && p.handR.alpha > 0.9); assert.equal(p.handL, null);
  p = run(b, 1.2, { expression: 'neutral', clip: null }); assert.equal(p.handR, null);
});
test('body: tay mờ dần có alpha giảm đơn điệu sau clip (không chớp tắt)', () => {
  const b = new Body(); run(b, 0.5, { expression: 'neutral', clip: sampleClip(CLIPS.wave, 1.0) }); let prev = 1;
  for (let i = 0; i < 60; i++) { const p = b.update(1 / 60, { expression: 'neutral' }); const a = p.handR ? p.handR.alpha : 0; assert.ok(a <= prev + 1e-9); prev = a; }
  assert.ok(prev < 0.05);
});
test('Eve: clip ghi đè arm* — tay vẫy giơ lên, tay kia thả lỏng; hết clip thì về tư thế biểu cảm', () => {
  const base = run(new Body(), 1.5, { expression: 'happy' }), b = new Body();
  const p = run(b, 1.0, (t) => ({ expression: 'happy', clip: sampleClip(CLIPS.wave, 0.5 + (t % 1.2)) }));
  okPose(p); assert.ok(p.armR.lift > 0.5 && p.armR.shape === 'open' && p.armR.w > 0.9, JSON.stringify(p.armR));
  assert.ok(p.armL.lift < base.armL.lift - 0.2, 'tay trái phải hạ xuống so với tư thế vui: ' + p.armL.lift + ' vs ' + base.armL.lift);
  const q = run(b, 2.5, { expression: 'happy' }); assert.equal(q.armR.shape, undefined); assert.ok(Math.abs(q.armR.lift - base.armR.lift) < 0.25, 'về tư thế vui (ngọ nguậy ±0.22): ' + q.armR.lift);
});
test('Eve: nắm đấm đấm vào người xem -> sc lớn, front, arm duỗi (reach); tay khép giữ curl thấp', () => {
  const b = new Body(); const p = run(b, 0.8, () => ({ expression: 'neutral', clip: sampleClip(CLIPS.punch, 0.9) }));
  assert.equal(p.armR.shape, 'fist'); assert.ok(p.armR.sc > 1.8); assert.equal(p.armR.front, true); assert.ok(p.armR.reach > 1); okPose(p);
  const s = handToArm({ x: 1.2, y: -0.6, rot: 0, shape: 'flat', scale: 1 }, 1), f = handToArm({ x: 1.2, y: -0.6, rot: 0, shape: 'fist', scale: 1 }, 1); assert.ok(Math.abs(s.curl) < Math.abs(f.curl) + 1e-9);
});
test('handToArm: hữu hạn ở mọi đích; đích phía trên -> lift dương; đối xứng trái/phải', () => {
  for (const x of [-2, -1, 0, 0.5, 1.2, 2]) for (const y of [-1.5, -0.5, 0.4, 1.2, 2]) for (const rot of [-1.4, 0, 1.4]) for (const side of [-1, 1]) {
    const a = handToArm({ x, y, rot, shape: 'open', scale: 1 }, side); for (const k of ['lift', 'spread', 'curl', 'sc', 'reach']) assert.ok(Number.isFinite(a[k]), `${x},${y},${rot}`); assert.ok(a.reach >= 0.6 && a.reach <= 1.6);
  }
  assert.ok(handToArm({ x: 1.2, y: -0.7, rot: 0, shape: 'open', scale: 1 }, 1).lift > 0.6);
  const r = handToArm({ x: 1.2, y: 0, rot: 0.3, shape: 'open', scale: 1 }, 1), l = handToArm({ x: -1.2, y: 0, rot: -0.3, shape: 'open', scale: 1 }, -1);
  for (const k of ['lift', 'spread', 'curl']) assert.ok(Math.abs(r[k] - l[k]) < 1e-9, k);
  assert.ok(EVE_ARM.len > 0);
});
test('body: mọi clip × mọi biểu cảm/điệu nhảy cho pose hữu hạn trong giới hạn', () => {
  for (const n of Object.keys(CLIPS)) { const b = new Body(), c = CLIPS[n]; let p; for (let t = 0; t <= c.dur; t += 1 / 30) { p = b.update(1 / 30, { expression: t < 1 ? 'excited' : 'groove', dance: t > 1 ? { phase: (t * 2) % 1, bpm: 120, energy: 0.8, beatIndex: Math.floor(t * 2), move: 'hype' } : null, clip: sampleClip(c, t) }); okPose(p); } }
});
test('softLimit: không bao giờ vượt lim, đơn điệu, giữ nguyên dưới knee', () => {
  assert.equal(softLimit(30, 100), 30); let prev = 0; for (let v = 0; v < 1000; v += 7) { const o = softLimit(v, 100); assert.ok(o <= 100 && o >= prev - 1e-9); prev = o; } assert.equal(softLimit(-500, 100) > -100, true);
});

test('voice: lệnh động tác tay (không dấu) -> đúng lệnh; câu dài/không liên quan không bị bắt nhầm', () => {
  const c = (t) => { const r = parseCommand(t, 'Pipo'); return r && r.type === 'cmd' ? r.cmd : r && r.type; };
  const cases = { 'chào': 'wave', 'xin chào': 'wave', 'hello': 'wave', 'hi': 'wave', 'Pipo chào bạn': 'wave', 'tạm biệt': 'bye', 'bye': 'bye', 'bai bai': 'bye', 'nghiêm': 'salute', 'tuân lệnh': 'salute', 'chào cờ': 'salute', 'rõ': 'salute', 'đấm': 'punch', 'đánh': 'punch', 'đấm đi': 'punch', 'đập tay': 'highfive', 'high five': 'highfive', 'cụng tay': 'fistbump', 'like': 'thumbsup', 'tuyệt': 'thumbsup', 'giỏi': 'thumbsup', 'vỗ tay': 'clap', 'ú òa': 'peekaboo', 'nhảy đi': 'dance', 'ngủ đi': 'sleep' };
  for (const [t, cmd] of Object.entries(cases)) assert.equal(c(t), cmd, t);
  for (const t of ['hôm qua tôi không rõ chuyện gì xảy ra cả', 'hi vọng ngày mai trời đẹp lắm nhé', 'bạn có thấy bộ phim tuyệt vời hôm qua không']) assert.equal(c(t), 'text', t);
});
test('LLM: validator nhận mọi action động tác tay, bỏ action lạ; prompt hệ thống mô tả hành động', () => {
  for (const a of ['wave', 'bye', 'salute', 'punch', 'highfive', 'fistbump', 'thumbsup', 'clap', 'point', 'peekaboo']) { assert.ok(ACTIONS.includes(a) && HAND_ACTIONS.includes(a), a); assert.equal(validateLLM({ action: a }).intent.action, a); }
  assert.ok(!HAND_ACTIONS.includes('dance')); assert.equal(validateLLM({ expression: 'happy', action: 'moonwalk' }).intent.action, undefined);
  const p = buildSystemPrompt('Bi'); for (const a of HAND_ACTIONS) assert.ok(p.includes(a), a); assert.ok(p.includes('vẫy tay') && p.includes('đấm'));
  for (const s of ['pow', 'slap', 'salute', 'whoosh']) { assert.ok(SOUND_IDS.includes(s)); assert.ok(validateLLM({ sound: s }).ok); }
});
const mkBrain = () => new RuleBrain({ needs: new Needs({ hunger: 1, thirst: 1, affection: 0.5, fun: 0.5, energy: 1 }), mood: new Mood(), reactions: new Reactions(), rng: () => 0.5 });
test('brain: mọi động tác -> phản xạ có clip tồn tại, priority/cooldown, chọc vẫn thắng', () => {
  for (const [g, r] of Object.entries(GESTURE_REACTIONS)) { const it = mkBrain().handle('voice:cmd', { cmd: g }, 0); assert.ok(it && it.name === r && CLIPS[it.clip], g); assert.ok(DEFS[r].priority >= 4 && DEFS[r].cooldown > 0); }
  assert.deepEqual(Object.keys(GESTURE_REACTIONS).sort(), [...GESTURES].sort());
  const b = mkBrain(); b.handle('voice:cmd', { cmd: 'wave' }, 0); const p = b.handle('touch:poke', {}, 300); assert.equal(p.expression, 'surprised');
  const c = mkBrain(); c.handle('voice:cmd', { cmd: 'punch' }, 0); assert.equal(c.handle('voice:cmd', { cmd: 'wave' }, 100).name, 'gWave');   // cùng priority: động tác mới thay cũ
  { const f = mkBrain(); f.needs.set('hunger', 0.4); assert.equal(f.handle('feed:drop', { kind: 'food', item: 'cookie' }, 0).expression, 'eating'); }
});
test('brain: thumbsup -> thương/vui tăng; salute mắt nghiêm; vẫy khi thấy mặt sau ≥ 10 phút vắng, không vẫy khi vừa thấy', () => {
  const b = mkBrain(), a0 = b.needs.get('affection'); b.handle('voice:cmd', { cmd: 'thumbsup' }, 0); assert.ok(b.needs.get('affection') > a0);
  assert.equal(mkBrain().handle('voice:cmd', { cmd: 'salute' }, 0).expression, 'focus');
  const f = mkBrain(), first = f.handle('camera:face', { present: true, x: 0, y: 0, size: 0.3 }, 1000); assert.equal(first.name, 'gWave');
  f.handle('camera:facelost', {}, 5000); const again = f.handle('camera:face', { present: true, x: 0, y: 0, size: 0.3 }, 20000); assert.notEqual(again && again.name, 'gWave');
  const g = mkBrain(); g.handle('camera:face', { present: true, size: 0.3 }, 0); g.handle('camera:facelost', {}, 10000); const back = g.handle('camera:face', { present: true, size: 0.3 }, 10000 + FACE_AWAY_MS + 5000); assert.equal(back.name, 'gWave');
});
test('brain: đập tay — chạm thì vui + thương tăng; hụt thì buồn nhẹ; chào buổi sáng có lời', () => {
  const b = mkBrain(), a0 = b.needs.get('affection'); const ok = b.handle('touch:highfive', {}, 0); assert.equal(ok.name, 'highfiveOk'); assert.ok(b.needs.get('affection') > a0); assert.ok(['joy', 'happy'].includes(ok.expression));
  const m = mkBrain().handle('hand:highfiveMiss', {}, 0); assert.equal(m.name, 'highfiveMiss'); assert.equal(m.expression, 'sad');
  const g = mkBrain().handle('greet:morning', {}, 0); assert.equal(g.clip, 'wave'); assert.ok(/sáng/i.test(g.say));
  const s = mkBrain(); s.handle('voice:cmd', { cmd: 'sleep' }, 0); assert.ok(s.asleep); s.handle('voice:cmd', { cmd: 'wave' }, 100); assert.ok(!s.asleep);
});
test('reactions: clap theo BPM truyền period vào clip; gClap mặc định không có clipOpts', () => {
  const R = new Reactions(); assert.equal(R.fire('gClap', { period: 0.43 }, 0).clipOpts.period, 0.43); assert.equal(new Reactions().fire('gClap', {}, 0).clipOpts, null);
});
test('telemetry: đếm gesture (khóa mới trong EV_KEYS)', () => {
  assert.ok(EV_KEYS.includes('gesture')); const mem = {}; const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const t = new Telemetry({ storage, now: () => Date.parse('2026-03-10T12:00:00Z'), gate: () => ({ endpoint: 'https://x.test/c', enabled: true, nav: {}, hostname: 'pipo.test', debug: false, gallery: false, artifact: false }), send: () => true });
  t.start({ mode: 'browser', platform: 'other', lang: 'vi', skin: 'eve', theme: 'cyan', sensors: [], llm: 'none' }); t.count('gesture'); t.count('gesture'); const pv = t.preview(); assert.equal(pv.packet.ev.gesture, 2);
});
