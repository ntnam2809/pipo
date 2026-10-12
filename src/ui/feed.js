// Kéo món từ khay lên mắt: ghost bám ngón tay; onMove/onDrop báo toạ độ màn hình.
import { h } from './dom.js';

export function makeDraggable(el, { emoji, onStart, onMove, onDrop, onCancel }) {
  let ghost = null, id = null;
  const end = (e, drop) => {
    if (!ghost) return;
    ghost.remove(); ghost = null;
    try { el.releasePointerCapture(id); } catch { /* bỏ qua */ }
    if (drop) onDrop && onDrop(e.clientX, e.clientY); else onCancel && onCancel();
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); id = e.pointerId;
    try { el.setPointerCapture(id); } catch { /* bỏ qua */ }
    ghost = h('div', { class: 'ghost', text: emoji, style: { left: e.clientX + 'px', top: e.clientY + 'px' } });
    document.body.append(ghost); onStart && onStart(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => {
    if (!ghost) return; ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; onMove && onMove(e.clientX, e.clientY);
  });
  el.addEventListener('pointerup', (e) => end(e, true));
  el.addEventListener('pointercancel', (e) => end(e, false));
}
