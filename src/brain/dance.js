// DanceDirector: biến trạng thái nhịp (BeatTracker) thành điệu nhảy: chú ý -> nhảy -> thỏa mãn. Thuần logic.
// update(dt, beatState, { energyNeed, asleep }) -> { active, phaseName, entered, moveId, expression, intensity, fx, lookSeq, dance }
//   dance = { phase, bpm, energy, beatIndex, move } (cùng pha nhạc; bpm > 140 thì nhảy nửa tốc) -> Body.update.
export const NOTICE_SEC = 1.2, OUTRO_SEC = 1.5, MOVE_BEATS = 8;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const NOTICE_LOOK = [{ t: 0, x: -0.7, y: -0.2 }, { t: 450, x: 0.7, y: -0.1 }, { t: 900, x: 0, y: -0.4 }];
const IDLE = Object.freeze({ active: false, phaseName: 'idle', entered: null, moveId: null, expression: null, intensity: 1, fx: [], lookSeq: null, dance: null });

export class DanceDirector {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng; this.phaseName = 'idle'; this.t = 0; this.move = 'bob'; this.movesInRow = 0;
    this.beatsInMove = 0; this.lastBeat = null; this.energy = 0.5;
  }

  _enter(name) { this.phaseName = name; this.t = 0; return name; }

  _pickMove(energy, lowNeed) {
    if (lowNeed) return 'bob';
    const pool = ['bob', 'sway', 'step', 'tilt']; if (energy > 0.6) pool.push('hype', 'hype');
    const cand = pool.filter((m) => m !== this.move);
    return cand[Math.floor(this.rng() * cand.length) % cand.length];
  }

  update(dt, bs, opts = {}) {
    const needE = opts.energyNeed ?? 1, asleep = !!opts.asleep, music = !!(bs && bs.isMusic) && !asleep;
    dt = clamp(Number(dt) || 0, 0, 0.1); this.t += dt;
    let entered = null;
    if (asleep) { if (this.phaseName !== 'idle') entered = this._enter('idle'); }
    else if (this.phaseName === 'idle') { if (music) entered = this._enter('notice'); }
    else if (this.phaseName === 'notice') {
      if (!music) entered = this._enter('idle');
      else if (this.t >= NOTICE_SEC) { entered = this._enter('dance'); this.lastBeat = bs.beatIndex; this.beatsInMove = 0; this.move = 'bob'; this.movesInRow = 0; }
    } else if (this.phaseName === 'dance') { if (!music) entered = this._enter('outro'); }
    else if (this.phaseName === 'outro') {
      if (music) { entered = this._enter('dance'); this.lastBeat = bs.beatIndex; }
      else if (this.t >= OUTRO_SEC) entered = this._enter('idle');
    }
    if (this.phaseName === 'idle') return { ...IDLE, entered };
    const base = { active: true, phaseName: this.phaseName, entered, moveId: null, intensity: 1, fx: [], lookSeq: null, dance: null };
    if (this.phaseName === 'notice') return { ...base, expression: 'curious', fx: ['question'], lookSeq: NOTICE_LOOK };
    if (this.phaseName === 'outro') return { ...base, expression: 'happy' };

    // ---- nhảy ----
    const lowNeed = needE < 0.2;
    this.energy += ((bs.energy ?? 0.5) - this.energy) * (1 - Math.exp(-dt / 0.6));
    let bpm = bs.bpm > 0 ? bs.bpm : 120, bi = bs.beatIndex | 0, ph = clamp(bs.phase ?? 0, 0, 1);
    if (bpm > 140) { ph = ((bi & 1) + ph) / 2; bi >>= 1; bpm /= 2; }          // nhảy nửa tốc
    if (this.lastBeat !== bi) { if (this.lastBeat != null && bi > this.lastBeat) this.beatsInMove += bi - this.lastBeat; this.lastBeat = bi; }
    if (this.beatsInMove >= MOVE_BEATS || (lowNeed && this.move !== 'bob')) { this.move = this._pickMove(this.energy, lowNeed); this.beatsInMove = 0; this.movesInRow++; if (!entered) entered = 'move'; }
    const energy = lowNeed ? 0.15 + 0.15 * this.energy : clamp(0.25 + 0.75 * this.energy, 0, 1);
    return {
      ...base, moveId: this.move, expression: lowNeed ? 'sleepy' : 'groove', intensity: lowNeed ? 0.7 : 1,
      dance: { phase: ph, bpm, energy, beatIndex: bi, move: this.move },
    };
  }
}
