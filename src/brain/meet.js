// Giao thức "hai Pipo gặp nhau" bằng tiếng bíp (audio/modem.js): gói nhị phân ≤ 24 byte + máy trạng thái hai phía. Thuần logic, không đụng DOM/WebAudio.
//
// Gói { t: HELLO|ACK|EMO|DANCE|BYE, id (ngẫu nhiên mỗi phiên gặp, không lưu), name (≤ 10 byte UTF-8), hue, skin, mood, emo, ... }.
// Luồng: HELLO → ACK → (người khởi xướng) EMO ⇄ EMO … (2–4 lượt, mỗi bên phản ứng với cảm xúc của bên kia) → [DANCE nếu có nhạc] → BYE ⇄ BYE.
//   - Khởi xướng = bên nhận ACK; bên gửi ACK là bên đáp. Hai bên gửi HELLO cùng lúc: id nhỏ hơn khởi xướng.
//   - Half-duplex do tầng truyền lo (không nghe lúc đang phát + 150 ms); ở đây: chỉ gửi khi đường rảnh (env.busy = false), trả lời sau một nhịp "nghĩ"
//     ngẫu nhiên (chống va chạm), HELLO lặp với backoff ngẫu nhiên, mất phản hồi thì gửi lại tối đa 2 lần rồi coi là mất bạn, cả phiên timeout 90 s.
//   - Mọi gói có seq/nhận trùng thì phát lại câu trả lời cũ (đối phương chưa nghe thấy), nên mất gói không làm kẹt luồng.
export const PROTO = 1;
export const T = { HELLO: 1, ACK: 2, EMO: 3, DANCE: 4, BYE: 5 };
export const TYPE_NAME = ['', 'HELLO', 'ACK', 'EMO', 'DANCE', 'BYE'];
export const EMOS = ['neutral', 'happy', 'joy', 'love', 'excited', 'curious', 'surprised', 'blush', 'wink', 'cool', 'smug', 'sad', 'sleepy', 'scared', 'confused', 'groove'];
export const SKINS = ['classic', 'pixel', 'eve'];
export const MAX_NAME_BYTES = 10;
export const MAX_FRIENDS = 50;
export const CFG = {
  total: 90,                   // s: cả chế độ gặp
  helloGap: [2.5, 5],          // s: nghỉ nghe ACK sau mỗi HELLO (cộng thời lượng phát)
  firstHello: [0.4, 1.4],
  replyDelay: [0.5, 1.1],      // s: "nghĩ" trước khi trả lời
  retry: 7, maxTries: 2,       // s chờ phản hồi rồi gửi lại, tối đa 2 lần gửi lại
  turns: [2, 4],               // số lượt (mỗi lượt = một EMO của mỗi bên)
  danceSec: 8, byeWait: 6, silence: 28,   // silence: s không nghe bạn (đã gặp) thì coi là mất bạn
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const emoIndex = (e) => { const i = EMOS.indexOf(e); return i < 0 ? 1 : i; };
const skinIndex = (s) => { const i = SKINS.indexOf(s); return i < 0 ? 0 : i; };

/** Cắt tên tới ≤ 10 byte UTF-8 ở ranh giới ký tự; bỏ ký tự điều khiển. */
export function clipName(name) {
  const enc = new TextEncoder(); let out = '', n = 0;
  for (const ch of String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()) { const b = enc.encode(ch).length; if (n + b > MAX_NAME_BYTES) break; out += ch; n += b; }
  return out;
}
const packMood = (m) => (Math.round(((clamp(+m?.valence || 0, -1, 1) + 1) / 2) * 15) << 4) | Math.round(clamp(+m?.arousal || 0, 0, 1) * 15);
const unpackMood = (b) => ({ valence: Math.round(((b >> 4) / 15 * 2 - 1) * 100) / 100, arousal: Math.round(((b & 15) / 15) * 100) / 100 });

/** Gói -> byte (≤ 24). Trường thiếu lấy mặc định. */
export function encodePacket(p) {
  const t = T[p.t]; if (!t) throw new RangeError('loại gói lạ: ' + p.t);
  const id = (p.id | 0) & 0xffff, b = [(PROTO << 5) | t, id >> 8, id & 255];
  if (t === T.HELLO || t === T.ACK) {
    if (t === T.ACK) { const to = (p.to | 0) & 0xffff; b.push(to >> 8, to & 255); }
    const nm = new TextEncoder().encode(clipName(p.name));
    b.push(Math.round((((+p.hue || 0) % 360) + 360) % 360 / 360 * 255), skinIndex(p.skin), packMood(p.mood), emoIndex(p.emo), nm.length, ...nm);
  } else if (t === T.EMO) b.push(((p.seq & 15) << 4) | (p.left & 15), emoIndex(p.emo), packMood(p.mood));
  else if (t === T.DANCE) b.push(clamp(Math.round((+p.bpm || 120) / 2), 20, 125));
  return Uint8Array.from(b);
}

/** Byte -> gói, hoặc null nếu sai phiên bản/độ dài/giá trị (kể cả UTF-8 hỏng). */
export function decodePacket(bytes) {
  if (!bytes || bytes.length < 3) return null;
  const b0 = bytes[0], t = b0 & 31, ver = b0 >> 5; if (ver !== PROTO || t < 1 || t > 5) return null;
  const p = { t: TYPE_NAME[t], id: (bytes[1] << 8) | bytes[2] };
  let o = 3;
  if (t === T.HELLO || t === T.ACK) {
    if (t === T.ACK) { if (bytes.length < o + 2) return null; p.to = (bytes[o] << 8) | bytes[o + 1]; o += 2; }
    if (bytes.length < o + 5) return null;
    const hue = bytes[o], skin = bytes[o + 1], mood = bytes[o + 2], emo = bytes[o + 3], nl = bytes[o + 4]; o += 5;
    if (nl > MAX_NAME_BYTES || bytes.length !== o + nl || emo >= EMOS.length) return null;
    let name; try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(o, o + nl)); } catch { return null; }
    if (/[\u0000-\u001f\u007f]/.test(name)) return null;
    Object.assign(p, { name, hue: Math.round((hue / 255) * 360), skin: SKINS[skin] || 'classic', mood: unpackMood(mood), emo: EMOS[emo] });
  } else if (t === T.EMO) {
    if (bytes.length !== o + 3 || bytes[o + 1] >= EMOS.length) return null;
    Object.assign(p, { seq: bytes[o] >> 4, left: bytes[o] & 15, emo: EMOS[bytes[o + 1]], mood: unpackMood(bytes[o + 2]) });
  } else if (t === T.DANCE) { if (bytes.length !== o + 1) return null; p.bpm = bytes[o] * 2; }
  else if (bytes.length !== o) return null;
  return p;
}

