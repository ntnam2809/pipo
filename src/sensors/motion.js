// Chuyển động: phát hiện lắc, rơi, úp, lật, bước chân. MotionAnalyzer là logic thuần (test được).
export const G = 9.80665;

/** Quy ước đầu vào: gia tốc kiểu Android (đứng thẳng thì ay = +9.8). Hệ trục màn hình: gx sang phải, gy xuống, gz = mặt ngửa. */
export class MotionAnalyzer {
  constructor() {
    this.gl = null; this.lastT = null; this.low0 = null; this.ff = false; this.ffT = 0; this.peaks = []; this.shakeStart = null; this.lastShake = -1e9; this.lastLevel = null;
    this.fdSince = null; this.facedown = false; this.udSince = null; this.upside = false; this.stepTimes = []; this.above = false; this.lastStep = -1e9; this.walking = false; this.lastTilt = -1e9;
  }
  get tilt() { const g = this.gl || { x: 0, y: G, z: 0 }; return { gx: -g.x / G, gy: g.y / G, gz: g.z / G }; }
  push(t, ax, ay, az) {
    const ev = [];
    if (![ax, ay, az].every(Number.isFinite)) return ev;
    const dt = this.lastT == null ? 0.016 : Math.min(0.2, Math.max(0.001, (t - this.lastT) / 1000)); this.lastT = t;
    if (!this.gl) this.gl = { x: ax, y: ay, z: az };
    const a = 1 - Math.exp(-dt / 0.15);
    this.gl.x += (ax - this.gl.x) * a; this.gl.y += (ay - this.gl.y) * a; this.gl.z += (az - this.gl.z) * a;
    const m = Math.hypot(ax, ay, az) / G, lm = Math.hypot(ax - this.gl.x, ay - this.gl.y, az - this.gl.z);

    // rơi tự do: |a| ~ 0 trong > 120 ms
    if (m < 0.25) { if (this.low0 == null) this.low0 = t; else if (!this.ff && t - this.low0 > 120) { this.ff = true; this.ffT = t; ev.push({ name: 'motion:freefall', payload: {} }); } }
    else { this.low0 = null; if (this.ff && m > 1.6) { this.ff = false; ev.push({ name: 'motion:impact', payload: { g: m } }); } }
    if (this.ff && t - this.ffT > 3000) this.ff = false;

    // lắc
    if (!this.ff && lm > 7 && (!this.peaks.length || t - this.peaks[this.peaks.length - 1].t > 60)) this.peaks.push({ t, v: lm });
    this.peaks = this.peaks.filter((p) => t - p.t <= 1000);
    const last = this.peaks[this.peaks.length - 1];
    if (last && t - last.t <= 500) { if (this.shakeStart == null) this.shakeStart = last.t; } else if (!last || t - last.t > 500) this.shakeStart = null;
    if (this.peaks.length >= 4 && (t - this.lastShake > 1200 || (this.lastLevel === 'shake' && t - this.lastShake > 150))) {
      const avg = this.peaks.reduce((s, p) => s + p.v, 0) / this.peaks.length;
      const hard = (this.peaks.length >= 6 && avg >= 16) || (this.shakeStart != null && t - this.shakeStart >= 2500);
      if (!hard && t - this.lastShake <= 1200) { /* chỉ cho phép leo thang lên lắc mạnh */ } else {
      ev.push({ name: hard ? 'motion:hardshake' : 'motion:shake', payload: { n: this.peaks.length, avg } });
      this.lastShake = t; this.lastLevel = hard ? 'hard' : 'shake'; } if (t - this.lastShake < 1) { this.peaks = []; if (hard) this.shakeStart = null; }
    }

    // úp mặt / ngửa
    const g = this.gl;
    if (g.z < -0.8 * G) { if (this.fdSince == null) this.fdSince = t; if (!this.facedown && t - this.fdSince > 500) { this.facedown = true; ev.push({ name: 'motion:facedown', payload: {} }); } }
    else { this.fdSince = null; if (this.facedown && g.z > -0.5 * G) { this.facedown = false; ev.push({ name: 'motion:faceup', payload: {} }); } }
    // lật ngược
    if (g.y < -0.7 * G && Math.abs(g.z) < 0.7 * G) { if (this.udSince == null) this.udSince = t; if (!this.upside && t - this.udSince > 600) { this.upside = true; ev.push({ name: 'motion:upsidedown', payload: {} }); } }
    else { this.udSince = null; if (this.upside && g.y > 0.4 * G) { this.upside = false; ev.push({ name: 'motion:upright', payload: {} }); } }

    // bước chân: đỉnh gia tốc ~ 1.25 g cách nhau 0.28-1.0 s
    if (m > 1.25 && !this.above) {
      this.above = true;
      const gap = t - this.lastStep;
      if (gap >= 280 && lm < 12 && this.peaks.length < 3) {
        if (gap > 1000) this.stepTimes = [];
        this.stepTimes.push(t); this.lastStep = t;
        if (this.stepTimes.length >= 3) { this.walking = true; ev.push({ name: 'motion:step', payload: {} }); }
      }
    } else if (m < 1.1) this.above = false;
    if (this.walking && t - this.lastStep > 1800) { this.walking = false; this.stepTimes = []; ev.push({ name: 'motion:stepstop', payload: {} }); }

    if (t - this.lastTilt >= 33) { this.lastTilt = t; ev.push({ name: 'motion:tilt', payload: this.tilt }); }
    return ev;
  }
}

const isIOS = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function createMotionSensor(bus) {
  const S = { id: 'motion', label: 'Nghiêng · lắc · rơi', status: 'off', an: new MotionAnalyzer(), handler: null, got: false, timer: null };
  S.supported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') { S.status = 'denied'; return S.status; }
      }
    } catch { S.status = 'denied'; return S.status; }
    const sign = isIOS() ? -1 : 1;
    S.handler = (e) => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
      S.got = true; S.status = 'on';
      for (const ev of S.an.push(performance.now(), a.x * sign, a.y * sign, a.z * sign)) bus.emit(ev.name, ev.payload);
    };
    window.addEventListener('devicemotion', S.handler);
    S.status = 'on';
    S.timer = setTimeout(() => { if (!S.got) { S.stop(); S.status = 'unsupported'; bus.emit('sensor:status', { id: 'motion', status: S.status }); } }, 1800);
    return S.status;
  };
  S.stop = () => { try { if (S.handler) window.removeEventListener('devicemotion', S.handler); } catch { /* bỏ qua */ } clearTimeout(S.timer); S.handler = null; if (S.status === 'on') S.status = 'off'; };
  return S;
}
