// Micro: âm lượng, vỗ tay, im lặng. MicAnalyzer là logic thuần.
export class MicAnalyzer {
  constructor() { this.floor = 0.02; this.prev = 0; this.prevT = 0; this.lastSpike = -1e9; this.claps = []; this.quiet0 = null; this.quietSent = false; this.lastLoud = -1e9; }
  /** rms 0..1; trả mảng {name,payload}. */
  push(t, rms) {
    const ev = [];
    const dt = Math.max(1, t - this.prevT);
    if (rms < this.floor * 2.5) this.floor += (rms - this.floor) * Math.min(1, dt / 3000);
    const thr = Math.max(0.16, this.floor * 6);
    const sudden = this.prev < rms * 0.45 && t - this.prevT < 120;
    if (rms > thr && t - this.lastSpike > 130) {
      if (sudden) {
        this.lastSpike = t;
        this.claps = this.claps.filter((c) => t - c < 700);
        if (this.claps.length >= 1 && t - this.claps[this.claps.length - 1] >= 150) { this.claps = []; ev.push({ name: 'mic:clap2', payload: {} }); }
        else { this.claps.push(t); ev.push({ name: 'mic:clap', payload: {} }); }
      } else if (rms > 0.3 && t - this.lastLoud > 1500) { this.lastLoud = t; this.lastSpike = t; ev.push({ name: 'mic:loud', payload: { rms } }); }
    }
    if (rms < 0.012) { if (this.quiet0 == null) this.quiet0 = t; if (!this.quietSent && t - this.quiet0 > 60000) { this.quietSent = true; ev.push({ name: 'mic:silence', payload: {} }); } }
    else { this.quiet0 = null; this.quietSent = false; }
    this.prev = rms; this.prevT = t;
    return ev;
  }
}

export function createMicSensor(bus) {
  const S = { id: 'mic', label: 'Micro', status: 'off', stream: null, ctx: null, timer: null, an: new MicAnalyzer(), paused: false };
  S.supported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined');
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }); }
    catch (e) { S.status = e && e.name === 'NotAllowedError' ? 'denied' : 'error'; return S.status; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; S.ctx = new AC();
      const src = S.ctx.createMediaStreamSource(S.stream), an = S.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      S.timer = setInterval(() => {
        if (S.paused) return;
        an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length); S.level = rms;
        for (const ev of S.an.push(performance.now(), rms)) bus.emit(ev.name, ev.payload);
      }, 30);
      S.status = 'on';
    } catch { S.status = 'error'; }
    return S.status;
  };
  S.pause = (p) => { S.paused = p; };
  S.stop = () => { clearInterval(S.timer); if (S.stream) S.stream.getTracks().forEach((t) => t.stop()); S.stream = null; try { if (S.ctx) S.ctx.close(); } catch { /* bỏ qua */ } S.ctx = null; if (S.status === 'on') S.status = 'off'; };
  return S;
}
