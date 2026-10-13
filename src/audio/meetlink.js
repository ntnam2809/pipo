// Tầng đường truyền cho chế độ gặp bạn: gói (brain/meet.js) <-> PCM (audio/modem.js), half-duplex. Thuần logic: phát/nghe thật do tầng ngoài tiêm vào.
//   - send(pkt): mã hóa -> PCM -> play(pcm); từ lúc phát tới khi hết + guard (150 ms) không nghe (khỏi nghe chính mình) và bỏ gói đang nhận dở.
//   - feed(frame): khung PCM từ micro -> gói hợp lệ (CRC đúng + decodePacket hợp lệ). busy(): đang phát hoặc đang nhận dở (nghe-trước-khi-nói).
//   - timeScale > 1: chỉ cho mô phỏng nhanh (debug "Giả lập bạn Pipo"): coi thời lượng phát ngắn đi chừng đó lần.
import { encode, Decoder } from './modem.js';
import { encodePacket, decodePacket } from '../brain/meet.js';

export const GUARD_SEC = 0.15;

export class Link {
  /** o: { sampleRate, play(pcm: Float32Array), now(): giây, guard, timeScale }. */
  constructor(o) {
    this.sr = o.sampleRate; this.play = o.play || (() => {}); this.clock = o.now || (() => 0); this.guard = o.guard ?? GUARD_SEC; this.timeScale = o.timeScale || 1;
    this.dec = new Decoder(this.sr); this.deafUntil = -1; this.sent = 0; this.received = 0; this.bad = 0;
  }
  /** Phát một gói; trả thời lượng phát (giây, theo timeScale). */
  send(pkt) {
    const pcm = encode(encodePacket(pkt), this.sr), dur = pcm.length / this.sr / this.timeScale, now = this.clock();
    this.deafUntil = now + dur + this.guard; this.dec.reset(); this.sent++;
    this.play(pcm); return dur;
  }
  /** Khung PCM từ micro (now: giây, mặc định đồng hồ tiêm vào). Trả mảng gói đã giải mã. */
  feed(frame, now = this.clock()) {
    if (now < this.deafUntil) return [];
    const out = [];
    for (const bytes of this.dec.push(frame)) { const p = decodePacket(bytes); if (p) { out.push(p); this.received++; } else this.bad++; }
    return out;
  }
  busy(now = this.clock()) { return now < this.deafUntil || this.dec.busy; }
}
