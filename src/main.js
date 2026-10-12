// Pipo: vòng lặp rAF, nối cảm biến -> bus -> brain -> animator -> renderer.
import { Bus } from './core/bus.js';
import { Store } from './core/store.js';
import { Animator } from './eyes/animator.js';
import { Renderer } from './eyes/renderer.js';
import { FX } from './eyes/fx.js';
import { EXPRESSION_IDS } from './eyes/expressions.js';
import { Needs } from './brain/needs.js';
import { Mood } from './brain/mood.js';
import { Reactions } from './brain/reactions.js';
import { RuleBrain } from './brain/rules.js';
import { StrokeDetector, HugDetector } from './brain/gestures.js';
import { callLLM, getArtifactSample } from './brain/llm.js';
import { createMotionSensor } from './sensors/motion.js';
import { createCompassSensor, northVector, dirVector } from './sensors/compass.js';
import { createGeoSensor } from './sensors/geo.js';
import { createWeatherSensor } from './sensors/weather.js';
import { createCameraSensor } from './sensors/camera.js';
import { createMicSensor } from './sensors/mic.js';
import { createBatterySensor } from './sensors/battery.js';
import { createClock, formatClock } from './sensors/clock.js';
import { Chirp } from './audio/chirp.js';
import { Mimic } from './audio/mimic.js';
import { createVoiceInput, speak } from './audio/voice.js';
import { createDrawer } from './ui/drawer.js';
import { createSettings } from './ui/settings.js';
import { runOnboarding } from './ui/onboarding.js';
import { createDebug } from './ui/debug.js';

const params = new URLSearchParams(location.search);
// ?debug=1 / ?gallery=1; trong artifact claude.ai chỉ có #debug / #gallery tới được trang.
const hash = location.hash.slice(1);
const DEBUG = params.get('debug') === '1' || hash === 'debug', GALLERY = params.get('gallery') === '1' || hash === 'gallery';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push('promise: ' + String(e.reason)));

const store = new Store();
const bus = new Bus();
const canvas = document.getElementById('eyes');
const renderer = new Renderer(canvas);
const animator = new Animator();
const fx = new FX();
const needs = new Needs(store.data.needs);
if (store.data.lastSeen) needs.resume(Date.now() - store.data.lastSeen);
const mood = new Mood();
const reactions = new Reactions();
const brain = new RuleBrain({ needs, mood, reactions });
const chirp = new Chirp();
const mimic = new Mimic(chirp);
const nowMs = () => performance.now();
const settings = () => store.data.settings;

// ---- cảm biến ----
const geo = createGeoSensor(bus, store);
const sensors = {
  motion: createMotionSensor(bus), compass: createCompassSensor(bus), geo, weather: createWeatherSensor(bus, geo, store),
  camera: createCameraSensor(bus), mic: createMicSensor(bus), battery: createBatterySensor(bus), voice: createVoiceInput(bus, () => store.data.name),
};
const clock = createClock(bus);

async function syncSensor(id) {
  const s = sensors[id]; if (!s) return;
  const want = !!settings().sensors[id];
  try {
    if (want && s.status !== 'on' && s.status !== 'unsupported') await s.start();
    else if (!want && s.status === 'on') s.stop();
    if (id === 'weather' && want && !settings().sensors.geo && s.status === 'on') { /* dùng vị trí một lần */ }
    if (id === 'camera' && s.status === 'on') await s.enableMimic(!!settings().sensors.mimicFace);
  } catch { s.status = 'error'; }
  drawer.setActive(id, s.status === 'on'); if (settingsUI) settingsUI.refresh();
}
async function syncAll() { for (const id of Object.keys(sensors)) await syncSensor(id); }

// ---- trạng thái hiển thị ----
let applied = null, forced = null, say = null, compassOn = false, homeBearing = null, lastBaseT = 0, armedCup = 0, lastHeading = null;
let mimicSamples = null, mimicUntil = 0, listening = false, lastLLM = 0, monoT = 0, chatHistory = [];
const recent = [];
const noteRecent = (n) => { recent.push(n); if (recent.length > 8) recent.shift(); };

