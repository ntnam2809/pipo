// Renderer Canvas 2D: mắt tham số + mí cắt (clip), parallax, glow nửa độ phân giải, miệng nhỏ.
import { MOUTH_BASE_FRAC, MOUTH_DROP } from './mouth.js';

const BG = '#05070a';
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${Math.max(0, Math.min(100, l)).toFixed(1)}%,${a})`;

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

/** Dựng path cho hình đặc biệt; trả về {stroke:boolean, lw}. */
export function shapePath(ctx, shape, w, h, spin = 0) {
  ctx.beginPath();
  const hw = w / 2, hh = h / 2;
  switch (shape) {
    case 'heart': {
      const t = -hh * 0.9, b = hh * 1.0;
      ctx.moveTo(0, b);
      ctx.bezierCurveTo(-hw * 1.15, hh * 0.25, -hw * 1.05, t * 0.95, -hw * 0.5, t);
      ctx.bezierCurveTo(-hw * 0.2, t * 1.05, 0, t * 0.55, 0, t * 0.35);
      ctx.bezierCurveTo(0, t * 0.55, hw * 0.2, t * 1.05, hw * 0.5, t);
      ctx.bezierCurveTo(hw * 1.05, t * 0.95, hw * 1.15, hh * 0.25, 0, b);
      ctx.closePath(); return { stroke: false };
    }
    case 'star': {
      const R = Math.min(hw, hh) * 1.12, r = R * 0.5; const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R; pts.push([Math.cos(a) * rr, Math.sin(a) * rr + R * 0.06]); }
      for (let i = 0; i < 10; i++) { const p = pts[i], q = pts[(i + 1) % 10], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; i === 0 ? ctx.moveTo(m[0], m[1]) : null; const n = pts[(i + 1) % 10], nn = pts[(i + 2) % 10]; ctx.quadraticCurveTo(n[0], n[1], (n[0] + nn[0]) / 2, (n[1] + nn[1]) / 2); }
      ctx.closePath(); return { stroke: false };
    }
    case 'spiral': {
      const R = Math.min(hw, hh), turns = 2.6, n = 70;
      for (let i = 0; i <= n; i++) { const u = i / n; const a = u * turns * Math.PI * 2 + spin; const rr = u * R; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      return { stroke: true, lw: Math.min(hw, hh) * 0.2 };
    }
    case 'x': { const a = Math.min(hw, hh) * 0.75; ctx.moveTo(-a, -a); ctx.lineTo(a, a); ctx.moveTo(a, -a); ctx.lineTo(-a, a); return { stroke: true, lw: Math.min(hw, hh) * 0.3 }; }
    case 'arc': { const a = hw * 0.85, b = hh * 0.55; ctx.moveTo(-a, b); ctx.quadraticCurveTo(0, -b * 1.9, a, b); return { stroke: true, lw: Math.min(hw, 0.5) * Math.max(0.5, Math.min(hh * 0.55, hw)) * 0.9 + 3 }; }
    case 'line': { ctx.moveTo(-hw * 0.8, 0); ctx.lineTo(hw * 0.8, 0); return { stroke: true, lw: Math.max(4, Math.min(h, w) * 0.4) }; }
    case 'dot': { ctx.arc(0, 0, Math.min(hw, hh) * 0.35, 0, Math.PI * 2); return { stroke: false }; }
    default: rrect(ctx, -hw, -hh, w, h, 0); return { stroke: false };
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.glowC = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    this.glowX = this.glowC ? this.glowC.getContext('2d') : null;
    this.W = 300; this.H = 600; this.dpr = 1; this.geom = null; this.vig = null;
  }
  resize(cssW, cssH, dprIn = 1) {
    const dpr = Math.min(2, dprIn || 1);
    this.dpr = dpr; this.W = Math.max(1, cssW); this.H = Math.max(1, cssH);
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    if (this.glowC) { this.glowC.width = Math.max(1, Math.round(this.W / 2)); this.glowC.height = Math.max(1, Math.round(this.H / 2)); }
    this.vig = null;
  }

  /** Tính hình học (pixel CSS) cho khung hiện tại. */
  computeGeom(frame) {
    const { W, H } = this;
    const U = Math.min(W, H * 1.15), B = 0.32 * U, D = 0.44 * U;
    const cx = W / 2, cy = H * 0.42;
    const mk = (e, sx) => {
      const sc = e.shapeScale;
      const open = e.shape === 'normal' ? 1 - Math.min(1, e.lidTop) : 1;
      return { x: cx + sx * D / 2 + e.x * B * 0.6, y: cy + e.y * B * 0.6, w: e.w * B * sc, h: e.h * B * sc, open, e };
    };
    const L = mk(frame.L, -1), R = mk(frame.R, 1);
    const h0 = 1.35 * B;
    const mouthY = cy + (frame.L.y + frame.R.y) * 0.5 * B * 0.25 + MOUTH_DROP * h0 + 0.04 * h0;
    this.geom = { W, H, U, B, D, cx, cy, L, R, mouth: { x: cx, y: mouthY, base: MOUTH_BASE_FRAC * D }, color: { h: frame.hue, s: frame.sat, l: frame.light } };
    return this.geom;
  }

  draw(frame, fx, extras = {}) {
    const ctx = this.ctx, { W, H, dpr } = this;
    const g = this.computeGeom(frame);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    if (!this.vig) { const v = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.25, W / 2, H * 0.42, Math.max(W, H) * 0.8); v.addColorStop(0, 'rgba(10,16,24,0.0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); this.vig = v; }
    ctx.fillStyle = this.vig; ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (frame.roll) { ctx.translate(W / 2, H * 0.42); ctx.rotate(frame.roll); ctx.translate(-W / 2, -H * 0.42); }
    this._glow(ctx, frame, g);
    if (fx) fx.draw(ctx, g, 'back', frame);
    const gl = frame.fx.includes('glitch'); if (gl) this._fringe(ctx, frame, g);
    this._eye(ctx, frame, g, g.L, -1); this._eye(ctx, frame, g, g.R, 1);
    this._mouth(ctx, frame, g);
    if (gl) this._glitch(ctx, frame, g);
    if (fx) fx.draw(ctx, g, 'front', frame);
    ctx.restore();

    if (extras.say && extras.say.alpha > 0.02) this._say(ctx, extras.say, g);
    if (extras.dim > 0.01) { ctx.globalAlpha = Math.min(0.85, extras.dim); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  _glow(ctx, frame, g) {
    if (!this.glowX) return;
    const gx = this.glowX, c = this.glowC; gx.setTransform(1, 0, 0, 1, 0, 0); gx.clearRect(0, 0, c.width, c.height);
    const col = hsl(frame.hue, frame.sat, frame.light, 1);
    const OFF = 6000; gx.fillStyle = col; gx.shadowColor = col; gx.shadowBlur = Math.max(10, g.U * 0.09); gx.shadowOffsetX = OFF * 0.5; gx.shadowOffsetY = 0;
    for (const eye of [g.L, g.R]) {
      const e = eye.e; let top = -eye.h / 2 + Math.min(1, e.lidTop) * eye.h, bot = eye.h / 2 - e.lidBottom * eye.h * (1 - Math.max(0, e.lidBottomCurve) * 0.25);
      if (bot - top < eye.h * 0.05) { const m = (top + bot) / 2; top = m - eye.h * 0.025; bot = m + eye.h * 0.025; }
      gx.save(); gx.scale(0.5, 0.5); gx.translate(eye.x - OFF, eye.y); gx.rotate(e.tilt);
      if (e.shape === 'normal') { gx.beginPath(); rrect(gx, -eye.w / 2, top, eye.w, bot - top, e.radius * Math.min(eye.w, bot - top) / 2); gx.fill(); }
      else { const r = shapePath(gx, e.shape, eye.w, eye.h, e.spin); if (r.stroke) { gx.strokeStyle = col; gx.lineWidth = r.lw; gx.lineCap = 'round'; gx.lineJoin = 'round'; gx.stroke(); } else gx.fill(); }
      gx.restore();
    }
    const gm = frame.mouth; gx.save(); gx.scale(0.5, 0.5); gx.shadowBlur = g.U * 0.03; gx.globalAlpha = 0.4; gx.beginPath(); gx.arc(g.mouth.x - OFF, g.mouth.y, g.mouth.base * 0.4 * gm.mw, 0, 7); gx.fill(); gx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, 0.55 * (0.4 + 0.9 * (frame.L.glow + frame.R.glow) / 2));
    ctx.drawImage(c, 0, 0, this.W, this.H); ctx.restore();
  }

  _eye(ctx, frame, g, eye, side, flat) {
    const e = eye.e; const w = eye.w, h = eye.h; if (w < 1 || h < 1) return;
    const inner = -side; // mắt trái: phía trong = +x
    const { U } = g;
    const hue = (flat ? flat.h : frame.hue + e.hueShift), s = frame.sat, l = frame.light;
    const base = flat ? flat.c : hsl(hue, s, l), bright = hsl(hue, s, l + 16), rim = hsl(hue, s * 1.0, l - 26), deep = hsl(hue, s, l - 40);
    ctx.save();
    if (flat) ctx.globalAlpha = 0.85;
    ctx.translate(eye.x + (flat ? flat.dx : 0), eye.y); ctx.rotate(e.tilt);

    if (e.shape !== 'normal') {
      ctx.save(); const r = shapePath(ctx, e.shape, w, h, e.spin);
      if (r.stroke) { ctx.strokeStyle = flat ? base : bright; ctx.lineWidth = r.lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (!flat) { ctx.shadowColor = hsl(hue, s, l, 0.8); ctx.shadowBlur = U * 0.03; } ctx.stroke(); }
      else { if (flat) ctx.fillStyle = base; else { const gr = ctx.createRadialGradient(-w * 0.12, -h * 0.15, 1, 0, 0, Math.max(w, h) * 0.65); gr.addColorStop(0, hsl(hue, s, l + 20)); gr.addColorStop(0.6, base); gr.addColorStop(1, rim); ctx.fillStyle = gr; } ctx.fill(); }
      if (!flat && !r.stroke && e.shape !== 'dot') { ctx.clip(); this._highlights(ctx, frame, w, h, e, 0.8); }
      ctx.restore(); ctx.restore(); return;
    }

    // thân mắt + mặt nạ mí
    const op = 1 - Math.min(1, e.lidTop); if (op <= 0.015) { ctx.restore(); return; }
    ctx.beginPath(); rrect(ctx, -w / 2, -h / 2, w, h, e.radius * Math.min(w, h) / 2);
    if (!flat) { ctx.save(); }
    ctx.clip();
    // mí trên
    const a = e.lidTopAngle, base1 = -h / 2 + e.lidTop * (h + 0.5 * Math.abs(a) * h);
    const yIn = base1 - a * 0.5 * h, yOut = base1 + a * 0.5 * h;
    const slope = (inner * (yIn - yOut)) / w; // inner = +1 nghĩa là phía trong ở +x
    const yAt = (x) => base1 + slope * x; // inner side có y = yIn
    ctx.beginPath(); ctx.moveTo(-w, yAt(-w)); ctx.lineTo(w, yAt(w)); ctx.lineTo(w, h * 2); ctx.lineTo(-w, h * 2); ctx.closePath(); ctx.clip();
    // mí dưới (đường cong mắt cười)
    if (e.lidBottom > 0.01) {
      const yb = h / 2 - e.lidBottom * h; const d = e.lidBottomCurve * Math.min(1, e.lidBottom * 4) * h * 0.45;
      ctx.beginPath(); ctx.moveTo(-w, -h * 2); ctx.lineTo(w, -h * 2); ctx.lineTo(w, yb); ctx.lineTo(w / 2, yb); ctx.quadraticCurveTo(0, yb - 2 * d, -w / 2, yb); ctx.lineTo(-w, yb); ctx.closePath(); ctx.clip();
    }
    if (flat) { ctx.fillStyle = base; ctx.fillRect(-w, -h, w * 2, h * 2); ctx.restore(); return; }

    const px = e.pupilX, py = e.pupilY; const par = frame.parallax;
    // lớp 2: khối cầu (gradient lệch theo hướng nhìn)
    const gr = ctx.createRadialGradient(px * w * 0.18, py * h * 0.14 - h * 0.05, 1, px * w * 0.08, py * h * 0.06, Math.max(w, h) * 0.78);
    gr.addColorStop(0, hsl(hue, s, l + 22)); gr.addColorStop(0.45, base); gr.addColorStop(0.85, rim); gr.addColorStop(1, deep);
    ctx.fillStyle = gr; ctx.fillRect(-w, -h, w * 2, h * 2);
    // ánh dội ở đáy (cảm giác thủy tinh)
    const bl = ctx.createRadialGradient(-par.x * w * 0.05, h * 0.5, 1, 0, h * 0.5, w * 0.6);
    bl.addColorStop(0, hsl(hue, s, l + 26, 0.38)); bl.addColorStop(1, hsl(hue, s, l + 26, 0));
    ctx.fillStyle = bl; ctx.fillRect(-w, 0, w * 2, h);
    // lớp 3: đồng tử + vân mống
    if (frame.style === 'pupil' && e.pupil > 0.01) {
      const pr = e.pupil * Math.min(w, h) * 0.5; const cx = px * w * 0.22, cy = py * h * 0.2;
      ctx.strokeStyle = hsl(hue, s, l + 24, 0.22); ctx.lineWidth = 1.2;
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, pr * (1 + i * 0.28), pr * (1 + i * 0.28), 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#04080c'; ctx.beginPath(); ctx.ellipse(cx, cy, pr, pr, 0, 0, 7); ctx.fill();
    }
    // lớp 4: highlight, trượt ngược chiều nghiêng
    this._highlights(ctx, frame, w, h, e, e.shine);
    // chữ số khi hiện giờ
    if (frame.clock) {
      ctx.fillStyle = 'rgba(2,10,16,0.88)'; ctx.font = `800 ${Math.round(h * 0.55)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(frame.clock[side < 0 ? 0 : 1] || '', 0, h * 0.02);
    }
    ctx.restore(); ctx.restore();
  }

  _highlights(ctx, frame, w, h, e, shine) {
    if (shine < 0.02) return; const par = frame.parallax;
    const ox = -par.x * w * 0.12 + e.pupilX * w * 0.06, oy = -Math.max(-1, Math.min(1, par.y)) * h * 0.1 + e.pupilY * h * 0.05;
    const rr = Math.min(w, h);
    ctx.fillStyle = `rgba(255,255,255,${0.92 * shine})`;
    ctx.beginPath(); ctx.ellipse(-w * 0.2 + ox, -h * 0.22 + oy, rr * 0.17, rr * 0.2, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.7 * shine})`;
    ctx.beginPath(); ctx.arc(w * 0.2 + ox * 1.4, h * 0.2 + oy * 1.4, rr * 0.065, 0, 7); ctx.fill();
  }

  _fringe(ctx, frame, g) { // tách kênh màu: viền đỏ/xanh lệch hai bên (vẽ dưới mắt chính)
    const jit = g.U * 0.035 * (0.6 + 0.4 * Math.sin(frame.t * 90));
    for (const [c, dx] of [['hsl(0,100%,55%)', -jit], ['hsl(225,100%,62%)', jit]]) { this._eye(ctx, frame, g, g.L, -1, { c, h: 0, dx }); this._eye(ctx, frame, g, g.R, 1, { c, h: 0, dx }); }
  }

  _glitch(ctx, frame, g) {
    const t = frame.t;
    // dải ngang lệch
    const cv = this.canvas, d = this.dpr;
    for (let i = 0; i < 4; i++) {
      const y = g.cy + (Math.sin(t * 40 + i * 7.3) * 0.6) * g.B, hh = g.B * (0.06 + 0.06 * ((i * 37) % 3)), off = Math.sin(t * 55 + i * 2.1) * g.U * 0.06;
      ctx.drawImage(cv, 0, y * d, cv.width, hh * d, off, y, this.W, hh);
    }
  }

  _mouth(ctx, frame, g) {
    const m = frame.mouth; const k = m.shapeScale; if (k < 0.02) return;
    const u = g.mouth.base * m.mw; const a = u / 2; const t = frame.t;
    const hue = frame.hue, s = frame.sat, l = frame.light;
    const col = hsl(hue, s, l + 4, 0.92), dark = hsl(hue, s * 0.6, 7, 0.96);
    const lw = Math.max(3, g.U * 0.017);
    const jit = (n) => (m.wobble > 0.02 ? Math.sin(t * (50 + n * 13) + n) * m.wobble * a * 0.07 : 0);
    ctx.save(); ctx.translate(g.mouth.x + m.mx * a * 0.6 + jit(1), g.mouth.y + m.my * a * 0.6 + jit(2)); ctx.scale(k, k);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
    ctx.shadowColor = hsl(hue, s, l, 0.5); ctx.shadowBlur = g.U * 0.018;
    const c = m.curve, sk = m.skew, op = m.open;
    const yl = -c * a * 0.38 + sk * a * 0.4, yr = -c * a * 0.38 - sk * a * 0.4; // y hai khóe (curve>0: khóe nâng)
    const tongue = (x, y, sz) => { if (m.tongue < 0.05) return; ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = 'hsl(350,85%,68%)'; ctx.beginPath(); ctx.ellipse(x, y + sz * 0.25 * m.tongue, sz * 0.55, sz * 0.7 * m.tongue, 0, 0, 7); ctx.fill(); ctx.restore(); };
    switch (m.shape) {
      case 'line': case 'smile': {
        const ctrl = c * a * 0.95 + (yl + yr) / 2;
        ctx.beginPath(); ctx.moveTo(-a, yl + jit(3)); ctx.quadraticCurveTo(0, ctrl * 2 - (yl + yr) / 2 + jit(4), a, yr + jit(5));
        if (op > 0.04) {
          const dep = op * a * 1.25; ctx.save(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-a, yl); ctx.quadraticCurveTo(0, (yl + yr) / 2 + dep * 2 + c * a * 0.3, a, yr);
          ctx.quadraticCurveTo(0, ctrl * 2 - (yl + yr) / 2 + 0, -a, yl); ctx.closePath(); ctx.fillStyle = dark; ctx.fill(); ctx.stroke(); ctx.restore();
          tongue(0, (yl + yr) / 2 + dep * 0.9, a * 0.45);
        } else { ctx.stroke(); tongue(a * 0.25, (yl + yr) / 2 + c * a * 0.5 + lw * 0.8, a * 0.35); }
        break;
      }
      case 'cat': {
        const r = a * 0.5, dy = Math.max(0.15, 0.55 + c * 0.45); ctx.save(); ctx.translate(0, -a * 0.1); ctx.scale(1, dy + op * 0.2);
        ctx.beginPath(); ctx.arc(-r, 0, r, 0.05, Math.PI - 0.05); ctx.moveTo(2 * r, 0); ctx.arc(r, 0, r, 0.05, Math.PI - 0.05); ctx.restore();
        ctx.stroke(); tongue(r * 0.1, a * 0.38, a * 0.32); break;
      }
      case 'o': {
        const ry = a * (0.16 + 0.8 * op), rxWide = a * (0.9 + 0.2 * op); const rx = Math.max(a * 0.22, rxWide + (ry - rxWide) * m.round);
        ctx.beginPath(); ctx.ellipse(0, ry * 0.15, rx, ry, 0, 0, 7); ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = dark; ctx.fill(); ctx.restore(); ctx.stroke(); tongue(0, ry * 0.55, rx * 0.8); break;
      }
      case 'triangle': {
        const hh = a * (0.25 + 1.0 * op), wt = a * 1.05;
        ctx.beginPath(); ctx.moveTo(-wt, -hh * 0.35); ctx.quadraticCurveTo(0, -hh * 0.55, wt, -hh * 0.35); ctx.quadraticCurveTo(wt * 0.55, hh * 1.0, 0, hh * 0.95); ctx.quadraticCurveTo(-wt * 0.55, hh * 1.0, -wt, -hh * 0.35); ctx.closePath();
        ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = dark; ctx.fill(); ctx.restore(); ctx.stroke(); tongue(0, hh * 0.55, wt * 0.55); break;
      }
      case 'zigzag': {
        const n = 6, amp = a * (0.25 + 0.45 * op); ctx.beginPath();
        for (let i = 0; i <= n; i++) { const x = -a + (2 * a * i) / n, y = (i % 2 ? amp : -amp) * 0.6 + jit(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); tongue(0, amp * 0.8, a * 0.3); break;
      }
      case 'dot': ctx.beginPath(); ctx.arc(0, 0, Math.max(lw * 0.9, a * 0.22), 0, 7); ctx.fill(); break;
    }
    ctx.restore();
  }

  _say(ctx, say, g) {
    const fs = Math.max(13, g.U * 0.045); ctx.save();
    ctx.font = `600 ${fs}px system-ui, sans-serif`; const tw = Math.min(g.W - 24, ctx.measureText(say.text).width + fs * 1.6); const bh = fs * 1.9;
    const x = g.W / 2 - tw / 2, y = Math.min(g.H - bh - 16, g.mouth.y + g.U * 0.14);
    ctx.globalAlpha = Math.min(1, say.alpha) * 0.9; ctx.fillStyle = 'rgba(20,28,38,0.92)'; ctx.strokeStyle = hsl(g.color.h, g.color.s, g.color.l, 0.6); ctx.lineWidth = 1.5;
    ctx.beginPath(); rrect(ctx, x, y, tw, bh, bh / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hsl(g.color.h, 30, 90); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(say.text, g.W / 2, y + bh / 2 + 1, tw - fs);
    ctx.restore();
  }
}
