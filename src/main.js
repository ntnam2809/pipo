// Pipo: vòng lặp rAF, nối cảm biến -> bus -> brain -> animator -> renderer.
import { Bus } from './core/bus.js';
import { Store } from './core/store.js';
import { Animator } from './eyes/animator.js';
import { Renderer } from './eyes/renderer.js';
import { Body } from './eyes/body.js';
import { ClipPlayer, GESTURES } from './eyes/handclips.js';
import { getSkin } from './skins/index.js';
import { FX } from './eyes/fx.js';
import { EXPRESSION_IDS } from './eyes/expressions.js';
import { Needs } from './brain/needs.js';
import { Mood } from './brain/mood.js';
import { Reactions } from './brain/reactions.js';
import { RuleBrain } from './brain/rules.js';
import { StrokeDetector, HugDetector } from './brain/gestures.js';
import { callLLM, getArtifactSample, HAND_ACTIONS } from './brain/llm.js';
import { createMotionSensor } from './sensors/motion.js';
import { createCompassSensor, northVector, dirVector } from './sensors/compass.js';
import { createGeoSensor } from './sensors/geo.js';
import { createWeatherSensor } from './sensors/weather.js';
import { createCameraSensor } from './sensors/camera.js';
import { createMicSensor } from './sensors/mic.js';
import { createMusicSensor } from './sensors/music.js';
import { createHandSensor } from './sensors/hands.js';
import { SyntheticBeat, IDLE_BEAT } from './audio/beat.js';
import { DanceDirector } from './brain/dance.js';
import { createBatterySensor } from './sensors/battery.js';
import { createClock, formatClock } from './sensors/clock.js';
import { Chirp } from './audio/chirp.js';
import { MeetSession, createSimPeer } from './audio/meetsession.js';
import { openMeetMic } from './audio/meetio.js';
import { updateFriends, emoOf } from './brain/meet.js';
import { Mimic } from './audio/mimic.js';
import { createVoiceInput, speak } from './audio/voice.js';
import { createDrawer } from './ui/drawer.js';
import { createSettings } from './ui/settings.js';
import { runOnboarding } from './ui/onboarding.js';
import { createDebug } from './ui/debug.js';
import { createInstall, isStandalone } from './ui/install.js';
import { Telemetry, makeSender, detectEnv, SENSOR_IDS } from './core/telemetry.js';
import { TELEMETRY_ENDPOINT } from './config.js';

const params = new URLSearchParams(location.search);
// ?debug=1 / ?gallery=1 / ?skin=eve; trong artifact claude.ai chỉ có hash tới được trang: #debug · #gallery · #gallery&skin=eve.
const hp = new URLSearchParams(location.hash.slice(1));
const flag = (k) => params.get(k) === '1' || (hp.has(k) && hp.get(k) !== '0');
const DEBUG = flag('debug'), GALLERY = flag('gallery');
const urlSkin = params.get('skin') || hp.get('skin');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push('promise: ' + String(e.reason)));

const store = new Store();
if (urlSkin) store.data.skin = getSkin(urlSkin).id;
const bus = new Bus();
const canvas = document.getElementById('eyes');
const renderer = new Renderer(canvas);
renderer.setSkin(getSkin(store.data.skin));
const body = new Body(), dancer = new DanceDirector(), hands = new ClipPlayer();
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

