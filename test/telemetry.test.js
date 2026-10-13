import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Telemetry, TELEMETRY_KEY, EV_KEYS, SENSOR_IDS, LLM_IDS, MODES, PLATFORMS, BUCKETS,
  bucketCount, bucketSessions, bucketMinutes, utcDay, dayDiff, addDays, detectEnv, detectPlatform, blockReason, buildPacket, makeSender, LONG_HIDDEN_MS,
} from '../src/core/telemetry.js';
import * as W from '../tools/telemetry-worker/validate.js';
import { defaults, migrate } from '../src/core/store.js';

const ACTIVE_KEYS = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang'];
const TOP_KEYS = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang', 'skin', 'theme', 'sessions', 'minutes', 'ev', 'sensors', 'llm'];
const MIN = 60000, HOUR = 3600000;

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
/** Một "máy": storage chung, mỗi lần open() là một lần tải trang mới với đồng hồ giả. */
function rig({ gate = {}, legacy = false, storage = fakeStorage(), cfg = { skin: 'pixel', theme: 'pink', sensors: ['motion', 'mic'], llm: 'none', mode: 'standalone', platform: 'android', lang: 'vi' } } = {}) {
  const sent = []; const r = { sent, storage, t: 0, tel: null };
  const g = { endpoint: 'https://t.example/v1/collect', enabled: true, nav: {}, hostname: 'pipo.example', debug: false, gallery: false, artifact: false, ...gate };
  r.gate = g;
  r.days = () => sent.filter((p) => p.kind === 'day'); r.actives = () => sent.filter((p) => p.kind === 'active');
  r.at = (iso) => { r.t = Date.parse(iso); return r; };
  r.open = (iso) => {
    if (iso) r.at(iso);
    r.tel = new Telemetry({ storage, now: () => r.t, gate: () => r.gate, send: (p) => { sent.push(p); return true; }, legacy });
    r.tel.start(cfg); return r.tel;
  };
  return r;
}

test('bucket: đúng ngưỡng từng nhóm', () => {
  assert.deepEqual([0, 1, 2, 5, 6, 20, 21, 999].map(bucketCount), [0, 1, 2, 2, 6, 6, 21, 21]);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 10, 11, 50].map(bucketSessions), [0, 1, 2, 3, 3, 6, 6, 11, 11]);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 15, 16, 30, 31, 60, 61, 500].map(bucketMinutes), [0, 1, 1, 3, 3, 6, 6, 16, 16, 31, 31, 61, 61]);
  assert.equal(bucketCount(NaN), 0); assert.equal(bucketCount(-5), 0); assert.equal(bucketCount('7'), 6);
});

test('ngày UTC: utcDay · dayDiff · addDays qua ranh giới tháng/năm', () => {
  assert.equal(utcDay(Date.parse('2026-03-01T23:59:59Z')), '2026-03-01');
  assert.equal(utcDay(Date.parse('2026-03-02T00:00:00Z')), '2026-03-02');
  assert.equal(dayDiff('2026-02-27', '2026-03-02'), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2026-03-01', -31), '2026-01-29');
});

test('detectEnv: nền tảng, chế độ, ngôn ngữ 2 ký tự', () => {
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }), 'android');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), 'ios');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios'); // iPadOS
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0 }), 'desktop');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64)' }), 'desktop');
  assert.equal(detectPlatform({ userAgent: 'curl/8' }), 'other'); assert.equal(detectPlatform(null), 'other');
  assert.deepEqual(detectEnv({ userAgent: 'Android', language: 'vi-VN' }, true), { mode: 'standalone', platform: 'android', lang: 'vi' });
  assert.deepEqual(detectEnv({ userAgent: 'Android', language: 'pt-BR' }, false), { mode: 'browser', platform: 'android', lang: 'pt' });
  assert.equal(detectEnv({ userAgent: 'x', language: '' }, false).lang, 'xx'); assert.equal(detectEnv({ userAgent: 'x', language: '12' }, false).lang, 'xx');
});

