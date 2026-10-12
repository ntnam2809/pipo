import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring, springStep, dampingFor } from '../src/core/spring.js';
import { Bus } from '../src/core/bus.js';
import { Store, migrate, STORE_KEY, VERSION } from '../src/core/store.js';
import { validateEye, defaultEye, clampEye, PARAMS, KEYS } from '../src/eyes/params.js';
import { validateMouth, defaultMouth, clampMouth } from '../src/eyes/mouth.js';

test('spring hội tụ về đích (thiếu tắt và tới hạn)', () => {
  for (const zeta of [0.3, 0.7, 1, 1.5]) {
    const s = new Spring(0, 400, zeta);
    for (let i = 0; i < 600; i++) s.update(1, 1 / 60);
    assert.ok(s.settled(1, 1e-3), `zeta ${zeta}: ${s.x}`);
  }
});
test('spring thiếu tắt có overshoot, tới hạn thì không', () => {
  const run = (zeta) => { const s = { x: 0, v: 0 }; let max = 0; for (let i = 0; i < 240; i++) { springStep(s, 1, 300, zeta, 1 / 60); max = Math.max(max, s.x); } return max; };
  assert.ok(run(0.3) > 1.1); assert.ok(run(1) < 1.01);
});
test('spring ổn định với dt lớn và k cứng', () => {
  const s = { x: 0, v: 0 }; for (let i = 0; i < 100; i++) springStep(s, 1, 2000, 0.6, 0.05);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x - 1) < 1e-2); assert.ok(dampingFor(100, 1) === 20);
});
test('bus: on/emit/off và wildcard, lỗi handler không văng', () => {
  const b = new Bus(); const got = []; const off = b.on('a', (p) => got.push(p.x)); b.on('*', (n) => got.push(n)); b.on('a', () => { throw new Error('x'); });
  const w = console.warn; console.warn = () => {}; b.emit('a', { x: 1 }); console.warn = w; off(); b.emit('a', { x: 2 });
  assert.deepEqual(got, [1, 'a', 'a']);
});
test('store: migrate, try/catch, reset', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; }, removeItem(k) { delete this.d[k]; } };
  const s = new Store(mem); assert.equal(s.data.version, VERSION); s.data.name = 'Bi'; assert.ok(s.save());
  assert.equal(new Store(mem).data.name, 'Bi');
  mem.d[STORE_KEY] = '{hỏng'; assert.equal(new Store(mem).data.name, 'Pipo');
  assert.equal(migrate({ places: new Array(80).fill({ lat: 1, lon: 1 }) }).places.length, 50);
  const bad = { getItem() { throw new Error('chặn'); }, setItem() { throw new Error('chặn'); }, removeItem() { throw new Error('chặn'); } };
  const s2 = new Store(bad); assert.equal(s2.save(), false); assert.equal(s2.reset().name, 'Pipo');
  assert.equal(new Store(null).save(), false);
});
test('params/mouth: default hợp lệ, clamp chặn số bậy', () => {
  assert.deepEqual(validateEye(defaultEye()), []); assert.deepEqual(validateMouth(defaultMouth()), []);
  const c = clampEye({ ...defaultEye(), w: 99, lidTop: -3, tilt: NaN, shape: 'lạ' });
  assert.deepEqual(validateEye(c), []); assert.equal(c.shape, 'normal'); assert.equal(c.w, PARAMS.w[1]);
  const m = clampMouth({ ...defaultMouth(), mw: 9, open: -1, shape: 'x' }); assert.deepEqual(validateMouth(m), []);
  assert.ok(validateMouth(null).length && validateEye({ ...defaultEye(), w: 5 }).length && KEYS.length > 10);
});
