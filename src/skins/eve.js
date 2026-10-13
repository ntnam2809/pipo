// Skin Eve: robot mini có thân và tay (cảm hứng dáng "EVE", thiết kế riêng). Đầu trứng nằm ngang trắng bóng với kính mặt đen
// chứa đôi mắt của engine (thu nhỏ vào trong kính), thân trứng thuôn dưới, hai tay hình lá lơ lửng bên thân, cả robot bay lơ lửng
// trên bóng elip. Đơn vị `u` = chiều rộng nửa mặt kính ~ 1 đơn vị; mọi toạ độ dựng tuyệt đối quanh neo (ax, ay) = tâm cổ.
import { Spring } from '../core/spring.js';
import { hsl } from '../eyes/renderer.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FACE_K = 1.78;                                  // khổ mặt (U của engine mắt) theo u
const HEAD = { cy: -0.8, a: 1.14, b: 0.78, n: 2.45 }; // đầu: tâm, nửa rộng, nửa cao, số mũ siêu elip
const VISOR = { cy: -0.8, a: 0.94, b: 0.6, n: 2.9 };  // kính mặt
const BODY = { top: 0.1, bot: 2.1, w: 0.92, peak: 0.34 };
const ARM = { len: 1.18, wid: 0.54, shoulderY: 0.7, gap: 0.24 };

/** Bố cục: u (px), neo cổ (ax, ay). Vừa màn dọc 390×780 lẫn ngang 844×390. */
export function layout(W, H) {
  const u = Math.min((W * 0.84) / 3.4, (H * 0.72) / 3.75, 150);
  return { u, ax: W / 2, ay: H * 0.47 - 0.285 * u };
}

function scaleGeom(g, s, cx, cy) {
  const eye = (e) => ({ ...e, x: cx + (e.x - g.cx) * s, y: cy + (e.y - g.cy) * s, w: e.w * s, h: e.h * s });
  return { ...g, U: g.U * s, B: g.B * s, D: g.D * s, cx, cy, L: eye(g.L), R: eye(g.R), mouth: { ...g.mouth, x: cx + (g.mouth.x - g.cx) * s, y: cy + (g.mouth.y - g.cy) * s, base: g.mouth.base * s } };
}

/** Đường siêu elip (n>2: vuông hơn) quanh (cx, cy); nửa dưới nén bởi `low`. */
function superPath(ctx, cx, cy, a, b, n, low = 1) {
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU, c = Math.cos(t), s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = cy + b * (s > 0 ? low : 1) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Nửa rộng thân tại độ cao y (u): trứng, rộng nhất ở `peak`, thuôn xuống đáy. */
function bodyHalfW(y) {
  const s = clamp((y - BODY.top) / (BODY.bot - BODY.top), 0, 1), pk = BODY.peak;
  if (s < pk) { const d = (pk - s) / pk; return BODY.w * Math.sqrt(Math.max(0, 1 - d * d)); }               // mái vòm tròn phía trên
  const d = (s - pk) / (1 - pk); return BODY.w * Math.pow(Math.max(0, 1 - Math.pow(d, 1.85)), 0.56);       // thuôn dần xuống đáy bo tròn
}
function bodyPath(ctx, ax, ay, u) {
  // mẫu theo góc ở mái vòm và dày dần về mũi đáy (nơi đường cong dốc) để viền mượt, không thấy góc cạnh
  const H = BODY.bot - BODY.top, ys = [];
  for (let i = 0; i <= 28; i++) ys.push(BODY.top + BODY.peak * H * (1 - Math.cos((i / 28) * Math.PI / 2)));
  for (let i = 1; i <= 64; i++) { const d = 1 - Math.pow(1 - i / 64, 2.2); ys.push(BODY.top + (BODY.peak + (1 - BODY.peak) * d) * H); }
  const R = ys.map((y) => [ax + bodyHalfW(y) * u, ay + y * u]);
  ctx.moveTo(R[0][0], R[0][1]); for (const p of R) ctx.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(2 * ax - R[i][0], R[i][1]); ctx.closePath();
}

/** Tay hình lá: xương sống uốn dần (curl), rộng nhất khoảng 55%, hai đầu bo tròn. Trả {mid, w} để đặt gradient. */
function armPath(ctx, sx, sy, theta0, len, wid, bend) {
  const N = 16, pts = []; let x = sx, y = sy, th = theta0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, prof = Math.min(1, 0.62 * (1 - t) + 0.36 * t + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.85)));
    pts.push({ x, y, hw: (wid / 2) * prof, th });
    th = theta0 + bend * (t + 1 / N) * (t + 1 / N); x += -Math.sin(th) * (len / N); y += Math.cos(th) * (len / N);
  }
  ctx.beginPath();
  const L = pts.map((p) => [p.x - Math.cos(p.th) * p.hw, p.y - Math.sin(p.th) * p.hw]), R = pts.map((p) => [p.x + Math.cos(p.th) * p.hw, p.y + Math.sin(p.th) * p.hw]);
  ctx.moveTo(L[0][0], L[0][1]); for (const p of L) ctx.lineTo(p[0], p[1]);
  const e = pts[N]; ctx.arc(e.x, e.y, e.hw, e.th + Math.PI, e.th, true);
  for (let i = N; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  const s0 = pts[0]; ctx.arc(s0.x, s0.y, s0.hw, s0.th, s0.th + Math.PI, true); ctx.closePath();
  const m = pts[Math.round(N * 0.55)]; return { mx: m.x, my: m.y, hw: m.hw, tipx: e.x, tipy: e.y, th: e.th };
}

