// Phản xạ: priority + duration + cooldown + habituation (leo thang khi lặp kích thích).
export const FORGET_STEP_MS = 4000; // mỗi 4 s không bị kích thích, bộ đếm giảm 1 (~20 s quên phần lớn)

/** Thang chọc mắt: 1-2 giật mình, 3-5 nghi ngờ, 6-9 bực, >=10 giận rồi quay đi. */
export function pokeLadder(n) {
  if (n <= 2) return { expression: 'surprised', duration: 1100, sound: 'surprise', jolt: 0.5 };
  if (n <= 5) return { expression: 'suspicious', duration: 1500, sound: 'curious', lookAt: { x: n % 2 ? 0.7 : -0.7, y: 0 } };
  if (n <= 9) return { expression: 'annoyed', duration: 1800, sound: 'annoyed', headShake: true };
  return { expression: 'angry', duration: 3500, sound: 'angry', lookAt: { x: n % 2 ? 1 : -1, y: 0.1 }, say: 'Hứ!' };
}

export const DEFS = {
  poke: { priority: 5, cooldown: 120, build: (n) => ({ ...pokeLadder(n), then: n <= 2 ? { expression: 'neutral', duration: 400 } : null }) },
  tapAway: { priority: 3, cooldown: 200, build: (n, p) => ({ expression: 'curious', duration: 1700, lookAt: { x: p.x ?? 0, y: p.y ?? 0 }, sound: 'curious' }) },
  pet: { priority: 6, cooldown: 400, build: (n) => ({ expression: n < 5 ? 'happy' : 'love', duration: 2600, sound: 'purr', vibrate: 12, jolt: 0.2 }) },
  hug: { priority: 7, cooldown: 3000, build: () => ({ expression: 'blush', duration: 1800, sound: 'purr', vibrate: 25, then: { expression: 'love', duration: 3000 } }) },
  eat: { priority: 7, cooldown: 300, build: (n, p) => ({ expression: 'eating', duration: p.dur || 2600, sound: 'chew', bite: true, then: { expression: 'joy', duration: 1800, sound: 'happy', lick: true } }) },
  drink: { priority: 7, cooldown: 300, build: () => ({ expression: 'drinking', duration: 2800, sound: 'gulp', then: { expression: 'happy', duration: 1800, sound: 'happy' } }) },
  full: { priority: 6, cooldown: 500, build: () => ({ expression: 'annoyed', duration: 1800, sound: 'annoyed', headShake: true, say: 'No rồi!' }) },
  shake: { priority: 6, cooldown: 1500, build: () => ({ expression: 'excited', duration: 2000, sound: 'joy', bounce: true }) },
  hardshake: { priority: 8, cooldown: 4000, build: () => ({ expression: 'dizzy', duration: 2200, sound: 'dizzy', then: { expression: 'glitch', duration: 300, sound: 'glitch', then: { expression: 'annoyed', duration: 2500, sound: 'annoyed' } } }) },
  freefall: { priority: 9, cooldown: 1500, build: () => ({ expression: 'shocked', duration: 2000, sound: 'scream', vibrate: 30 }) },
  impact: { priority: 8, cooldown: 1500, build: () => ({ expression: 'dizzy', duration: 2200, sound: 'dizzy', vibrate: 60, jolt: 1 }) },
  facedown: { priority: 8, cooldown: 1000, build: () => ({ expression: 'sleeping', duration: 3.6e6, sound: 'sleep', hold: true }) },
  upsidedown: { priority: 4, cooldown: 1000, build: () => ({ expression: 'confused', duration: 3.6e6, sound: 'confused', hold: true }) },
  step: { priority: 2, cooldown: 300, build: () => ({ expression: 'happy', duration: 900, bounce: true }) },
  newplace: { priority: 5, cooldown: 5000, build: () => ({ expression: 'curious', duration: 2500, sound: 'curious', say: 'Chỗ mới!', then: { expression: 'excited', duration: 2500, sound: 'joy' } }) },
  home: { priority: 5, cooldown: 60000, build: () => ({ expression: 'joy', duration: 3500, sound: 'happy', say: 'Về nhà rồi!' }) },
  faceHi: { priority: 4, cooldown: 8000, build: () => ({ expression: 'happy', duration: 2200, sound: 'hello' }) },
  faceNear: { priority: 4, cooldown: 12000, build: () => ({ expression: 'blush', duration: 2500, sound: 'purr' }) },
  faceLost: { priority: 3, cooldown: 15000, build: () => ({ expression: 'sad', duration: 2500, then: { expression: 'curious', duration: 3000, lookSeq: [{ t: 0, x: -0.8, y: 0 }, { t: 900, x: 0.8, y: 0.1 }, { t: 1800, x: 0, y: -0.5 }] } }) },
  peekaboo: { priority: 7, cooldown: 3000, build: () => ({ expression: 'surprised', duration: 700, sound: 'surprise', then: { expression: 'joy', duration: 2400, sound: 'happy', say: 'Ú òa!' } }) },
  mimicFace: { priority: 3, cooldown: 600, build: (n, p) => ({ expression: p.kind === 'wink' ? 'wink' : p.kind === 'mouth' ? 'surprised' : 'happy', duration: 1500 }) },
  loud: { priority: 5, cooldown: 800, build: () => ({ expression: 'surprised', duration: 900, sound: 'surprise' }) },
  clap: { priority: 5, cooldown: 500, build: () => ({ expression: 'surprised', duration: 700, sound: 'surprise' }) },
  clap2: { priority: 6, cooldown: 1500, build: () => ({ expression: 'excited', duration: 2200, sound: 'joy', bounce: true }) },
  batteryLow: { priority: 4, cooldown: 120000, build: () => ({ expression: 'hungry', duration: 3500, sound: 'sad', say: 'Đói điện...' }) },
  plugIn: { priority: 5, cooldown: 4000, build: () => ({ expression: 'eating', duration: 2400, sound: 'chew', then: { expression: 'happy', duration: 2500, sound: 'happy' } }) },
  bored: { priority: 1, cooldown: 30000, build: () => ({ expression: 'bored', duration: 5000, sound: 'beep' }) },
  nameCall: { priority: 4, cooldown: 1500, build: () => ({ expression: 'happy', duration: 2200, sound: 'hello', lookAt: { x: 0, y: 0 } }) },
  wake: { priority: 6, cooldown: 500, build: () => ({ expression: 'surprised', duration: 700, sound: 'wake', then: { expression: 'sleepy', duration: 1800, then: { expression: 'happy', duration: 1500 } } }) },
  dance: { priority: 6, cooldown: 1000, build: () => ({ expression: 'joy', duration: 4000, sound: 'joy', bounce: true, lookSeq: [{ t: 0, x: -0.6, y: 0 }, { t: 600, x: 0.6, y: 0 }, { t: 1200, x: -0.6, y: 0 }, { t: 1800, x: 0.6, y: 0 }, { t: 2400, x: 0, y: -0.3 }] }) },
  // ---- động tác tay: it.clip = tên clip (eyes/handclips.js); main phát clip + âm theo sự kiện của clip ----
  gWave: { priority: 5, cooldown: 1500, build: (n, p) => ({ expression: 'happy', duration: 2400, clip: 'wave', sound: 'hello', say: p.say }) },
  gBye: { priority: 5, cooldown: 1500, build: (n, p) => ({ expression: 'happy', duration: 2800, clip: 'bye', sound: 'hello', say: p.say || 'Bai bai!', then: { expression: 'neutral', duration: 300 } }) },
  gSalute: { priority: 5, cooldown: 1500, build: () => ({ expression: 'focus', duration: 2500, clip: 'salute', say: 'Rõ!', lookAt: { x: 0, y: -0.1 } }) },
  gPunch: { priority: 5, cooldown: 1200, build: () => ({ expression: 'smug', duration: 1900, clip: 'punch', then: { expression: 'happy', duration: 900 } }) },
  gCombo: { priority: 5, cooldown: 1500, build: () => ({ expression: 'smug', duration: 2700, clip: 'combo', then: { expression: 'excited', duration: 1100, sound: 'joy' } }) },
  gHighfive: { priority: 5, cooldown: 2500, build: () => ({ expression: 'happy', duration: 3300, clip: 'highfive', lookAt: { x: 0.2, y: -0.05 } }) },
  highfiveOk: { priority: 7, cooldown: 500, build: () => ({ expression: 'joy', duration: 2200, say: 'Bép!', jolt: 0.5, then: { expression: 'happy', duration: 1500 } }) },
  highfiveMiss: { priority: 5, cooldown: 500, build: () => ({ expression: 'sad', duration: 1900, sound: 'sad', jolt: 0.2, say: 'Hứ...', then: { expression: 'neutral', duration: 300 } }) },
  gFistbump: { priority: 5, cooldown: 1500, build: () => ({ expression: 'cool', duration: 2100, clip: 'fistbump', then: { expression: 'happy', duration: 1000 } }) },
  gThumbsup: { priority: 5, cooldown: 1500, build: () => ({ expression: 'happy', duration: 2400, clip: 'thumbsup', sound: 'happy' }) },
  gClap: { priority: 5, cooldown: 1500, build: (n, p) => ({ expression: 'joy', duration: p.dur || 3300, clip: 'clap', clipOpts: p.period ? { period: p.period } : null, sound: 'joy', bounce: true }) },
  gPoint: { priority: 5, cooldown: 1500, build: () => ({ expression: 'smug', duration: 2300, clip: 'point', lookAt: { x: 0, y: 0 } }) },
  gPeekaboo: { priority: 5, cooldown: 2000, build: () => ({ expression: 'blush', duration: 1700, clip: 'peekaboo', then: { expression: 'joy', duration: 1200 } }) },
  // ---- bắn súng tay (giả chết hoạt hình): aim = bị chĩa súng (giơ tay đầu hàng, giữ tới khi hạ súng) · shotHit = trúng đạn (fall.js điều khiển thân) ----
  aim: { priority: 8, cooldown: 1500, build: () => ({ expression: 'scared', intensity: 0.85, duration: 9000, hold: true, clip: 'handsup', sound: 'surprise', say: 'Đừng bắn!', lookAt: { x: 0, y: 0 }, jolt: 0.3 }) },
  shotHit: { priority: 10, cooldown: 0, build: () => ({ expression: 'ko', duration: 9500, hold: true, sound: 'pow', burst: 'pow', shake: 1, jolt: 1, vibrate: 40 }) },
  reviveTouch: { priority: 10, cooldown: 0, build: () => ({ expression: 'dizzy', duration: 1700, sound: 'dizzy', jolt: 0.6, then: { expression: 'happy', duration: 2000, sound: 'happy' } }) },
  reviveSelf: { priority: 10, cooldown: 0, build: () => ({ expression: 'wink', duration: 2300, sound: 'happy', say: 'Hì, giả vờ đó!', then: { expression: 'happy', duration: 1400 } }) },
  dodge: { priority: 10, cooldown: 0, build: () => ({ expression: 'smug', duration: 1500, sound: 'whoosh', say: 'Hụt rồi!', lookAt: { x: 0, y: 0 }, then: { expression: 'happy', duration: 900 } }) },
  counter: { priority: 10, cooldown: 0, build: () => ({ expression: 'smug', duration: 2400, clip: 'gun', say: 'Pew!', lookAt: { x: 0, y: 0 }, then: { expression: 'happy', duration: 1000, sound: 'happy' } }) },
  // ---- gặp bạn Pipo bằng tiếng bíp: tiếng bíp thật do audio/meetsession phát (nhép miệng theo chirp.level), ở đây chỉ là biểu cảm/động tác ----
  meetSearch: { priority: 3, cooldown: 0, build: () => ({ expression: 'curious', duration: 2300, say: 'bíp bíp?', lookSeq: [{ t: 0, x: -0.8, y: 0 }, { t: 700, x: 0.8, y: 0.05 }, { t: 1500, x: 0, y: -0.4 }] }) },
  meetFound: { priority: 7, cooldown: 0, build: (n, p) => ({ expression: 'excited', duration: 2000, clip: 'wave', say: p.name ? `Chào ${p.name}!` : 'Chào bạn!', fx: ['hearts'], then: { expression: 'love', duration: 3200 } }) },
  meetEmo: { priority: 4, cooldown: 0, build: (n, p) => ({ expression: p.emo || 'happy', duration: 2600, lookAt: { x: 0, y: 0 } }) },
  meetBye: { priority: 6, cooldown: 0, build: (n, p) => ({ expression: 'happy', duration: 2900, clip: 'bye', say: p.name ? `Bai bai ${p.name}!` : 'Bai bai!', then: { expression: 'love', duration: 1500 } }) },
  meetEnd: { priority: 3, cooldown: 0, build: (n, p) => ({ expression: p.sad ? 'sad' : 'neutral', duration: 2400, say: p.say || '' }) },
  cue: { priority: 1, cooldown: 0, build: (n, p) => ({ expression: p.expression, duration: p.duration || 5000, sound: p.sound, say: p.say }) },
};