// ---- thống kê ẩn danh (core/telemetry.js): mặc định tắt hẳn khi TELEMETRY_ENDPOINT rỗng ----
// window.__pipoTelemetryTest chỉ để smoke test giả endpoint/hostname/đồng hồ; bản chạy thật không đặt biến này.
const TT = window.__pipoTelemetryTest || {};
const teleEndpoint = TT.endpoint !== undefined ? TT.endpoint : TELEMETRY_ENDPOINT;
let inArtifact = false;
const telemetry = new Telemetry({
  storage: store.storage,
  now: TT.now || Date.now,
  gate: () => ({ endpoint: teleEndpoint, enabled: settings().telemetry !== false, nav: navigator, hostname: TT.hostname !== undefined ? TT.hostname : location.hostname, debug: DEBUG, gallery: GALLERY, artifact: inArtifact }),
  send: (packet) => makeSender(teleEndpoint, navigator, typeof fetch === 'function' ? fetch.bind(window) : null)(packet),
  legacy: !!(store.data.onboarded || store.data.lastSeen > 0), // đã dùng Pipo từ trước: không biết ngày cài thật
});
const teleCfg = () => ({ skin: store.data.skin, theme: store.data.theme, sensors: SENSOR_IDS.filter((id) => settings().sensors[id]), llm: settings().llm.provider });
const startTelemetry = () => telemetry.start({ ...detectEnv(navigator, isStandalone()), ...teleCfg() });

// ---- cảm biến ----
const geo = createGeoSensor(bus, store);
const sensors = {
  motion: createMotionSensor(bus), compass: createCompassSensor(bus), geo, weather: createWeatherSensor(bus, geo, store),
  camera: createCameraSensor(bus), hands: createHandSensor(bus, () => sensors.camera), mic: createMicSensor(bus), music: createMusicSensor(bus), battery: createBatterySensor(bus), voice: createVoiceInput(bus, () => store.data.name),
};
const clock = createClock(bus);

async function syncSensor(id) {
  const s = sensors[id]; if (!s) return;
  const want = !!settings().sensors[id], before = s.status;
  try {
    if (want && s.status !== 'on' && s.status !== 'unsupported') await s.start();
    else if (!want && s.status === 'on') s.stop();
    if (id === 'weather' && want && !settings().sensors.geo && s.status === 'on') { /* dùng vị trí một lần */ }
    if (id === 'camera' && s.status === 'on') await s.enableMimic(!!settings().sensors.mimicFace);
    if (id === 'camera') { if (s.status !== 'on') sensors.hands.stop(); else if (settings().sensors.hands) await syncSensor('hands'); }   // nhận dáng tay đi theo camera
  } catch { s.status = 'error'; }
  if (id === 'music' && before !== 'on' && s.status === 'on') telemetry.count('music_on');
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
  if (HAND_ACTIONS.includes(a)) brain.gesture(a, now);
  void it;
}

// ---- động tác tay: ClipPlayer phát clip, sự kiện của clip (âm · fx · rung màn · lời) xử lý ở đây ----
let shakeAmt = 0, hypeNext = 0, lastPose = null;
function playGesture(name, opts) {
  if (!hands.play(name, opts)) return false;
  if (GESTURES.includes(name)) telemetry.count('gesture');
  return true;
}
function handEvents(evs) {
  const px = renderer.handPx || {}, g = renderer.geom;
  for (const ev of evs) {
    if (ev.type === 'sound') chirp.play(ev.name);
    else if (ev.type === 'fx' && g) {
      const at = ev.hand === 'M' ? (px.L && px.R ? { x: (px.L.x + px.R.x) / 2, y: (px.L.y + px.R.y) / 2, r: px.L.r * 0.7 } : { x: g.cx, y: g.cy + g.U * 0.12, r: g.U * 0.06 }) : px[ev.hand] || null;
      fx.burst(ev.name === 'sparkle' ? 'sparkles' : ev.name, g, ev.name === 'sparkle' ? 3 : 1, at);
    } else if (ev.type === 'shake') shakeAmt = Math.max(shakeAmt, ev.amt || 0.5);
    else if (ev.type === 'say') showSay(ev.text);
    else if (ev.type === 'miss') bus.emit('hand:highfiveMiss', {});
  }
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
  if (it.clip) playGesture(it.clip, it.clipOpts || undefined);
  if (it.burst && renderer.geom) fx.burst(it.burst, renderer.geom, 1, { x: renderer.geom.cx, y: renderer.geom.cy - renderer.geom.U * 0.02, r: renderer.geom.U * 0.14 });
  if (it.shake) shakeAmt = Math.max(shakeAmt, it.shake);
  if (it.name === 'shotHit' || it.name === 'dodge' || it.name === 'counter') telemetry.count('shot');
  if (it.name === 'shotHit') { hands.stop(true); say = null; }   // trúng đạn: bỏ tay đầu hàng ngay, xoá lời "Đừng bắn!"
  noteRecent(it.expression);
}