/** Phản ứng với cảm xúc của bên kia (bảng cố định, chọn một trong hai theo rng). */
export const REACT = {
  neutral: ['happy', 'curious'], happy: ['joy', 'happy'], joy: ['excited', 'joy'], love: ['blush', 'love'], excited: ['joy', 'excited'], curious: ['surprised', 'curious'],
  surprised: ['curious', 'excited'], blush: ['love', 'wink'], wink: ['wink', 'smug'], cool: ['cool', 'smug'], smug: ['wink', 'happy'], sad: ['love', 'sad'],
  sleepy: ['sleepy', 'happy'], scared: ['curious', 'love'], confused: ['curious', 'wink'], groove: ['groove', 'joy'],
};
export function reactTo(emo, rng = Math.random) { const r = REACT[emo] || REACT.neutral; return r[rng() < 0.5 ? 0 : 1]; }
/** Biểu cảm hiện tại -> cảm xúc gửi đi (gần nhất trong bảng 16). */
export function emoOf(expression) { return EMOS.includes(expression) ? expression : ({ cry: 'sad', bored: 'sleepy', sleeping: 'sleepy', shocked: 'surprised', angry: 'smug', annoyed: 'confused' }[expression] || 'happy'); }

/** Danh sách bạn đã gặp (≤ 50, mới nhất lên đầu): khóa = tên + nhóm màu. Hàm thuần: trả danh sách mới. */
export function updateFriends(list, peer, nowMs = 0) {
  const key = (f) => `${String(f.name).toLowerCase()}|${Math.floor((((f.hue % 360) + 360) % 360) / 45)}`;
  const f = { name: clipName(peer.name) || 'Bạn', hue: Math.round(peer.hue) || 0, skin: peer.skin || 'classic', n: 1, last: nowMs };
  const out = []; let hit = null;
  for (const g of Array.isArray(list) ? list : []) { if (g && typeof g.name === 'string' && !hit && key(g) === key(f)) hit = g; else if (g && typeof g.name === 'string') out.push({ name: g.name, hue: +g.hue || 0, skin: g.skin || 'classic', n: Math.max(1, g.n | 0), last: +g.last || 0 }); }
  const merged = hit ? { ...f, n: Math.min(9999, (hit.n | 0) + 1) } : f;
  return [merged, ...out].slice(0, MAX_FRIENDS);
}

