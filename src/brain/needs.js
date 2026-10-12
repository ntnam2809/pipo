// Nhu cầu 0..1 (1 = đủ). Decay theo thời gian thực; resume có sàn 0.15.
export const NEED_KEYS = ['hunger', 'thirst', 'energy', 'affection', 'fun'];
// số giờ để đi từ 1 về 0.3
export const HOURS_TO_LOW = { hunger: 6, thirst: 4, affection: 5, fun: 3 };
export const RESUME_FLOOR = 0.15;
export const LIVE_FLOOR = 0.05;
const rate = (k) => 0.7 / (HOURS_TO_LOW[k] * 3600); // đơn vị / giây

/** Độ buồn ngủ theo giờ: 0 ban ngày, 1 đêm khuya. */
export function circadian(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h < 20) return 0;
  if (h >= 20) return Math.min(1, (h - 20) / 3.5);
  if (h < 5) return 1;
  return 1 - (h - 5) / 2;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Needs {
  constructor(saved) {
    this.v = { hunger: 0.8, thirst: 0.8, energy: 0.9, affection: 0.7, fun: 0.7 };
    if (saved && typeof saved === 'object') for (const k of NEED_KEYS) if (Number.isFinite(saved[k])) this.v[k] = clamp01(saved[k]);
  }
  get(k) { return this.v[k]; }
  snapshot() { return { ...this.v }; }
  set(k, x) { if (k in this.v) this.v[k] = clamp01(x); }
  add(k, d) { if (k in this.v) this.v[k] = clamp01(this.v[k] + d); }
  /** Tiến thời gian thực khi app đang chạy. */
  tick(dtSec, { sleeping = false, hour = 12 } = {}) {
    for (const k of Object.keys(HOURS_TO_LOW)) this.v[k] = Math.max(Math.min(this.v[k], LIVE_FLOOR), this.v[k] - rate(k) * dtSec);
    const night = circadian(hour);
    if (sleeping) this.v.energy = clamp01(this.v.energy + (0.7 / 7200) * dtSec);
    else this.v.energy = Math.max(Math.min(this.v.energy, LIVE_FLOOR), this.v.energy - (0.7 / (12 * 3600)) * (1 + night * 0.8) * dtSec);
  }
  /** Mở app lại sau elapsedMs: vẫn decay nhưng chặn sàn 0.15 (không bao giờ kéo thấp hơn mức đang có nếu đã < 0.15). */
  resume(elapsedMs) {
    if (!(elapsedMs > 0)) return;
    const s = elapsedMs / 1000;
    for (const k of Object.keys(HOURS_TO_LOW)) this.v[k] = Math.max(this.v[k] - rate(k) * s, Math.min(this.v[k], RESUME_FLOOR));
    if (s > 4 * 3600) this.v.energy = Math.max(this.v.energy, 0.8);
    else this.v.energy = Math.max(this.v.energy - (0.7 / (12 * 3600)) * s * 0.5, Math.min(this.v.energy, RESUME_FLOOR));
  }
  /** Nhu cầu thấp nhất dưới ngưỡng. */
  lows(th = 0.3) {
    return ['hunger', 'thirst', 'energy', 'affection', 'fun'].filter((k) => this.v[k] < th).sort((a, b) => this.v[a] - this.v[b]);
  }
  mean() { return (this.v.hunger + this.v.thirst + this.v.affection + this.v.fun) / 4; }
}
