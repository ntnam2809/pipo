import test from 'node:test';
import assert from 'node:assert/strict';
import { BeatTracker, SyntheticBeat, tempoPrior } from '../src/audio/beat.js';

function rng(seed = 1) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const NB = 1024, BW = 44100 / 2048;
const ray = (r, a) => a * Math.sqrt(-2 * Math.log(Math.max(1e-9, r())));
/** Phổ nền nhiễu Rayleigh. */
function noiseFrame(r, a) { const m = new Float32Array(NB); for (let k = 1; k < NB; k++) m[k] = ray(r, a); return m; }
/** Click track: kick ở dải thấp + hi-hat lệch nhịp ở dải cao + nhiễu nền. */
function clickFrame(t, bpm, r, { off = 0.13, noise = 0.003, hat = true } = {}) {
  const m = noiseFrame(r, noise), P = 60 / bpm;
  const jb = Math.floor((t - off) / P), tk = off + jb * P, since = t - tk;
  if (jb >= 0 && since >= 0 && since < 0.4) {
    const a = 0.25 * Math.exp(-since / 0.07) * (since < 0.02 ? 0.6 : 1), a2 = 0.04 * Math.exp(-since / 0.03);
    for (let k = 2; k <= 9; k++) m[k] += a * (0.7 + 0.3 * r());
    for (let k = 10; k <= 80; k++) m[k] += a2 * (0.6 + 0.4 * r());
  }
  if (hat) {
    const jh = Math.floor((t - off - P / 2) / P), th = off + P / 2 + jh * P, sh = t - th;
    if (jh >= 0 && sh >= 0 && sh < 0.15) { const a = 0.03 * Math.exp(-sh / 0.03); for (let k = 100; k <= 380; k++) m[k] += a * (0.5 + r()); }
  }
  return m;
}
/** Chạy bộ theo dõi với hàm tạo frame; trả log theo thời gian. */
function run(tr, seconds, frameFn, t0 = 0) {
  const log = [];
  for (let t = t0; t < t0 + seconds; t += 0.02) { const s = tr.push(t, frameFn(t)); log.push({ t, ...s }); }
  return log;
}

for (const bpm of [90, 120, 128, 150]) {
  test(`click track ${bpm} BPM: bpm đúng (không nửa/đôi), isMusic ≤ 4 s, onBeat khớp ≤ 60 ms`, () => {
    const r = rng(bpm), tr = new BeatTracker();
    const log = run(tr, 20, (t) => clickFrame(t, bpm, r));
    const first = log.find((x) => x.isMusic);
    assert.ok(first && first.t <= 4.0, 'isMusic lúc ' + (first && first.t));
    const last = log[log.length - 1];
    assert.ok(Math.abs(last.bpm - bpm) <= 3, `bpm ${last.bpm} (đúng ${bpm})`);
    // pha: mọi onBeat sau 8 s phải gần một nhịp thật
    const P = 60 / bpm, off = 0.13; let n = 0, worst = 0;
    for (const x of log) if (x.t > 8 && x.onBeat) { n++; let d = (x.t - off) % P; if (d > P / 2) d -= P; worst = Math.max(worst, Math.abs(d)); }
    assert.ok(n >= (12 * bpm) / 60 * 0.8, 'số nhịp ' + n);
    assert.ok(worst <= 0.06, `lệch nhịp ${(worst * 1000).toFixed(0)} ms`);
    // phase liên tục 0..1 và bao quanh
    for (const x of log) assert.ok(x.phase >= 0 && x.phase < 1 && Number.isFinite(x.energy) && x.energy >= 0 && x.energy <= 1);
  });
}

test('đổi nhạc 110 -> 140 BPM: tempo theo kịp sau vài giây', () => {
  const r = rng(5), tr = new BeatTracker();
  run(tr, 12, (t) => clickFrame(t, 110, r));
  const log = run(tr, 16, (t) => clickFrame(t, 140, r, { off: 0.07 }), 12);
  assert.ok(Math.abs(log[log.length - 1].bpm - 140) <= 4, 'bpm ' + log[log.length - 1].bpm);
});

test('nhiễu trắng (to) không thành nhạc', () => {
  const r = rng(11), tr = new BeatTracker();
  const log = run(tr, 25, () => noiseFrame(r, 0.02));
  assert.ok(!log.some((x) => x.isMusic), 'nhiễu bị nhận là nhạc');
  assert.ok(log[log.length - 1].confidence < 0.3);
});

