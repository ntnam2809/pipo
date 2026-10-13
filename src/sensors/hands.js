// Nhận dáng tay: MediaPipe HandLandmarker (tải lười từ jsDelivr như camera.js, phiên bản cố định) chạy trên luồng video của camera sensor.
// Cần camera bật; tải/khởi tạo lỗi thì tự tắt và báo trạng thái — Pipo vẫn sống bình thường. Logic nhận dáng nằm ở brain/handpose.js (thuần, có test).
// Phát lên bus: hand:aim · hand:fire · hand:lower · hand:wave · hand:fistbump · hand:thumbsup · hand:highfive.
import { GestureTracker } from '../brain/handpose.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
export const HAND_EVENTS = { 'gun:aim': 'hand:aim', 'gun:fire': 'hand:fire', 'gun:lower': 'hand:lower', wave: 'hand:wave', 'fist:toward': 'hand:fistbump', thumbsup: 'hand:thumbsup', 'open:hold': 'hand:highfive' };
export const FPS = 12;

export function createHandSensor(bus, getCamera) {
  const S = { id: 'hands', label: 'Nhận dáng tay', status: 'off', lm: null, timer: null, tracker: new GestureTracker(), paused: false, busy: false, last: 'unknown' };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const emit = (evs) => { for (const e of evs) { const n = HAND_EVENTS[e.name]; if (n) bus.emit(n, { why: e.why }); } return evs; };
  S.supported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  /** Đưa một khung landmark vào bộ theo dõi (dùng cho vòng lặp thật và cho smoke test không camera). */
  S.feed = (hands, aspect = 4 / 3, t = now()) => emit(S.tracker.update(t, hands, aspect));
  S.micOnset = (t = now()) => emit(S.tracker.micOnset(t));
  S.voiceBang = (t = now()) => emit(S.tracker.voiceBang(t));
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    const cam = getCamera && getCamera();
    if (!cam || cam.status !== 'on' || !cam.video) { S.status = 'needcam'; return S.status; }
    try {
      const mod = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
      const fileset = await mod.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      S.lm = await mod.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numHands: 2 });
    } catch { S.lm = null; S.status = 'error'; return S.status; }
    S.tracker.reset(); S.timer = setInterval(S.step, Math.round(1000 / FPS)); S.status = 'on'; return S.status;
  };
  S.step = () => {
    const cam = getCamera && getCamera(), v = cam && cam.video;
    if (S.paused || S.busy || !S.lm || !v || v.readyState < 2) return;
    S.busy = true;
    try {
      const r = S.lm.detectForVideo(v, performance.now());
      S.feed((r && r.landmarks) || [], (v.videoWidth || 4) / (v.videoHeight || 3));
    } catch { /* bỏ qua khung lỗi */ }
    S.busy = false;
  };
  S.pause = (p) => { S.paused = p; };
  S.stop = () => { clearInterval(S.timer); S.timer = null; try { if (S.lm && S.lm.close) S.lm.close(); } catch { /* bỏ qua */ } S.lm = null; S.tracker.reset(); if (S.status === 'on') S.status = 'off'; };
  return S;
}