function showSay(text) { if (!text) return; say = { text, t0: nowMs(), dur: 3600 }; if (settings().tts) speak(text); }
function runAction(a, now) {
  if (!a) return;
  const it = a === 'sleep' || a === 'wake' ? brain.command(a, now) : a === 'dance' ? reactions.fire('dance', {}, now)
    : a === 'look_around' ? reactions.inject({ expression: 'curious', duration: 3500, lookSeq: [{ t: 0, x: -0.8, y: 0 }, { t: 1000, x: 0.8, y: 0.1 }, { t: 2000, x: 0, y: -0.6 }, { t: 2800, x: 0, y: 0 }] }, now) : null;
  if (a === 'follow_face') animator.setLook('face', 0, 0, 6);
  void it;
}
function applyIntent(it) {
  const left = Math.max(150, it.until - nowMs());
  animator.applyIntent({ ...it, duration: left });
  if (it.sound) chirp.play(it.sound);
  if (it.say) showSay(it.say);
  if (it.bite) animator.bite();
  if (it.lick) animator.triggerLick(0.35);
  if (it.jolt) animator.jolt(it.jolt);
  if (it.vibrate && settings().vibrate) { try { navigator.vibrate && navigator.vibrate(it.vibrate); } catch { /* bỏ qua */ } }
  if (it.action) runAction(it.action, nowMs());
  noteRecent(it.expression);
}

// ---- bus ----
bus.on('*', (name, p) => {
  if (name === 'motion:tilt') { animator.setTilt(p.gx, p.gy, p.gz); return; }
  if (name === 'motion:upsidedown') animator.setUpsideDown(true);
  if (name === 'motion:upright') animator.setUpsideDown(false);
  if (name === 'camera:face' && p.present) animator.setLook('face', p.x, p.y * 0.6, 1.2);
  if (name === 'camera:motion') animator.setLook('motion', p.x, p.y * 0.7, 1.0);
  if (name === 'compass:heading') lastHeading = p.deg;
  if (name === 'geo:homebearing') homeBearing = p.deg;
  if (name === 'clock:tick') brain.setWorld({ hour: p.hour });
  if (name === 'weather:update' && p.lateNight) brain.setWorld({ hour: Math.max(brain.world.hour, 23) });
  if (name === 'sensor:status') { if (settingsUI) settingsUI.refresh(); return; }
  if (name === 'voice:text') { askLLM(p.text); return; }
  if (name === 'feed:hover') return;
  if (forced) return;
  if (name.startsWith('motion:step')) { /* không ghi nhận spam */ } else noteRecent(name);
  try { brain.handle(name, p, nowMs()); } catch (e) { errors.push('brain: ' + e.message); }
});

// ---- LLM ----
async function askLLM(text, mono = false) {
  const cfg = settings().llm;
  if (!text && !mono) return;
  if (cfg.provider === 'none') { brain.handle('voice:name', {}, nowMs()); return; }
  if (nowMs() - lastLLM < 1200) return; lastLLM = nowMs();
  const w = brain.world.weather;
  const ctx = { name: store.data.name, needs: needs.snapshot(), mood: { valence: mood.valence, arousal: mood.arousal }, hour: Math.round(brain.world.hour), weather: w ? { temp: w.temp, rain: w.rain, clear: w.clear } : null, recent };
  const res = await callLLM(cfg, ctx, text || '(tự nói một câu nhỏ)', chatHistory);
  if (text) chatHistory.push({ role: 'user', text });
  if (res.ok) {
    chatHistory.push({ role: 'pet', text: res.intent.say || res.intent.expression }); chatHistory = chatHistory.slice(-12);
    reactions.inject(res.intent, nowMs());
  } else if (text) brain.handle('voice:name', {}, nowMs()); // fallback rule brain
}

