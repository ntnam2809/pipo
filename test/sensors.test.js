import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionAnalyzer, G } from '../src/sensors/motion.js';
import { haversine, bearing, GeoAnalyzer } from '../src/sensors/geo.js';
import { classifyWeather, parseOpenMeteo, weatherUrl } from '../src/sensors/weather.js';
import { CameraAnalyzer, classifyBlend } from '../src/sensors/camera.js';
import { MicAnalyzer } from '../src/sensors/mic.js';
import { northVector, dirVector, angleDiff } from '../src/sensors/compass.js';
import { formatClock } from '../src/sensors/clock.js';

function feed(an, f, ms, dt = 16, t0 = 0) { const ev = []; for (let t = 0; t <= ms; t += dt) { const [x, y, z] = f(t); ev.push(...an.push(t0 + t, x, y, z)); } return ev; }
const names = (ev) => ev.map((e) => e.name);
const still = () => [0, G, 0];

test('motion: đứng yên không sinh sự kiện (ngoài tilt)', () => { const ev = names(feed(new MotionAnalyzer(), still, 2000)).filter((n) => n !== 'motion:tilt'); assert.deepEqual(ev, []); });
test('motion: rơi tự do > 120ms rồi chạm đất', () => {
  const an = new MotionAnalyzer(); feed(an, still, 300); const ev = names(feed(an, () => [0, 0.2, 0], 400, 16, 300)); assert.ok(ev.includes('motion:freefall'));
  assert.ok(names(feed(an, () => [0, 3 * G, 0], 48, 16, 700)).includes('motion:impact'));
  const quick = new MotionAnalyzer(); feed(quick, still, 300); assert.ok(!names(feed(quick, () => [0, 0.2, 0], 80, 16, 300)).includes('motion:freefall'));
});
test('motion: lắc nhẹ vs lắc mạnh', () => {
  const sh = (amp) => (t) => [Math.sin(t / 100 * Math.PI) * amp, G, 0];
  let an = new MotionAnalyzer(); feed(an, still, 300); assert.ok(names(feed(an, sh(11), 1000, 16, 300)).includes('motion:shake'));
  an = new MotionAnalyzer(); feed(an, still, 300); assert.ok(names(feed(an, sh(45), 1000, 16, 300)).includes('motion:hardshake'));
  an = new MotionAnalyzer(); feed(an, still, 300); const ev = names(feed(an, sh(11), 4000, 16, 300)); assert.ok(ev.includes('motion:hardshake'), 'lắc lâu thành lắc mạnh');
});
test('motion: úp mặt, lật ngược, và quay lại', () => {
  let an = new MotionAnalyzer(); feed(an, still, 200); assert.ok(names(feed(an, () => [0, 0, -G], 1500, 16, 200)).includes('motion:facedown')); assert.ok(names(feed(an, still, 1500, 16, 2000)).includes('motion:faceup'));
  an = new MotionAnalyzer(); feed(an, still, 200); assert.ok(names(feed(an, () => [0, -G, 0], 2000, 16, 200)).includes('motion:upsidedown')); assert.ok(names(feed(an, still, 2000, 16, 2300)).includes('motion:upright'));
});
test('motion: bước chân có nhịp -> step, dừng -> stepstop', () => {
  const an = new MotionAnalyzer(); const walk = (t) => [0, G * (1 + 0.45 * Math.max(0, Math.sin((t / 550) * 2 * Math.PI)) ** 3), 0];
  const ev = names(feed(an, walk, 4000)); assert.ok(ev.filter((n) => n === 'motion:step').length >= 3); assert.ok(names(feed(an, still, 3000, 16, 4000)).includes('motion:stepstop'));
});
test('motion: tilt chuẩn hóa hệ màn hình', () => { const an = new MotionAnalyzer(); feed(an, () => [-G * 0.6, G * 0.8, 0], 2000); const t = an.tilt; assert.ok(t.gx > 0.5 && t.gy > 0.7); });