// ---- bus ----
bus.on('*', (name, p) => {
  if (meet && name.startsWith('mic:')) return;   // đang gặp bạn: tiếng bíp của chính mình/bạn không được thành vỗ tay, tiếng to
  if ((name === 'mic:clap' || name === 'mic:clap2' || name === 'mic:loud') && sensors.hands.tracker.aiming) sensors.hands.micOnset();   // tiếng động đột ngột lúc đang bị chĩa súng = tiếng súng
  if (name === 'hand:highfive' && hands.waiting && hands.name === 'highfive' && hands.resolve(true)) { telemetry.count('hand_mirror'); bus.emit('touch:highfive', {}); return; }   // đang giơ tay chờ: người giữ tay mở = đập tay
  if (name === 'hand:wave' || name === 'hand:fistbump' || name === 'hand:thumbsup' || name === 'hand:highfive') telemetry.count('hand_mirror');
  if (musicHeard && (name === 'mic:clap' || name === 'mic:clap2' || name === 'mic:loud')) return; // nhạc không làm Pipo giật mình
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

for (const [name, key] of [['touch:poke', 'poke'], ['touch:pet', 'pet'], ['touch:hug', 'hug']]) bus.on(name, () => telemetry.count(key));

// ---- LLM ----
async function askLLM(text, mono = false) {
  const cfg = settings().llm;
  if (!text && !mono) return;
  if (cfg.provider === 'none') { brain.handle('voice:name', {}, nowMs()); return; }
  if (nowMs() - lastLLM < 1200) return; lastLLM = nowMs();
  if (!mono) telemetry.count('chat_llm');
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
  onGesture: (name) => bus.emit('voice:cmd', { cmd: name, text: name }),
  onMeet: () => { startMeet(); },
});
const installUI = createInstall({ store, onInstall: (r) => { if (r !== 'manual') { telemetry.count('install_prompt'); if (r === 'accepted') telemetry.count('install_accepted'); } }, onManual: () => { settingsUI.open(); installUI.section.scrollIntoView({ block: 'start' }); } });
settingsUI = createSettings({
  extra: installUI.section,
  store, sensors, telemetry, onOpen: () => telemetry.count('settings_open'),
  onChange: async (k, v) => {
    if (k === 'theme' || k === 'style') animator.setTheme(store.data.theme, store.data.style);
    if (k === 'skin') renderer.setSkin(getSkin(v));
    if (k === 'sound') chirp.enabled = v;
    if (k === 'sensor') { if (v.id === 'compass') compassOn = v.on; await syncSensor(v.id); drawer.setActive(v.id, sensors[v.id].status === 'on'); }
    if (k === 'mimicFace') await syncSensor('camera');
    if (k === 'kiosk') acquireWakeLock();
    if (k === 'llm') document.getElementById('chat').hidden = v.provider === 'none';
    if (k === 'telemetry') { if (v) { telemetry.legacy = true; startTelemetry(); } else telemetry.clear(); }
  },
  onSetHome: () => geo.setHomeHere(),
  onReset: () => { telemetry.clear(); store.reset(); location.reload(); },
  onClose: () => {},
});
document.body.append(drawer.el, drawer.corner, settingsUI.el);
if (!GALLERY) document.body.append(installUI.pill);
if (DEBUG) document.body.append(createDebug({ bus, force: (id) => force(id), needs, animator, getSkin: () => store.data.skin, setSkin: (id) => { store.data.skin = getSkin(id).id; renderer.setSkin(getSkin(id)); }, toggleMusic: () => { setFakeMusic(!fake); return !!fake; }, gesture: (name) => playGesture(name), stopGesture: () => hands.stop(), simMeet: () => startMeet({ sim: true }) }));
const chatForm = document.getElementById('chat'), chatIn = document.getElementById('chat-in');
chatForm.hidden = settings().llm.provider === 'none' || GALLERY;
// Chạy trong artifact claude.ai: có Claude sẵn thì bật làm não mặc định (người dùng chưa chọn provider nào khác).
getArtifactSample().then((sample) => {
  if (!sample || GALLERY) return;
  if (settings().llm.provider === 'none' && !settings().llm.artifactAuto) { settings().llm.provider = 'claude-artifact'; settings().llm.artifactAuto = true; store.save(); }
  chatForm.hidden = settings().llm.provider === 'none';
});
getArtifactSample().then((sample) => { inArtifact = !!sample; startTelemetry(); });
chatForm.addEventListener('submit', (e) => { e.preventDefault(); const t = chatIn.value.trim(); chatIn.value = ''; if (t) askLLM(t); });

// ---- gặp bạn Pipo bằng tiếng bíp (audio/modem + brain/meet): bật 90 s bằng nút 📡 trong drawer ----
let meet = null;   // { session, mic, sim, bpm, startedAt, log }
const meetNow = () => nowMs() / 1000;
function meetSelf() {
  const f = animator.color || { h: 188 };
  return { name: store.data.name || 'Pipo', hue: f.h, skin: store.data.skin, mood: { valence: mood.valence, arousal: mood.arousal }, emo: emoOf(animator.expressionId) };
}
function meetEnd(reason) {
  if (!meet) return; const m = meet; meet = null;
  try { m.mic && m.mic.stop(); } catch { /* bỏ qua */ }
  if (m.sim) m.sim.stop(); if (m.session.active) m.session.stop(reason);
  if (m.pausedMusic) sensors.music.pause(false);
  drawer.setActive('meet', false);
}
function meetEvent(e) {
  if (!meet) return; (meet.log ||= []).push(e.type);
  const now = nowMs();
  if (e.type === 'search') brain.handle('meet:search', {}, now);
  else if (e.type === 'met') {
    telemetry.count('meet_ok'); store.data.friends = updateFriends(store.data.friends, e.peer, Date.now()); store.save();
    brain.handle('meet:found', { name: e.peer.name }, now); if (renderer.geom) fx.burst('hearts', renderer.geom, 6);
  } else if (e.type === 'myEmo') brain.handle('meet:emo', { emo: e.emo }, now);
  else if (e.type === 'dance') { setFakeMusic(true, e.bpm || 120); setTimeout(() => setFakeMusic(false), (e.sec || 8) * 1000); }
  else if (e.type === 'bye') brain.handle('meet:bye', { name: e.peer && e.peer.name }, now);
  else if (e.type === 'end') {
    const why = e.reason; if (why === 'timeout') brain.handle('meet:end', { sad: true, say: 'Không thấy bạn nào...' }, now);
    else if (why === 'lost') brain.handle('meet:end', { sad: true, say: 'Bạn đi mất rồi...' }, now);
    setTimeout(() => meetEnd(why), 0);
  }
}
async function startMeet(opts = {}) {
  if (meet) { meetEnd('stop'); return false; }
  if (brain.asleep) { showSay('Pipo đang ngủ...'); return false; }
  if (!settings().sound) { showSay('Bật âm thanh để gặp bạn'); return false; }
  chirp.enabled = true; chirp.unlock();
  const sr = chirp.sampleRate, sim = !!opts.sim, ts = sim ? 4 : 1;
  const m = (meet = { session: null, mic: null, sim: null, pausedMusic: false, bpm: dd.active && dd.dance ? dd.dance.bpm : 0, startedAt: nowMs(), log: [] });
  m.session = new MeetSession({
    sampleRate: sr, now: meetNow, timeScale: ts, self: meetSelf, music: () => (m.bpm > 0 ? { bpm: m.bpm } : null), emit: meetEvent,
    cfg: sim ? { firstHello: [0.5, 0.8], replyDelay: [0.25, 0.45], helloGap: [3, 4], turns: [2, 2], retry: 4, byeWait: 3, danceSec: 3 } : undefined,
    play: (pcm) => { chirp.pcm(pcm); if (m.sim) m.sim.fromMain(pcm); },
  });
  if (sim) m.sim = createSimPeer({ sampleRate: sr, now: meetNow, mainSession: m.session, timeScale: ts, friend: opts.friend, peerBpm: m.bpm });
  else {
    m.mic = await openMeetMic(chirp.ctx, (frame) => { if (meet === m) m.session.feed(frame); });
    if (!m.mic) { meet = null; showSay('Không mở được micro'); return false; }
  }
  if (sensors.music.status === 'on') { sensors.music.pause(true); m.pausedMusic = true; }       // tạm dừng nghe nhạc: không cho tiếng bíp bị nhận nhầm là nhạc/vỗ tay
  telemetry.count('meet_start'); drawer.setActive('meet', true); m.session.start(); return true;
}
function meetStep() { if (!meet) return; if (meet.sim) meet.sim.tick(); meet.session.tick(); }

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
  brain.touched(nowMs()); telemetry.count(kind === 'drink' ? 'drink' : 'feed');
  const it = brain.handle('feed:drop', { kind, item }, nowMs());
  if (it && it.expression === 'eating') fx.burst('crumbs', renderer.geom, 3);
}
function armCup() { armedCup = nowMs() + 6000; }
bus.on('motion:tilt', (p) => { if (armedCup && nowMs() < armedCup && Math.abs(p.gx) > 0.6) { armedCup = 0; telemetry.count('drink'); brain.handle('feed:drop', { kind: 'drink', item: 'water' }, nowMs()); } });
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
  telemetry.count('mimic');
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
  if (hands.waiting && hands.name === 'highfive' && ptr.size === 1) { // chạm vào bàn tay đang chờ = đập tay
    const p = renderer.handPx && renderer.handPx.R;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < Math.max(p.r * 2.6, 72) && hands.resolve(true)) { downInfo.moved = 999; bus.emit('touch:highfive', {}); }
  }
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
function showClockEyes() { telemetry.count('clock'); animator.showClock(formatClock(new Date()), 3); chirp.play('beep'); }

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
  // chào buổi sáng: lần mở đầu tiên trong ngày (5h–11h), chỉ khi đã làm quen và không ở chế độ debug/gallery
