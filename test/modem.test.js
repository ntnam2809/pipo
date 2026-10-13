import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEM, toneFreq, crc8, interleaveStep, permutation, bodyNibbles, symbolCount, airtime, encode, Decoder } from '../src/audio/modem.js';

const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mkGauss = (rng) => () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); };
const pl = (L, k = 0) => Uint8Array.from({ length: L }, (_, i) => ((i + k) * 53 + 7) & 255);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Giọng nói giả: hài của f0 qua bốn formant, đường bao âm tiết ~3,3 Hz, xen nhiễu xát — mức RMS = 1. Tổng hợp ở 12 kHz rồi nội suy (đủ cho ≤ 5 kHz; nhanh hơn 4 lần). */
const speechCache = new Map();
function speech(rng, sr, n, f0) {
  const key = `${sr}|${f0}`, hit = speechCache.get(key); if (hit && hit.length >= n) return hit.subarray(0, n);
  const gauss = mkGauss(rng), s0 = 12000, m = Math.ceil((n * s0) / sr) + 2, z = new Float32Array(m), F = [[700, 120, 1], [1500, 150, 0.7], [2500, 200, 0.5], [3400, 250, 0.3]]; let ph = 0, nz = 0;
  for (let i = 0; i < m; i++) {
    const t = i / s0, f = f0 * (1 + 0.06 * Math.sin(2 * Math.PI * 4.5 * t)); ph += (2 * Math.PI * f) / s0;
    const syl = Math.max(0, Math.sin(2 * Math.PI * 3.3 * t)) ** 1.3; let v = 0;
    for (let h = 1; h * f < 5000; h++) { let g = 0; for (const [fc, bw, a] of F) g += a / (1 + ((h * f - fc) / bw) ** 2); v += (g * Math.sin(h * ph)) / Math.sqrt(h); }
    nz = 0.6 * nz + gauss(); z[i] = syl * v * 0.25 + (Math.sin(2 * Math.PI * 0.7 * t) > 0.7 ? 0.15 * nz : 0);
  }
  const x = new Float32Array(n); for (let i = 0; i < n; i++) { const t = (i * s0) / sr, a = Math.floor(t), fr = t - a; x[i] = z[a] * (1 - fr) + z[a + 1] * fr; }
  const k = 1 / (rms(x) + 1e-9); for (let i = 0; i < n; i++) x[i] *= k; speechCache.set(key, x); return x;
}
/** Dựng luồng thu: im lặng đầu + gói + im lặng cuối, rồi nhiễu/suy giảm/lệch tốc độ. Trả luồng PCM. */
function channel(packets, sr, o = {}) {
  const rng = lcg(o.seed || 1), gauss = mkGauss(rng), sigs = packets.map((p) => encode(p, sr)), lead = o.offset ?? 7777, gap = Math.round(sr * (o.gap ?? 0.8));
  const len = lead + sigs.reduce((s, x) => s + x.length + gap, 0) + Math.round(sr * 1.2), x = new Float32Array(len); let at = lead;
  for (const s of sigs) { x.set(s, at); at += s.length + gap; }
  const sigRms = rms(sigs[0]);
  if (o.speechDb != null) { const sp = speech(rng, sr, len, o.f0 || 130), k = sigRms * Math.pow(10, o.speechDb / 20); for (let i = 0; i < len; i++) x[i] += k * sp[i]; }
  if (o.snr != null) { const sd = sigRms / Math.pow(10, o.snr / 20); for (let i = 0; i < len; i++) x[i] += sd * gauss(); }
  if (o.burst) for (const [a, b, amp] of o.burst) for (let i = Math.round(a * sr); i < Math.min(len, Math.round(b * sr)); i++) x[i] += amp * gauss();
  let y = x; const mis = o.mis || 1;
  if (mis !== 1) { const n = Math.floor(len / mis); y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * mis, a = Math.floor(t), f = t - a; y[i] = x[a] * (1 - f) + (x[a + 1] || 0) * f; } }
  if (o.gain) for (let i = 0; i < y.length; i++) y[i] *= o.gain;
  return y;
}
function decodeAll(y, sr, chunk = 1000) { const d = new Decoder(sr), out = []; const ch = typeof chunk === 'function' ? chunk : () => chunk; for (let i = 0; i < y.length;) { const c = ch(); out.push(...d.push(y.subarray(i, Math.min(y.length, i + c)))); i += c; } return { out, d }; }
const expectOne = (packet, y, sr, why, chunk) => { const { out } = decodeAll(y, sr, chunk); assert.equal(out.length, 1, `${why}: ra ${out.length} gói`); assert.ok(same(out[0], packet), `${why}: sai nội dung`); };

