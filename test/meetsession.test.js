import test from 'node:test';
import assert from 'node:assert/strict';
import { MeetSession, createSimPeer, SIM_CFG } from '../src/audio/meetsession.js';
import { RuleBrain } from '../src/brain/rules.js';
import { Reactions, DEFS } from '../src/brain/reactions.js';
import { Needs } from '../src/brain/needs.js';
import { Mood } from '../src/brain/mood.js';
import { isExpression } from '../src/eyes/expressions.js';
import { SOUND_IDS } from '../src/audio/sounds.js';
import { defaults, migrate } from '../src/core/store.js';
import { EV_KEYS } from '../src/core/telemetry.js';
import { updateFriends } from '../src/brain/meet.js';

const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function simRun({ seed = 3, bpm = 0, secs = 60 } = {}) {
  let now = 0; const log = [], plays = [];
  const main = new MeetSession({ sampleRate: 48000, now: () => now, timeScale: 4, rng: lcg(seed), cfg: SIM_CFG, self: () => ({ name: 'Pipo', hue: 188, skin: 'classic', mood: { valence: 0.3, arousal: 0.4 }, emo: 'happy' }), music: () => (bpm ? { bpm } : null), emit: (e) => log.push({ ...e, at: now }), play: (pcm) => { plays.push(pcm.length); sim.fromMain(pcm); } });
  const sim = createSimPeer({ sampleRate: 48000, now: () => now, mainSession: main, timeScale: 4, rng: lcg(seed + 5), startDelay: 2.2, peerBpm: bpm });
  main.start();
  for (; now < secs; now += 0.05) { sim.tick(); main.tick(); if (!main.active && !sim.peer.active) break; }
  return { log, plays, main, sim, now };
}
test('bạn Pipo ảo (debug): hai phiên nghe nhau qua PCM thật — mình bị gặp trước (HELLO của bạn tới), gặp "Bibi", nói chuyện, tạm biệt trong ~15 s', () => {
  const r = simRun(); const types = r.log.map((e) => e.type);
  assert.equal(types[0], 'start'); assert.ok(types.includes('search'), 'có tìm bạn'); assert.ok(types.indexOf('search') < types.indexOf('met'));
  const met = r.log.find((e) => e.type === 'met'); assert.equal(met.peer.name, 'Bibi'); assert.equal(met.peer.skin, 'eve'); assert.ok(met.at < 12, 'gặp sớm: ' + met.at);
  assert.ok(r.log.filter((e) => e.type === 'myEmo').length >= 2 && r.log.filter((e) => e.type === 'peerEmo').length >= 2);
  const end = r.log.find((e) => e.type === 'end'); assert.ok(end && end.reason === 'bye', JSON.stringify(end)); assert.ok(r.now < 30, 'xong nhanh: ' + r.now);
  assert.ok(r.plays.length >= 3 && r.plays.every((n) => n > 4800), 'đã phát PCM thật qua play()');
  assert.ok(r.log.findIndex((e) => e.type === 'bye') > r.log.findIndex((e) => e.type === 'peerEmo'));
});
test('bạn Pipo ảo + có nhạc (bpm) → có DANCE trước BYE', () => {
  const r = simRun({ seed: 6, bpm: 128 }); const d = r.log.find((e) => e.type === 'dance'); assert.ok(d && d.bpm === 128, JSON.stringify(d)); assert.ok(r.log.findIndex((e) => e.type === 'dance') < r.log.findIndex((e) => e.type === 'bye'));
  assert.equal(r.log.find((e) => e.type === 'end').reason, 'bye');
});
test('MeetSession: không có bạn → timeout đúng 90 s (cfg mặc định), dừng thủ công phát sự kiện end', () => {
  let now = 0; const log = []; const s = new MeetSession({ sampleRate: 16000, now: () => now, rng: lcg(2), self: () => ({ name: 'P', hue: 1, skin: 'eve', mood: {}, emo: 'happy' }), emit: (e) => log.push(e), play: () => {} });
  s.start(); for (; now < 100; now += 0.1) { s.feed(new Float32Array(1600)); s.tick(); } assert.equal(log.find((e) => e.type === 'end').reason, 'timeout'); assert.ok(log.filter((e) => e.type === 'search').length >= 5); assert.equal(s.active, false);
  const t = new MeetSession({ sampleRate: 16000, now: () => 0, self: () => ({ name: 'P' }), emit: (e) => log.push(e), play: () => {} }); t.start(); t.stop('stop'); assert.equal(t.active, false); assert.equal(log.at(-1).reason, 'stop');
});

const mk = () => new RuleBrain({ needs: new Needs({ hunger: 0.5, thirst: 0.5, affection: 0.4, fun: 0.4, energy: 1 }), mood: new Mood(), reactions: new Reactions(), rng: () => 0.5 });
test('brain: sự kiện gặp bạn → biểu cảm/động tác (tìm: bíp bíp?; gặp: vẫy + tên bạn + vui; emo của mình; tạm biệt: vẫy hai tay); gặp được thì vui/thương tăng', () => {
  const b = mk(); assert.equal(b.handle('meet:search', {}, 0).say, 'bíp bíp?');
  const f0 = b.needs.get('fun'), a0 = b.needs.get('affection'); const found = b.handle('meet:found', { name: 'Bibi' }, 1000); assert.equal(found.say, 'Chào Bibi!'); assert.equal(found.clip, 'wave'); assert.equal(found.expression, 'excited'); assert.equal(found.then.expression, 'love'); assert.ok(b.needs.get('fun') > f0 && b.needs.get('affection') > a0);
  assert.equal(mk().handle('meet:emo', { emo: 'wink' }, 0).expression, 'wink'); const bye = mk().handle('meet:bye', { name: 'Bibi' }, 0); assert.equal(bye.clip, 'bye'); assert.equal(bye.say, 'Bai bai Bibi!');
  assert.equal(mk().handle('meet:end', { sad: true, say: 'Không thấy bạn nào...' }, 0).expression, 'sad');
  for (const n of ['meetSearch', 'meetFound', 'meetEmo', 'meetBye', 'meetEnd']) assert.ok(isExpression(DEFS[n].build(1, { emo: 'happy' }).expression), n);
  assert.equal(mk().handle('meet:found', {}, 0).say, 'Chào bạn!');
});
test('lưu trữ & thống kê: danh sách bạn ≤ 50 trong store, migrate dữ liệu hỏng; khóa telemetry meet_start/meet_ok; âm thanh cho chirp.pcm không cần id mới', () => {
  assert.deepEqual(defaults().friends, []); const m = migrate({ friends: [{ name: 'A', n: 2 }, null, 5, { x: 1 }, ...Array.from({ length: 70 }, (_, i) => ({ name: 'F' + i }))] }); assert.equal(m.friends.length, 50); assert.equal(m.friends[0].name, 'A'); assert.deepEqual(migrate({ friends: 'x' }).friends, []);
  assert.ok(EV_KEYS.includes('meet_start') && EV_KEYS.includes('meet_ok')); assert.ok(updateFriends(defaults().friends, { name: 'Bibi', hue: 330, skin: 'eve' }, 5)[0].n === 1);
  assert.ok(SOUND_IDS.includes('thud') && SOUND_IDS.includes('pew'));
});