export class Meeting {
  /**
   * o.self = { name, hue, skin, mood:{valence,arousal}, emo }; o.send(pkt) -> thời lượng phát (s) hoặc 0; o.emit({type,...});
   * o.rng, o.cfg. Thời gian `now` luôn là giây (đơn điệu).
   */
  constructor(o) {
    this.self = o.self; this.rng = o.rng || Math.random; this.sendFn = o.send; this.emit = o.emit || (() => {}); this.cfg = { ...CFG, ...(o.cfg || {}) };
    this.state = 'idle'; this.id = 0; this.peer = null; this.role = null;
  }
  get active() { return this.state !== 'idle' && this.state !== 'done'; }
  _r(range) { return range[0] + (range[1] - range[0]) * this.rng(); }
  _info() { const s = typeof this.self === 'function' ? this.self() : this.self; return { name: clipName(s.name), hue: s.hue, skin: s.skin, mood: s.mood, emo: s.emo }; }
  start(now) {
    this.id = 1 + Math.floor(this.rng() * 65534); this.state = 'search'; this.startedAt = now; this.peer = null; this.role = null; this.last = null; this.due = null; this.rxSeq = -1; this.seq = -1;
    this.nextHello = now + this._r(this.cfg.firstHello); this.lastRx = now; this.metSent = false; this.total = 0; this.danceUntil = 0; this.byeSent = false; this.finishAt = null;
    this.emit({ type: 'start', id: this.id });
  }
  stop(reason = 'stop', now = 0) { if (this.active) this._finish(reason, now); }
  _finish(reason, now) { const was = this.state; this.state = 'done'; this.due = null; this.last = null; this.emit({ type: 'end', reason, peer: this.peer, ok: reason === 'bye', was }); }
  /** Gửi gói; nhớ lại để gửi lại khi cần (expect: có chờ phản hồi hay không). */
  _tx(pkt, now, expect) {
    const dur = this.sendFn(pkt) || 0;
    this.last = { pkt, at: now + dur, expect, tries: 0, dur };
    return dur;
  }
  _later(now, fn, range = this.cfg.replyDelay) { this.due = { at: now + this._r(range), fn }; }
  _emoPkt(seq, left, emo) { const s = this._info(); return { t: 'EMO', id: this.id, seq, left, emo, mood: s.mood }; }
  _sendEmo(now, seq, left, emo) {
    this.seq = seq; this.emit({ type: 'myEmo', emo, seq, left });
    this._tx(this._emoPkt(seq, left, emo), now, true);
  }

  tick(now, env = {}) {
    if (!this.active) return;
    if (now - this.startedAt > this.cfg.total) { this._finish('timeout', now); return; }
    if (this.finishAt != null && now >= this.finishAt) { this._finish('bye', now); return; }
    if (this.state !== 'search' && now - this.lastRx > this.cfg.silence && !(this.state === 'dance' && now < this.danceUntil + 3)) { this._finish('lost', now); return; }
    if (env.busy) return;
    if (this.due && now >= this.due.at) { const f = this.due.fn; this.due = null; f(); if (!this.active) return; }
    if (this.state === 'search' && now >= this.nextHello) {
      const s = this._info(), dur = this._tx({ t: 'HELLO', id: this.id, ...s }, now, false);
      this.emit({ type: 'search' }); this.nextHello = now + dur + this._r(this.cfg.helloGap); return;
    }
    const l = this.last;
    if (l && l.expect && now - l.at > this.cfg.retry && !this.due) {
      if (l.tries >= this.cfg.maxTries) { this._finish(this.state === 'bye' ? 'bye' : 'lost', now); return; }
      const t = l.tries + 1, dur = this.sendFn(l.pkt) || 0; this.last = { ...l, tries: t, at: now + dur };
    }
    if (this.state === 'dance' && this.role === 'initiator' && now >= this.danceUntil && !this.due) this._startBye(now);
  }

  _startBye(now) {
    this.state = 'bye'; this.byeSent = true; this.emit({ type: 'bye', peer: this.peer });
    this._tx({ t: 'BYE', id: this.id }, now, true); this.finishAt = null;
    this.byeDeadline = now + this.cfg.byeWait * (this.cfg.maxTries + 1);
  }

