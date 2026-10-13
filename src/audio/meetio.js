// Thu PCM thô từ micro cho chế độ gặp bạn (modem cần từng mẫu, không phải RMS như sensors/mic.js).
// Tắt echoCancellation/noiseSuppression/autoGainControl (bộ xử lý giọng nói của hệ điều hành sẽ nuốt tiếng bíp); ScriptProcessor 2048 mẫu trên cùng AudioContext với chirp
// (cùng tốc độ mẫu với bộ mã hóa). Lỗi (từ chối quyền, không hỗ trợ) -> null, không ném.
export async function openMeetMic(ctx, onFrame) {
  try {
    if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ctx.createScriptProcessor) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(2048, 1, 1), mute = ctx.createGain();
    mute.gain.value = 0;
    proc.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    return { stop() { try { proc.onaudioprocess = null; src.disconnect(); proc.disconnect(); mute.disconnect(); stream.getTracks().forEach((t) => t.stop()); } catch { /* bỏ qua */ } } };
  } catch { return null; }
}