if (!GALLERY && !DEBUG && store.data.onboarded) setTimeout(() => {
  const d = new Date(), key = d.toDateString();
  if (d.getHours() >= 5 && d.getHours() < 11 && store.data.lastGreet !== key && !brain.asleep) { store.data.lastGreet = key; store.save(); brain.handle('greet:morning', {}, nowMs()); }
}, 1600);
requestAnimationFrame(loop);
  const sleeping = brain.asleep && !forced, hidden = document.visibilityState === 'hidden';
  if ((sleeping || hidden) && ts - lastDraw < 48) return;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts; lastDraw = ts; frames++;
  try { step(dt, ts); } catch (e) { errors.push('step: ' + (e && e.stack || e)); }
}
// ---- nghe nhạc & nhảy ----
// Nguồn nhịp: micro (sensors.music) hoặc bộ phát giả khi debug. Dance director quyết định chú ý -> nhảy -> thỏa mãn;
// phản xạ priority > DANCE_PRIORITY (chọc, nựng, cho ăn, lắc...) thắng, xong quay lại nhảy.
const DANCE_PRIORITY = 4;
let fake = null, dd = dancer.update(0, IDLE_BEAT), musicHeard = false, sing = 0, beatSeen = -1;
function setFakeMusic(on, bpm = 120) { fake = on ? new SyntheticBeat(bpm) : null; return !!fake; }
function musicState(dt) {
  if (fake) return fake.update(dt);
  const m = sensors.music; return m.status === 'on' && m.read ? m.read() : IDLE_BEAT;
}
function danceStep(dt, now) {
  const bs = musicState(dt);
  dd = dancer.update(dt, bs, { energyNeed: needs.get('energy'), asleep: brain.asleep });
  musicHeard = dd.active || bs.isMusic; sing = 0;
  if (dd.entered === 'dance') telemetry.count('dance');
  if (dd.entered === 'outro') showSay('Hay quá!');
  if (!dd.active) { if ((animator.overlayTag || '').startsWith('dance')) animator.clearOverlay(); return; }
  brain.touched(now);
  const cur = reactions.active(now);
  if (cur && cur.priority <= DANCE_PRIORITY) reactions.cancel();
  if (dd.phaseName === 'dance') {
    const E = bs.energy, pulse = 0.5 + 0.5 * Math.cos(2 * Math.PI * bs.phase);
    sing = Math.min(0.8, E * 0.55 * (0.55 + 0.45 * pulse));
    fx.setEnergy(E);
    if (bs.beatIndex !== beatSeen) {
      beatSeen = bs.beatIndex; animator.jolt(0.08 + 0.18 * E);
      if (bs.beatIndex % 2 === 0) fx.burst('notes', renderer.geom, E > 0.65 ? 2 : 1);
      animator.pulseMouth(bs.beatIndex % 2 ? 'o' : 'smile', 0.2);
    }
    needs.add('fun', dt * 0.004); needs.add('energy', -dt * 0.0006);
    // đang nhảy hype: thỉnh thoảng vỗ tay đúng nhịp hoặc giơ nắm đấm ăn mừng
    if (dd.moveId === 'hype' && !hands.active && now > hypeNext) {
      hypeNext = now + 9000 + Math.random() * 7000;
      if (Math.random() < 0.55) playGesture('clap', { period: 60 / Math.max(60, Math.min(160, dd.dance ? dd.dance.bpm : 120)), count: 4 }); else playGesture('fistpump');
    }
  }
}
function ensureDanceIntent() {
  const tag = 'dance:' + dd.expression;
  if (animator.overlayTag !== tag || animator.overlayLeft < 0.35) animator.applyIntent({ expression: dd.expression, intensity: dd.intensity, duration: 2500, fx: dd.fx, lookSeq: dd.lookSeq, tag });
}
function step(dt, ts) {
  const now = nowMs();
  if (!forced) {
    brain.tick(dt, now);
    danceStep(dt, now);
    const cur = reactions.active(now);
    if (cur !== applied) {
      if (applied && applied.clip === 'handsup' && (!cur || cur.clip !== 'handsup')) hands.stop();   // hết bị chĩa súng: thả tay đầu hàng
      applied = cur; if (cur) applyIntent(cur); else animator.clearOverlay();
    }
    for (const e of brain.pending.splice(0)) { if (e.sound) chirp.play(e.sound); if (e.shake) shakeAmt = Math.max(shakeAmt, e.shake); }
    if (now - lastBaseT > 400) { lastBaseT = now; const b = brain.baseExpression(now); animator.setBase(b.id, b.intensity); }
    if (now - lastIdle > 500) { lastIdle = now; brain.idle(now); }
    if (dd.active && !reactions.active(now)) ensureDanceIntent();
    animator.setVoiceAmp(Math.max(listening ? mimic.level : chirp.level(), sing));
    // la bàn: đồng tử chỉ Bắc, chấm nhỏ chỉ nhà
    if (compassOn && lastHeading != null) { const v = northVector(lastHeading); animator.setLook('compass', v.x * 0.9, v.y * 0.9, 0.5); }
    // độc thoại LLM
    const cfg = settings().llm;
    if (cfg.provider !== 'none' && cfg.monologue && now - monoT > 600000) { monoT = now; askLLM('', true); }
    if (hug.update(ptr.size, now)) bus.emit('touch:hug', {});
  } else { dd = dancer.update(dt, IDLE_BEAT, {}); musicHeard = false; sing = 0; } // gallery/debug ép biểu cảm: không nhảy
  const nightDim = settings().kiosk && (brain.world.hour >= 22 || brain.world.hour < 6) ? 0.45 : 0;
  const dim = Math.max(nightDim, brain.asleep && !forced ? 0.55 : 0);
  // tính frame
  const f = animator.update(dt);
  meetStep();
  const hs = hands.update(dt); if (hs.events.length) handEvents(hs.events);
  const pose = lastPose = body.update(dt, { expression: f.expression, dance: dd.phaseName === 'dance' ? dd.dance : null, t: f.t, clip: hs.active || hs.done ? hs : null, fall: brain.fall.pose });
  renderer.computeGeom(f, pose);
  fx.update(dt, f, renderer.geom);
  let sayView = null;
  if (say) { const u = (now - say.t0) / say.dur; if (u >= 1) say = null; else sayView = { text: say.text, alpha: u < 0.1 ? u / 0.1 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1 }; }
  renderer.draw(f, fx, { say: sayView, dim, pose });
  // rung màn nhẹ khi đấm/đập: dịch cả canvas bằng CSS (mọi skin dùng chung)
  if (shakeAmt > 0.01) { const a = shakeAmt * 9; canvas.style.transform = `translate(${((Math.random() - 0.5) * a).toFixed(1)}px,${((Math.random() - 0.5) * a).toFixed(1)}px)`; shakeAmt *= Math.exp(-dt * 11); }
  else if (shakeAmt) { shakeAmt = 0; canvas.style.transform = ''; }
  if (compassOn && homeBearing != null && lastHeading != null) drawHomeDot(f);
  if (now - lastNeedsUi > 1000) { lastNeedsUi = now; drawer.setNeeds(needs.snapshot()); }
  if (now - lastSave > 10000) { lastSave = now; save(); }
}
function drawHomeDot(f) {
  const g = renderer.geom, v = dirVector(homeBearing - lastHeading), ctx = renderer.ctx, r = g.U * 0.45;
  ctx.save(); ctx.fillStyle = 'hsl(45,100%,65%)'; ctx.shadowColor = 'hsl(45,100%,65%)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(g.cx + v.x * r, g.cy + v.y * r * 1.2, 5, 0, 7); ctx.fill(); ctx.restore(); void f;
}
function save() { store.data.needs = needs.snapshot(); store.data.lastSeen = Date.now(); store.save(); telemetry.setCfg(teleCfg()); telemetry.flush(); }
window.addEventListener('pagehide', () => { save(); telemetry.tick(false); });
setInterval(() => { telemetry.setCfg(teleCfg()); telemetry.tick(); }, 60000);
document.addEventListener('visibilitychange', () => {
  const hid = document.visibilityState === 'hidden';
  telemetry.setCfg(teleCfg()); telemetry.tick(!hid);
  for (const id of ['camera', 'hands', 'mic', 'music']) if (sensors[id].pause) sensors[id].pause(hid);
  if (hid) save(); else { acquireWakeLock(); last = performance.now(); }
});

