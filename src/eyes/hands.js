// Găng tay hoạt hình vẽ bằng path (không emoji, không ảnh) cho skin không có tay thật (classic · pixel).
// Skin classic vẽ thẳng lên canvas chính; skin pixel vẽ cùng găng vào buffer LED (flat: true) nên thành tay chấm LED.
// Hình học tính theo bán kính lòng bàn tay = 1 (ngón hướng lên = -y, ngón cái bên -x tức bên trong khi là tay phải).
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${clamp(s, 0, 100).toFixed(1)}%,${clamp(l, 0, 100).toFixed(1)}%,${a})`;

/** Viên nang (đoạn thẳng có đầu tròn) từ (x1,y1) tới (x2,y2) rộng w. */
function cap(c, x1, y1, x2, y2, w) {
  const a = Math.atan2(y2 - y1, x2 - x1), r = w / 2;
  c.moveTo(x1 + Math.cos(a + Math.PI / 2) * r, y1 + Math.sin(a + Math.PI / 2) * r);
  c.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5); c.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2); c.closePath();
}
const disc = (c, x, y, rx, ry = rx) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };
function rrect(c, x0, y0, x1, y1, r) {
  c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.arcTo(x1, y0, x1, y0 + r, r); c.lineTo(x1, y1 - r); c.arcTo(x1, y1, x1 - r, y1, r);
  c.lineTo(x0 + r, y1); c.arcTo(x0, y1, x0, y1 - r, r); c.lineTo(x0, y0 + r); c.arcTo(x0, y0, x0 + r, y0, r); c.closePath();
}
const line = (c, x1, y1, qx, qy, x2, y2) => { c.moveTo(x1, y1); c.quadraticCurveTo(qx, qy, x2, y2); };

/**
 * Hình học từng dáng: parts = khối đặc (hợp lại thành găng), lines = nét gợi ngón/khớp, rims = nét viền riêng (ngón cái đè lên nắm tay).
 * Mỗi hàm nhận context đã scale theo bán kính.
 */
const SHAPE = {
  open: {
    parts: [(c) => cap(c, -0.6, -0.3, -0.76, -1.26, 0.6), (c) => cap(c, 0, -0.45, 0.02, -1.5, 0.62), (c) => cap(c, 0.6, -0.3, 0.76, -1.2, 0.58), (c) => cap(c, -0.76, 0.3, -1.42, -0.18, 0.6), (c) => disc(c, 0, 0.06, 1.0, 0.92)],
    lines: [(c) => line(c, -0.3, -0.95, -0.34, -0.5, -0.3, 0.05), (c) => line(c, 0.3, -0.95, 0.34, -0.5, 0.3, 0.05), (c) => line(c, -0.66, 0.08, -0.56, 0.3, -0.36, 0.5)],
  },
  fist: {
    parts: [(c) => disc(c, 0, 0.1, 1.02, 0.96), (c) => disc(c, -0.66, -0.58, 0.4), (c) => disc(c, -0.22, -0.82, 0.4), (c) => disc(c, 0.22, -0.82, 0.4), (c) => disc(c, 0.66, -0.58, 0.4)],
    lines: [(c) => line(c, -0.45, -1.02, -0.5, -0.7, -0.44, -0.3), (c) => line(c, 0, -1.12, 0.02, -0.72, 0, -0.3), (c) => line(c, 0.45, -1.02, 0.5, -0.7, 0.44, -0.3), (c) => line(c, -0.8, 0.22, -0.3, 0.42, 0.42, 0.7)],
  },
  point: {
    parts: [(c) => disc(c, 0.08, 0.3, 0.96, 0.88), (c) => cap(c, -0.34, -0.1, -0.34, -1.42, 0.62), (c) => disc(c, 0.42, -0.34, 0.36), (c) => disc(c, 0.76, -0.04, 0.32)],
    lines: [(c) => line(c, 0.02, -0.5, 0.12, -0.2, 0.08, 0.1), (c) => line(c, 0.6, -0.3, 0.6, -0.1, 0.55, 0.12), (c) => line(c, -0.76, 0.34, -0.3, 0.52, 0.3, 0.76)],
  },
  thumb: {
    parts: [(c) => disc(c, 0.12, 0.4, 0.96, 0.9), (c) => cap(c, -0.36, 0.0, -0.46, -1.3, 0.7)],
    lines: [(c) => line(c, -0.02, 0.12, 0.4, 0.04, 0.88, 0.16), (c) => line(c, -0.02, 0.44, 0.4, 0.36, 0.9, 0.48), (c) => line(c, 0.04, 0.76, 0.4, 0.68, 0.76, 0.78)],
  },
  flat: {
    parts: [(c) => rrect(c, -0.82, -1.62, 0.82, 0.4, 0.4), (c) => disc(c, 0, 0.1, 0.98, 0.86), (c) => cap(c, -0.9, 0.3, -1.0, -0.4, 0.46)],
    lines: [(c) => line(c, -0.4, -1.5, -0.4, -0.9, -0.4, -0.2), (c) => line(c, 0, -1.56, 0, -0.9, 0, -0.2), (c) => line(c, 0.4, -1.5, 0.4, -0.9, 0.4, -0.2)],
  },
  gun: {
    parts: [(c) => disc(c, 0.12, 0.34, 0.92, 0.86), (c) => cap(c, -0.34, -0.06, -0.34, -1.42, 0.62), (c) => cap(c, 0.56, 0.0, 0.64, -1.02, 0.5), (c) => disc(c, 0.46, -0.26, 0.32)],
    lines: [(c) => line(c, -0.02, -0.5, 0.0, -0.1, 0.1, 0.22), (c) => line(c, -0.76, 0.34, -0.3, 0.52, 0.3, 0.76)],
  },
};

/**
 * Vẽ MỘT chiếc găng gốc (0,0) = tâm lòng bàn tay, ngón hướng lên.
 * o: { r (px), hue, sat, light, flat (LED), side (+1 phải · -1 trái, trái = lật gương), alpha }.
 */
export function drawGlove(ctx, shape, o) {
  const G = SHAPE[shape] || SHAPE.open, r = Math.max(1, o.r), side = o.side < 0 ? -1 : 1, flat = !!o.flat, hue = o.hue ?? 188, sat = o.sat ?? 90, light = o.light ?? 58;
  ctx.save(); ctx.globalAlpha *= clamp(o.alpha ?? 1, 0, 1); ctx.scale(r * side, r); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const ow = flat ? 0.2 : 0.14;
  const rim = hsl(hue, sat, flat ? 62 : light + 4), glow = hsl(hue, 100, 60, 0.85);
  const cuff = (c) => rrect(c, -0.7, 0.8, 0.7, 1.36, 0.22);
  // 1) viền sáng: nét dày quanh mọi khối (phần trong sẽ bị lớp tô phủ)
  ctx.save(); ctx.strokeStyle = rim; ctx.lineWidth = ow * 2;
  if (!flat) { ctx.shadowColor = glow; ctx.shadowBlur = r * 0.7; }
  ctx.beginPath(); cuff(ctx); ctx.stroke();
  for (const p of G.parts) { ctx.beginPath(); p(ctx); ctx.stroke(); }
  ctx.restore();
  // 2) tay áo (cuff)
  ctx.beginPath(); cuff(ctx);
  ctx.fillStyle = flat ? hsl(hue, sat, 56) : hsl(hue, sat * 0.9, light - 16); ctx.fill();
  if (!flat) { ctx.strokeStyle = hsl(hue, sat * 0.8, light + 22, 0.9); ctx.lineWidth = 0.07; ctx.beginPath(); line(ctx, -0.62, 0.98, 0, 1.06, 0.62, 0.98); ctx.stroke(); }
  // 3) thân găng: trắng pha màu theme, đổ bóng nhẹ
  let fill;
  if (flat) fill = hsl(hue, sat * 0.35, 94);
  else { fill = ctx.createRadialGradient(-0.4, -0.7, 0.05, 0.05, 0.25, 2.3); fill.addColorStop(0, hsl(hue, sat * 0.25, 99)); fill.addColorStop(0.5, hsl(hue, sat * 0.5, 90)); fill.addColorStop(1, hsl(hue, sat * 0.85, 70)); }
  ctx.fillStyle = fill; for (const p of G.parts) { ctx.beginPath(); p(ctx); ctx.fill(); }
  // 4) nét ngón / khớp
  const ink = flat ? 'rgba(0,0,0,0.9)' : hsl(hue, sat * 0.9, 38, 0.8), lw = flat ? 0.26 : 0.075;
  ctx.strokeStyle = ink; ctx.lineWidth = lw;
  for (const l of G.lines || []) { ctx.beginPath(); l(ctx); ctx.stroke(); }
    // 5) bóng loáng (chỉ bản vẽ thường)
  if (!flat) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-0.42, -0.2, 0.17, 0.3, 0.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Làm mềm biên: |v| vượt knee thì nén dần về lim, không bao giờ vượt lim. */
export function softLimit(v, lim, knee = 0.62) {
  const a = Math.abs(v), k = lim * knee; if (a <= k) return v;
  const room = Math.max(1e-6, lim - k); return Math.sign(v) * (k + room * (1 - Math.exp(-(a - k) / room)));
}

/** Kích thước găng (px) & một đơn vị F (px) cho hình học g của classic/pixel. Pixel to hơn vì lưới LED thô. */
export function handMetrics(g, flat) {
  const r = g.U * (flat ? 0.112 : 0.078);
  return { F: g.U * 0.4, r };
}

/**
 * Vẽ hai tay theo pose.handL/handR trong không gian mặt (gọi bên trong cặp save/restore đã áp pose của skin).
 * g: hình học mặt; o: { flat, toCss(devX, devY) -> {x,y} }. Trả vị trí css của từng tay ({x,y,r}) cho hit-test/fx; ghi r.handPx.
 */
export function drawHands(r, ctx, g, pose, o = {}) {
  const out = { L: null, R: null };
  if (!pose) { r.handPx = out; return out; }
  const { F, r: r0 } = handMetrics(g, o.flat), W = g.W, H = g.H;
  for (const [side, key] of [['L', 'handL'], ['R', 'handR']]) {
    const hd = pose[key]; if (!hd || hd.alpha < 0.01) continue;
    const rr = r0 * clamp(hd.scale, 0.3, 3.2);
    // vị trí: đơn vị F quanh tâm mặt. Màn ngang (rộng, thấp): tay dạt ra hai bên và hạ xuống ngang mắt thay vì lên trên (trên đầu hết chỗ);
    // nén mềm theo biên màn để tay không bị cắt, rồi kẹp theo chiều dọc để cả bàn tay (cả ngón giơ lên) nằm trong màn.
    const wide = clamp((W / H - 1.05) / 0.7, 0, 1);
    const limX = Math.max(rr * 1.4, W / 2 - rr * 1.95 - 4);
    const dx = softLimit(hd.x * F * (1 + 0.35 * wide), limX), dy0 = hd.y * F * (hd.y < 0 ? 1 - 0.7 * wide : 1);
    const px = g.cx + dx;
    let py = clamp(g.cy + dy0, Math.min(rr * 2.05 + 4, H * 0.5), Math.max(H - rr * 1.5 - 4, H * 0.5));
    if (o.flat && hd.y < -0.3) {   // LED thô: tay giơ lên phải nằm hẳn trên mắt, không đè lên mắt (che mắt chỉ khi cố ý: y ≈ 0)
      const eyeTop = Math.min(g.L.y - g.L.h / 2, g.R.y - g.R.h / 2), eyeOuter = Math.abs(g.R.x - g.cx) + g.R.w / 2;
      if (Math.abs(dx) - rr * 1.3 < eyeOuter) { const bottom = py + rr * (0.95 + 0.5 * Math.abs(Math.cos(hd.rot))), maxBottom = eyeTop - g.U * 0.05; if (bottom > maxBottom) py = Math.max(rr * 1.3 + 4, py - (bottom - maxBottom)); }
    }
    ctx.save(); ctx.translate(px, py); ctx.translate(0, rr * 0.8); ctx.rotate(hd.rot * (side === 'L' ? 1 : 1)); ctx.translate(0, -rr * 0.8);
    drawGlove(ctx, hd.shape, { r: rr, hue: g.color.h, sat: g.color.s, light: g.color.l, flat: o.flat, side: side === 'L' ? -1 : 1, alpha: hd.alpha });
    if (o.toCss) { const m = ctx.getTransform(); out[side] = { ...o.toCss(m.e, m.f), r: rr * (o.cssK || 1) }; }
    ctx.restore();
    if (!o.toCss) out[side] = { x: px, y: py, r: rr };
  }
  r.handPx = out;
  return out;
}
