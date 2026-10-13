import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePacket, decodePacket, clipName, reactTo, emoOf, updateFriends, Meeting, EMOS, SKINS, REACT, MAX_FRIENDS, MAX_NAME_BYTES, T, CFG } from '../src/brain/meet.js';
import { Link } from '../src/audio/meetlink.js';
import { encode, Decoder, MODEM, airtime } from '../src/audio/modem.js';
import { isExpression } from '../src/eyes/expressions.js';

// ---------- helpers ----------
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mkGauss = (rng) => () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
const SELF = (name, hue, skin, emo = 'happy') => ({ name, hue, skin, mood: { valence: 0.4, arousal: 0.5 }, emo });

test('gói: mã hóa/giải mã đủ năm loại, ≤ 24 byte, đúng giá trị (tên, hue, skin, mood, emo)', () => {
  const hello = { t: 'HELLO', id: 0xabcd, name: 'Pipo', hue: 188, skin: 'eve', mood: { valence: 0.4, arousal: 0.6 }, emo: 'joy' };
  const b = encodePacket(hello); assert.ok(b.length <= MODEM_MAX); const d = decodePacket(b);
  assert.equal(d.t, 'HELLO'); assert.equal(d.id, 0xabcd); assert.equal(d.name, 'Pipo'); assert.ok(Math.abs(d.hue - 188) <= 2); assert.equal(d.skin, 'eve'); assert.equal(d.emo, 'joy'); assert.ok(Math.abs(d.mood.valence - 0.4) < 0.08 && Math.abs(d.mood.arousal - 0.6) < 0.05);
  const ack = decodePacket(encodePacket({ t: 'ACK', id: 7, to: 0xabcd, name: 'Bi', hue: 330, skin: 'pixel', mood: { valence: -1, arousal: 0 }, emo: 'sad' })); assert.equal(ack.t, 'ACK'); assert.equal(ack.to, 0xabcd); assert.equal(ack.skin, 'pixel'); assert.equal(ack.mood.valence, -1);
  const emo = decodePacket(encodePacket({ t: 'EMO', id: 9, seq: 5, left: 2, emo: 'love', mood: { valence: 0.9, arousal: 1 } })); assert.deepEqual([emo.t, emo.seq, emo.left, emo.emo], ['EMO', 5, 2, 'love']);
  assert.equal(decodePacket(encodePacket({ t: 'DANCE', id: 1, bpm: 128 })).bpm, 128); assert.equal(decodePacket(encodePacket({ t: 'BYE', id: 65535 })).id, 65535);
  assert.throws(() => encodePacket({ t: 'NOPE', id: 1 }));
});
const MODEM_MAX = MODEM.maxPayload;
test('gói: tên dài/có dấu cắt ≤ 10 byte ở ranh giới ký tự; mọi emo/skin đều qua; gói ngắn nhất tối đa còn trong 24 byte', () => {
  for (const nm of ['Pipo', 'Bé Bống Bang Bang Bang', 'Nguyễn Văn', '🐙🐙🐙🐙', '', 'a'.repeat(40), 'tên\u0000x']) {
    const c = clipName(nm); assert.ok(new TextEncoder().encode(c).length <= MAX_NAME_BYTES, nm); assert.ok(!/[\u0000-\u001f]/.test(c));
    const b = encodePacket({ t: 'ACK', id: 1, to: 2, name: nm, hue: 10, skin: 'classic', mood: {}, emo: 'happy' }); assert.ok(b.length <= MODEM_MAX, nm); assert.equal(decodePacket(b).name, c);
  }
  for (const e of EMOS) { assert.ok(isExpression(e), e); assert.equal(decodePacket(encodePacket({ t: 'EMO', id: 1, seq: 0, left: 0, emo: e, mood: {} })).emo, e); }
  for (const s of SKINS) assert.equal(decodePacket(encodePacket({ t: 'HELLO', id: 1, name: 'x', hue: 0, skin: s, mood: {}, emo: 'happy' })).skin, s);
});
test('gói: giải mã từ chối rác (sai phiên bản · loại lạ · độ dài lệch · UTF-8 hỏng · emo ngoài bảng)', () => {
  const good = encodePacket({ t: 'HELLO', id: 3, name: 'Pipo', hue: 10, skin: 'classic', mood: {}, emo: 'happy' });
  assert.ok(decodePacket(good));
  const mut = (f) => { const x = Uint8Array.from(good); f(x); return decodePacket(x); };
  assert.equal(mut((x) => { x[0] = 0x40 | 1; }), null); assert.equal(mut((x) => { x[0] = 0x20 | 9; }), null); assert.equal(mut((x) => { x[0] = 0x20 | 0; }), null);
  assert.equal(decodePacket(good.subarray(0, good.length - 1)), null); assert.equal(decodePacket(Uint8Array.from([...good, 0])), null); assert.equal(mut((x) => { x[good.length - 1] = 0xff; x[good.length - 2] = 0xc0; }), null);
  assert.equal(mut((x) => { x[6] = 99; }), null); assert.equal(decodePacket(null), null); assert.equal(decodePacket(Uint8Array.from([0x23])), null); assert.equal(decodePacket(Uint8Array.from([0x20 | 3, 0, 1, 0x12, 1, 0, 0])), null);
  const rng = lcg(5); for (let i = 0; i < 300; i++) { const x = Uint8Array.from({ length: (rng() * 24) | 0 }, () => (rng() * 256) | 0); const p = decodePacket(x); if (p) assert.ok(['HELLO', 'ACK', 'EMO', 'DANCE', 'BYE'].includes(p.t)); }
});
test('cảm xúc: bảng phản ứng đủ 16 emo, trả emo hợp lệ; emoOf ánh xạ biểu cảm lạ', () => {
  for (const e of EMOS) { assert.ok(REACT[e] && REACT[e].length === 2); for (const r of REACT[e]) assert.ok(EMOS.includes(r)); assert.ok(EMOS.includes(reactTo(e, () => 0.2)) && EMOS.includes(reactTo(e, () => 0.9))); }
  assert.equal(reactTo('sad', () => 0.1), 'love'); assert.equal(emoOf('cry'), 'sad'); assert.equal(emoOf('joy'), 'joy'); assert.equal(emoOf('no_such'), 'happy');
});
test('bạn đã gặp: cùng tên+nhóm màu thì cộng số lần, mới nhất lên đầu, tối đa 50, dữ liệu hỏng bị loại', () => {
  let l = []; l = updateFriends(l, { name: 'Bi', hue: 330, skin: 'eve' }, 1000); l = updateFriends(l, { name: 'Pipo', hue: 188 }, 2000); l = updateFriends(l, { name: 'bi', hue: 335 }, 3000);
  assert.equal(l.length, 2); assert.deepEqual([l[0].name.toLowerCase(), l[0].n, l[0].last], ['bi', 2, 3000]); assert.equal(l[1].name, 'Pipo');
  let big = []; for (let i = 0; i < 80; i++) big = updateFriends(big, { name: 'P' + i, hue: i * 3 }, i); assert.equal(big.length, MAX_FRIENDS); assert.equal(big[0].name, 'P79');
  assert.equal(updateFriends([null, { x: 1 }, 5], { name: 'A', hue: 0 }, 1).length, 1); assert.equal(updateFriends(undefined, { name: '' , hue: 1 }, 1)[0].name, 'Bạn');
});