test('cổng chặn: endpoint rỗng · DNT · GPC · debug/gallery · artifact · localhost · tắt trong cài đặt', () => {
  const ok = { endpoint: 'https://t/x', enabled: true, nav: {}, hostname: 'pipo.example', debug: false, gallery: false, artifact: false };
  assert.equal(blockReason(ok), null);
  assert.equal(blockReason({ ...ok, endpoint: '' }), 'no-endpoint');
  assert.equal(blockReason({ ...ok, enabled: false }), 'user-off');
  assert.equal(blockReason({ ...ok, nav: { doNotTrack: '1' } }), 'dnt');
  assert.equal(blockReason({ ...ok, nav: { msDoNotTrack: '1' } }), 'dnt');
  assert.equal(blockReason({ ...ok, nav: { doNotTrack: '0' } }), null);
  assert.equal(blockReason({ ...ok, nav: { globalPrivacyControl: true } }), 'gpc');
  assert.equal(blockReason({ ...ok, debug: true }), 'debug'); assert.equal(blockReason({ ...ok, gallery: true }), 'debug');
  assert.equal(blockReason({ ...ok, artifact: true }), 'artifact');
  for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', '::1', 'app.localhost']) assert.equal(blockReason({ ...ok, hostname: h }), 'localhost', h);
  assert.equal(blockReason({ ...ok, hostname: 'ntnam2809.github.io' }), null);
});

test('endpoint rỗng: không gom, không ghi storage, không gửi', () => {
  const r = rig({ gate: { endpoint: '' } });
  const tel = r.open('2026-03-01T10:00:00Z'); tel.count('poke'); tel.tick(); tel.flush();
  r.open('2026-03-02T10:00:00Z');
  assert.equal(r.storage._m.size, 0); assert.equal(r.sent.length, 0); assert.equal(tel.active(), false);
  assert.equal(tel.preview().ok, false);
});

test('DNT/GPC/localhost/debug/artifact: không gom, không gửi dù sang ngày', () => {
  for (const gate of [{ nav: { doNotTrack: '1' } }, { nav: { globalPrivacyControl: true } }, { hostname: 'localhost' }, { debug: true }, { gallery: true }, { artifact: true }]) {
    const r = rig({ gate });
    r.open('2026-03-01T10:00:00Z').count('poke'); r.open('2026-03-02T10:00:00Z').tick();
    assert.equal(r.storage._m.size, 0, JSON.stringify(gate)); assert.equal(r.sent.length, 0);
  }
});

