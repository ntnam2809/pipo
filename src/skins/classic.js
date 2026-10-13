// Skin cổ điển: hai mắt + miệng trên nền tối có vignette (hành vi gốc của Pipo), thân chỉ nhún/lắc/nghiêng theo pose.
export default {
  id: 'classic', label: 'Cổ điển',
  draw(r, ctx, frame, fx, extras, g, pose) {
    r.paintBg(ctx);
    ctx.save();
    if (frame.roll) { ctx.translate(g.cx, g.cy); ctx.rotate(frame.roll); ctx.translate(-g.cx, -g.cy); }
    r.applyPose(ctx, g, pose);
    r.drawFace(ctx, frame, fx, g);
    ctx.restore();
    r.drawOverlay(ctx, extras, g);
  },
};
