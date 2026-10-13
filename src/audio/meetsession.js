// Một phiên "gặp bạn": nối Meeting (giao thức) + Link (modem half-duplex) + vào/ra âm thanh do tầng ngoài tiêm.
// Thuần logic (đồng hồ, phát, sự kiện đều tiêm vào) nên test được không cần WebAudio. SimPeer: bạn Pipo ảo cho nút debug "Giả lập bạn Pipo"
// — một phiên thứ hai, hai phiên nghe nhau qua PCM thật (encode → Decoder), không cần micro.
import { Meeting, emoOf, CFG } from '../brain/meet.js';
import { Link } from './meetlink.js';

export class MeetSession {
  /**
   * o: { sampleRate, now(): giây, play(pcm), self(): { name, hue, skin, mood, emo }, music(): { bpm } | null, emit(ev), cfg, rng, timeScale }
   * emit nhận các sự kiện của Meeting: start · search · met · myEmo · peerEmo · dance · bye · end.
   */
  constructor(o) {
    this.o = o; this.clock = o.now;
    this.link = new Link({ sampleRate: o.sampleRate, now: o.now, play: o.play, timeScale: o.timeScale || 1 });
    this.meeting = new Meeting({ self: () => o.self(), rng: o.rng, cfg: o.cfg, emit: (e) => o.emit && o.emit(e), send: (pkt) => this.link.send(pkt) });
  }
  get active() { return this.meeting.active; }
  start() { this.meeting.start(this.clock()); }
  stop(reason = 'stop') { this.meeting.stop(reason, this.clock()); }
  /** Khung PCM từ micro. */
  feed(frame) {
    const now = this.clock(), music = this.o.music ? this.o.music() : null;
    for (const p of this.link.feed(frame, now)) this.meeting.onPacket(p, now, { music });
  }
  /** Gọi mỗi khung hình. */
  tick() { const now = this.clock(); this.meeting.tick(now, { busy: this.link.busy(now) }); }
}

/** Đường truyền ảo hai chiều giữa hai phiên: PCM của bên này tới Decoder của bên kia sau đúng thời lượng phát (theo timeScale). */
export class SimWire {
  constructor(now, timeScale = 1) { this.now = now; this.ts = timeScale; this.q = []; this.ends = {}; }
  /** Đăng ký phiên nhận. */
  attach(tag, session) { this.ends[tag] = session; }
  /** from phát pcm: bên kia nhận sau pcm/sr/ts giây. */
  transmit(from, pcm, sr) { const to = from === 'a' ? 'b' : 'a'; this.q.push({ at: this.now() + pcm.length / sr / this.ts, to, pcm }); }
  pump() {
    const t = this.now();
    for (let i = 0; i < this.q.length; i++) {
      if (this.q[i].at > t) continue;
      const { to, pcm } = this.q.splice(i--, 1)[0], s = this.ends[to]; if (!s) continue;
      for (let k = 0; k < pcm.length; k += 4096) s.feed(pcm.subarray(k, Math.min(pcm.length, k + 4096)));
      s.feed(new Float32Array(Math.round(s.link.sr * 0.25)));                    // đuôi im lặng để Decoder chốt gói
    }
  }
}

/** Cấu hình chạy nhanh cho mô phỏng (debug): ít lượt, nghĩ nhanh, HELLO dồn. */
export const SIM_CFG = { firstHello: [0.5, 0.8], replyDelay: [0.25, 0.45], helloGap: [3, 4], turns: [2, 2], retry: 4, byeWait: 3, danceSec: 3 };

/** Bạn Pipo ảo: phiên thứ hai nói chuyện với phiên của mình qua SimWire. selfMain.play được bọc để chuyển PCM sang bạn ảo. */
export function createSimPeer({ sampleRate, now, mainSession, rng = Math.random, timeScale = 4, startDelay = 2.2, friend, peerBpm = 0 }) {
  const wire = new SimWire(now, timeScale), me = friend || { name: 'Bibi', hue: 330, skin: 'eve', mood: { valence: 0.6, arousal: 0.6 }, emo: 'excited' };
  const peer = new MeetSession({ sampleRate, now, timeScale, rng, cfg: SIM_CFG, self: () => me, music: () => (peerBpm > 0 ? { bpm: peerBpm } : null), play: (pcm) => wire.transmit('b', pcm, sampleRate) });
  wire.attach('b', peer); wire.attach('a', mainSession);
  let t0 = now(), started = false;
  return {
    peer, wire,
    /** PCM của phiên chính (thay cho `play` thật hoặc gọi thêm): chuyển sang bạn ảo. */
    fromMain(pcm) { wire.transmit('a', pcm, sampleRate); },
    tick() { const t = now(); if (!started && t - t0 >= startDelay) { started = true; peer.start(); } wire.pump(); if (started) peer.tick(); },
    get started() { return started; },
    stop() { peer.stop('stop'); },
  };
}
export { emoOf, CFG };