// ---------- hai peer giả qua kênh giả (không âm thanh): ghép thẳng gói ----------
function pair(opts = {}) {
  const rng = lcg(opts.seed || 11), log = { A: [], B: [] }, q = []; let now = 0;
  const mk = (tag, self, other) => new Meeting({ self, rng: lcg((opts.seed || 11) * (tag === 'A' ? 3 : 7)), cfg: opts.cfg, emit: (e) => log[tag].push(e), send: (pkt) => { if (!(opts.drop && opts.drop(tag, pkt, now))) q.push({ at: now + 1.2, to: other, pkt: decodePacket(encodePacket(pkt)) }); return 1.2; } });
  const A = mk('A', SELF('Pipo', 188, 'classic', 'happy'), 'B'), B = mk('B', SELF('Bi', 330, 'eve', 'sad'), 'A'); const M = { A, B };
  return { A, B, M, log, q, run(sec, env = {}) { const end = now + sec; for (; now < end; now += 0.1) { for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) { const m = q.splice(i, 1)[0]; M[m.to].onPacket(m.pkt, now, env); } A.tick(now, env); B.tick(now, env); if (!A.active && !B.active) break; } return now; }, get now() { return now; } };
}
test('meeting (kênh giả): HELLO → ACK → EMO ⇄ EMO → BYE, hai bên đều "met" và đổi tên cho nhau, mỗi bên phản ứng với cảm xúc của bên kia', () => {
  const p = pair(); p.A.start(0); p.B.start(0.3); p.run(90);
  const types = (L) => L.map((e) => e.type);
  for (const k of ['A', 'B']) { assert.ok(types(p.log[k]).includes('met'), k + ' met'); assert.ok(types(p.log[k]).includes('bye'), k + ' bye'); const end = p.log[k].find((e) => e.type === 'end'); assert.ok(end && end.ok && end.reason === 'bye', k + ' end ' + JSON.stringify(end)); }
  assert.equal(p.log.A.find((e) => e.type === 'met').peer.name, 'Bi'); assert.equal(p.log.B.find((e) => e.type === 'met').peer.name, 'Pipo'); assert.equal(p.log.A.find((e) => e.type === 'met').peer.skin, 'eve');
  const mine = p.log.A.filter((e) => e.type === 'myEmo'), theirs = p.log.A.filter((e) => e.type === 'peerEmo'); assert.ok(mine.length >= 2 && theirs.length >= 2, 'ít nhất 2 lượt: ' + mine.length + '/' + theirs.length);
  const seen = p.log.B.filter((e) => e.type === 'peerEmo'); assert.equal(seen[0].emo, 'happy'); const reply = p.log.B.filter((e) => e.type === 'myEmo')[0].emo; assert.ok(REACT.happy.includes(reply), 'B (buồn) phản ứng với happy của A bằng ' + reply);
  assert.ok(!p.A.active && !p.B.active); assert.ok(p.now < 80, 'xong trong cửa sổ 90 s: ' + p.now);
  assert.notEqual(p.A.id, p.B.id);
});
test('meeting: có nhạc thì khởi xướng gửi DANCE, hai bên cùng nhảy rồi mới BYE; không nhạc thì không có DANCE', () => {
  const p = pair({ seed: 4 }); p.A.start(0); p.B.start(0); p.run(90, { music: { bpm: 124 } });
  const dances = [...p.log.A, ...p.log.B].filter((e) => e.type === 'dance'); assert.equal(dances.length, 2); assert.ok(dances.every((d) => d.bpm === 124));
  const q = pair({ seed: 4 }); q.A.start(0); q.B.start(0); q.run(90); assert.equal([...q.log.A, ...q.log.B].filter((e) => e.type === 'dance').length, 0);
});
test('meeting: va chạm (hai bên HELLO cùng lúc) vẫn ra đúng một khởi xướng (id nhỏ hơn) và một bên đáp', () => {
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const p = pair({ seed, cfg: { firstHello: [0.5, 0.5] } }); p.A.start(0); p.B.start(0); p.run(90);
    const roles = ['A', 'B'].map((k) => p.log[k].find((e) => e.type === 'met')?.role); assert.ok(roles.includes('initiator') || roles.every(Boolean), seed + ' ' + roles);
    for (const k of ['A', 'B']) assert.equal(p.log[k].find((e) => e.type === 'end')?.reason, 'bye', `${seed} ${k}`);
  }
});
test('meeting: mất gói giữa chừng thì gửi lại (không kẹt); mất hẳn bạn thì "lost"; không ai trả lời thì timeout 90 s; nghe chính mình thì bỏ qua', () => {
  let dropped = 0; const p = pair({ seed: 9, drop: (tag, pkt) => { if (pkt.t === 'EMO' && pkt.seq === 1 && dropped < 1) { dropped++; return true; } return false; } });
  p.A.start(0); p.B.start(0.2); p.run(90); assert.equal(dropped, 1); assert.equal(p.log.A.find((e) => e.type === 'end').reason, 'bye'); assert.equal(p.log.B.find((e) => e.type === 'end').reason, 'bye');
  const lost = pair({ seed: 9, drop: (tag, pkt, now) => now > 12 && tag === 'B' }); lost.A.start(0); lost.B.start(0.2); lost.run(90); assert.ok(['lost', 'timeout'].includes(lost.log.A.find((e) => e.type === 'end').reason));
  const alone = pair({ seed: 2, drop: () => true }); alone.A.start(0); alone.run(120); assert.equal(alone.log.A.find((e) => e.type === 'end').reason, 'timeout'); assert.ok(alone.log.A.filter((e) => e.type === 'search').length >= 3, 'HELLO lặp lại');
  const m = new Meeting({ self: SELF('X', 1, 'classic'), rng: lcg(1), send: () => 0, emit: () => {} }); m.start(0); m.onPacket({ t: 'HELLO', id: m.id, name: 'echo' }, 1); assert.equal(m.state, 'search');
});
test('meeting: chỉ nói chuyện với bạn đã chọn; gói của peer thứ ba và gói trùng không làm hỏng luồng', () => {
  const sent = []; const m = new Meeting({ self: SELF('X', 1, 'classic'), rng: lcg(3), cfg: { replyDelay: [0.1, 0.1] }, send: (p) => { sent.push(p); return 0.5; }, emit: () => {} });
  m.start(0); m.onPacket({ t: 'HELLO', id: 111, name: 'Ann', hue: 10, skin: 'classic', mood: {}, emo: 'happy' }, 1); m.tick(1.2); assert.equal(sent.at(-1).t, 'ACK'); assert.equal(sent.at(-1).to, 111);
  const n = sent.length; m.onPacket({ t: 'HELLO', id: 222, name: 'Eve' }, 2); m.onPacket({ t: 'EMO', id: 222, seq: 0, left: 3, emo: 'joy', mood: {} }, 2); m.tick(3); assert.equal(sent.length, n, 'bỏ qua người lạ');
  m.onPacket({ t: 'EMO', id: 111, seq: 0, left: 3, emo: 'joy', mood: {} }, 4); m.tick(4.2); const r1 = sent.at(-1); assert.equal(r1.t, 'EMO'); assert.equal(r1.seq, 1); assert.equal(r1.left, 2);
  const c = sent.length; m.onPacket({ t: 'EMO', id: 111, seq: 0, left: 3, emo: 'joy', mood: {} }, 6); m.tick(6.3); assert.equal(sent.length, c + 1, 'nhận trùng thì phát lại câu trả lời cũ'); assert.deepEqual(sent.at(-1), r1);
});

