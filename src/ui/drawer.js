// Drawer vuốt lên từ đáy: nhu cầu, khay ăn/uống, nhại giọng, la bàn, camera, cài đặt.
import { h } from './dom.js';
import { makeDraggable } from './feed.js';
import { FOODS, DRINKS } from '../brain/rules.js';

/** Khay ✋ Động tác: [lệnh, emoji, nhãn] — chạm là Pipo làm. */
export const GESTURE_ITEMS = [['wave', '👋', 'Chào'], ['bye', '🙌', 'Tạm biệt'], ['salute', '🫡', 'Nghiêm'], ['punch', '👊', 'Đấm'], ['combo', '🥊', 'Combo'], ['highfive', '🖐️', 'Đập tay'], ['fistbump', '✊', 'Cụng tay'], ['thumbsup', '👍', 'Giỏi'], ['clap', '👏', 'Vỗ tay'], ['point', '👉', 'Chỉ'], ['peekaboo', '🙈', 'Ú òa']];

const NEED_LABELS = { hunger: ['Đói', '🍪'], thirst: ['Khát', '💧'], energy: ['Sức', '⚡'], affection: ['Thương', '💗'], fun: ['Vui', '🎈'] };

export function createDrawer(cb) {
  const bars = {};
  const barEls = Object.keys(NEED_LABELS).map((k) => {
    const fill = h('i'); bars[k] = fill;
    return h('div', { class: 'need', title: NEED_LABELS[k][0] }, h('span', { text: NEED_LABELS[k][1] }), h('b', {}, fill));
  });
  const tray = h('div', { class: 'tray' });
  let trayKind = null;
  const showTray = (kind) => {
    tray.innerHTML = '';
    if (trayKind === kind) { trayKind = null; tray.classList.remove('on'); return; }
    trayKind = kind; tray.classList.add('on');
    if (kind === 'gesture') {
      for (const [cmd, emoji, label] of GESTURE_ITEMS) tray.append(h('button', { class: 'item gitem', title: label, 'data-g': cmd, onclick: () => { drawer.close(); cb.onGesture && cb.onGesture(cmd); } }, h('span', { text: emoji }), h('small', { text: label })));
      return;
    }
    const src = kind === 'food' ? FOODS : DRINKS;
    for (const [key, it] of Object.entries(src)) {
      const el = h('div', { class: 'item', title: it.label }, h('span', { text: it.emoji }), h('small', { text: it.label }));
      makeDraggable(el, {
        emoji: it.emoji,
        onStart: (x, y) => { drawer.close(); cb.onDragMove && cb.onDragMove(x, y, kind, key); },
        onMove: (x, y) => cb.onDragMove && cb.onDragMove(x, y, kind, key),
        onDrop: (x, y) => cb.onDrop && cb.onDrop(x, y, kind, key),
        onCancel: () => cb.onDragCancel && cb.onDragCancel(),
      });
      tray.append(el);
    }
    if (kind === 'drink') tray.append(h('p', { class: 'hint', text: 'Kéo lên mắt, hoặc chạm 💧 rồi nghiêng máy để rót.' }));
  };
  const btn = (emoji, label, fn, id) => h('button', { class: 'dbtn', id, onclick: fn }, h('span', { text: emoji }), h('small', { text: label }));
  const mimicBtn = btn('🎙️', 'Nhại giọng', () => {}, 'btn-mimic');
  let held = false;
  const down = (e) => { e.preventDefault(); if (held) return; held = true; mimicBtn.classList.add('hold'); cb.onMimicStart && cb.onMimicStart(); };
  const up = () => { if (!held) return; held = false; mimicBtn.classList.remove('hold'); cb.onMimicStop && cb.onMimicStop(); };
  mimicBtn.addEventListener('pointerdown', down); mimicBtn.addEventListener('pointerup', up); mimicBtn.addEventListener('pointerleave', up); mimicBtn.addEventListener('pointercancel', up);
  const compassBtn = btn('🧭', 'La bàn', () => cb.onToggle('compass'), 'btn-compass');
  const cameraBtn = btn('📷', 'Camera', () => cb.onToggle('camera'), 'btn-camera');
  const musicBtn = btn('🎵', 'Nghe nhạc', () => cb.onToggle('music'), 'btn-music');
  const meetBtn = btn('📡', 'Gặp bạn', () => { drawer.close(); cb.onMeet && cb.onMeet(); }, 'btn-meet');
  const el = h('div', { class: 'drawer', id: 'drawer', 'aria-hidden': 'true' },
    h('div', { class: 'grab' }),
    h('div', { class: 'needs' }, barEls),
    h('div', { class: 'row' },
      btn('🍪', 'Ăn', () => showTray('food'), 'btn-food'), btn('💧', 'Uống', () => showTray('drink'), 'btn-drink'), btn('✋', 'Động tác', () => showTray('gesture'), 'btn-gesture'), mimicBtn, compassBtn, cameraBtn, musicBtn, meetBtn,
      btn('⚙️', 'Cài đặt', () => { drawer.close(); cb.onSettings(); }, 'btn-settings')),
    tray);
  const corner = h('button', { class: 'corner', id: 'corner', 'aria-label': 'Mở menu', text: '☰', onclick: () => drawer.toggle() });
  const drawer = {
    el, corner, isOpen: false,
    open() { drawer.isOpen = true; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); corner.classList.add('hide'); },
    close() { drawer.isOpen = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); corner.classList.remove('hide'); },
    toggle() { drawer.isOpen ? drawer.close() : drawer.open(); },
    setNeeds(v) { for (const k of Object.keys(bars)) bars[k].style.width = Math.round(Math.max(0, Math.min(1, v[k])) * 100) + '%'; for (const k of Object.keys(bars)) bars[k].parentElement.parentElement.classList.toggle('low', v[k] < 0.3); },
    setActive(id, on) { const b = id === 'compass' ? compassBtn : id === 'camera' ? cameraBtn : id === 'music' ? musicBtn : id === 'meet' ? meetBtn : null; if (b) b.classList.toggle('active', !!on); },
  };
  return drawer;
}