test('đúng 1 gói day/ngày (của NGÀY HÔM TRƯỚC) + 1 gói active/ngày (ngay lần mở đầu); dsi · a7 · a30 đúng qua nhiều ngày giả lập', () => {
  const r = rig();
  // ngày 0 (cài): gói active gửi NGAY, dsi 0
  let tel = r.open('2026-03-01T10:00:00Z');
  assert.equal(r.actives().length, 1); assert.deepEqual(Object.keys(r.actives()[0]), ACTIVE_KEYS);
  assert.deepEqual([r.actives()[0].day, r.actives()[0].dsi, r.actives()[0].a7, r.actives()[0].a30], ['2026-03-01', 0, 1, 1]);
  // 3 chọc, 1 ăn; 4 phút dùng rồi 1 giờ treo (mỗi tick chỉ cộng tối đa 5 phút) -> 9 phút -> bucket 6
  for (let i = 0; i < 3; i++) tel.count('poke');
  tel.count('feed'); r.t += 4 * MIN; tel.tick();
  assert.equal(r.days().length, 0, 'chưa sang ngày thì chưa gửi gói day');
  r.t += HOUR; tel.tick(false); tel.tick(true); tel = r.open('2026-03-01T20:00:00Z'); tel.tick();
  assert.equal(r.days().length, 0); assert.equal(r.actives().length, 1, 'mở lại cùng ngày không gửi active thêm');
  // ngày 1: mở app -> active mới + gói day của ngày 0
  tel = r.open('2026-03-02T09:00:00Z');
  assert.equal(r.days().length, 1); assert.equal(r.actives().length, 2);
  const p0 = r.days()[0];
  assert.equal(p0.kind, 'day'); assert.equal(p0.day, '2026-03-01'); assert.equal(p0.dsi, 0); assert.equal(p0.a7, 1); assert.equal(p0.a30, 1);
  assert.equal(p0.sessions, 2); assert.equal(p0.ev.poke, 2); assert.equal(p0.ev.feed, 1); assert.equal(p0.ev.pet, 0); assert.equal(p0.minutes, 6);
  assert.deepEqual([r.actives()[1].day, r.actives()[1].dsi, r.actives()[1].a7], ['2026-03-02', 1, 2]);
  tel.tick(); tel.tick(); r.open('2026-03-02T12:00:00Z');
  assert.equal(r.days().length, 1, 'cùng ngày không gửi day thêm'); assert.equal(r.actives().length, 2);
  // ngày 2 -> gói day 2/3
  r.open('2026-03-03T09:00:00Z'); assert.equal(r.days().length, 2);
  assert.deepEqual([r.days()[1].day, r.days()[1].dsi, r.days()[1].a7, r.days()[1].a30, r.days()[1].sessions], ['2026-03-02', 1, 2, 2, 2]);
  // bỏ ngày 4/3, mở ngày 5/3: dữ liệu 3/3 cách 2 ngày, còn trong cửa sổ ±2 ngày của server
  r.open('2026-03-05T09:00:00Z'); assert.equal(r.days().length, 3);
  assert.deepEqual([r.days()[2].day, r.days()[2].dsi, r.days()[2].a7], ['2026-03-03', 2, 3]);
  // nghỉ 3 ngày rồi mở 8/3: gói day của 5/3 đã quá cửa sổ -> bỏ; nhưng active của 8/3 vẫn gửi ngay
  r.open('2026-03-08T09:00:00Z'); assert.equal(r.days().length, 3);
  assert.deepEqual(r.actives().map((a) => a.day), ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-08']);
  assert.deepEqual([r.actives()[4].dsi, r.actives()[4].a7, r.actives()[4].a30], [7, 4, 5]);   // ngày thứ 7 kể từ cài: D7 đo được ngay, không cần quay lại thêm
  // 9/3: gửi gói day 8/3. Đã mở trong 2..8/3: 2,3,5,8 -> a7 = 4; trong 30 ngày: 1,2,3,5,8 -> 5
  r.open('2026-03-09T09:00:00Z'); assert.equal(r.days().length, 4);
  assert.deepEqual([r.days()[3].day, r.days()[3].dsi, r.days()[3].a7, r.days()[3].a30], ['2026-03-08', 7, 4, 5]);
  // mỗi loại gói xuất hiện tối đa một lần cho mỗi ngày
  for (const list of [r.days(), r.actives()]) { const days = list.map((p) => p.day); assert.equal(new Set(days).size, days.length); }
});

test('qua nửa đêm khi app đang mở: gói day của hôm qua + active của hôm nay, mỗi loại đúng 1 gói', () => {
  const r = rig(); const tel = r.open('2026-03-01T23:50:00Z');
  tel.count('hug'); r.t += 5 * MIN; tel.tick();
  assert.equal(r.days().length, 0); assert.equal(r.actives().length, 1);
  r.t += 10 * MIN; tel.tick(false);            // 00:05 hôm sau, người dùng ẩn tab: đóng ngày cũ, nhưng chưa tính là "đã mở" ngày mới
  assert.equal(r.days().length, 1); assert.equal(r.days()[0].day, '2026-03-01'); assert.equal(r.days()[0].ev.hug, 1);
  assert.equal(r.actives().length, 1, 'ẩn tab sau nửa đêm không phải một lần mở');
  r.t += HOUR; tel.tick(true);                 // người dùng quay lại -> lần mở đầu của 2/3
  assert.equal(r.actives().length, 2); assert.deepEqual([r.actives()[1].day, r.actives()[1].dsi, r.actives()[1].a7], ['2026-03-02', 1, 2]);
  tel.tick(false); tel.tick(true); r.t += HOUR; tel.tick();
  assert.equal(r.days().length, 1, 'không gửi lặp'); assert.equal(r.actives().length, 2);
  assert.equal(tel.preview().packet.day, '2026-03-02');
});

test('active: chỉ phần chung (không ev/sensors/skin/theme/llm), gửi trước khi ghi nhận để không lặp; máy cũ dsi 31', () => {
  const r = rig({ cfg: { skin: 'eve', theme: 'pink', sensors: ['camera'], llm: 'anthropic', mode: 'browser', platform: 'ios', lang: 'fr' } });
  const tel = r.open('2026-03-01T10:00:00Z'); tel.count('poke'); tel.tick();
  const a = r.actives()[0]; assert.deepEqual(Object.keys(a), ACTIVE_KEYS);
  assert.deepEqual([a.mode, a.platform, a.lang, a.dsi], ['browser', 'ios', 'fr', 0]);
  const wire = JSON.stringify(a); for (const n of ['eve', 'pink', 'camera', 'anthropic', 'poke', 'sessions']) assert.ok(!wire.includes(n), n);
  for (let i = 0; i < 4; i++) { r.open('2026-03-01T1' + i + ':00:00Z'); r.tel.tick(); }
  assert.equal(r.actives().length, 1);
  const old = rig({ legacy: true }); old.open('2026-03-01T10:00:00Z');
  assert.equal(old.actives().length, 1); assert.equal(old.actives()[0].dsi, 31);
});

test('ẩn tab ≥ 30 phút rồi quay lại = phiên mới; ẩn ngắn thì không', () => {
  const r = rig(); const tel = r.open('2026-03-01T10:00:00Z');
  tel.tick(false); r.t += 5 * MIN; tel.tick(true);
  assert.equal(tel.preview().packet.sessions, 1);
  tel.tick(false); r.t += LONG_HIDDEN_MS + MIN; tel.tick(true);
  assert.equal(tel.preview().packet.sessions, 2);
});

test('dsi: ngày cài thật; >30 ngày -> 31; máy cũ (legacy) coi là 31 chứ không lẫn vào cài mới', () => {
  const r = rig(); r.open('2026-03-01T10:00:00Z');
  // dùng liên tục tới ngày 40, kiểm gói ngày 31 và 40
  let t = Date.parse('2026-03-01T10:00:00Z'); const got = {};
  for (let d = 1; d <= 41; d++) { r.open(new Date(t + d * 86400000).toISOString()); }
  for (const p of r.days()) got[p.dsi] = (got[p.dsi] || 0) + 1;
  assert.equal(got[0], 1); assert.equal(got[30], 1); assert.ok(got[31] >= 9, 'từ ngày 31 trở đi đều là 31');
  assert.ok(r.sent.every((p) => p.dsi >= 0 && p.dsi <= 31));
  assert.ok(r.sent.every((p) => p.a7 <= 7 && p.a30 <= 30 && p.a7 >= 1));
  assert.equal(r.actives().length, 42, 'một active mỗi ngày dùng, từ ngày 0 tới 41'); assert.ok(r.actives().every((p, i) => p.dsi === Math.min(i, 31)));
  const old = rig({ legacy: true }); old.open('2026-03-01T10:00:00Z'); old.open('2026-03-02T10:00:00Z');
  assert.equal(old.days().length, 1); assert.equal(old.days()[0].dsi, 31); assert.ok(old.sent.every((p) => p.dsi === 31));
});

test('gói chỉ có khóa cho phép; không định danh nào lọt vào gói hay vào storage telemetry', () => {
  const secret = { name: 'TenThuCungBiMat', apiKey: 'sk-ant-SECRET', baseUrl: 'http://192.168.1.77:11434/v1', home: { lat: 10.7769, lon: 106.7009 }, places: [{ lat: 21.0278, lon: 105.8342 }] };
  const storage = fakeStorage({ 'pipo.v1': JSON.stringify(secret) });
  const r = rig({ storage, cfg: { skin: 'eve', theme: 'rainbow', sensors: ['camera', 'geo', 'nope', 'music'], llm: 'anthropic', mode: 'browser', platform: 'ios', lang: 'vi' } });
  const tel = r.open('2026-03-01T10:00:00Z');
  for (const k of EV_KEYS) tel.count(k, 25);
  tel.count('khong_co_trong_danh_sach'); tel.count('__proto__'); tel.count('uid', 3);
  tel.tick();
  r.open('2026-03-02T10:00:00Z');
  const p = r.days()[0];
  assert.deepEqual(Object.keys(p), TOP_KEYS);
  for (const a of r.actives()) assert.deepEqual(Object.keys(a), ACTIVE_KEYS);
  assert.deepEqual(Object.keys(p.ev), EV_KEYS);
  assert.ok(Object.values(p.ev).every((v) => v === 21));
  assert.deepEqual(p.sensors, ['geo', 'camera', 'music']);   // 'nope' bị loại, thứ tự cố định
  assert.equal(p.llm, 'anthropic'); assert.equal(p.skin, 'eve'); assert.equal(p.theme, 'rainbow'); assert.equal(p.mode, 'browser'); assert.equal(p.platform, 'ios'); assert.equal(p.lang, 'vi');
  const wire = JSON.stringify(r.sent), local = storage.getItem(TELEMETRY_KEY);
  for (const needle of ['TenThuCungBiMat', 'sk-ant', '192.168', '10.7769', '106.70', '21.0278', 'khong_co', 'uid']) {
    assert.ok(!wire.includes(needle), 'gói: ' + needle); assert.ok(!local.includes(needle), 'storage: ' + needle);
  }
  // mọi giá trị là số / chuỗi ngắn / mảng chuỗi ngắn
  assert.ok(wire.length < 1000 && r.sent.every((x) => JSON.stringify(x).length < 700), 'gói nhỏ: ' + wire.length);
});

test('cấu hình lạ (skin/theme/llm/lang/mode/platform ngoài danh sách) được ép về giá trị an toàn, không lọt nguyên văn', () => {
  const pk = buildPacket('2026-03-01', '2026-03-01', ['2026-03-01'], { sessions: 1, ms: 0, ev: {} }, { skin: 'Có Dấu & Dài Hơn 16 ký tự!', theme: '<script>', sensors: 'motion', mode: 'x', platform: 'y', lang: 'vietnamese', llm: 'https://evil.example' });
  assert.deepEqual([pk.skin, pk.theme, pk.mode, pk.platform, pk.lang, pk.llm, pk.sensors], ['classic', 'cyan', 'browser', 'other', 'xx', 'none', []]);
});

test('tắt cài đặt -> xóa sạch bộ đếm local, không gửi; bật lại thì gom lại từ đầu', () => {
  const r = rig(); const tel = r.open('2026-03-01T10:00:00Z');
  tel.count('poke'); tel.tick(); assert.ok(r.storage.getItem(TELEMETRY_KEY));
  r.gate.enabled = false; tel.clear();
  assert.equal(r.storage.getItem(TELEMETRY_KEY), null); assert.equal(tel.active(), false);
  tel.count('poke'); tel.tick(); tel.flush(); tel.start();   // vẫn tắt: không ghi gì
  assert.equal(r.storage.getItem(TELEMETRY_KEY), null);
  const nSent = r.sent.length; r.open('2026-03-02T10:00:00Z'); assert.equal(r.sent.length, nSent, 'đã tắt thì không gửi gì (cả active lẫn day)');
  assert.equal(tel.preview().reason, 'user-off');
  r.gate.enabled = true; const t2 = r.open('2026-03-03T10:00:00Z'); t2.count('pet');
  assert.equal(t2.preview().packet.ev.pet, 1); assert.equal(r.days().length, 0); assert.equal(r.actives().length, 2, 'ngày 1 và ngày 3 (bật lại), ngày 2 đang tắt');
});

test('bật DNT giữa chừng: không gửi dù sang ngày', () => {
  const r = rig(); const tel = r.open('2026-03-01T10:00:00Z'); tel.count('poke');
  const n = r.sent.length; r.gate.nav = { doNotTrack: '1' }; r.t = Date.parse('2026-03-03T10:00:00Z'); tel.tick(); tel.flush(); r.open();
  assert.equal(r.sent.length, n, 'DNT bật: không gửi thêm gì (kể cả active)');
});

test('preview: gói của hôm nay khớp schema, cộng cả thời gian đang dùng', () => {
  const r = rig(); const tel = r.open('2026-03-01T10:00:00Z');
  r.t += 4 * MIN; const pv = tel.preview();
  assert.ok(pv.ok); assert.deepEqual(Object.keys(pv.packet), TOP_KEYS); assert.deepEqual(Object.keys(pv.active), ACTIVE_KEYS); assert.equal(pv.activeSent, true); assert.equal(pv.packet.day, '2026-03-01'); assert.equal(pv.packet.minutes, 3);
  assert.equal(pv.packet.dsi, 0); assert.equal(pv.packet.a7, 1);
});

test('hỏng storage (getItem ném lỗi / JSON hỏng) không làm app hỏng', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const r = rig({ storage: bad }); const tel = r.open('2026-03-01T10:00:00Z'); tel.count('poke'); tel.tick(); tel.flush(); tel.clear();
  const r2 = rig({ storage: fakeStorage({ [TELEMETRY_KEY]: '{không phải json' }) }); const t2 = r2.open('2026-03-01T10:00:00Z');
  assert.equal(t2.preview().packet.dsi, 0);
});

