import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, CLIP_NAMES, GESTURES, SHAPES, EASE, sampleClip, mirror, eventsIn, ClipPlayer, hiddenHand } from '../src/eyes/handclips.js';

const NEED = ['wave', 'bye', 'salute', 'punch', 'combo', 'highfive', 'fistbump', 'thumbsup', 'clap', 'point', 'peekaboo', 'handsup', 'gun'];
const FIELDS = ['x', 'y', 'rot', 'scale', 'alpha'];

test('đủ clip theo spec, mọi động tác người dùng gọi được đều có clip', () => {
  for (const n of NEED) assert.ok(CLIPS[n], n);
  for (const g of GESTURES) assert.ok(CLIPS[g], g);
  assert.ok(CLIPS.highfiveHit && CLIPS.fistpump);
});
test('sampleClip: số hữu hạn, shape hợp lệ, alpha 0..1, kể cả t lạ (âm · NaN · quá dur)', () => {
  for (const n of CLIP_NAMES) {
    const c = CLIPS[n];
    for (const t of [-5, NaN, undefined, Infinity, c.dur + 3, ...Array.from({ length: 80 }, (_, i) => (i / 79) * c.dur)]) {
      const s = sampleClip(c, t);
      for (const k of ['L', 'R']) { for (const f of FIELDS) assert.ok(Number.isFinite(s[k][f]), `${n} ${k}.${f} @${t}`); assert.ok(SHAPES.includes(s[k].shape)); assert.ok(s[k].alpha >= 0 && s[k].alpha <= 1); assert.ok(s[k].scale > 0.2 && s[k].scale < 3.5); }
    }
  }
});
test('clip bắt đầu và kết thúc bằng tay ẩn (alpha 0); done đúng lúc', () => {
  for (const n of CLIP_NAMES) {
    const c = CLIPS[n], a = sampleClip(c, 0), z = sampleClip(c, c.dur);
    for (const k of ['L', 'R']) { if (n !== 'highfiveHit') assert.equal(a[k].alpha, 0, `${n} đầu ${k}`); assert.equal(z[k].alpha, 0, `${n} cuối ${k}`); }   // highfiveHit nối tiếp từ tay đang giơ, nên không bắt đầu ẩn
    assert.equal(sampleClip(c, c.dur * 0.5).done, false); assert.equal(sampleClip(c, c.dur).done, true);
  }
});
test('easing: 0→0, 1→1, đơn điệu (trừ back vọt quá 1)', () => {
  for (const [n, f] of Object.entries(EASE)) { assert.ok(Math.abs(f(0)) < 1e-9, n); assert.ok(Math.abs(f(1) - 1) < 1e-9, n); }
  assert.ok(EASE.back(0.7) > 1); assert.ok(EASE.snap(0.2) > 0.7);
});
test('wave: tay phải giơ cạnh mặt, lắc đủ 3 nhịp (rot đổi dấu 6 lần), tay trái ẩn', () => {
  const c = CLIPS.wave; let flips = 0, prev = 0;
  for (let t = 0.5; t < 1.9; t += 0.01) { const s = sampleClip(c, t); assert.equal(s.L.alpha, 0); assert.ok(s.R.x > 0.8 && s.R.y < 0.2 && s.R.alpha > 0.99); const d = Math.sign(s.R.rot - 0.05); if (prev && d && d !== prev) flips++; if (d) prev = d; }
  assert.ok(flips >= 5, `đổi chiều ${flips}`);
});
test('punch: nắm đấm phóng to vào người xem rồi thu về; có pow + rung màn đúng lúc', () => {
  const c = CLIPS.punch, hit = sampleClip(c, 0.72).R, back = sampleClip(c, 0.5).R;
  assert.equal(hit.shape, 'fist'); assert.ok(hit.scale > 2.2 && back.scale < 1); assert.ok(Math.abs(hit.x) < 0.5);
  const ev = c.events.filter((e) => e.t === 0.72).map((e) => e.type + ':' + (e.name || '')); assert.ok(ev.includes('fx:pow') && ev.includes('shake:') && ev.includes('sound:pow'));
});
test('salute: bàn tay khép (flat) giữ ≥ 1,2 s ở gần trán; combo: trái-phải-trái', () => {
  const c = CLIPS.salute; let hold = 0; for (let t = 0; t < c.dur; t += 0.01) { const r = sampleClip(c, t).R; if (r.shape === 'flat' && r.alpha > 0.99 && r.y < -0.7) hold += 0.01; }
  assert.ok(hold >= 1.2, `giữ ${hold}`);
  const fx = CLIPS.combo.events.filter((e) => e.type === 'fx').map((e) => e.hand); assert.deepEqual(fx, ['L', 'R', 'L']);
});
test('mirror: đổi tay, x và rot đổi dấu, sự kiện đổi tay; mirror hai lần = nguyên bản', () => {
  const m = mirror(CLIPS.wave), a = sampleClip(CLIPS.wave, 1.0), b = sampleClip(m, 1.0);
  assert.equal(b.L.alpha, a.R.alpha); assert.ok(Math.abs(b.L.x + a.R.x) < 1e-9 && Math.abs(b.L.rot + a.R.rot) < 1e-9); assert.equal(b.R.alpha, 0);
  const p = mirror(CLIPS.punch); assert.deepEqual(p.events.filter((e) => e.type === 'fx').map((e) => e.hand), ['L']);
  const mm = mirror(m), c = sampleClip(mm, 1.0); for (const f of FIELDS) assert.ok(Math.abs(c.R[f] - a.R[f]) < 1e-9, f);
});
test('eventsIn: nửa mở (t0, t1], t0<0 gồm t=0', () => {
  const c = { events: [{ t: 0 }, { t: 1 }, { t: 2 }] };
  assert.equal(eventsIn(c, -1e-6, 1).length, 2); assert.equal(eventsIn(c, 1, 2).length, 1); assert.equal(eventsIn(c, 0, 0.5).length, 0);
});
test('ClipPlayer: phát hết clip, mỗi sự kiện đúng một lần, rồi không còn active', () => {
  const p = new ClipPlayer(); assert.ok(p.play('punch')); const seen = []; let n = 0;
  while (p.active && n++ < 1000) seen.push(...p.update(0.016).events);
  assert.ok(!p.active); assert.equal(seen.filter((e) => e.type === 'fx').length, 1); assert.equal(seen.filter((e) => e.type === 'shake').length, 1);
  assert.equal(p.play('khong_co'), false); assert.deepEqual(p.update(0.016).L, hiddenHand('L'));
});
test('ClipPlayer: dt lớn / NaN không làm hỏng; rate co giãn thời gian', () => {
  const p = new ClipPlayer(); p.play('wave', { rate: 2 }); let n = 0; while (p.active && n++ < 1000) { const s = p.update(n === 3 ? NaN : 0.016); assert.ok(Number.isFinite(s.R.x)); } assert.ok(n < 80, 'rate 2 ~ nửa thời gian: ' + n);
});
test('highfive: chờ chạm — không chạm thì phát miss đúng 1 lần; chạm đúng lúc thì sang highfiveHit', () => {
  const p = new ClipPlayer(); p.play('highfive'); const ev = []; let n = 0; while (p.active && n++ < 1000) ev.push(...p.update(0.02).events);
  assert.equal(ev.filter((e) => e.type === 'miss').length, 1);
  const q = new ClipPlayer(); q.play('highfive'); assert.equal(q.waiting, false); assert.equal(q.resolve(true), false);   // chưa tới cửa sổ chờ
  for (let i = 0; i < 40; i++) q.update(0.02); assert.ok(q.waiting);
  assert.ok(q.resolve(true)); assert.equal(q.name, 'highfiveHit'); assert.equal(q.waiting, false);
  const e2 = []; n = 0; while (q.active && n++ < 1000) e2.push(...q.update(0.02).events);
  assert.ok(e2.some((e) => e.type === 'fx' && e.name === 'slap') && !e2.some((e) => e.type === 'miss'));
});
test('handsup lặp tới khi stop(); gun/handsup dùng được cho phần sau', () => {
  const p = new ClipPlayer(); p.play('handsup'); for (let i = 0; i < 400; i++) { const s = p.update(0.02); assert.ok(s.active); assert.ok(s.L.alpha > 0.99 || i < 30); }
  p.stop(); let n = 0; while (p.active && n++ < 400) p.update(0.02); assert.ok(!p.active && n < 200);
  const g = new ClipPlayer(); g.play('gun'); assert.equal(sampleClip(CLIPS.gun, 0.82).R.shape, 'gun');
});
test('clap: chu kỳ theo BPM co giãn clip và mỗi cái vỗ có âm slap', () => {
  const fast = new ClipPlayer(), slow = new ClipPlayer(); fast.play('clap', { period: 0.4 }); slow.play('clap', { period: 0.9 });
  const run = (p) => { let t = 0, ev = []; while (p.active && t < 20) { ev.push(...p.update(0.01).events); t += 0.01; } return { t, ev }; };
  const a = run(fast), b = run(slow); assert.ok(a.t < b.t); assert.equal(a.ev.filter((e) => e.type === 'sound' && e.name === 'slap').length, 4);
  const gaps = []; let last = null; for (const e of CLIPS.clap.events.filter((x) => x.type === 'sound')) { if (last != null) gaps.push(+(e.t - last).toFixed(3)); last = e.t; } assert.ok(gaps.every((g) => Math.abs(g - 0.5) < 1e-6));
});
