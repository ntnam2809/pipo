// Cài như app: bắt beforeinstallprompt (Android/desktop Chrome), hướng dẫn iOS, toàn màn hình khi còn chạy trong tab.
import { h } from './dom.js';

let deferred = null; const subs = new Set();
const notify = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export function isStandalone() {
  try { return ['fullscreen', 'standalone', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true; } catch { return false; }
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOK = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
export function enterFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || fsEl()) return; try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch { /* bỏ qua */ }
}
function toggleFullscreen() { if (fsEl()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); } else enterFullscreen(); }
export function howTo() {
  return isIOS() ? 'Bấm nút Chia sẻ ⬆︎ của Safari (hoặc Chrome) → "Thêm vào Màn hình chính", rồi mở Pipo từ icon mới.'
    : 'Mở menu ⋮ của trình duyệt → "Cài đặt ứng dụng" (hoặc "Thêm vào màn hình chính"), rồi mở Pipo từ icon mới.';
}
export async function promptInstall() {
  if (!deferred) return 'manual';
  const ev = deferred; deferred = null; notify();
  try { ev.prompt(); const r = await ev.userChoice; return r && r.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch { return 'manual'; }
}

/** Mục "Ứng dụng" trong Cài đặt + nút gợi ý nhỏ góc trái; tự toàn màn hình ở cú chạm kế tiếp nếu bật. */
export function createInstall({ store, onManual }) {
  const S = () => store.data.settings;
  const status = h('span', {});
  const installBtn = h('button', { class: 'btn', text: '📲 Cài Pipo như ứng dụng', onclick: () => install() });
  const fsBtn = h('button', { class: 'btn', text: '⛶ Toàn màn hình', onclick: () => toggleFullscreen() });
  const auto = h('input', { type: 'checkbox' }); auto.checked = !!S().autoFullscreen;
  auto.addEventListener('change', () => { S().autoFullscreen = auto.checked; store.save(); });
  const autoRow = h('label', { class: 'frow' }, h('span', { text: 'Tự toàn màn hình khi chạm (lúc chạy trong trình duyệt)' }), auto);
  const help = h('p', { class: 'warn' });
  const section = h('div', {}, h('h4', { text: 'Ứng dụng' }), h('div', { class: 'frow' }, status), h('div', { class: 'frow' }, installBtn, fsBtn), autoRow, help);

  const pill = h('button', { class: 'pill', id: 'install-pill', 'aria-label': 'Cài Pipo như ứng dụng' },
    h('span', { text: '📲 Cài như app', onclick: () => install() }),
    h('b', { text: '✕', 'aria-label': 'Ẩn gợi ý', onclick: (e) => { e.stopPropagation(); S().installHintOff = true; store.save(); refresh(); } }));

  async function install() {
    const r = await promptInstall();
    if (r === 'manual') { help.textContent = howTo(); if (onManual) onManual(); }
    refresh();
  }
  function refresh() {
    const sa = isStandalone();
    status.textContent = sa ? '✓ Đang chạy như ứng dụng — không có thanh trình duyệt.' : deferred ? 'Có thể cài Pipo lên màn hình chính.' : 'Đang chạy trong trình duyệt.';
    installBtn.hidden = sa; fsBtn.hidden = sa || !fsOK(); autoRow.hidden = sa || !fsOK();
    help.textContent = sa ? '' : deferred ? 'Cài xong, mở Pipo từ icon ngoài màn hình chính để chạy toàn màn hình.' : howTo();
    let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* bỏ qua */ }
    pill.hidden = sa || !!S().installHintOff || !(deferred || (coarse && isIOS()));
  }
  subs.add(refresh); refresh();
  try { matchMedia('(display-mode: standalone)').addEventListener('change', refresh); } catch { /* bỏ qua */ }

  // Toàn màn hình cần cử chỉ người dùng: thử ở mỗi lần nhả tay khi bật và chưa toàn màn hình.
  const onUp = () => { if (S().autoFullscreen && !isStandalone() && fsOK() && !fsEl()) enterFullscreen(); };
  document.addEventListener('pointerup', onUp, true);

  return { section, pill, refresh };
}
