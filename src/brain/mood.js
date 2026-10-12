// Tâm trạng liên tục: valence (-1..1) + arousal (0..1); chọn biểu cảm nền theo vùng.
import { circadian } from './needs.js';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const NEED_EXPR = { hunger: 'hungry', thirst: 'thirsty', energy: 'sleepy' };

export class Mood {
  constructor() { this.valence = 0.2; this.arousal = 0.3; this.vb = 0; this.ab = 0; }
  /** Sự kiện đẩy tâm trạng; tự trôi về 0 sau chục giây. */
  bump(dv = 0, da = 0) { this.vb = clamp(this.vb + dv, -1, 1); this.ab = clamp(this.ab + da, -1, 1); }
  update(dt, needs, hour = 12) {
    const base = (needs.mean() - 0.5) * 1.8;
    const tv = clamp(base + this.vb, -1, 1);
    const night = circadian(hour);
    const ta = clamp(0.35 + this.ab + (needs.get('energy') - 0.6) * 0.4 - night * 0.3, 0, 1);
    const k = 1 - Math.exp(-dt / 6);
    this.valence += (tv - this.valence) * k; this.arousal += (ta - this.arousal) * k;
    const dec = Math.exp(-dt / 18); this.vb *= dec; this.ab *= dec;
  }
}

/** Biểu cảm nền theo vùng valence/arousal. */
export function pickBase(valence, arousal) {
  if (valence > 0.7 && arousal > 0.6) return 'joy';
  if (valence > 0.3) return arousal > 0.45 ? 'happy' : 'happy';
  if (valence > -0.15) return arousal < 0.2 ? 'bored' : 'neutral';
  if (valence > -0.5) return arousal < 0.35 ? 'sad' : 'annoyed';
  return arousal < 0.45 ? 'sad' : 'annoyed';
}

/** Chèn biểu cảm của nhu cầu thấp theo chu kỳ (24 s, 5 s mỗi lần). Trả null nếu chưa tới lượt. */
export function needCue(needs, tSec, hour = 12) {
  const eff = { ...needs.snapshot() };
  eff.energy = clamp(eff.energy - 0.4 * circadian(hour), 0, 1);
  const lows = ['hunger', 'thirst', 'energy'].filter((k) => eff[k] < 0.3).sort((a, b) => eff[a] - eff[b]);
  if (!lows.length) return null;
  const slot = Math.floor(tSec / 24), ph = tSec - slot * 24;
  if (ph > 5.5) return null;
  return NEED_EXPR[lows[slot % lows.length]];
}