export class Reactions {
  constructor(defs = DEFS) { this.defs = defs; this.st = {}; this.cur = null; }
  count(name) { return this.st[name]?.n || 0; }
  forget(name) { if (this.st[name]) this.st[name].n = 0; }
  fire(name, payload = {}, now = 0) {
    const def = this.defs[name]; if (!def) return null;
    const st = (this.st[name] ||= { n: 0, last: -Infinity, cool: -Infinity });
    if (now < st.cool) return null;
    const gap = now - st.last;
    if (st.last > -Infinity && gap > 0) st.n = Math.max(0, st.n - Math.floor(gap / FORGET_STEP_MS));
    st.n += 1; st.last = now; st.cool = now + (def.cooldown || 0);
    const cur = this.active(now);
    if (cur && cur.priority > def.priority) return null;
    const it = { ...def.build(st.n, payload), name, priority: def.priority, n: st.n };
    it.until = now + (it.duration ?? 1500);
    this.cur = it; return it;
  }
  active(now) {
    let guard = 0;
    while (this.cur && now >= this.cur.until && guard++ < 6) {
      const th = this.cur.then;
      this.cur = th ? { ...th, priority: this.cur.priority, name: this.cur.name, until: this.cur.until + (th.duration ?? 1500), fromChain: true } : null;
      if (this.cur && now >= this.cur.until) continue;
      if (this.cur) this.cur.fresh = true;
    }
    return this.cur;
  }
  /** Chèn intent từ nguồn ngoài (LLM). */
  inject(it, now) { const cur = this.active(now); if (cur && cur.priority > (it.priority ?? 5)) return null; const o = { name: 'llm', ...it, until: now + (it.duration ?? 2500) }; this.cur = o; return o; }
  cancel(name) { if (this.cur && (!name || this.cur.name === name)) this.cur = null; }
}