/** Cung bóng loáng chạy dọc mép siêu elip (t0..t1 rad). */
function superArc(ctx, cx, cy, a, b, n, t0, t1) {
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) { const t = t0 + ((t1 - t0) * i) / 18, c = Math.cos(t), s = Math.sin(t); const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
}

function whiteGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, '#eef2f8'); g.addColorStop(0.78, '#c4cedc'); g.addColorStop(1, '#8f9db2');
  return g;
}

/** Đầu tay đổi dạng theo shape của động tác: nắm đấm = củ tròn có vạch ngón, ngón cái = củ + mấu, chỉ = củ nhỏ + ngón. open/flat giữ nguyên dáng lá. */
function tipDeco(ctx, shape, tx, ty, th, u, sc, frame) {
  if (shape !== 'fist' && shape !== 'thumb' && shape !== 'point' && shape !== 'gun') return;
  const dx = -Math.sin(th), dy = Math.cos(th), nx = -dy, ny = dx;   // dọc cánh tay (ra đầu tay) và pháp tuyến
  const k = Math.pow(Math.max(0.5, sc), 0.8), br = 0.27 * u * k * (shape === 'point' || shape === 'gun' ? 0.84 : 1);
  const cx = tx + dx * br * 0.5, cy = ty + dy * br * 0.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 0.1 * u; ctx.shadowOffsetY = 0.04 * u;
  const body = (c) => { c.beginPath(); c.arc(cx, cy, br, 0, TAU); };
  const nub = (x1, y1, x2, y2, w) => { ctx.beginPath(); const a = Math.atan2(y2 - y1, x2 - x1), r = w / 2; ctx.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5); ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2); ctx.closePath(); };
  ctx.fillStyle = whiteGrad(ctx, cx - br, cy - br, cx + br, cy + br);
  if (shape === 'thumb') { const sd = nx > 0 ? -1 : 1; nub(cx + dx * br * 0.45 + nx * sd * br * 0.3, cy + dy * br * 0.45 + ny * sd * br * 0.3, cx + dx * br * 1.55 + nx * sd * br * 0.22, cy + dy * br * 1.55 + ny * sd * br * 0.22, br * 0.6); ctx.fill(); }
  if (shape === 'point' || shape === 'gun') { nub(cx + dx * br * 0.5, cy + dy * br * 0.5, cx + dx * br * 1.95, cy + dy * br * 1.95, br * 0.56); ctx.fill(); }
  if (shape === 'gun') { nub(cx + nx * br * 0.6, cy + ny * br * 0.6, cx + nx * br * 0.95 + dx * br * 0.7, cy + ny * br * 0.95 + dy * br * 0.7, br * 0.46); ctx.fill(); }
  body(ctx); ctx.fill();
  ctx.shadowColor = 'transparent';
  const sp = ctx.createRadialGradient(cx - br * 0.35, cy - br * 0.4, 0, cx - br * 0.35, cy - br * 0.4, br * 0.9); sp.addColorStop(0, 'rgba(255,255,255,0.9)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sp; body(ctx); ctx.fill();
  ctx.fillStyle = hsl(frame.hue, frame.sat * 0.8, 62, 0.14); body(ctx); ctx.fill();
  if (shape === 'fist') {   // vạch ngón: ba nét ngắn vuông góc cánh tay
    ctx.strokeStyle = 'rgba(70,86,112,0.55)'; ctx.lineWidth = Math.max(1.2, 0.028 * u); ctx.lineCap = 'round';
    for (const o of [-0.42, 0, 0.42]) { const bx = cx + nx * br * o + dx * br * 0.22, by = cy + ny * br * o + dy * br * 0.22; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * br * 0.5, by + dy * br * 0.5); ctx.stroke(); }
  }
  ctx.restore();
}