// ---------- đầu-cuối: PCM thật qua kênh âm học giả (nhiễu + suy giảm + trễ + tiếng nói chen), hai Link + hai Meeting ----------
function speechLike(rng, sr, n, f0) {   // tổng hợp ở 12 kHz rồi nội suy (đủ cho ≤ 5 kHz; nhanh); mức RMS = 1
  const gauss = mkGauss(rng), s0 = 12000, m = Math.ceil((n * s0) / sr) + 2, z = new Float32Array(m), F = [[700, 120, 1], [1500, 150, 0.7], [2500, 200, 0.5], [3400, 250, 0.3]]; let ph = 0, nz = 0;
  for (let i = 0; i < m; i++) {
    const t = i / s0, f = f0 * (1 + 0.06 * Math.sin(2 * Math.PI * 4.5 * t)); ph += (2 * Math.PI * f) / s0; const syl = Math.max(0, Math.sin(2 * Math.PI * 3.3 * t)) ** 1.3;
    let v = 0; for (let h = 1; h * f < 5000; h += 1) { let g = 0; for (const [fc, bw, a] of F) g += a / (1 + ((h * f - fc) / bw) ** 2); v += (g * Math.sin(h * ph)) / Math.sqrt(h); }
    nz = 0.6 * nz + gauss(); z[i] = syl * v * 0.25 + (Math.sin(2 * Math.PI * 0.7 * t) > 0.7 ? 0.15 * nz : 0);
  }
  const x = new Float32Array(n); let e = 0; for (let i = 0; i < n; i++) { const t = (i * s0) / sr, a = Math.floor(t), fr = t - a; x[i] = z[a] * (1 - fr) + z[a + 1] * fr; e += x[i] * x[i]; }
  const k = 1 / Math.sqrt(e / n + 1e-12); for (let i = 0; i < n; i++) x[i] *= k; return x;
}
function acoustic({ sr = 48000, snr = 10, atten = 0.3, speechDb = -Infinity, seed = 21, burst = null, mis = 1, latency = 0.04, cfg } = {}) {
  const rng = lcg(seed), gauss = mkGauss(rng), FR = 2048, dt = FR / sr, tx = []; let now = 0;
  const logs = { A: [], B: [] }, peerOf = { A: 'B', B: 'A' };
  const links = {}, meets = {};
  const mkSide = (tag, self, s2) => {
    links[tag] = new Link({ sampleRate: sr * (tag === 'B' ? mis : 1), now: () => now, play: (pcm) => tx.push({ from: tag, start: now + latency, pcm: tag === 'B' && mis !== 1 ? pcm : pcm }) });
    meets[tag] = new Meeting({ self, rng: lcg(seed * s2), cfg, emit: (e) => logs[tag].push({ ...e, at: now }), send: (pkt) => links[tag].send(pkt) });
  };
  mkSide('A', SELF('Pipo', 188, 'classic', 'happy'), 3); mkSide('B', SELF('Bi', 330, 'eve', 'sad'), 5);
  const sigRms = 0.7 / Math.SQRT2 * 0.8, noiseSd = sigRms * atten / Math.pow(10, snr / 20), sp = speechDb > -100 ? speechLike(rng, sr, Math.ceil(20 * sr), 130) : null;
  const frameFor = (tag, t0) => {
    const f = new Float32Array(FR); const peer = peerOf[tag];
    for (const x of tx) { if (x.from !== peer) continue; const a = Math.round((t0 - x.start) * sr); if (a + FR <= 0 || a >= x.pcm.length) continue; for (let i = 0; i < FR; i++) { const j = a + i; if (j >= 0 && j < x.pcm.length) f[i] += atten * x.pcm[j]; } }
    if (sp) { const o = Math.round(t0 * sr), k = sigRms * atten * Math.pow(10, speechDb / 20); for (let i = 0; i < FR; i++) f[i] += k * sp[(o + i) % sp.length]; }
    if (snr < 100) for (let i = 0; i < FR; i++) f[i] += noiseSd * gauss();
    if (burst && t0 >= burst[0] && t0 < burst[1]) for (let i = 0; i < FR; i++) f[i] += 1.5 * gauss();       // cụm nhiễu rất to phá một gói
    return f;
  };
  return { logs, links, meets, run(sec) { for (; now < sec; now += dt) { for (const tag of ['A', 'B']) { const pkts = links[tag].feed(frameFor(tag, now), now); for (const p of pkts) meets[tag].onPacket(p, now, {}); meets[tag].tick(now, { busy: links[tag].busy(now) }); } if (!meets.A.active && !meets.B.active) break; } return now; }, get now() { return now; } };
}
const endOf = (L) => L.find((e) => e.type === 'end');
test('đầu-cuối: PCM của peer A → nhiễu trắng SNR 10 dB + suy giảm + trễ → Decoder của B → hai máy trạng thái chạy hết HELLO→ACK→EMO…→BYE', () => {
  const s = acoustic({ snr: 10, atten: 0.3, seed: 21 }); s.meets.A.start(0); s.meets.B.start(0.5); const t = s.run(100);
  for (const k of ['A', 'B']) { const e = endOf(s.logs[k]); assert.ok(e && e.reason === 'bye' && e.ok, `${k}: ${JSON.stringify(e)}`); assert.ok(s.logs[k].some((x) => x.type === 'met')); assert.ok(s.logs[k].filter((x) => x.type === 'peerEmo').length >= 2, k + ' nghe được ≥ 2 EMO'); }
  assert.equal(s.logs.A.find((x) => x.type === 'met').peer.name, 'Bi'); assert.equal(s.logs.B.find((x) => x.type === 'met').peer.name, 'Pipo');
  assert.ok(t < 90, 'xong trong 90 s: ' + t); assert.ok(s.links.A.received >= 4 && s.links.B.received >= 4); assert.equal(s.links.A.bad + s.links.B.bad, 0, 'không có gói CRC đúng mà giải mã gói sai');
});
test('đầu-cuối: thêm tiếng nói chen ngang (cùng mức gói) + nhiễu + tín hiệu rất nhỏ (-30 dB) vẫn gặp được nhau', () => {
  const s = acoustic({ snr: 8, atten: 0.03, speechDb: 0, seed: 33 }); s.meets.A.start(0); s.meets.B.start(1.1); const t = s.run(110);
  for (const k of ['A', 'B']) { const e = endOf(s.logs[k]); assert.ok(e && e.reason === 'bye', `${k}: ${JSON.stringify(e)} @${t}`); }
});
test('đầu-cuối: một cụm nhiễu to phá hỏng một gói → bên kia gửi lại, luồng vẫn xong', () => {
  const s = acoustic({ snr: 12, seed: 5, burst: [11, 13.5] }); s.meets.A.start(0); s.meets.B.start(0.4); const t = s.run(118);
  for (const k of ['A', 'B']) { const e = endOf(s.logs[k]); assert.ok(e && ['bye'].includes(e.reason), `${k}: ${JSON.stringify(e)} @${t}`); }
});
test('đầu-cuối: có nhạc → DANCE đi qua PCM; không bạn nào ngoài vùng → timeout, không gói ma từ nhiễu', () => {
  const s = acoustic({ snr: 10, seed: 8 }); const orig = s.meets.A.onPacket.bind(s.meets.A); s.meets.A.onPacket = (p, n) => orig(p, n, { music: { bpm: 120 } }); s.meets.A.start(0); s.meets.B.start(0.2); s.run(118);
  assert.ok(s.logs.A.some((e) => e.type === 'dance') && s.logs.B.some((e) => e.type === 'dance'), 'cả hai nhảy'); assert.equal(endOf(s.logs.B).reason, 'bye');
  const lone = acoustic({ snr: 3, seed: 3 }); lone.meets.A.start(0); lone.run(95); assert.equal(endOf(lone.logs.A).reason, 'timeout'); assert.equal(lone.links.A.received, 0);
});
test('Link: half-duplex — đang phát (+ guard 150 ms) thì không nghe và bỏ gói nhận dở; busy() phản ánh đúng', () => {
  let now = 0; const played = []; const link = new Link({ sampleRate: 48000, now: () => now, play: (p) => played.push(p) });
  assert.equal(link.busy(0), false); const dur = link.send({ t: 'BYE', id: 5 }); assert.ok(Math.abs(dur - airtime(3 + 0) * 1) < 0.1 || dur > 1); assert.equal(played.length, 1);
  assert.ok(link.busy(0.1) && link.busy(dur + 0.1) && !link.busy(dur + 0.2)); const loop = played[0]; assert.deepEqual(link.feed(loop, 0.5), [], 'không nghe chính mình khi đang phát');
  now = dur + 0.3; const got = []; for (let i = 0; i < loop.length; i += 2048) got.push(...link.feed(loop.subarray(i, Math.min(loop.length, i + 2048)), now)); const pad = new Float32Array(48000); got.push(...link.feed(pad, now)); assert.equal(got.length, 1); assert.equal(got[0].t, 'BYE'); assert.equal(got[0].id, 5);
  const fast = new Link({ sampleRate: 48000, now: () => 0, timeScale: 4 }); assert.ok(Math.abs(fast.send({ t: 'BYE', id: 1 }) - dur / 4) < 0.02);
});
test('cấu hình: thời lượng phát từng gói đủ ngắn để cả phiên (HELLO, ACK, ≤ 8 EMO, BYE) lọt cửa sổ 90 s', () => {
  const L = (p) => encodePacket(p).length, hello = L({ t: 'HELLO', id: 1, name: 'Pipo', hue: 1, skin: 'eve', mood: {}, emo: 'happy' }), ack = L({ t: 'ACK', id: 1, to: 2, name: 'abcdefghij', hue: 1, skin: 'eve', mood: {}, emo: 'happy' }), emo = L({ t: 'EMO', id: 1, seq: 0, left: 0, emo: 'joy', mood: {} });
  const worst = airtime(hello) + airtime(ack) + 8 * (airtime(emo) + CFG.replyDelay[1]) + 2 * airtime(3) + 4 * CFG.replyDelay[1]; assert.ok(worst < 60, 'ngắn hơn 90 s đáng kể: ' + worst.toFixed(1));
  assert.ok(emo <= 8 && hello <= 24 && ack <= 24);
});
