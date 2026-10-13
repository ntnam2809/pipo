import { drawHands } from '../eyes/hands.js';
// Skin cổ điển: hai mắt + miệng trên nền tối có vignette (hành vi gốc của Pipo), thân chỉ nhún/lắc/nghiêng theo pose.
export default {
  id: 'classic', label: 'Cổ điển',
  draw(r, ctx, frame, fx, extras, g, pose) {
    r.paintBg(ctx);
    ctx.save();
    if (frame.roll) { ctx.translate(g.cx, g.cy); ctx.rotate(frame.roll); ctx.translate(-g.cx, -g.cy); }
    r.paintFloor(ctx, g, pose && pose.fall);
    r.applyPose(ctx, g, pose); r.applyFall(ctx, g, pose && pose.fall);
    r.drawFace(ctx, frame, fx, g);
    drawHands(r, ctx, g, pose, { toCss: (x, y) => ({ x: x / r.dpr, y: y / r.dpr }) });   // găng động tác (chỉ hiện khi có clip)
    ctx.restore();
    r.drawOverlay(ctx, extras, g);
  },
};
