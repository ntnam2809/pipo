// Nghe nhạc ngoài môi trường qua micro: phổ -> BeatTracker (audio/beat.js). Cùng giao diện các sensor khác.
// Phát: music:start {bpm} · music:beat {bpm, beatIndex, strength} · music:stop. S.state đọc mỗi frame (pha ngoại suy theo audioCtx.currentTime).
import { BeatTracker, IDLE_BEAT } from '../audio/beat.js';

export function createMusicSensor(bus) {
  const S = { id: 'music', label: 'Nghe nhạc', status: 'off', stream: null, ctx: null, an: null, timer: null, paused: false, state: IDLE_BEAT, tracker: null };
  S.supported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined');
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }); }
    catch (e) { S.status = e && e.name === 'NotAllowedError' ? 'denied' : 'error'; return S.status; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; S.ctx = new AC();
      const src = S.ctx.createMediaStreamSource(S.stream), an = S.ctx.createAnalyser();
      an.fftSize = 2048; an.smoothingTimeConstant = 0; src.connect(an); S.an = an;
      S.tracker = new BeatTracker({ sampleRate: S.ctx.sampleRate, fftSize: an.fftSize });
      const db = new Float32Array(an.frequencyBinCount), mag = new Float32Array(an.frequencyBinCount);
      let was = false, lastBeat = -1;
      S.timer = setInterval(() => {
        if (S.paused || !S.ctx) return;
        an.getFloatFrequencyData(db);
        for (let i = 0; i < db.length; i++) { const d = db[i]; mag[i] = d > -150 ? Math.pow(10, d / 20) : 0; }   // dB -> tuyến tính
        const st = S.tracker.push(S.ctx.currentTime, mag);
        if (st.isMusic && !was) { was = true; bus.emit('music:start', { bpm: st.bpm }); }
        else if (!st.isMusic && was) { was = false; bus.emit('music:stop', {}); }
        if (st.isMusic && st.beatIndex !== lastBeat) { lastBeat = st.beatIndex; bus.emit('music:beat', { bpm: st.bpm, beatIndex: st.beatIndex, strength: st.energy }); }
      }, 20);
      S.status = 'on';
    } catch { S.status = 'error'; }
    return S.status;
  };
  /** Trạng thái hiện tại (pha ngoại suy tới bây giờ). */
  S.read = () => (S.tracker && S.ctx && S.status === 'on' ? (S.state = S.tracker.stateAt(S.ctx.currentTime)) : IDLE_BEAT);
  S.pause = (p) => { S.paused = p; };
  S.stop = () => {
    clearInterval(S.timer); if (S.stream) S.stream.getTracks().forEach((t) => t.stop()); S.stream = null;
    try { if (S.ctx) S.ctx.close(); } catch { /* bỏ qua */ }
    const was = S.tracker && S.tracker.state.isMusic; S.ctx = null; S.an = null; S.tracker = null; S.state = IDLE_BEAT;
    if (S.status === 'on') S.status = 'off'; if (was) bus.emit('music:stop', {});
  };
  return S;
}
