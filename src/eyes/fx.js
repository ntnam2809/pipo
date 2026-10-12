// Hạt & phụ kiện: tim, sao, nước mắt, mồ hôi, Zzz, ?, !, má hồng, kính râm, ô, bong bóng, vụn, vết giận...
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)},${s}%,${l}%,${a})`;
const TAU = Math.PI * 2;

// phụ kiện "pop" (hiện/ẩn mượt bằng lò xo đơn giản)
const POPS = ['blush', 'sunglasses', 'umbrella', 'anger', 'question', 'exclaim', 'scan', 'orbit', 'drop'];

export class FX {
  constructor(rng = Math.random) {
    this.rng = rng; this.p = []; this.tm = {}; this.pop = {}; this.vel = {}; this.t = 0; this.active = new Set();
    for (const k of POPS) { this.pop[k] = 0; this.vel[k] = 0; }
  }
  _emit(key, every, dt, fn) {
    this.tm[key] = (this.tm[key] ?? every * this.rng()) - dt;
    if (this.tm[key] <= 0) { this.tm[key] += every * (0.7 + 0.6 * this.rng()); fn(); }
  }
  add(o) { this.p.push({ age: 0, ay: 0, vx: 0, vy: 0, rot: 0, vr: 0, a: 1, ...o }); if (this.p.length > 240) this.p.shift(); }
  burst(name, geom, n = 6) { // phát một lần (vd. vụn khi cắn)
    if (name === 'crumbs') for (let i = 0; i < n; i++) this._crumb(geom);
    if (name === 'hearts') for (let i = 0; i < n; i++) this._heart(geom);
    if (name === 'sparkles') for (let i = 0; i < n; i++) this._spark(geom);
  }
  _heart(g) { const e = this.rng() < 0.5 ? g.L : g.R; this.add({ type: 'heart', x: e.x + (this.rng() - 0.5) * e.w, y: e.y - e.h * 0.4, vy: -g.U * 0.16, vx: (this.rng() - 0.5) * g.U * 0.05, life: 1.9, size: g.U * (0.035 + 0.04 * this.rng()), hue: 340 + this.rng() * 20, ph: this.rng() * TAU }); }
  _spark(g) { const a = this.rng() * TAU, d = g.D * (0.3 + 0.55 * this.rng()); this.add({ type: 'spark', x: g.cx + Math.cos(a) * d * 1.05, y: g.cy + Math.sin(a) * g.B * (0.55 + 0.35 * this.rng()), life: 0.8, size: g.U * (0.02 + 0.03 * this.rng()), hue: 45 + this.rng() * 30 }); }
  _crumb(g) { const m = g.mouth; const sd = this.rng() < 0.5 ? -1 : 1; this.add({ type: 'crumb', x: m.x + sd * m.base * 0.5, y: m.y, vx: sd * g.U * (0.05 + 0.1 * this.rng()), vy: -g.U * (0.1 + 0.12 * this.rng()), ay: g.U * 1.6, life: 0.9, size: g.U * (0.008 + 0.008 * this.rng()), hue: 28 + this.rng() * 14, rot: this.rng() * TAU, vr: (this.rng() - 0.5) * 12 }); }

  update(dt, frame, g) {
    dt = Math.min(dt, 0.05); this.t += dt; const t = this.t;
    if (!g) return;
    const on = new Set(frame.fx); this.active = on;
    const eyeOpen = (e) => e.open;
    if (on.has('hearts')) this._emit('hearts', 0.4, dt, () => this._heart(g));
    if (on.has('sparkles')) this._emit('spark', 0.13, dt, () => this._spark(g));
    if (on.has('tears')) for (const [k, e, s] of [['tL', g.L, -1], ['tR', g.R, 1]]) this._emit(k, 0.55, dt, () => this.add({ type: 'tear', x: e.x + s * e.w * 0.18, y: e.y + e.h * 0.32, vy: g.U * 0.04, ay: g.U * 1.5, life: 1.4, size: g.U * 0.03, ph: s }));
    if (on.has('sweat')) this._emit('sweat', 1.3, dt, () => this.add({ type: 'tear', sweat: true, x: g.R.x + g.R.w * 0.52, y: g.R.y - g.R.h * 0.42, vy: g.U * 0.03, ay: g.U * 0.35, life: 1.3, size: g.U * 0.032 }));
    if (on.has('zzz')) this._emit('zzz', 1.5, dt, () => this.add({ type: 'z', x: g.R.x + g.R.w * 0.5, y: g.R.y - g.R.h * 0.25, vx: g.U * 0.045, vy: -g.U * 0.075, life: 2.7, size: g.U * 0.05 }));
    if (on.has('sleepbubble')) this._emit('sbub', 4.5, dt, () => this.add({ type: 'sbub', x: g.mouth.x + g.mouth.base * 0.3, y: g.mouth.y - g.U * 0.01, vx: 0, vy: -g.U * 0.01, life: 3.2, size: g.U * 0.05 }));
    if (on.has('bubbles')) this._emit('bub', 0.28, dt, () => this.add({ type: 'bubble', x: g.mouth.x + (this.rng() - 0.5) * g.mouth.base * 0.6, y: g.mouth.y - g.U * 0.01, vy: -g.U * (0.08 + 0.08 * this.rng()), vx: 0, life: 1.8, size: g.U * (0.012 + 0.022 * this.rng()), ph: this.rng() * TAU }));
    if (on.has('crumbs')) this._emit('crumb', 0.14, dt, () => this._crumb(g));
    if (on.has('coldbreath')) this._emit('puff', 0.9, dt, () => this.add({ type: 'puff', x: g.mouth.x + g.U * 0.02, y: g.mouth.y + g.U * 0.03, vx: -g.U * 0.03, vy: -g.U * 0.045, life: 1.8, size: g.U * 0.025 }));
    if (on.has('umbrella')) this._emit('rain', 0.035, dt, () => this.add({ type: 'rain', x: this.rng() * g.W, y: -10, vy: g.U * (1.0 + 0.5 * this.rng()), vx: -g.U * 0.12, life: 1.3, size: g.U * 0.03 }));
    if (on.has('glitch')) this._emit('gl', 0.06, dt, () => this.add({ type: 'gblock', x: g.cx + (this.rng() - 0.5) * g.U * 0.9, y: g.cy + (this.rng() - 0.5) * g.B * 1.5, life: 0.12, size: g.U * (0.02 + 0.06 * this.rng()), hue: this.rng() < 0.5 ? 180 : 310 }));
    for (const k of POPS) { // lò xo overshoot nhẹ
      const target = on.has(k) ? 1 : 0; this.vel[k] += ((target - this.pop[k]) * 220 - this.vel[k] * 17) * dt; this.pop[k] += this.vel[k] * dt;
    }
    void eyeOpen;
    for (const q of this.p) {
      q.age += dt; q.vy += q.ay * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.type === 'heart' || q.type === 'bubble') q.x += Math.sin(q.age * 3 + q.ph) * g.U * 0.04 * dt;
    }
    this.p = this.p.filter((q) => q.age < q.life);
  }

  draw(ctx, g, layer, frame) {
    if (!g) return;
    ctx.save();
    if (layer === 'back') { this._popsBack(ctx, g); this._particles(ctx, g, true); }
    else { this._popsFront(ctx, g, frame); this._particles(ctx, g, false); }
    ctx.restore();
  }

  _particles(ctx, g, back) {
    for (const q of this.p) {
      const isBack = q.type === 'rain' ? false : q.type === 'puff';
      if (back !== isBack) continue;
      const u = q.age / q.life, fade = u < 0.12 ? u / 0.12 : u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1;
      ctx.save(); ctx.globalAlpha = fade * (q.a ?? 1); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      const s = q.size;
      switch (q.type) {
        case 'heart': { const sc = 0.7 + 0.3 * Math.min(1, u * 5); ctx.scale(sc, sc); ctx.fillStyle = hsl(q.hue, 90, 66); ctx.shadowColor = hsl(q.hue, 90, 60, 0.8); ctx.shadowBlur = s * 0.8; heart(ctx, s); break; }
        case 'spark': { const sc = Math.sin(Math.PI * u); ctx.scale(sc, sc); ctx.fillStyle = hsl(q.hue, 100, 80); ctx.shadowColor = hsl(q.hue, 100, 70); ctx.shadowBlur = s; sparkle(ctx, s); break; }
        case 'tear': { ctx.fillStyle = q.sweat ? 'rgba(190,225,255,0.85)' : 'rgba(150,210,255,0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; drop(ctx, s); ctx.fill(); ctx.stroke(); break; }
        case 'z': { ctx.scale(0.6 + u * 0.9, 0.6 + u * 0.9); ctx.rotate(-0.2); ctx.fillStyle = 'rgba(190,215,255,0.95)'; ctx.font = `800 ${s * 1.6}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Z', 0, 0); break; }
        case 'sbub': { const r = s * (0.5 + 0.7 * Math.min(1, u * 1.2)); ctx.strokeStyle = 'rgba(190,230,255,0.8)'; ctx.fillStyle = 'rgba(190,230,255,0.15)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, u > 0.9 ? r * 1.3 : r, 0, TAU); ctx.fill(); ctx.stroke(); shineDot(ctx, r); break; }
        case 'bubble': { const r = s * (u > 0.85 ? 1 + (u - 0.85) * 4 : 1); ctx.strokeStyle = 'rgba(190,235,255,0.85)'; ctx.fillStyle = 'rgba(170,225,255,0.18)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke(); shineDot(ctx, r); break; }
        case 'crumb': { ctx.fillStyle = hsl(q.hue, 60, 55); ctx.fillRect(-s, -s, s * 2, s * 1.6); break; }
        case 'puff': { const r = s * (1 + u * 2.6); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(235,245,255,0.55)'); gr.addColorStop(1, 'rgba(235,245,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); break; }
        case 'rain': { ctx.rotate(0.12); ctx.strokeStyle = 'rgba(160,200,255,0.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); break; }
        case 'gblock': { ctx.rotate(-q.rot); ctx.globalAlpha = 0.8; ctx.fillStyle = hsl(q.hue, 100, 60); ctx.fillRect(0, 0, s * 2.5, s * 0.35); break; }
      }
      ctx.restore();
    }
  }

  _popsBack(ctx, g) {
    const bl = this.pop.blush;
    if (bl > 0.02) for (const e of [g.L, g.R]) {
      const s = Math.max(0, bl), r = g.B * 0.4 * s, x = e.x + (e === g.L ? -1 : 1) * g.B * 0.12, y = e.y + e.h * 0.5 + g.B * 0.02;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5); gr.addColorStop(0, 'rgba(255,100,140,0.6)'); gr.addColorStop(1, 'rgba(255,100,140,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,170,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.5 - r * 0.12, y + r * 0.28); ctx.lineTo(x + i * r * 0.5 + r * 0.12, y - r * 0.28); ctx.stroke(); }
    }
    if (this.active.has('tears')) for (const e of [g.L, g.R]) { ctx.fillStyle = 'rgba(140,200,255,0.18)'; ctx.fillRect(e.x - 1.5, e.y + e.h * 0.35, 3, g.U * 0.08); }
  }

  _popsFront(ctx, g, frame) {
    const P = this.pop, t = this.t;
    if (P.sunglasses > 0.02) {
      const s = P.sunglasses, dy = (1 - s) * -g.U * 0.35; ctx.save(); ctx.translate(0, dy);
      const lw = g.B * 1.3, lh = g.B * 0.9;
      for (const e of [g.L, g.R]) {
        const x = e.x, y = e.y - g.B * 0.02;
        ctx.beginPath(); ctx.moveTo(x - lw / 2, y - lh * 0.4); ctx.lineTo(x + lw / 2, y - lh * 0.4); ctx.quadraticCurveTo(x + lw * 0.52, y + lh * 0.7, x, y + lh * 0.6); ctx.quadraticCurveTo(x - lw * 0.52, y + lh * 0.7, x - lw / 2, y - lh * 0.4); ctx.closePath();
        const gr = ctx.createLinearGradient(x, y - lh * 0.4, x, y + lh * 0.6); gr.addColorStop(0, '#1b2230'); gr.addColorStop(1, '#05070a'); ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = '#2d3646'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(x - lw * 0.3, y - lh * 0.3); ctx.lineTo(x - lw * 0.05, y - lh * 0.3); ctx.lineTo(x - lw * 0.28, y + lh * 0.25); ctx.lineTo(x - lw * 0.42, y + lh * 0.25); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#2d3646'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(g.L.x + g.B * 0.62, g.L.y - g.B * 0.25); ctx.quadraticCurveTo(g.cx, g.cy - g.B * 0.45, g.R.x - g.B * 0.62, g.R.y - g.B * 0.25); ctx.stroke();
      const gl = (t * 0.7) % 3; if (gl < 1) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; sparklePos(ctx, g.L.x + lw * 0.3, g.L.y - lh * 0.2, g.B * 0.1 * Math.sin(Math.PI * gl)); }
      ctx.restore();
    }
    if (P.umbrella > 0.02) {
      const s = P.umbrella, cy = g.cy - g.B * 1.42 - (1 - s) * g.U * 0.3, r = g.D * 0.95;
      ctx.save(); ctx.translate(g.cx, cy); ctx.rotate(Math.sin(t * 1.3) * 0.03);
      ctx.fillStyle = hsl(frame.hue, 70, 55); ctx.strokeStyle = hsl(frame.hue, 80, 80); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(-r * 0.95, -r * 0.85, 0, -r * 0.85); ctx.quadraticCurveTo(r * 0.95, -r * 0.85, r, 0);
      const n = 4; for (let i = 0; i < n; i++) { const x0 = r - (2 * r * i) / n, x1 = r - (2 * r * (i + 1)) / n; ctx.quadraticCurveTo((x0 + x1) / 2, r * 0.22, x1, 0); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.quadraticCurveTo(-r * 0.45, -r * 0.4, -r * 0.5, 0); ctx.moveTo(0, -r * 0.85); ctx.quadraticCurveTo(r * 0.45, -r * 0.4, r * 0.5, 0); ctx.stroke();
      ctx.strokeStyle = '#9aa7b8'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 0.2); ctx.arc(-r * 0.09, r * 0.2, r * 0.09, 0, Math.PI); ctx.stroke();
      ctx.restore();
    }
    if (P.anger > 0.02) {
      const e = g.R, s = P.anger * (1 + 0.12 * Math.sin(t * 14)), r = g.B * 0.22 * s; ctx.save(); ctx.translate(e.x + e.w * 0.5, e.y - e.h * 0.58); ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = Math.max(3, r * 0.3); ctx.lineCap = 'round'; ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = r * 0.6;
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.25, sy * r * 0.9); ctx.quadraticCurveTo(sx * r * 0.25, sy * r * 0.25, sx * r * 0.9, sy * r * 0.25); ctx.stroke(); }
      ctx.restore();
    }
    if (P.question > 0.02 || P.exclaim > 0.02) {
      const q = P.question > P.exclaim; const s = q ? P.question : P.exclaim; const bob = Math.sin(t * (q ? 3 : 14)) * g.B * (q ? 0.06 : 0.03);
      const x = q ? g.R.x + g.R.w * 0.35 : g.cx, y = g.cy - g.B * (q ? 1.15 : 1.1) + bob - (1 - s) * g.B * 0.4;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(q ? 0.2 : 0); ctx.font = `900 ${g.B * 0.85}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = q ? 'hsl(200,90%,75%)' : 'hsl(48,100%,60%)'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = g.B * 0.25; ctx.fillText(q ? '?' : '!', 0, 0); ctx.restore();
    }
    if (P.orbit > 0.02) for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * TAU) / 3, x = g.cx + Math.cos(a) * g.D * 0.75, y = g.cy - g.B * 1.0 + Math.sin(a) * g.B * 0.16;
      ctx.fillStyle = hsl(50 + i * 25, 100, 72, 0.95 * P.orbit); ctx.save(); ctx.translate(x, y); ctx.rotate(a); sparkle(ctx, g.B * 0.13); ctx.restore();
    }
    if (P.scan > 0.02) {
      const u = (t % 1.3) / 1.3, y = g.cy - g.B * 0.5 + u * g.B; ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const x0 = g.L.x - g.L.w * 0.7, x1 = g.R.x + g.R.w * 0.7; const gr = ctx.createLinearGradient(0, y - g.B * 0.3, 0, y + 2); gr.addColorStop(0, 'rgba(120,255,200,0)'); gr.addColorStop(1, 'rgba(120,255,200,0.4)');
      ctx.fillStyle = gr; ctx.fillRect(x0, y - g.B * 0.3, x1 - x0, g.B * 0.3); ctx.fillStyle = 'rgba(190,255,230,0.95)'; ctx.fillRect(x0, y, x1 - x0, 2.5); ctx.restore();
    }
    if (P.drop > 0.02) { const x = g.R.x + g.R.w * 0.62, y = g.cy - g.B * 0.9 + Math.sin(t * 2.4) * g.B * 0.06; ctx.save(); ctx.translate(x, y); ctx.scale(P.drop, P.drop); ctx.fillStyle = 'rgba(130,200,255,0.95)'; ctx.shadowColor = 'rgba(130,200,255,0.8)'; ctx.shadowBlur = 8; drop(ctx, g.B * 0.17); ctx.fill(); ctx.restore(); }
  }
}

function heart(ctx, s) { ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.0, 0, -s * 0.35); ctx.bezierCurveTo(s * 0.7, -s * 1.0, s * 1.4, -s * 0.1, 0, s); ctx.fill(); }
function sparkle(ctx, s) { ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s); ctx.fill(); }
function sparklePos(ctx, x, y, s) { ctx.save(); ctx.translate(x, y); sparkle(ctx, Math.max(0.1, s)); ctx.restore(); }
function drop(ctx, s) { ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.bezierCurveTo(s * 1.0, -s * 0.2, s * 1.0, s * 0.9, 0, s * 0.95); ctx.bezierCurveTo(-s * 1.0, s * 0.9, -s * 1.0, -s * 0.2, 0, -s * 1.5); ctx.closePath(); }
function shineDot(ctx, r) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.2, 0, TAU); ctx.fill(); }
