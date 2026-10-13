import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePacket, toDataPoint, parseOrigins, corsHeaders, MAX_BYTES, ACTIVE_KEYS, DAY_KEYS, EV_KEYS, dayNum } from '../tools/telemetry-worker/validate.js';
import worker from '../tools/telemetry-worker/worker.js';

const NOW = Date.parse('2026-03-10T12:00:00Z');
const goodActive = () => ({ v: 1, kind: 'active', day: '2026-03-09', dsi: 3, a7: 2, a30: 3, mode: 'standalone', platform: 'android', lang: 'vi' });
const good = () => ({ v: 1, kind: 'day', day: '2026-03-09', dsi: 3, a7: 2, a30: 3, mode: 'standalone', platform: 'android', lang: 'vi', skin: 'eve', theme: 'cyan', sessions: 3, minutes: 6, ev: Object.fromEntries(EV_KEYS.map((k) => [k, 2])), sensors: ['motion', 'mic'], llm: 'none' });

test('validate: gói đúng schema đi qua nguyên vẹn, khóa đúng thứ tự', () => {
  const v = validatePacket(good(), NOW);
  assert.ok(v.ok); assert.deepEqual(v.packet, good()); assert.deepEqual(Object.keys(v.packet), DAY_KEYS);
});

test('validate: khóa lạ (định danh, rác) bị bỏ ở gốc và trong ev', () => {
  const g = { ...good(), uid: 'abc', deviceId: 'x', ip: '1.2.3.4', name: 'Bi', apiKey: 'sk-1', lat: 1, ev: { ...good().ev, foo: 9, userId: 'u' } };
  const v = validatePacket(g, NOW);
  assert.ok(v.ok); assert.deepEqual(Object.keys(v.packet), DAY_KEYS); assert.deepEqual(Object.keys(v.packet.ev), EV_KEYS);
  const wire = JSON.stringify(v.packet); for (const n of ['uid', 'deviceId', '1.2.3.4', 'Bi"', 'sk-1', 'userId', 'foo']) assert.ok(!wire.includes(n), n);
});

test('validate: bucket được ép về cận dưới hợp lệ; thiếu khóa ev = 0', () => {
  const g = good(); g.ev = { poke: 7, pet: 100, hug: 1.9, feed: 20 }; g.sessions = 4; g.minutes = 20;
  const v = validatePacket(g, NOW); assert.ok(v.ok);
  assert.deepEqual([v.packet.ev.poke, v.packet.ev.pet, v.packet.ev.hug, v.packet.ev.feed, v.packet.ev.drink], [6, 21, 1, 6, 0]);
  assert.equal(v.packet.sessions, 3); assert.equal(v.packet.minutes, 16);
});

test('validate: loại cả gói khi sai kiểu / ngoài khoảng / ngày lệch', () => {
  const bad = (mut, why) => { const g = good(); mut(g); const v = validatePacket(g, NOW); assert.equal(v.ok, false, why); };
  for (const x of [null, undefined, 5, 'str', [], [good()]]) assert.equal(validatePacket(x, NOW).ok, false);
  bad((g) => { g.v = 2; }, 'version'); bad((g) => { delete g.v; }, 'thiếu v');
  bad((g) => { delete g.kind; }, 'thiếu kind'); bad((g) => { g.kind = 'other'; }, 'kind lạ'); bad((g) => { g.kind = ['day']; }, 'kind mảng');
  bad((g) => { g.day = '2026-03-13'; }, 'ngày +3'); bad((g) => { g.day = '2026-03-07'; }, 'ngày -3');
  bad((g) => { g.day = '2026-02-30'; }, 'ngày không tồn tại'); bad((g) => { g.day = '2026-3-9'; }, 'sai dạng'); bad((g) => { g.day = 20260309; }, 'số');
  bad((g) => { g.dsi = 32; }, 'dsi > 31'); bad((g) => { g.dsi = -1; }, 'dsi < 0'); bad((g) => { g.dsi = 1.5; }, 'dsi lẻ'); bad((g) => { g.dsi = '3'; }, 'dsi chuỗi');
  bad((g) => { g.a7 = 8; }, 'a7 > 7'); bad((g) => { g.a30 = 31; }, 'a30 > 30'); bad((g) => { g.a7 = 3; g.a30 = 2; }, 'a7 > a30'); bad((g) => { g.a30 = 0; g.a7 = 0; }, 'a30 = 0');
  bad((g) => { g.mode = 'kiosk'; }, 'mode'); bad((g) => { g.platform = 'windows'; }, 'platform');
  bad((g) => { g.lang = 'vie'; }, 'lang dài'); bad((g) => { g.lang = 'VI'; }, 'lang hoa'); bad((g) => { g.lang = 5; }, 'lang số');
  bad((g) => { g.skin = 'Có Dấu'; }, 'skin'); bad((g) => { g.theme = 'x'.repeat(17); }, 'theme dài'); bad((g) => { g.skin = '<b>'; }, 'skin html');
  bad((g) => { g.sessions = -1; }, 'sessions âm'); bad((g) => { g.minutes = '5'; }, 'minutes chuỗi'); bad((g) => { g.minutes = null; }, 'minutes null');
  bad((g) => { g.ev = []; }, 'ev mảng'); bad((g) => { g.ev = null; }, 'ev null'); bad((g) => { g.ev.poke = -2; }, 'ev âm'); bad((g) => { g.ev.poke = 'x'; }, 'ev chuỗi');
});