test('geo: haversine/bearing', () => {
  const d = haversine(10.77, 106.7, 10.78, 106.7); assert.ok(d > 1000 && d < 1200); const b = bearing(0, 0, 1, 0); assert.ok(b < 1 || b > 359); assert.ok(Math.abs(bearing(0, 0, 0, 1) - 90) < 0.5);
});
test('geo: chỗ mới > 300m, lưu tối đa 50, về nhà', () => {
  const g = new GeoAnalyzer({ home: { lat: 10, lon: 106 } }); assert.deepEqual(g.update(10.5, 106.5).filter((e) => e.name === 'geo:newplace'), []);
  assert.equal(g.update(10.5002, 106.5).filter((e) => e.name === 'geo:newplace').length, 0, '< 300m');
  assert.equal(g.update(10.52, 106.5).filter((e) => e.name === 'geo:newplace').length, 1);
  for (let i = 0; i < 80; i++) g.update(11 + i * 0.01, 107); assert.equal(g.places.length, 50);
  assert.ok(g.update(10.0003, 106).some((e) => e.name === 'geo:home')); assert.ok(!g.update(10.0003, 106).some((e) => e.name === 'geo:home'));
  assert.ok(g.update(10.3, 106).find((e) => e.name === 'geo:homebearing'));
  assert.deepEqual(new GeoAnalyzer().update(NaN, 1), []);
});
test('weather: phân loại mã WMO + parse Open-Meteo', () => {
  const w = (code, temp = 25) => classifyWeather({ code, temp, isDay: true });
  assert.ok(w(61).rain && w(80).rain && w(95).storm && w(0).clear && w(73).snow && !w(3).rain); assert.ok(w(0, 35).hot && w(0, 10).cold && !w(0, 25).hot);
  const sunset = '2026-10-12T18:00'; assert.ok(classifyWeather({ code: 0, temp: 20, isDay: false, sunset, now: Date.parse('2026-10-12T22:00') }).lateNight);
  const p = parseOpenMeteo({ current: { temperature_2m: 31, weather_code: 63, is_day: 1 }, daily: { sunset: [sunset] } }); assert.ok(p.rain && p.temp === 31 && p.isDay); assert.equal(parseOpenMeteo({}), null);
  assert.match(weatherUrl(10.1234, 106.5), /open-meteo\.com.*latitude=10\.123.*current=temperature_2m,weather_code,is_day.*daily=sunrise,sunset.*timezone=auto/);
});
test('camera: ú òa (che rồi mở), tối hẳn, mặt xuất hiện/mất, chuyển động', () => {
  const c = new CameraAnalyzer(); const ev = []; for (let t = 0; t < 3000; t += 100) ev.push(...c.push(t, { brightness: t < 500 ? 0.5 : t < 2000 ? 0.02 : 0.5 }));
  assert.ok(names(ev).includes('camera:dark') && names(ev).includes('camera:peekaboo'));
  const c2 = new CameraAnalyzer(); const e2 = []; for (let t = 0; t < 12000; t += 100) e2.push(...c2.push(t, { brightness: t < 9000 ? 0.02 : 0.5 })); assert.ok(!names(e2).includes('camera:peekaboo'), 'tối lâu không phải ú òa');
  const c3 = new CameraAnalyzer(); const e3 = []; for (let t = 0; t < 8000; t += 100) e3.push(...c3.push(t, { brightness: 0.5, face: t < 1000 ? { x: 0, y: 0, size: 0.3 } : null, motion: t > 6000 ? { x: 0.3, y: 0, amount: 0.1 } : null }));
  assert.ok(names(e3).includes('camera:face') && names(e3).includes('camera:facelost') && names(e3).includes('camera:motion'));
  assert.equal(classifyBlend({ jawOpen: 0.8 }), 'mouth'); assert.equal(classifyBlend({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 }), 'wink'); assert.equal(classifyBlend({ mouthSmileLeft: 0.7, mouthSmileRight: 0.6 }), 'smile'); assert.equal(classifyBlend({}), null);
});
test('mic: vỗ tay, vỗ 2 lần, tiếng to, im lặng', () => {
  const m = new MicAnalyzer(); const ev = []; const sig = (t) => (t === 1000 || t === 1300 ? 0.7 : 0.01); for (let t = 0; t < 2000; t += 20) ev.push(...m.push(t, sig(t)));
  assert.ok(names(ev).includes('mic:clap') && names(ev).includes('mic:clap2'));
  const m2 = new MicAnalyzer(); const e2 = []; for (let t = 0; t < 2000; t += 20) e2.push(...m2.push(t, t < 500 ? 0.01 : Math.min(0.5, 0.01 + (t - 500) * 0.002))); assert.ok(!names(e2).includes('mic:clap2'));
  const m3 = new MicAnalyzer(); const e3 = []; for (let t = 0; t < 70000; t += 100) e3.push(...m3.push(t, 0.002)); assert.ok(names(e3).includes('mic:silence'));
});
test('compass + clock', () => {
  const n = northVector(0); assert.ok(Math.abs(n.x) < 1e-9 && n.y < -0.99); assert.ok(northVector(90).x < -0.99); assert.ok(dirVector(90).x > 0.99); assert.equal(Math.round(angleDiff(350, 10)), 20);
  assert.deepEqual(formatClock(new Date(2026, 0, 1, 7, 5)), ['07', '05']);
});
