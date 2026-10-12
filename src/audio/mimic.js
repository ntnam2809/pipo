// Nhại giọng: thu <= 6 s -> pitch-shift (playbackRate) + ring-mod + bit-crush -> phát lại; miệng nhép theo biên độ.
export const MAX_SEC = 6;
export const MIMIC_PRESETS = {
  chipmunk: { label: 'Chipmunk', rate: 1.7, ring: 30, mix: 0.45, bits: 7, hold: 1 },
  robot: { label: 'Robot', rate: 1.2, ring: 55, mix: 0.85, bits: 5, hold: 2 },
  deep: { label: 'Trầm', rate: 0.75, ring: 25, mix: 0.4, bits: 8, hold: 1 },
};

/** Xử lý mẫu thu (thuần). Trả {data, rate, env (RMS mỗi 20ms thời gian phát), duration}. */
export function processMimic(input, sr, presetKey = 'chipmunk') {
  const p = MIMIC_PRESETS[presetKey] || MIMIC_PRESETS.chipmunk;
  const n = Math.min(input.length, Math.floor(sr * MAX_SEC));
  const out = new Float32Array(n);
  let peak = 1e-6; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(input[i]));
  const gain = Math.min(8, 0.9 / peak), levels = Math.pow(2, p.bits - 1);
  let held = 0;
  for (let i = 0; i < n; i++) {
    let x = input[i] * gain;
    const ring = Math.sin((2 * Math.PI * p.ring * i) / sr);
    x = x * (1 - p.mix) + x * ring * p.mix;
    if (i % p.hold === 0) held = Math.round(x * levels) / levels;
    out[i] = Math.max(-1, Math.min(1, held));
  }
  const block = Math.max(1, Math.floor(0.02 * p.rate * sr)), env = [];
  for (let i = 0; i < n; i += block) { let s = 0, c = 0; for (let j = i; j < Math.min(n, i + block); j++) { s += out[j] * out[j]; c++; } env.push(Math.min(1, Math.sqrt(s / Math.max(1, c)) * 2.2)); }
  return { data: out, rate: p.rate, env, duration: n / sr / p.rate };
}
export function envAt(env, tSec) { const i = Math.floor(tSec / 0.02); return i >= 0 && i < env.length ? env[i] : 0; }

export class Mimic {
  constructor(chirp) { this.chirp = chirp; this.chunks = []; this.stream = null; this.node = null; this.src = null; this.recording = false; this.timer = null; this.level = 0; }
  supported() { return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && this.chirp.supported(); }
  async start(onAuto) {
    if (!this.supported() || this.recording) return false;
    this.chirp.unlock(); const ctx = this.chirp.ctx; if (!ctx) return false;
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false }, video: false }); } catch { return false; }
    this.chunks = []; this.recording = true; this.sr = ctx.sampleRate;
    this.src = ctx.createMediaStreamSource(this.stream); this.node = ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (e) => {
      if (!this.recording) return; const d = e.inputBuffer.getChannelData(0); this.chunks.push(new Float32Array(d));
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; this.level = Math.min(1, Math.sqrt(s / d.length) * 6);
    };
    const mute = ctx.createGain(); mute.gain.value = 0; this.src.connect(this.node); this.node.connect(mute); mute.connect(ctx.destination);
    this.timer = setTimeout(() => { if (this.recording && onAuto) onAuto(); }, MAX_SEC * 1000);
    return true;
  }
  /** Dừng thu, trả mẫu (hoặc null nếu quá ngắn). Không lưu bản ghi sau khi phát. */
  stop() {
    if (!this.recording) return null; this.recording = false; clearTimeout(this.timer); this.level = 0;
    try { this.node.disconnect(); this.src.disconnect(); } catch { /* bỏ qua */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); this.stream = null;
    let len = 0; for (const c of this.chunks) len += c.length; if (len < this.sr * 0.15) { this.chunks = []; return null; }
    const all = new Float32Array(len); let o = 0; for (const c of this.chunks) { all.set(c, o); o += c.length; } this.chunks = []; return all;
  }
  /** Phát lại; trả thời lượng (giây). Nhép miệng: main đọc chirp.level() vì phát qua cùng master. */
  play(samples, presetKey, onEnd) {
    const ctx = this.chirp.ctx; if (!ctx || !samples) return 0;
    const r = processMimic(samples, this.sr || ctx.sampleRate, presetKey);
    const buf = ctx.createBuffer(1, r.data.length, this.sr || ctx.sampleRate); buf.copyToChannel(r.data, 0);
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = r.rate; s.connect(this.chirp.master);
    s.onended = () => { if (onEnd) onEnd(); }; s.start(); return r.duration;
  }
}