// ---- khởi động ----
animator.setTheme(store.data.theme, store.data.style);
chirp.enabled = settings().sound;
clock.start();
brain.setWorld({ hour: new Date().getHours() + new Date().getMinutes() / 60 });
if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { /* không đăng ký SW ngoài http(s) */ }
else navigator.serviceWorker.register('sw.js').catch(() => {});

window.__pipo = { hands, handSensor: sensors.hands, startMeet, meetEnd, get meet() { return meet; }, playGesture, ids: EXPRESSION_IDS, force, unforce, bus, animator, brain, needs, errors, renderer, fx, sensors, body, dancer, setFakeMusic, getSkin, telemetry, get dance() { return dd; }, get frames() { return frames; }, get pose() { return lastPose; }, store };

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
// chào buổi sáng: lần mở đầu tiên trong ngày (5h–11h), chỉ khi đã làm quen và không ở chế độ debug/gallery
if (!GALLERY && !DEBUG && store.data.onboarded) setTimeout(() => {
  const d = new Date(), key = d.toDateString();
  if (d.getHours() >= 5 && d.getHours() < 11 && store.data.lastGreet !== key && !brain.asleep) { store.data.lastGreet = key; store.save(); brain.handle('greet:morning', {}, nowMs()); }
}, 1600);
requestAnimationFrame(loop);
