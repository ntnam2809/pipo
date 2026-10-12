// Camera trước: độ sáng, chuyển động, khuôn mặt (FaceDetector nếu có), ú òa. CameraAnalyzer là logic thuần.
export class CameraAnalyzer {
  constructor() { this.dark0 = null; this.darkSent = false; this.darkDur = 0; this.hadFace = false; this.lastFace = -1e9; this.lostSent = false; this.lastMotion = -1e9; this.lastFaceEv = -1e9; }
  /** s = {brightness 0..1, motion:{x,y,amount}|null, face:{x,y,size}|null}; trả mảng {name,payload}. */
  push(t, s) {
    const ev = [];
    if (s.brightness < 0.07) {
      if (this.dark0 == null) this.dark0 = t;
      if (!this.darkSent && t - this.dark0 > 800) { this.darkSent = true; ev.push({ name: 'camera:dark', payload: { dark: true } }); }
    } else if (s.brightness > 0.14 && this.dark0 != null) {
      const dur = t - this.dark0; this.dark0 = null;
      if (this.darkSent) { this.darkSent = false; ev.push({ name: 'camera:dark', payload: { dark: false } }); if (dur >= 800 && dur <= 8000) ev.push({ name: 'camera:peekaboo', payload: { dur } }); }
    }
    if (s.motion && s.motion.amount > 0.04 && t - this.lastMotion > 200) { this.lastMotion = t; ev.push({ name: 'camera:motion', payload: { x: s.motion.x, y: s.motion.y } }); }
    if (s.face) {
      this.hadFace = true; this.lastFace = t; this.lostSent = false;
      if (t - this.lastFaceEv > 250) { this.lastFaceEv = t; ev.push({ name: 'camera:face', payload: { present: true, x: s.face.x, y: s.face.y, size: s.face.size } }); }
    } else if (this.hadFace && !this.lostSent && t - this.lastFace > 4000) { this.lostSent = true; this.hadFace = false; ev.push({ name: 'camera:facelost', payload: {} }); }
    return ev;
  }
}

/** Phân loại nét mặt từ blendshape (MediaPipe) -> 'smile' | 'wink' | 'mouth' | null. Hàm thuần. */
export function classifyBlend(bs) {
  const g = (n) => bs[n] || 0;
  if (g('jawOpen') > 0.45) return 'mouth';
  if (Math.abs(g('eyeBlinkLeft') - g('eyeBlinkRight')) > 0.5) return 'wink';
  if ((g('mouthSmileLeft') + g('mouthSmileRight')) / 2 > 0.45) return 'smile';
  return null;
}

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function createCameraSensor(bus) {
  const S = { id: 'camera', label: 'Camera', status: 'off', stream: null, timer: null, an: new CameraAnalyzer(), video: null, cv: null, prev: null, tick: 0, fd: null, mimic: false, lm: null, lastKind: null, paused: false };
  S.supported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
    } catch (e) { S.status = e && e.name === 'NotAllowedError' ? 'denied' : 'error'; return S.status; }
    const v = (S.video = document.createElement('video')); v.muted = true; v.playsInline = true; v.srcObject = S.stream;
    try { await v.play(); } catch { /* vẫn thử đọc khung */ }
    S.cv = document.createElement('canvas'); S.cv.width = 64; S.cv.height = 48; S.ctx = S.cv.getContext('2d', { willReadFrequently: true });
    try { if ('FaceDetector' in window) S.fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch { S.fd = null; }
    S.timer = setInterval(S.step, 120); S.status = 'on'; return S.status;
  };
  S.step = async () => {
    if (S.paused || !S.video || S.video.readyState < 2) return;
    S.tick++;
    const { ctx, cv } = S; ctx.drawImage(S.video, 0, 0, 64, 48);
    const d = ctx.getImageData(0, 0, 64, 48).data, n = 64 * 48, gray = new Uint8Array(n);
    let sum = 0, cx = 0, cy = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const y = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0; gray[i] = y; sum += y;
      if (S.prev && Math.abs(y - S.prev[i]) > 28) { cnt++; cx += i % 64; cy += (i / 64) | 0; }
    }
    S.prev = gray;
    const motion = cnt > 0 ? { x: -((cx / cnt / 64) * 2 - 1), y: (cy / cnt / 48) * 2 - 1, amount: cnt / n } : null;
    let face = S.faceNow || null;
    if (S.fd && S.tick % 3 === 0) {
      try { const f = await S.fd.detect(S.video); if (f && f[0]) { const b = f[0].boundingBox, vw = S.video.videoWidth || 1, vh = S.video.videoHeight || 1; S.faceNow = { x: -(((b.x + b.width / 2) / vw) * 2 - 1), y: ((b.y + b.height / 2) / vh) * 2 - 1, size: b.width / vw }; } else S.faceNow = null; } catch { S.fd = null; }
      face = S.faceNow;
    } else if (!S.fd) face = null;
    for (const ev of S.an.push(performance.now(), { brightness: sum / n / 255, motion, face })) bus.emit(ev.name, ev.payload);
    if (S.mimic && S.lm && S.tick % 2 === 0) {
      try { const r = S.lm.detectForVideo(S.video, performance.now()); const cats = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories; if (cats) { const bs = {}; for (const c of cats) bs[c.categoryName] = c.score; const k = classifyBlend(bs); if (k && k !== S.lastKind) bus.emit('camera:expression', { kind: k }); S.lastKind = k; } } catch { /* bỏ qua khung lỗi */ }
    }
  };
  /** Bật bắt chước nét mặt: tải lười MediaPipe từ jsDelivr (phiên bản cố định). Lỗi -> tắt, không crash. */
  S.enableMimic = async (on) => {
    if (!on) { S.mimic = false; return true; }
    try {
      const mod = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
      const fileset = await mod.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      S.lm = await mod.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
      S.mimic = true; return true;
    } catch { S.mimic = false; S.lm = null; return false; }
  };
  S.pause = (p) => { S.paused = p; };
  S.stop = () => { clearInterval(S.timer); if (S.stream) S.stream.getTracks().forEach((t) => t.stop()); S.stream = null; S.video = null; S.prev = null; S.faceNow = null; if (S.status === 'on') S.status = 'off'; };
  return S;
}