  /** Gói nhận được từ đường truyền (đã qua CRC + decodePacket). */
  onPacket(pkt, now, env = {}) {
    if (!this.active || !pkt || pkt.id === this.id) return;              // bỏ tiếng vọng của chính mình
    if (this.peer && pkt.id === this.peer.id) this.lastRx = now;
    if (this.state === 'search') {
      if (pkt.t === 'HELLO') return this._onHello(pkt, now);
      if (pkt.t === 'ACK' && pkt.to === this.id) return this._onAck(pkt, now);
      return;
    }
    if (!this.peer || pkt.id !== this.peer.id) return;                   // chỉ nói chuyện với bạn đã chọn
    switch (pkt.t) {
      case 'HELLO': if (this.role === 'responder' && this.rxSeq < 0) this._later(now, () => this._sendAck(now)); break;   // ACK bị mất: gửi lại
      case 'ACK': if (pkt.to === this.id && this.role === 'responder' && this.rxSeq < 0 && this.seq < 0 && this.id < this.peer.id) this._becomeInitiator(now); break;   // hai bên cùng HELLO: id nhỏ khởi xướng
      case 'EMO': this._onEmo(pkt, now, env); break;
      case 'DANCE': this._onDance(pkt, now); break;
      case 'BYE': this._onBye(pkt, now); break;
      default: break;
    }
  }
  _setPeer(pkt) { this.peer = { id: pkt.id, name: pkt.name || '', hue: pkt.hue ?? 0, skin: pkt.skin || 'classic', mood: pkt.mood, emo: pkt.emo }; }
  _onHello(pkt, now) {
    this._setPeer(pkt); this.state = 'talk'; this.role = 'responder'; this.last = null; this.lastRx = now;
    this._later(now, () => this._sendAck(now));
  }
  _sendAck(now) {
    const s = this._info(); this._tx({ t: 'ACK', id: this.id, to: this.peer.id, ...s }, now, true);   // chờ EMO đầu tiên của người khởi xướng; không thấy thì gửi lại
    if (!this.metSent) { this.metSent = true; this.emit({ type: 'met', peer: this.peer, role: this.role }); }
  }
  _onAck(pkt, now) {
    this._setPeer(pkt); this.state = 'talk'; this.lastRx = now; this._becomeInitiator(now); this.last = null;
    if (!this.metSent) { this.metSent = true; this.emit({ type: 'met', peer: this.peer, role: 'initiator' }); }
  }
  _becomeInitiator(now) {
    this.role = 'initiator'; this.total = 2 * Math.round(this._r(this.cfg.turns)); this.total = clamp(this.total, 2, 14);
    this._later(now, () => this._sendEmo(now, 0, this.total - 1, this._info().emo));
  }
  _resendLast(now) { if (!this.last) return; const dur = this.sendFn(this.last.pkt) || 0; this.last.at = now + dur; }
  _onEmo(pkt, now, env) {
    if (pkt.seq <= this.rxSeq) { if (this.last && !this.due) this._later(now, () => this._resendLast(now)); return; }   // trùng: đối phương chưa nghe câu trả lời của mình
    this.rxSeq = pkt.seq; this.lastRx = now;
    if (!this.metSent) { this.metSent = true; this.emit({ type: 'met', peer: this.peer, role: this.role }); }
    this.peer.mood = pkt.mood; this.peer.emo = pkt.emo; this.last = null;
    this.emit({ type: 'peerEmo', emo: pkt.emo, mood: pkt.mood });
    if (pkt.left > 0) { const mine = reactTo(pkt.emo, this.rng); this._later(now, () => this._sendEmo(now, (pkt.seq + 1) & 15, pkt.left - 1, mine)); return; }
    if (this.role === 'initiator') {                                       // hết lượt: nhảy cùng nếu có nhạc, rồi tạm biệt
      const bpm = env.music && env.music.bpm > 0 ? env.music.bpm : 0;
      this._later(now, () => { if (bpm > 0) this._startDance(now, bpm); else this._startBye(now); });
    }
  }
  _startDance(now, bpm) {
    this.state = 'dance'; this.danceUntil = now + this.cfg.danceSec; this.emit({ type: 'dance', bpm, sec: this.cfg.danceSec });
    this._tx({ t: 'DANCE', id: this.id, bpm }, now, false);
  }
  _onDance(pkt, now) { this.state = 'dance'; this.last = null; this.emit({ type: 'dance', bpm: pkt.bpm, sec: this.cfg.danceSec }); }
  _onBye(pkt, now) {
    if (this.role === 'responder') {
      if (!this.byeSent) { this.byeSent = true; this.emit({ type: 'bye', peer: this.peer }); }
      this.state = 'bye'; this._later(now, () => { this._tx({ t: 'BYE', id: this.id }, now, false); this.finishAt = now + 1.2; });
    } else this._finish('bye', now);                                       // bên khởi xướng nhận BYE đáp: xong
  }
}