// ---- UI ----
let settingsUI = null;
const drawer = createDrawer({
  onToggle: async (id) => { settings().sensors[id] = !settings().sensors[id]; store.save(); if (id === 'compass') compassOn = settings().sensors.compass; await syncSensor(id); },
  onSettings: () => settingsUI.open(),
  onDragMove: (x, y, kind) => feedHover(x, y, kind),
  onDrop: (x, y, kind, item) => feedDrop(x, y, kind, item),
  onDragCancel: () => { animator.setFeedApproach(0); },
  onMimicStart: startMimic, onMimicStop: stopMimic,
});
settingsUI = createSettings({
  store, sensors,
  onChange: async (k, v) => {
    if (k === 'theme' || k === 'style') animator.setTheme(store.data.theme, store.data.style);
    if (k === 'sound') chirp.enabled = v;
    if (k === 'sensor') { if (v.id === 'compass') compassOn = v.on; await syncSensor(v.id); drawer.setActive(v.id, sensors[v.id].status === 'on'); }
    if (k === 'mimicFace') await syncSensor('camera');
    if (k === 'kiosk') acquireWakeLock();
    if (k === 'llm') document.getElementById('chat').hidden = v.provider === 'none';
  },
  onSetHome: () => geo.setHomeHere(),
  onReset: () => { store.reset(); location.reload(); },
  onClose: () => {},
});
document.body.append(drawer.el, drawer.corner, settingsUI.el);
if (DEBUG) document.body.append(createDebug({ bus, force: (id) => force(id), needs, animator }));
const chatForm = document.getElementById('chat'), chatIn = document.getElementById('chat-in');
chatForm.hidden = settings().llm.provider === 'none' || GALLERY;
// Chạy trong artifact claude.ai: có Claude sẵn thì bật làm não mặc định (người dùng chưa chọn provider nào khác).
getArtifactSample().then((sample) => {
  if (!sample || GALLERY) return;
  if (settings().llm.provider === 'none' && !settings().llm.artifactAuto) { settings().llm.provider = 'claude-artifact'; settings().llm.artifactAuto = true; store.save(); }
  chatForm.hidden = settings().llm.provider === 'none';
});
chatForm.addEventListener('submit', (e) => { e.preventDefault(); const t = chatIn.value.trim(); chatIn.value = ''; if (t) askLLM(t); });

// ---- cho ăn / uống ----
function eyesRect() { const g = renderer.geom; return g ? { x0: g.cx - g.D / 2 - g.B * 0.8, x1: g.cx + g.D / 2 + g.B * 0.8, y0: g.cy - g.B * 1.0, y1: g.mouth.y + g.B * 0.5 } : null; }
function onEyes(x, y) { const r = eyesRect(); return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; }
function feedHover(x, y, kind) {
  const g = renderer.geom; if (!g) return;
  const d = Math.hypot(x - g.cx, y - g.mouth.y); const p = clamp(1 - d / (g.U * 0.8), 0, 1);
  animator.setLook('touch', clamp((x - g.cx) / (g.U * 0.5), -1, 1), clamp((y - g.cy) / (g.U * 0.5), -1, 1), 0.6);
  animator.setFeedApproach(kind === 'food' && !brain.asleep ? p : 0);
}
function feedDrop(x, y, kind, item) {
  animator.setFeedApproach(0);
  if (!onEyes(x, y)) return;
  if (kind === 'drink' && item === 'water' && !armedCup) { /* chạm ly -> rót bằng nghiêng: xem armCup */ }
  brain.touched(nowMs());
  const it = brain.handle('feed:drop', { kind, item }, nowMs());
  if (it && it.expression === 'eating') fx.burst('crumbs', renderer.geom, 3);
}
function armCup() { armedCup = nowMs() + 6000; }
bus.on('motion:tilt', (p) => { if (armedCup && nowMs() < armedCup && Math.abs(p.gx) > 0.6) { armedCup = 0; brain.handle('feed:drop', { kind: 'drink', item: 'water' }, nowMs()); } });
document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('#btn-drink'); if (t) armCup(); });

// ---- nhại giọng ----
async function startMimic() {
  if (brain.asleep) return;
  const ok = await mimic.start(() => stopMimic());
  if (!ok) { showSay('Không mở được micro'); return; }
  listening = true; animator.applyIntent({ expression: 'focus', duration: 8000 });
}
function stopMimic() {
  if (!listening) return; listening = false;
  const s = mimic.stop(); animator.clearOverlay();
  if (!s) return;
  chirp.unlock();
  const dur = mimic.play(s, settings().mimicPreset, () => {});
  mimicUntil = nowMs() + dur * 1000 + 300;
  animator.applyIntent({ expression: 'happy', duration: dur * 1000 + 300 });
  needs.add('fun', 0.05);
}

