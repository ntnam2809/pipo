// Lò xo thiếu tắt/tới hạn (semi-implicit Euler, chia bước nhỏ cho ổn định). Không đụng DOM.
export const MAX_STEP = 1 / 120;

/** Hệ số tắt từ độ cứng k và tỉ số tắt zeta (1 = tới hạn, <1 = thiếu tắt, có overshoot). */
export function dampingFor(k, zeta) { return 2 * zeta * Math.sqrt(k); }

/** Bước lò xo trên đối tượng {x, v}. */
export function springStep(s, target, k, zeta, dt) {
  if (!(dt > 0)) return s;
  if (dt > 0.1) dt = 0.1;
  const c = dampingFor(k, zeta);
  const n = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
  return s;
}

export class Spring {
  constructor(x = 0, k = 200, zeta = 0.7) { this.x = x; this.v = 0; this.k = k; this.zeta = zeta; }
  update(target, dt, k = this.k, zeta = this.zeta) { springStep(this, target, k, zeta, dt); return this.x; }
  snap(x) { this.x = x; this.v = 0; }
  settled(target, eps = 1e-3) { return Math.abs(this.x - target) < eps && Math.abs(this.v) < eps; }
}

/** Nhóm lò xo 2 chiều (vd. hướng nhìn). */
export class SpringVec {
  constructor(x = 0, y = 0, k = 200, zeta = 0.7) { this.sx = new Spring(x, k, zeta); this.sy = new Spring(y, k, zeta); }
  update(tx, ty, dt, k, zeta) { this.sx.update(tx, dt, k, zeta); this.sy.update(ty, dt, k, zeta); return this; }
  get x() { return this.sx.x; }
  get y() { return this.sy.x; }
}
