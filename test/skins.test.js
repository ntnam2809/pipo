import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, SKIN_IDS, getSkin } from '../src/skins/index.js';
import { defaults, migrate } from '../src/core/store.js';
import { Renderer } from '../src/eyes/renderer.js';
import { Animator } from '../src/eyes/animator.js';
import { restPose } from '../src/eyes/body.js';

test('registry skin: classic · pixel · eve, id lạ -> classic, contract đủ', () => {
  assert.deepEqual(SKIN_IDS, ['classic', 'pixel', 'eve']);
  assert.equal(getSkin('nope').id, 'classic'); assert.equal(getSkin(undefined).id, 'classic'); assert.equal(getSkin('eve').id, 'eve');
  for (const s of SKINS) { assert.ok(s.id && s.label && typeof s.draw === 'function', s.id); assert.ok(!s.geom || typeof s.geom === 'function'); assert.ok(!s.resize || typeof s.resize === 'function'); }
});
test('store: skin mặc định classic, music tắt, dữ liệu cũ tự migrate', () => {
  const d = defaults(); assert.equal(d.skin, 'classic'); assert.equal(d.settings.sensors.music, false);
  const m = migrate({ name: 'Bi', settings: { sensors: { mic: true } } }); assert.equal(m.skin, 'classic'); assert.equal(m.settings.sensors.music, false); assert.equal(m.settings.sensors.mic, true);
});
// Renderer.geom không cần DOM: canvas giả đủ cho computeGeom.
const fakeCanvas = { getContext: () => ({}), width: 0, height: 0 };
test('geom giữ nguyên cấu trúc ở mọi skin; Eve thu mặt vào kính (nhỏ hơn, lệch tâm)', () => {
  const frame = new Animator({ rng: () => 0.5 }).update(0.016);
  const base = new Renderer(fakeCanvas); base.W = 390; base.H = 780; base.setSkin(getSkin('classic')); const g0 = base.computeGeom(frame, restPose());
  for (const id of SKIN_IDS) {
    const r = new Renderer(fakeCanvas); r.W = 390; r.H = 780; r.setSkin(getSkin(id)); const g = r.computeGeom(frame, restPose());
    for (const k of ['U', 'B', 'D', 'cx', 'cy', 'L', 'R', 'mouth', 'color', 'W', 'H']) assert.ok(g[k] != null, id + '.' + k);
    for (const e of [g.L, g.R]) for (const k of ['x', 'y', 'w', 'h', 'open', 'e']) assert.ok(e[k] != null && (k === 'e' || Number.isFinite(e[k])), id + ' eye.' + k);
    assert.ok(Number.isFinite(g.mouth.x) && Number.isFinite(g.mouth.y) && g.mouth.base > 0);
    if (id === 'eve') { assert.ok(g.U < g0.U * 0.8 && g.cy < g0.cy + 400); assert.ok(g.L.x > 0 && g.R.x < 390 && g.mouth.y < 780); } else assert.equal(g.U, g0.U);
  }
  for (const [w, h] of [[390, 780], [844, 390], [320, 480]]) { const r = new Renderer(fakeCanvas); r.W = w; r.H = h; r.setSkin(getSkin('eve')); const g = r.computeGeom(frame, restPose()); assert.ok(g.L.x - g.L.w / 2 > 0 && g.R.x + g.R.w / 2 < w, `${w}x${h}: mắt trong màn`); assert.ok(g.mouth.y < h); }
});