// ---- cảm ứng ----
const ptr = new Map(); let downInfo = null, lastTap = 0; const stroke = new StrokeDetector(), hug = new HugDetector();
function lookVec(x, y) { const g = renderer.geom; return g ? { x: clamp((x - g.cx) / (g.U * 0.5), -1, 1), y: clamp((y - g.cy) / (g.U * 0.5), -1, 1) } : { x: 0, y: 0 }; }
canvas.addEventListener('pointerdown', (e) => {
  firstGesture(); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, t: nowMs() });
  if (ptr.size === 1) { downInfo = { x: e.clientX, y: e.clientY, t: nowMs(), moved: 0, swipe: e.clientY > innerHeight - 80 }; stroke.reset(); }
  const v = lookVec(e.clientX, e.clientY); animator.setLook('touch', v.x, v.y, 1.5);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
});
canvas.addEventListener('pointermove', (e) => {
  const v = lookVec(e.clientX, e.clientY);
  if (!ptr.has(e.pointerId)) { if (e.pointerType === 'mouse') { animator.setLook('touch', v.x, v.y, 0.8); if (!sensors.motion || sensors.motion.status !== 'on') animator.setTilt(clamp(v.x, -1, 1) * 0.6, 1 + v.y * 0.2, 0); } return; }
  ptr.set(e.pointerId, { ...ptr.get(e.pointerId), x: e.clientX, y: e.clientY });
  animator.setLook('touch', v.x, v.y, 1.5);
  if (downInfo && ptr.size === 1) {
    downInfo.moved = Math.max(downInfo.moved, Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y));
    if (downInfo.swipe && downInfo.y - e.clientY > 50) { drawer.open(); downInfo.swipe = false; downInfo.moved = 999; }
    const g = renderer.geom;
    if (g && Math.abs(e.clientY - g.cy) < g.U * 0.65) { const n = stroke.push(e.clientX, nowMs()); if (n) { downInfo.moved = 999; bus.emit('touch:pet', { count: n }); } }
  }
});
const up = (e) => {
  const p = ptr.get(e.pointerId); ptr.delete(e.pointerId);
  if (downInfo && p && ptr.size === 0) {
    const dt = nowMs() - downInfo.t;
    if (downInfo.moved < 14 && dt < 350) {
      const now = nowMs();
      if (now - lastTap < 330) { lastTap = 0; showClockEyes(); }
      else {
        lastTap = now;
        const v = lookVec(e.clientX, e.clientY);
        if (onEyes(e.clientX, e.clientY)) { bus.emit('touch:poke', { x: v.x, y: v.y }); animator.jolt(0.3); } else bus.emit('touch:tap', { x: v.x, y: v.y });
      }
    }
    downInfo = null;
  }
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function showClockEyes() { animator.showClock(formatClock(new Date()), 3); chirp.play('beep'); }

// ---- cử chỉ đầu tiên: mở audio, xin quyền, wake lock ----
let gestured = false, wakeLock = null;
async function acquireWakeLock() {
  try { if (settings().wakeLock !== false && 'wakeLock' in navigator && document.visibilityState === 'visible') { if (wakeLock) await wakeLock.release().catch(() => {}); wakeLock = await navigator.wakeLock.request('screen'); } } catch { wakeLock = null; }
}
async function firstGesture() {
  if (gestured) return; gestured = true;
  chirp.enabled = settings().sound; chirp.unlock(); acquireWakeLock();
  if (!GALLERY) await syncAll();
}

// ---- đồng bộ biểu cảm ----
function force(id) {
  forced = { id }; reactions.cancel(); animator.applyIntent({ expression: id, duration: 600000 });
  animator.clearLook('touch'); fx.p.length = 0;
}
function unforce() { forced = null; animator.clearOverlay(); }

// ---- vòng lặp ----
function resize() { renderer.resize(innerWidth, innerHeight, window.devicePixelRatio || 1); }
window.addEventListener('resize', resize); resize();
let last = performance.now(), lastDraw = 0, lastSave = 0, lastIdle = 0, lastNeedsUi = 0, frames = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const sleeping = brain.asleep && !forced, hidden = document.visibilityState === 'hidden';
  if ((sleeping || hidden) && ts - lastDraw < 48) return;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts; lastDraw = ts; frames++;
  try { step(dt, ts); } catch (e) { errors.push('step: ' + (e && e.stack || e)); }
}
function step(dt, ts) {
  const now = nowMs();
  if (!forced) {
    brain.tick(dt, now);
    const cur = reactions.active(now);
    if (cur !== applied) { applied = cur; if (cur) applyIntent(cur); else animator.clearOverlay(); }
    if (now - lastBaseT > 400) { lastBaseT = now; const b = brain.baseExpression(now); animator.setBase(b.id, b.intensity); }
    if (now - lastIdle > 500) { lastIdle = now; brain.idle(now); }
    if (listening) animator.setVoiceAmp(mimic.level);
    else animator.setVoiceAmp(chirp.level());
    // la bàn: đồng tử chỉ Bắc, chấm nhỏ chỉ nhà
    if (compassOn && lastHeading != null) { const v = northVector(lastHeading); animator.setLook('compass', v.x * 0.9, v.y * 0.9, 0.5); }
    // độc thoại LLM
    const cfg = settings().llm;
    if (cfg.provider !== 'none' && cfg.monologue && now - monoT > 600000) { monoT = now; askLLM('', true); }
    if (hug.update(ptr.size, now)) bus.emit('touch:hug', {});
  } else if (GALLERY) { /* gallery tự điều khiển */ }
  const nightDim = settings().kiosk && (brain.world.hour >= 22 || brain.world.hour < 6) ? 0.45 : 0;
  const dim = Math.max(nightDim, brain.asleep && !forced ? 0.55 : 0);
  // tính frame
  const f = animator.update(dt);
  renderer.computeGeom(f);
  fx.update(dt, f, renderer.geom);
  let sayView = null;
  if (say) { const u = (now - say.t0) / say.dur; if (u >= 1) say = null; else sayView = { text: say.text, alpha: u < 0.1 ? u / 0.1 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1 }; }
  renderer.draw(f, fx, { say: sayView, dim });
  if (compassOn && homeBearing != null && lastHeading != null) drawHomeDot(f);
  if (now - lastNeedsUi > 1000) { lastNeedsUi = now; drawer.setNeeds(needs.snapshot()); }
  if (now - lastSave > 10000) { lastSave = now; save(); }
}
function drawHomeDot(f) {
  const g = renderer.geom, v = dirVector(homeBearing - lastHeading), ctx = renderer.ctx, r = g.U * 0.45;
  ctx.save(); ctx.fillStyle = 'hsl(45,100%,65%)'; ctx.shadowColor = 'hsl(45,100%,65%)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(g.cx + v.x * r, g.cy + v.y * r * 1.2, 5, 0, 7); ctx.fill(); ctx.restore(); void f;
}
function save() { store.data.needs = needs.snapshot(); store.data.lastSeen = Date.now(); store.save(); }
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  const hid = document.visibilityState === 'hidden';
  for (const id of ['camera', 'mic']) if (sensors[id].pause) sensors[id].pause(hid);
  if (hid) save(); else { acquireWakeLock(); last = performance.now(); }
});