test('makeSender: sendBeacon (text/plain) trước, fallback fetch keepalive không cookie, không ném', async () => {
  const calls = []; const pk = { v: 1, day: '2026-03-01' };
  const nav = { sendBeacon: (url, blob) => { calls.push(['beacon', url, blob]); return true; } };
  assert.equal(makeSender('https://t/x', nav, null)(pk), true);
  assert.equal(calls[0][0], 'beacon'); assert.match(calls[0][2].type, /^text\/plain/); assert.equal(await calls[0][2].text(), JSON.stringify(pk));
  const fcalls = []; const fetchFn = (u, o) => { fcalls.push([u, o]); return Promise.reject(new Error('mạng lỗi')); };
  assert.equal(makeSender('https://t/x', { sendBeacon: () => false }, fetchFn)(pk), true);
  assert.equal(fcalls[0][1].keepalive, true); assert.equal(fcalls[0][1].credentials, 'omit'); assert.equal(fcalls[0][1].method, 'POST');
  assert.equal(fcalls[0][1].referrerPolicy, 'no-referrer');
  assert.equal(makeSender('https://t/x', { sendBeacon() { throw new Error('x'); } }, fetchFn)(pk), true);
  assert.equal(makeSender('https://t/x', {}, null)(pk), false);
  await new Promise((r) => setTimeout(r, 5));   // lời hứa bị từ chối đã được nuốt (không unhandledRejection)
});