test('hằng số & tiện ích: 16 tông 1,8–4,2 kHz cách 160 Hz; CRC-8 đúng vector chuẩn; xáo trộn là hoán vị; thời lượng khớp', () => {
  assert.equal(MODEM.tones, 16); assert.equal(toneFreq(0), 1800); assert.equal(toneFreq(15), 4200); for (let k = 1; k < 16; k++) assert.equal(toneFreq(k) - toneFreq(k - 1), 160);
  assert.ok(MODEM.sym >= 0.06 && MODEM.sym <= 0.08); assert.equal(MODEM.maxPayload, 24);
  assert.equal(crc8(Array.from('123456789', (c) => c.charCodeAt(0))), 0xf4); assert.equal(crc8([]), 0); assert.notEqual(crc8([1, 2, 3]), crc8([1, 2, 4]));
  for (let n = 2; n <= 60; n++) { const p = permutation(n); assert.equal(new Set(p).size, n, 'n=' + n); assert.ok(p.every((v) => v >= 0 && v < n)); assert.ok(n < 6 || interleaveStep(n) >= 2); }
  for (const L of [0, 1, 8, 24]) assert.equal(bodyNibbles(pl(L)).length, 2 * (L + 1));
  for (const sr of [48000, 44100]) for (const L of [0, 5, 24]) { const x = encode(pl(L), sr), want = airtime(L); assert.ok(Math.abs(x.length / sr - want) < 0.02, `${sr} L=${L}: ${x.length / sr} vs ${want}`); }
  assert.ok(airtime(24) < 8 && symbolCount(5) === 6 + 24);
});
test('encode: hữu hạn, biên độ ≤ 1, không click (đường bao về 0 ở mọi ranh giới ký hiệu), đúng 24 byte thì được, 25 byte thì từ chối', () => {
  const sr = 48000, x = encode(pl(24, 3), sr); assert.ok(x.every(Number.isFinite)); let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); assert.ok(pk <= 0.75 && pk > 0.6, 'peak ' + pk);
  const T = Math.round(MODEM.sym * sr), start = Math.round(MODEM.lead * sr) + 2 * Math.round(MODEM.preDur * sr) + Math.round(MODEM.guard * sr);
  for (let s = 0; s < symbolCount(24); s += 7) { const a = start + s * T; assert.ok(Math.abs(x[a]) < 0.03 && Math.abs(x[a + T - 1]) < 0.03, `ranh giới ký hiệu ${s}: ${x[a]} ${x[a + T - 1]}`); }
  assert.ok(Math.abs(x[0]) < 1e-6 && Math.abs(x[x.length - 1]) < 1e-6); assert.throws(() => encode(pl(25), sr), RangeError); assert.equal(encode([], sr).length > 0, true);
  // phổ: mỗi ký hiệu thật sự là tông đúng bảng (Goertzel trên ký hiệu đầu của thân)
  const body = start + 6 * T, w = (2 * Math.PI * toneFreq(bodyNibbles(pl(24, 3))[0])) / sr; let re = 0, im = 0; for (let i = 0; i < T; i++) { re += x[body + i] * Math.cos(w * i); im += x[body + i] * Math.sin(w * i); } assert.ok(Math.hypot(re, im) / T > 0.15);
});
test('giải mã sạch: mọi độ dài 0…24 byte, các tốc độ mẫu 48000/44100/22050/16000', () => {
  for (const sr of [48000, 44100, 22050, 16000]) for (const L of [0, 1, 7, 24]) { const p = pl(L, L + sr % 7); expectOne(p, channel([p], sr), sr, `sr=${sr} L=${L}`); }
  const hard = Uint8Array.from([0, 255, 0, 255, 17, 17, 17, 17, 238, 238, 1, 2, 4, 8, 16, 32, 64, 128, 0xaa, 0x55]); expectOne(hard, channel([hard], 48000), 48000, 'mẫu byte khó (lặp nibble)');
});
test('nhiễu trắng: SNR 10 dB (và 0 dB, -6 dB) vẫn ra đúng gói', () => {
  for (const snr of [10, 0, -6]) for (const sr of [48000, 44100]) { const p = pl(14, snr + 9); expectOne(p, channel([p], sr, { snr, seed: 3 + sr % 5 }), sr, `snr=${snr} sr=${sr}`); }
});
test('suy giảm mạnh (-34 dB) + nhiễu: chuẩn hóa biên độ nên vẫn giải được', () => {
  const p = pl(12, 4); expectOne(p, channel([p], 48000, { gain: 0.02, snr: 10, seed: 6 }), 48000, 'gain 0.02');
});
test('lệch thời gian: bắt đầu ở mẫu bất kỳ, khung đẩy vào độ dài lẻ/ngẫu nhiên (kể cả 1 mẫu, 7 mẫu, 1 mẫu rồi 5000 mẫu)', () => {
  const sr = 48000, p = pl(9, 2);
  for (const offset of [0, 1, 333, 12345, 48001]) expectOne(p, channel([p], sr, { offset, snr: 12, seed: offset % 9 + 1 }), sr, `offset ${offset}`);
  const y = channel([p], sr, { snr: 12, seed: 4 }); const rng = lcg(99);
  expectOne(p, y, sr, 'khung ngẫu nhiên', () => 1 + Math.floor(rng() * 6000)); expectOne(p, y, sr, 'khung 7 mẫu', 7); assert.equal(decodeAll(y.subarray(0, 40000), sr, 997).out.length, 0, 'luồng bị cắt cụt giữa gói -> không ra gói');
});
test('lệch tốc độ mẫu ±0,5% (đồng hồ hai máy lệch/co giãn thời gian) vẫn giải được, kể cả gói dài 24 byte', () => {
  for (const mis of [0.995, 0.998, 1.002, 1.005]) for (const L of [6, 24]) { const p = pl(L, 5); expectOne(p, channel([p], 48000, { mis, snr: 10, seed: 11 }), 48000, `mis=${mis} L=${L}`); }
  const p = pl(10); expectOne(p, channel([p], 44100, { mis: 1.004, snr: 6, seed: 2 }), 44100, '44.1k +0.4% SNR 6');
});
test('tiếng nói giả chen ngang (cùng mức RMS với gói, đỉnh âm tiết còn cao hơn) + nhiễu: gói vẫn đúng; to hơn nữa (+3 dB) thì mất gói chứ không ra gói sai', () => {
  for (const f0 of [100, 140, 210]) { const p = pl(12, f0); expectOne(p, channel([p], 48000, { speechDb: 0, snr: 10, f0, seed: f0 }), 48000, `nói f0=${f0} 0 dB`); }
  const p = pl(14, 9); for (const f0 of [100, 120, 210]) for (const o of decodeAll(channel([p], 48000, { speechDb: 3, f0, seed: 8 }), 48000, 1000).out) assert.ok(same(o, p), 'nói +3 dB: gói ra phải đúng');
});
test('tổ hợp xấu nhất: suy giảm + nhiễu 6 dB + nói 0 dB + lệch tốc độ 0,3% + khung ngẫu nhiên', () => {
  const rng = lcg(5), p = pl(16, 1); expectOne(p, channel([p], 48000, { gain: 0.05, snr: 6, speechDb: 0, mis: 1.003, offset: 4321, seed: 9 }), 48000, 'tổ hợp', () => 500 + Math.floor(rng() * 4000));
});
test('nhiều gói liên tiếp trong một luồng (cách nhau 0,3 s) đều ra đúng thứ tự, không dư không thiếu', () => {
  const ps = [pl(3, 1), pl(24, 2), pl(0, 3), pl(11, 4)], sr = 48000, y = channel(ps, sr, { snr: 10, gap: 0.3, seed: 7 }), { out } = decodeAll(y, sr, 2048);
  assert.equal(out.length, ps.length); out.forEach((o, i) => assert.ok(same(o, ps[i]), 'gói ' + i));
});
test('cụm nhiễu to phá một đoạn thân: hai bản + xáo trộn cứu được nếu ngắn; gói hỏng nặng thì bỏ chứ không bao giờ ra nội dung sai', () => {
  const sr = 48000, p = pl(14, 5), start = 7777 / sr, T = MODEM.sym;
  const body0 = start + MODEM.lead + 2 * MODEM.preDur + MODEM.guard + 6 * T;
  const short = channel([p], sr, { snr: 20, seed: 5, burst: [[body0 + 6 * T, body0 + 8.5 * T, 3]] });                     // phá ~2 ký hiệu của bản A
  expectOne(p, short, sr, 'cụm nhiễu ngắn trong bản A');
  let wrong = 0, got = 0; const rng = lcg(21);
  for (let k = 0; k < 24; k++) { const a = body0 + rng() * 3, b = a + 0.2 + rng() * 2.5, q = pl(14, 5), y = channel([q], sr, { snr: 15, seed: 30 + k, burst: [[a, b, 1 + rng() * 3]] }); for (const o of decodeAll(y, sr, 3000).out) { if (same(o, q)) got++; else wrong++; } }
  assert.equal(wrong, 0, 'không bao giờ ra gói sai'); assert.ok(got >= 6, 'đa số cụm ngắn vẫn cứu được: ' + got);
});
test('gói giả/nhiễu: nhiễu trắng 2 phút, tiếng nói, tông cố định, nhạc giả, chirp lẻ, nửa gói → KHÔNG ra gói nào', () => {
  const sr = 48000, rng = lcg(17), gauss = mkGauss(rng);
  const run = (name, x) => { const { out, d } = decodeAll(x, sr, 2048); assert.equal(out.length, 0, name); return d; };
  const N = sr * 90, white = new Float32Array(N); for (let i = 0; i < N; i++) white[i] = 0.3 * gauss(); run('nhiễu trắng 90 s', white);
  const sp = Float32Array.from(speech(lcg(2), sr, sr * 40, 130), (v) => v * 0.3); run('tiếng nói 40 s', sp);
  const tone = new Float32Array(sr * 20); for (let i = 0; i < tone.length; i++) tone[i] = 0.4 * Math.sin((2 * Math.PI * 3000 * i) / sr); run('tông 3 kHz', tone);
  const mus = new Float32Array(sr * 30); for (let i = 0; i < mus.length; i++) { const t = i / sr, n = Math.floor(t * 4); mus[i] = 0.3 * Math.sin(2 * Math.PI * (440 * 2 ** ((n * 5) % 12 / 12)) * t) + 0.2 * Math.sin(2 * Math.PI * 3 * (440 * 2 ** ((n * 5) % 12 / 12)) * t); } run('nhạc giả', mus);
  const sig = encode(pl(10, 1), sr), up = new Float32Array(sr * 6); up.set(sig.subarray(0, Math.round(sr * 0.2)), sr); run('chỉ chirp lên', up);
  const half = new Float32Array(sr * 6); half.set(sig.subarray(0, Math.round(sig.length * 0.4)), sr); run('nửa gói', half);
  const swapped = Float32Array.from(sig); const dn = Math.round(sr * (MODEM.lead + MODEM.preDur)); for (let i = 0; i < Math.round(sr * MODEM.preDur); i++) swapped[dn + i] = 0; const sw = new Float32Array(sr * 6); sw.set(swapped, sr); run('thiếu chirp xuống', sw);
});
test('Decoder: bộ đệm không phình (luồng im lặng/nhiễu 60 s), busy() đúng khi nhận dở, reset() xóa trạng thái, đầu vào lạ không ném', () => {
  const sr = 48000, d = new Decoder(sr); const p = pl(10, 3), sig = encode(p, sr); let sawBusy = false;
  for (let i = 0; i < sr * 60; i += 2048) d.push(new Float32Array(2048)); assert.ok(d.n <= d.cap && !d.busy);
  for (let i = 0; i < sig.length / 2; i += 1024) { d.push(sig.subarray(i, Math.min(sig.length, i + 1024))); if (d.busy) sawBusy = true; } assert.ok(sawBusy, 'đang nhận dở thì busy');
  d.reset(); assert.equal(d.busy, false); assert.equal(d.n, 0);
  assert.deepEqual(d.push(new Float32Array(0)), []); assert.deepEqual(d.push([]), []); assert.deepEqual(d.push(undefined), []); assert.doesNotThrow(() => d.push(Float32Array.from([NaN, Infinity, -Infinity, 0])));
  for (let i = 0; i < sig.length; i += 1500) { const o = d.push(sig.subarray(i, Math.min(sig.length, i + 1500))); if (o.length) assert.ok(same(o[0], p)); }
  const long = new Decoder(sr); const ps = Array.from({ length: 6 }, (_, k) => pl(20, k)), y = channel(ps, sr, { snr: 12, gap: 1.5, seed: 4 }); const r = decodeAll(y, sr, 4096); assert.equal(r.out.length, 6); assert.ok(long.cap >= 15 * long.er && r.d.n < r.d.cap);
});
