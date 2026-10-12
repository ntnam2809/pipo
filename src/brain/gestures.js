// Nhận diện cử chỉ chạm (thuần): nựng (vuốt qua lại), ôm (hai ngón giữ lâu).
export class StrokeDetector {
  constructor({ minTravel = 36, window = 2500 } = {}) { this.minTravel = minTravel; this.window = window; this.reset(); }
  reset() { this.dir = 0; this.ext = null; this.rev = []; }
  /** Đẩy điểm mới. Trả số lượt vuốt (>=3) mỗi khi có thêm một lượt đảo chiều, ngược lại 0. */
  push(x, t) {
    if (this.ext == null) { this.ext = x; return 0; }
    const d = x - this.ext;
    if (this.dir === 0) { if (Math.abs(d) >= this.minTravel) { this.dir = Math.sign(d); this.ext = x; } return 0; }
    if (Math.sign(d) === this.dir) { this.ext = x; return 0; }
    if (Math.abs(d) >= this.minTravel) {
      this.dir = -this.dir; this.ext = x; this.rev.push(t);
      this.rev = this.rev.filter((r) => t - r <= this.window);
      const strokes = this.rev.length + 1;
      return strokes >= 3 ? strokes : 0;
    }
    return 0;
  }
}
export class HugDetector {
  constructor(holdMs = 1200) { this.holdMs = holdMs; this.t0 = null; this.fired = false; }
  update(pointerCount, t) {
    if (pointerCount >= 2) { if (this.t0 == null) this.t0 = t; if (!this.fired && t - this.t0 >= this.holdMs) { this.fired = true; return true; } } else { this.t0 = null; this.fired = false; }
    return false;
  }
}
