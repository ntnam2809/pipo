// Registry skin ("Giao diện"): cách vẽ thân Pipo. Khác `theme` (màu mắt) và `style` (kiểu mắt) — hai thứ đó áp cho mọi skin.
//
// Thêm skin mới = tạo src/skins/<id>.js `export default` một object theo contract rồi thêm MỘT dòng import + một phần tử vào SKINS (và './src/skins/<id>.js' vào ASSETS của sw.js).
//
/**
 * @typedef {Object} Skin
 * @property {string} id      định danh ngắn, chữ thường (lưu trong store.data.skin, dùng ở ?skin=<id>)
 * @property {string} label   nhãn hiện trong Cài đặt ("Giao diện") và debug
 * @property {(base:Object, frame:Object, pose:Object)=>Object} [geom]
 *     tùy chọn: chỉnh tâm/khổ mặt (Eve thu mặt vào kính). Trả geom MỚI, giữ nguyên cấu trúc
 *     {W,H,U,B,D,cx,cy,L,R,mouth,color} vì main.js dùng geom cho chạm/cho ăn/fx.
 * @property {(r:import('../eyes/renderer.js').Renderer, ctx:CanvasRenderingContext2D, frame:Object, fx:Object, extras:Object, g:Object, pose:Object)=>void} draw
 *     vẽ TOÀN cảnh kể cả nền. r = Renderer: dùng lại r.paintBg · r.applyPose · r.drawFace (glow+fx+mắt+miệng) ·
 *     r.drawOverlay (say+dim) · r._eye · r._mouth · r._glow · r._say. extras = {say, dim, pose}.
 * @property {(r:import('../eyes/renderer.js').Renderer)=>void} [resize]
 *     tùy chọn: dựng lại cache (gradient, canvas offscreen) khi đổi kích thước/đổi skin. Trạng thái riêng của skin để ở r.sk[id].
 *
 * Pose (eyes/body.js): { bob, sway, tilt, squash, hover, armL:{lift,spread,curl}, armR:{...} } — mọi skin nên áp bob/sway/tilt/squash lên mặt;
 * chỉ skin có tay mới dùng arm*.
 */
import classic from './classic.js';
import pixel from './pixel.js';
import eve from './eve.js';

/** Thứ tự hiển thị. */
export const SKINS = [classic, pixel, eve];
export const SKIN_IDS = SKINS.map((s) => s.id);
/** id lạ -> classic. */
export function getSkin(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