// ---- khởi động ----
animator.setTheme(store.data.theme, store.data.style);
chirp.enabled = settings().sound;
clock.start();
brain.setWorld({ hour: new Date().getHours() + new Date().getMinutes() / 60 });
if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { /* không đăng ký SW ngoài http(s) */ }
else navigator.serviceWorker.register('sw.js').catch(() => {});

window.__pipo = { ids: EXPRESSION_IDS, force, unforce, bus, animator, brain, needs, errors, renderer, fx, sensors, get frames() { return frames; }, store };

function startGallery() {
  let i = 0; const tick = () => { force(EXPRESSION_IDS[i % EXPRESSION_IDS.length]); const sel = document.getElementById('dbg-expr'); if (sel) sel.value = EXPRESSION_IDS[i % EXPRESSION_IDS.length]; i++; };
  tick(); setInterval(tick, 1500);
}

if (GALLERY) { store.data.onboarded = true; startGallery(); }
else if (!store.data.onboarded && !DEBUG) {
  animator.setBase('sleeping'); 
  runOnboarding({
    store,
    onWake: async () => { await firstGesture(); animator.setBase('neutral'); animator.applyIntent({ expression: 'surprised', duration: 900 }); chirp.play('wake'); },
    onTheme: (k) => { animator.setTheme(k, store.data.style); },
    onDone: () => { animator.setTheme(store.data.theme, store.data.style); store.save(); animator.applyIntent({ expression: 'joy', duration: 1800 }); chirp.play('happy'); },
  });
}
requestAnimationFrame(loop);