/** Tiếng nói giả: âm tiết ngẫu nhiên 0,12–0,45 s, độ dài/biên độ ngẫu nhiên, năng lượng dải 100–3000 Hz. */
function speechTrack(r, seconds) {
  const ev = []; let t = 0.3;
  while (t < seconds) { const d = 0.08 + r() * 0.17; ev.push({ t, d, a: 0.04 + r() * 0.12, f0: 5 + Math.floor(r() * 10), f1: 40 + Math.floor(r() * 120) }); t += d + 0.07 + r() * 0.3; }
  return (time, rr) => {
    const m = noiseFrame(rr, 0.003);
    for (const e of ev) if (time >= e.t && time < e.t + e.d + 0.1) { const u = time - e.t, env = u < e.d ? Math.min(1, u / 0.025) : Math.exp(-(u - e.d) / 0.03); for (let k = e.f0; k <= e.f1; k++) m[k] += e.a * env * (0.5 + rr()); }
    return m;
  };
}
test('tiếng nói / onset ngẫu nhiên không thành nhạc', () => {
  for (const seed of [3, 4, 9]) {
    const r = rng(seed), tr = new BeatTracker(), sp = speechTrack(r, 40);
    const log = run(tr, 40, (t) => sp(t, r));
    assert.ok(!log.some((x) => x.isMusic), 'tiếng nói seed ' + seed + ' bị nhận là nhạc');
  }
});
test('vỗ tay lẻ (không đều) không thành nhạc', () => {
  const r = rng(21), tr = new BeatTracker(); const claps = []; let c = 1; while (c < 40) { claps.push(c); c += 1.1 + r() * 3.3; }
  const log = run(tr, 40, (t) => { const m = noiseFrame(r, 0.003); for (const tc of claps) { const s = t - tc; if (s >= 0 && s < 0.12) for (let k = 30; k < 300; k++) m[k] += 0.08 * Math.exp(-s / 0.03) * (0.5 + r()); } return m; });
  assert.ok(!log.some((x) => x.isMusic));
});

test('nhạc tắt -> isMusic false trong ≤ 4 s', () => {
  const r = rng(7), tr = new BeatTracker();
  const log = run(tr, 20, (t) => (t < 10 ? clickFrame(t, 120, r) : noiseFrame(r, 0.003)));
  assert.ok(log.find((x) => x.t > 6 && x.isMusic), 'phải có nhạc trước đó');
  const off = log.find((x) => x.t > 10 && !x.isMusic);
  assert.ok(off && off.t - 10 <= 4.0, 'tắt lúc +' + (off && (off.t - 10).toFixed(1)));
  assert.ok(!log[log.length - 1].isMusic);
});
test('im lặng tuyệt đối: không nhạc, không NaN', () => {
  const tr = new BeatTracker(); const z = new Float32Array(NB);
  const log = run(tr, 10, () => z);
  assert.ok(log.every((x) => !x.isMusic && Number.isFinite(x.energy) && Number.isFinite(x.phase)));
});
test('đầu vào hỏng (NaN, thiếu độ dài) không làm đổ', () => {
  const tr = new BeatTracker(); const bad = new Float32Array(NB).fill(NaN);
  assert.doesNotThrow(() => { for (let t = 0; t < 3; t += 0.02) { tr.push(t, bad); tr.push(t + 0.001, new Float32Array(10)); tr.push(NaN, bad); } });
});
test('stateAt ngoại suy pha giữa hai lần push', () => {
  const r = rng(2), tr = new BeatTracker(); const log = run(tr, 10, (t) => clickFrame(t, 120, r));
  const t = log[log.length - 1].t; const a = tr.stateAt(t), b = tr.stateAt(t + 0.1);
  assert.ok(b.phase > a.phase || b.phase < 0.2); assert.equal(b.onBeat, false);
});
test('tempoPrior đỉnh ở 120', () => { assert.ok(tempoPrior(120) > tempoPrior(90) && tempoPrior(120) > tempoPrior(170)); assert.equal(tempoPrior(120), 1); });
test('SyntheticBeat: pha tuần hoàn và đếm nhịp theo bpm', () => {
  const s = new SyntheticBeat(120); let beats = 0, last;
  for (let i = 0; i < 60 * 10; i++) { last = s.update(1 / 60); if (last.onBeat) beats++; assert.ok(last.phase >= 0 && last.phase < 1); }
  assert.ok(beats >= 19 && beats <= 21, 'nhịp ' + beats); assert.ok(last.isMusic && last.energy > 0.3);
});