test('validate: ngày trong ±2 được nhận; cảm biến lạ bị lọc; llm lạ -> other', () => {
  for (const d of ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12']) { const g = good(); g.day = d; assert.ok(validatePacket(g, NOW).ok, d); }
  const g = good(); g.sensors = ['mic', 'xxx', 'mic', 'camera', { a: 1 }, 5]; g.llm = 'https://evil';
  const v = validatePacket(g, NOW); assert.ok(v.ok); assert.deepEqual(v.packet.sensors, ['camera', 'mic']); assert.equal(v.packet.llm, 'other');
  g.sensors = 'mic'; assert.deepEqual(validatePacket(g, NOW).packet.sensors, []);
});

test('toDataPoint (day): 1 index, 9 blob (blob9 = kind), 25 double theo đúng ánh xạ cột', () => {
  const p = validatePacket(good(), NOW).packet, dp = toDataPoint(p);
  assert.deepEqual(dp.indexes, ['2026-03-09']);
  assert.deepEqual(dp.blobs, ['2026-03-09', 'standalone', 'android', 'vi', 'eve', 'cyan', 'none', 'motion,mic', 'day']);
  assert.equal(dp.doubles.length, 25); assert.deepEqual(dp.doubles.slice(0, 7), [1, dayNum('2026-03-09'), 3, 2, 3, 3, 6]); assert.deepEqual(dp.doubles.slice(7), EV_KEYS.map(() => 2));
  assert.ok(dp.doubles.every((x) => typeof x === 'number'));
});

test('validate (active): chỉ phần chung; khóa lạ và trường của gói day bị bỏ', () => {
  const v = validatePacket(goodActive(), NOW); assert.ok(v.ok); assert.deepEqual(v.packet, goodActive()); assert.deepEqual(Object.keys(v.packet), ACTIVE_KEYS);
  const noisy = { ...goodActive(), uid: 'u-1', skin: 'eve', theme: 'cyan', ev: { poke: 5 }, sensors: ['mic'], llm: 'anthropic', sessions: 3, minutes: 9 };
  const v2 = validatePacket(noisy, NOW); assert.ok(v2.ok); assert.deepEqual(Object.keys(v2.packet), ACTIVE_KEYS);
  const wire = JSON.stringify(v2.packet); for (const n of ['u-1', 'eve', 'anthropic', 'sensors', 'ev']) assert.ok(!wire.includes(n), n);
  const bad = (mut) => { const g = goodActive(); mut(g); assert.equal(validatePacket(g, NOW).ok, false); };
  bad((g) => { g.day = '2026-03-14'; }); bad((g) => { g.dsi = 32; }); bad((g) => { g.a7 = 4; g.a30 = 3; }); bad((g) => { g.mode = 'x'; }); bad((g) => { g.platform = 'x'; }); bad((g) => { g.lang = 'vie'; }); bad((g) => { delete g.kind; });
  const ok = goodActive(); delete ok.skin; assert.ok(validatePacket(ok, NOW).ok, 'active không cần skin/ev');
});

test('toDataPoint (active): blob9 = active, blob5..8 trống, chỉ 5 double', () => {
  const dp = toDataPoint(validatePacket(goodActive(), NOW).packet);
  assert.deepEqual(dp.indexes, ['2026-03-09']);
  assert.deepEqual(dp.blobs, ['2026-03-09', 'standalone', 'android', 'vi', '', '', '', '', 'active']);
  assert.deepEqual(dp.doubles, [1, dayNum('2026-03-09'), 3, 2, 3]);
});

test('CORS: chỉ origin cấu hình, không bao giờ *', () => {
  const allowed = parseOrigins(' https://a.example/ , https://b.example ,, ');
  assert.deepEqual(allowed, ['https://a.example', 'https://b.example']);
  assert.equal(corsHeaders('https://evil.example', allowed), null); assert.equal(corsHeaders(null, allowed), null); assert.equal(corsHeaders('*', allowed), null);
  assert.equal(corsHeaders('https://a.example', allowed)['access-control-allow-origin'], 'https://a.example');
});

// ---- worker ----
const ORIGIN = 'https://pipo.example';
function env() { const pts = []; return { ALLOWED_ORIGINS: ORIGIN + ', https://other.example', PIPO: { writeDataPoint: (d) => pts.push(d) }, pts }; }
const post = (body, headers = {}) => new Request('https://w.example/v1/collect', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { origin: ORIGIN, 'content-type': 'text/plain;charset=UTF-8', ...headers } });
const today = () => new Date().toISOString().slice(0, 10);
const fresh = () => ({ ...good(), day: today() });

