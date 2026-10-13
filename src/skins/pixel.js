// Skin pixel: ma trận LED. Mặt (mắt + miệng + fx, không glow) dựng vào canvas offscreen độ phân giải thấp (ô vuông),
// đọc lại bằng getImageData rồi vẽ từng ô thành chấm LED bo tròn: sáng theo độ sáng mẫu, màu theo theme; ô tắt vẫn hiện mờ (lưới "ma").
const COLS_FACE = 34;                      // số ô ngang ứng với một đơn vị U (khổ mặt)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function build(r) {
  if (typeof document === 'undefined') return null;
  const { W, H, dpr } = r, U = Math.min(W, H * 1.15), cell = Math.max(5, U / COLS_FACE), cy = H * 0.42;
  const i0 = Math.round(W / 2 / cell - 0.5), j0 = Math.round(cy / cell - 0.5);
  const ox = W / 2 - (i0 + 0.5) * cell, oy = cy - (j0 + 0.5) * cell;
  const cols = Math.ceil((W - ox) / cell), rows = Math.ceil((H - oy) / cell);
  const lo = document.createElement('canvas'); lo.width = cols; lo.height = rows;
  const lx = lo.getContext('2d', { willReadFrequently: true });
  // LED phẳng: bỏ bóng đổ trong canvas thấp (bóng sẽ to cỡ cả chục ô); quầng sáng do lớp bloom bên dưới đảm nhiệm
  for (const k of ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY']) Object.defineProperty(lx, k, { get: () => 0, set: () => {} });
  lx.imageSmoothingEnabled = true;
  // lưới "ma": các chấm tắt, dựng sẵn một lần
  const ghost = document.createElement('canvas'); ghost.width = Math.round(W * dpr); ghost.height = Math.round(H * dpr);
  const gx = ghost.getContext('2d'); gx.scale(dpr, dpr); gx.fillStyle = 'rgba(150,196,214,0.075)';
  gx.beginPath();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = ox + (i + 0.5) * cell, y = oy + (j + 0.5) * cell; gx.moveTo(x + cell * 0.3, y); gx.arc(x, y, cell * 0.3, 0, Math.PI * 2); }
  gx.fill();
  return { cell, cols, rows, ox, oy, lo, lx, ghost };
}

export default {
  id: 'pixel', label: 'Pixel (ma trận LED)',
  resize(r) { r.sk.pixel = build(r); },
  draw(r, ctx, frame, fx, extras, g, pose) {
    const st = r.sk.pixel || (r.sk.pixel = build(r));
    r.paintBg(ctx);
    if (!st) { r.drawFace(ctx, frame, fx, g); r.drawOverlay(ctx, extras, g); return; }
    const { cell, cols, rows, ox, oy, lo, lx, ghost } = st;
    // 1) mặt -> canvas thấp (ô vuông), đen nền
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1;
    lx.fillStyle = '#000'; lx.fillRect(0, 0, cols, rows);
    lx.setTransform(1 / cell, 0, 0, 1 / cell, -ox / cell, -oy / cell);
    lx.save();
    if (frame.roll) { lx.translate(g.cx, g.cy); lx.rotate(frame.roll); lx.translate(-g.cx, -g.cy); }
    r.applyPose(lx, g, pose);
    const ls = r.lineScale; r.lineScale = 1.9;       // nét miệng mảnh phải dày cỡ một ô mới thấy
    // miệng nhỏ phải rộng ~5 ô mới đọc được nụ cười trên lưới thấp
    const gp = { ...g, mouth: { ...g.mouth, base: g.mouth.base * 1.5 } };
    r.drawFace(lx, frame, fx, gp, { glow: false });
    r.lineScale = ls;
    lx.restore();
    // 2) lưới ma + quầng sáng (phóng to mượt canvas thấp, cộng sáng)
    ctx.drawImage(ghost, 0, 0, r.W, r.H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lo, ox, oy, cols * cell, rows * cell); ctx.restore();
    // 3) từng ô thành chấm LED
    const px = lx.getImageData(0, 0, cols, rows).data;
    ctx.save();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const o = (j * cols + i) * 4, R = px[o], G = px[o + 1], B = px[o + 2], m = Math.max(R, G, B);
        if (m < 22) continue;
        const lum = m / 255, v = Math.pow(clamp((lum - 0.06) / 0.86, 0, 1), 0.78), k = (v * 255) / m;
        const x = ox + (i + 0.5) * cell, y = oy + (j + 0.5) * cell, rad = cell * (0.27 + 0.17 * v);
        ctx.fillStyle = `rgb(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, B * k) | 0})`;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
        if (v > 0.55) { ctx.fillStyle = `rgba(255,255,255,${(v - 0.55) * 0.9})`; ctx.beginPath(); ctx.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.42, 0, 6.2832); ctx.fill(); }
      }
    }
    ctx.restore();
    r.drawOverlay(ctx, extras, g);
  },
};