test('store: settings.telemetry mặc định bật; dữ liệu cũ tự có', () => {
  assert.equal(defaults().settings.telemetry, true);
  assert.equal(migrate({ name: 'Bi', settings: { sound: false } }).settings.telemetry, true);
  assert.equal(migrate({ settings: { telemetry: false } }).settings.telemetry, false);
});

test('parity client <-> validate của worker: cùng danh sách, gói client luôn qua validate nguyên vẹn', () => {
  assert.deepEqual(EV_KEYS, W.EV_KEYS); assert.deepEqual(SENSOR_IDS, W.SENSOR_IDS); assert.deepEqual(MODES, W.MODES); assert.deepEqual(PLATFORMS, W.PLATFORMS);
  assert.deepEqual(BUCKETS, W.BUCKETS); assert.deepEqual(TOP_KEYS, W.DAY_KEYS); assert.deepEqual(ACTIVE_KEYS, W.ACTIVE_KEYS);
  for (const id of LLM_IDS) assert.ok(W.LLM_IDS.includes(id), id);
  const r = rig({ cfg: { skin: 'pixel', theme: 'amber', sensors: ['motion', 'mic', 'music'], llm: 'gemini', mode: 'standalone', platform: 'desktop', lang: 'en' } });
  const tel = r.open('2026-03-01T10:00:00Z'); for (const k of EV_KEYS) tel.count(k, 7); r.t += 3 * MIN; tel.tick();
  r.open('2026-03-02T10:00:00Z');
  for (const pk of r.sent) { const v = W.validatePacket(pk, Date.parse('2026-03-02T11:00:00Z')); assert.ok(v.ok, v.reason); assert.deepEqual(v.packet, pk); }
  assert.deepEqual(r.sent.map((x) => x.kind).sort(), ['active', 'active', 'day']);
});