function state(r) {
  return r.sk.eve || (r.sk.eve = { t: -1, hx: new Spring(0, 900, 0.8), hy: new Spring(0, 900, 0.8), bx: new Spring(0, 130, 0.45), by: new Spring(0, 130, 0.45), bt: new Spring(0, 90, 0.5), bs: new Spring(0, 160, 0.5) });
}

export default {
  id: 'eve', label: 'Eve (robot có tay)',
  geom(base, frame) {
    const { u, ax, ay } = layout(base.W, base.H);
    return scaleGeom(base, (FACE_K * u) / base.U, ax, ay + (VISOR.cy - 0.025) * u);
  },
  resize(r) { r.sk.eve = null; },
  draw(r, ctx, frame, fx, extras, g, pose) {
    const { W, H } = r, { u, ax, ay } = layout(W, H), st = state(r);
    pose = pose || { bob: 0, sway: 0, tilt: 0, squash: 0, hover: 0, armL: { lift: -1, spread: 0, curl: 0 }, armR: { lift: -1, spread: 0, curl: 0 } };
    const dt = st.t < 0 ? 0 : clamp(frame.t - st.t, 0, 0.05); st.t = frame.t;
    const Ue = FACE_K * u, th = frame.t;
    // đầu bám pose sát; thân trễ pha (lò xo mềm) nên nhún lệch nhẹ so với đầu
    const hx = st.hx.update(pose.sway * Ue, dt || 0.016), hy = st.hy.update(pose.bob * Ue, dt || 0.016);
    const bx = st.bx.update(pose.sway * Ue * 0.55, dt || 0.016), by = st.by.update(pose.bob * Ue * 0.8, dt || 0.016);
    const bt = st.bt.update(pose.tilt * 0.3, dt || 0.016), bs = st.bs.update(pose.squash, dt || 0.016);
    const fl = pose.fall || null, hug = fl ? clamp(Math.abs(fl.tilt) / 1.2, 0, 1) * fl.w : 0, hover = pose.hover * Ue * 2.2 * (fl ? 1 - fl.w : 1);
    const neckY = ay - 0.07 * u;

    r.paintBg(ctx); r.handPx = { L: null, R: null };
    // ---- nền: ánh sáng dịu quanh robot + sàn ----
    const floorY = ay + (BODY.bot + 0.55) * u;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let gr = ctx.createRadialGradient(ax, ay + 0.2 * u, 0, ax, ay + 0.2 * u, 2.9 * u);
    gr.addColorStop(0, hsl(frame.hue, 40, 40, 0.16)); gr.addColorStop(0.55, 'rgba(60,84,120,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(ax, floorY); ctx.scale(1, 0.2); gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.2 * u);
    gr.addColorStop(0, 'rgba(120,150,190,0.22)'); gr.addColorStop(1, 'rgba(120,150,190,0)'); ctx.fillStyle = gr; ctx.fillRect(-2.3 * u, -2.3 * u, 4.6 * u, 4.6 * u); ctx.restore();
    ctx.restore();

    ctx.save();
    if (frame.roll) { const cy0 = ay + 0.285 * u; ctx.translate(ax, cy0); ctx.rotate(frame.roll); ctx.translate(-ax, -cy0); }

    // ---- bóng dưới sàn (nhỏ + nhạt khi bay cao) ----
    {
      const lift = clamp(-hover / u, -0.3, 0.6), k = 1 - 0.25 * lift;
      const wide = fl ? 1 + 1.25 * fl.w * Math.abs(Math.sin(fl.tilt)) : 1;   // nằm xuống thì bóng dài ra
      ctx.save(); ctx.translate(ax + bx * 0.3 + (fl ? -Math.sin(fl.tilt) * 0.6 * u : 0), floorY); ctx.scale(wide, 0.2); const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.25 * u * k);
      sg.addColorStop(0, `rgba(0,0,0,${0.9 - 0.3 * lift})`); sg.addColorStop(0.55, `rgba(0,0,0,${0.5 - 0.15 * lift})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 1.25 * u * k, 0, TAU); ctx.fill(); ctx.restore();
    }

    ctx.translate(0, hover);
    if (fl) {   // đổ cả người: xoay quanh điểm chạm sàn dưới đáy thân, rồi dồn về giữa màn và nâng lên cho nằm trên sàn
      const th = fl.tilt * 0.95, s2 = Math.sin(th), lie = clamp(Math.abs(s2), 0, 1), sc = 1 - 0.24 * lie * lie;   // nằm xuống thì thu nhỏ chút cho vừa bề ngang màn
      ctx.translate(ax - s2 * 2.3 * u * sc + fl.sway * Ue * 0.3, floorY - s2 * s2 * 0.62 * u * sc - Math.max(0, floorY + 0.95 * u * sc - (H - 6)) * lie); ctx.rotate(th); ctx.scale(sc, sc); ctx.translate(-ax, -floorY);   // màn thấp: nâng lên để tay rũ không tụt khỏi màn
    }
    // ---- cổ (khe tối + vòng sáng theo màu mắt) ----
    ctx.save(); ctx.translate(bx * 0.5, by * 0.6);
    ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.ellipse(ax, ay + 0.02 * u, 0.5 * u, 0.2 * u, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- thân + tay (cùng nhóm, thân nghiêng nhẹ theo đầu) ----
    const bodyXf = () => { ctx.translate(bx, by); ctx.translate(ax, ay + 1.0 * u); ctx.rotate(bt); ctx.scale(1 - bs * 0.1, 1 + bs * 0.12); ctx.translate(-ax, -(ay + 1.0 * u)); };
    const raised = (side) => { const a = side < 0 ? pose.armL : pose.armR; return a.lift > 0.2 || !!a.front; };
    ctx.save(); bodyXf();
    // thân
    ctx.save(); ctx.beginPath(); bodyPath(ctx, ax, ay, u);
    ctx.fillStyle = whiteGrad(ctx, ax - 0.9 * u, ay + 0.2 * u, ax + 0.95 * u, ay + 1.9 * u); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 0.18 * u; ctx.shadowOffsetY = 0.08 * u; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.clip();
    gr = ctx.createLinearGradient(0, ay + 0.1 * u, 0, ay + 0.5 * u); gr.addColorStop(0, 'rgba(40,52,72,0.55)'); gr.addColorStop(1, 'rgba(40,52,72,0)'); ctx.fillStyle = gr; ctx.fillRect(ax - u, ay, 2 * u, 0.6 * u);   // bóng đầu đổ xuống thân
    gr = ctx.createRadialGradient(ax - 0.4 * u, ay + 0.55 * u, 0, ax - 0.4 * u, ay + 0.55 * u, 0.9 * u); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(ax - u, ay, 2 * u, 1.6 * u);   // bóng loáng
    gr = ctx.createRadialGradient(ax, ay + 0.75 * u, 0.1 * u, ax, ay + 0.75 * u, 1.3 * u); gr.addColorStop(0, hsl(frame.hue, frame.sat * 0.8, 60, 0)); gr.addColorStop(1, hsl(frame.hue, frame.sat * 0.8, 60, 0.2)); ctx.fillStyle = gr; ctx.fillRect(ax - u, ay, 2 * u, 2.3 * u);   // viền sáng màu mắt
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(ax - 0.5 * u, ay + 0.88 * u, 0.065 * u, 0.36 * u, 0.2, 0, TAU); ctx.fill();   // vệt phản chiếu
    ctx.restore();
    // đèn ngực nhỏ nhịp thở
    {
      const pulse = 0.65 + 0.35 * Math.sin(th * 2.4), cy = ay + 0.66 * u;
      ctx.save(); ctx.shadowColor = hsl(frame.hue, 100, 60, 0.9); ctx.shadowBlur = 0.16 * u; ctx.fillStyle = hsl(frame.hue, frame.sat, 62 + 12 * pulse, 0.55 + 0.4 * pulse);
      ctx.beginPath(); ctx.arc(ax, cy, 0.062 * u, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(120,136,160,0.5)'; ctx.lineWidth = Math.max(1, 0.012 * u); ctx.beginPath(); ctx.arc(ax, cy, 0.105 * u, 0, TAU); ctx.stroke();
    }
    // tay: tay thấp vẽ trước đầu; tay giơ cao (che mặt, gãi đầu) vẽ sau đầu để nằm phía trước
    const drawArm = (side) => {
      const A = side < 0 ? pose.armL : pose.armR;
      const out = 0.3 + 0.95 * A.spread + 0.04 * Math.sin(th * 1.7 + side), up = A.lift;
      const phi = Math.atan2(out, -up + 0.02);
      const shx = ax + side * (bodyHalfW(ARM.shoulderY) + ARM.gap) * u, shy = ay + ARM.shoulderY * u;
      const theta = -side * phi, bend = side * A.curl * 1.15;
      const reach = A.reach || 1, sc = A.sc || 1;
      let len = ARM.len * u * (reach > 1.05 ? 1 : (1 - 0.22 * clamp(-out, 0, 1)) * (1 - 0.3 * Math.pow(Math.abs(Math.sin(phi)), 1.5))) * reach;   // tay dang ngang bị rút ngắn (phối cảnh); tay động tác duỗi/rút theo reach
      const dx = -Math.sin(theta + bend * 0.6), room = (dx * side > 0 ? (side > 0 ? W - shx : shx) : 1e9) - 0.12 * u - Math.abs(bx);   // không để tay tràn khỏi màn
      if (Math.abs(dx) * len > room) len = Math.max(0.35 * u, room / Math.abs(dx));
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 0.1 * u; ctx.shadowOffsetY = 0.04 * u;
      const m = armPath(ctx, shx, shy, theta, len, ARM.wid * u * (1 + 0.3 * (Math.min(sc, 2.6) - 1)), bend);
      ctx.fillStyle = whiteGrad(ctx, m.mx - 0.3 * u, m.my - 0.3 * u, m.mx + 0.3 * u, m.my + 0.3 * u); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.clip();
      const sp = ctx.createRadialGradient(m.mx - 0.08 * u, m.my - 0.1 * u, 0, m.mx - 0.08 * u, m.my - 0.1 * u, 0.4 * u); sp.addColorStop(0, 'rgba(255,255,255,0.9)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sp; ctx.fillRect(m.mx - u, m.my - u, 2 * u, 2 * u);
      ctx.fillStyle = hsl(frame.hue, frame.sat * 0.8, 62, 0.16); ctx.beginPath(); ctx.arc(m.tipx, m.tipy, 0.2 * u, 0, TAU); ctx.fill();   // đầu tay hắt màu mắt
      ctx.restore();
      if (A.shape) tipDeco(ctx, A.shape, m.tipx, m.tipy, m.th, u, sc, frame);
      if (A.w > 0.3) { const T = ctx.getTransform(), p = T.transformPoint({ x: m.tipx, y: m.tipy }); r.handPx[side < 0 ? 'L' : 'R'] = { x: p.x / r.dpr, y: p.y / r.dpr, r: 0.4 * u * Math.pow(Math.max(0.6, sc), 0.8) }; }   // vị trí đầu tay: hit-test (đập tay) + fx
    };
    for (const side of [-1, 1]) if (!raised(side)) drawArm(side);
    ctx.restore();

    // vòng cổ phát sáng nhẹ theo màu mắt (thấy ở khe giữa đầu và thân)
    ctx.save(); ctx.translate(hx * 0.6, hy * 0.6 + by * 0.4 + 0.1 * u * hug); ctx.strokeStyle = hsl(frame.hue, frame.sat, 62, 0.55); ctx.shadowColor = hsl(frame.hue, 100, 60, 0.9); ctx.shadowBlur = 0.12 * u; ctx.lineWidth = Math.max(1.5, 0.034 * u);
    ctx.beginPath(); ctx.ellipse(ax, ay + 0.03 * u, 0.44 * u, 0.085 * u, 0, 0.1, Math.PI - 0.1); ctx.stroke(); ctx.restore();

    // ---- đầu (nghiêng quanh cổ, ép theo squash) ----
    ctx.save();
    ctx.translate(hx, hy + 0.2 * u * hug); ctx.translate(ax, neckY); ctx.rotate(pose.tilt); ctx.scale(1 + pose.squash * 0.55, 1 - pose.squash); ctx.translate(-ax, -neckY);
    const hcy = ay + HEAD.cy * u, vcy = ay + VISOR.cy * u;
    ctx.save(); ctx.beginPath(); superPath(ctx, ax, hcy, HEAD.a * u, HEAD.b * u, HEAD.n, 0.94);
    ctx.fillStyle = whiteGrad(ctx, ax - 1.1 * u, hcy - 0.8 * u, ax + 1.1 * u, hcy + 0.8 * u); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 0.2 * u; ctx.shadowOffsetY = 0.07 * u; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.clip();
    gr = ctx.createLinearGradient(0, hcy + 0.2 * u, 0, hcy + 0.78 * u); gr.addColorStop(0, 'rgba(70,86,112,0)'); gr.addColorStop(1, 'rgba(70,86,112,0.34)'); ctx.fillStyle = gr; ctx.fillRect(ax - 1.3 * u, hcy, 2.6 * u, u);
    gr = ctx.createRadialGradient(ax - 0.55 * u, hcy - 0.5 * u, 0, ax - 0.55 * u, hcy - 0.5 * u, 0.85 * u); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(ax - 1.3 * u, hcy - u, 2.6 * u, 1.6 * u);
    gr = ctx.createRadialGradient(ax, vcy, 0.4 * u, ax, vcy, 1.5 * u); gr.addColorStop(0, hsl(frame.hue, frame.sat, 60, 0.3)); gr.addColorStop(1, hsl(frame.hue, frame.sat, 60, 0)); ctx.fillStyle = gr; ctx.fillRect(ax - 1.3 * u, hcy - u, 2.6 * u, 2 * u);   // kính hắt sáng lên đầu
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.05 * u; ctx.lineCap = 'round'; superArc(ctx, ax, hcy, HEAD.a * u * 0.93, HEAD.b * u * 0.9, HEAD.n, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();   // cung bóng loáng
    ctx.restore();
    // kính mặt
    ctx.save(); ctx.beginPath(); superPath(ctx, ax, vcy, VISOR.a * u, VISOR.b * u, VISOR.n);
    gr = ctx.createRadialGradient(ax - 0.2 * u, vcy - 0.15 * u, 0.1 * u, ax, vcy, 1.1 * u); gr.addColorStop(0, '#161d27'); gr.addColorStop(0.7, '#070a0f'); gr.addColorStop(1, '#010203');
    ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = Math.max(1.5, 0.035 * u); ctx.strokeStyle = '#2b3440'; ctx.stroke();
    ctx.restore();
    // mặt (mắt + miệng) cắt trong kính
    const visorClip = (c) => superPath(c, ax, vcy, (VISOR.a - 0.02) * u, (VISOR.b - 0.02) * u, VISOR.n);
    r.drawFace(ctx, frame, fx, g, { clip: visorClip, glowK: 0.9 });
    // phản chiếu trên kính
    ctx.save(); ctx.beginPath(); visorClip(ctx); ctx.clip();
    gr = ctx.createLinearGradient(ax - 0.75 * u, vcy - 0.5 * u, ax - 0.1 * u, vcy - 0.2 * u); gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(ax - 0.4 * u, vcy - 0.41 * u, 0.5 * u, 0.1 * u, -0.34, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    for (const side of [-1, 1]) if (raised(side)) { ctx.save(); bodyXf(); drawArm(side); ctx.restore(); }
    ctx.restore();
    // chữ say đặt dưới robot
    const gs = { ...g, U: u * 1.5, mouth: { ...g.mouth, y: ay + (BODY.bot + 0.15) * u - u * 0.21 } };
    r.drawOverlay(ctx, extras, gs);
  },
};