test('worker: gói hợp lệ -> 204, ghi đúng 1 data point, CORS đúng origin', async () => {
  const e = env(); const res = await worker.fetch(post(fresh()), e);
  assert.equal(res.status, 204); assert.equal(e.pts.length, 1);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN); assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(e.pts[0].blobs[0], today());
});

test('worker: gói active -> 204, ghi data point kind=active', async () => {
  const e = env(); const res = await worker.fetch(post({ ...goodActive(), day: today() }), e);
  assert.equal(res.status, 204); assert.equal(e.pts.length, 1); assert.equal(e.pts[0].blobs[8], 'active'); assert.equal(e.pts[0].doubles.length, 5);
  assert.equal((await worker.fetch(post({ ...goodActive(), day: today(), kind: 'weird' }), e)).status, 400); assert.equal(e.pts.length, 1);
});

test('worker: không đọc/lưu IP, UA, cookie — dù yêu cầu có kèm', async () => {
  const e = env();
  const req = post(fresh(), { 'cf-connecting-ip': '203.0.113.77', 'x-forwarded-for': '198.51.100.9', 'user-agent': 'SecretAgent/9', cookie: 'sid=SECRETCOOKIE', 'accept-language': 'zz-ZZ' });
  Object.defineProperty(req, 'cf', { get() { throw new Error('worker không được đọc request.cf'); } });
  const res = await worker.fetch(req, e); assert.equal(res.status, 204);
  const wire = JSON.stringify(e.pts); for (const n of ['203.0.113.77', '198.51.100.9', 'SecretAgent', 'SECRETCOOKIE', 'zz-ZZ']) assert.ok(!wire.includes(n), n);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('worker: origin lạ / thiếu origin -> 403, không ghi', async () => {
  const e = env();
  assert.equal((await worker.fetch(post(fresh(), { origin: 'https://evil.example' }), e)).status, 403);
  const noOrigin = new Request('https://w.example/v1/collect', { method: 'POST', body: JSON.stringify(fresh()) });
  assert.equal((await worker.fetch(noOrigin, e)).status, 403);
  assert.equal(e.pts.length, 0);
});

test('worker: quá lớn -> 413 (cả khi khai Content-Length lẫn khi không), không ghi', async () => {
  const e = env(); const big = JSON.stringify({ ...fresh(), junk: 'x'.repeat(MAX_BYTES) });
  assert.equal((await worker.fetch(post(big), e)).status, 413);
  assert.equal((await worker.fetch(post(big, { 'content-length': String(big.length) }), e)).status, 413);
  assert.equal((await worker.fetch(post(JSON.stringify(fresh()), { 'content-length': '999999' }), e)).status, 413);
  assert.equal(e.pts.length, 0);
});

test('worker: JSON hỏng / sai schema / ngày lệch -> 400, không ghi', async () => {
  const e = env();
  assert.equal((await worker.fetch(post('{không phải json'), e)).status, 400);
  assert.equal((await worker.fetch(post({ ...fresh(), v: 9 }), e)).status, 400);
  assert.equal((await worker.fetch(post({ ...fresh(), day: '2020-01-01' }), e)).status, 400);
  assert.equal((await worker.fetch(post('[]'), e)).status, 400);
  assert.equal(e.pts.length, 0);
});

test('worker: khóa lạ trong gói bị bỏ trước khi ghi', async () => {
  const e = env(); await worker.fetch(post({ ...fresh(), uid: 'u-123', ev: { ...fresh().ev, who: 5 } }), e);
  assert.equal(e.pts.length, 1); assert.ok(!JSON.stringify(e.pts).includes('u-123')); assert.equal(e.pts[0].doubles.length, 25);
});

test('worker: OPTIONS, GET health, method/path lạ, thiếu binding', async () => {
  const e = env();
  const pre = await worker.fetch(new Request('https://w.example/v1/collect', { method: 'OPTIONS', headers: { origin: ORIGIN } }), e);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  const preBad = await worker.fetch(new Request('https://w.example/v1/collect', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), e);
  assert.equal(preBad.status, 403); assert.equal(preBad.headers.get('access-control-allow-origin'), null);
  const h = await worker.fetch(new Request('https://w.example/v1/health'), e); assert.equal(h.status, 200); assert.deepEqual(await h.json(), { ok: true });
  assert.equal((await worker.fetch(new Request('https://w.example/v1/collect', { method: 'GET', headers: { origin: ORIGIN } }), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://w.example/nope'), e)).status, 404);
  assert.equal((await worker.fetch(post(fresh()), { ALLOWED_ORIGINS: ORIGIN })).status, 503);
  assert.equal((await worker.fetch(post(fresh()), { PIPO: e.PIPO })).status, 403, 'không cấu hình ALLOWED_ORIGINS = từ chối hết');
});
