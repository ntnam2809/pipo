// Bảng cài đặt: tên, màu mắt, kiểu mắt, âm thanh, cảm biến, nhại giọng, LLM, dữ liệu.
import { h } from './dom.js';
import { THEMES } from '../eyes/animator.js';
import { SKINS } from '../skins/index.js';
import { MIMIC_PRESETS } from '../audio/mimic.js';
import { PROVIDERS, DEFAULT_MODEL } from '../brain/llm.js';
import { BLOCK_TEXT } from '../core/telemetry.js';

const STATUS = { unsupported: 'không hỗ trợ', denied: 'bị từ chối', off: 'tắt', on: 'đang bật', error: 'lỗi', needcam: 'cần bật camera' };
const SENSORS = [
  ['motion', 'Nghiêng · lắc · rơi · bước chân'], ['compass', 'La bàn'], ['geo', 'GPS (nhà · chỗ mới)'], ['weather', 'Thời tiết (Open-Meteo)'],
  ['camera', 'Camera (mặt · ú òa · chuyển động)'], ['hands', 'Nhận dáng tay (tải MediaPipe)'], ['mic', 'Micro (tiếng động · vỗ tay)'], ['battery', 'Pin'], ['voice', 'Lệnh giọng nói (vi-VN)'], ['music', 'Nghe nhạc & nhảy theo (micro)'],
];

export function createSettings({ store, sensors, onChange, onSetHome, onReset, onClose, onOpen, extra, telemetry }) {
  const S = () => store.data.settings;
  const row = (label, ctl) => h('label', { class: 'frow' }, h('span', { text: label }), ctl);
  const check = (get, set) => { const i = h('input', { type: 'checkbox' }); i.checked = !!get(); i.addEventListener('change', () => set(i.checked)); return i; };
  const text = (get, set, type = 'text', ph = '') => { const i = h('input', { type, placeholder: ph }); i.value = get() || ''; i.addEventListener('change', () => set(i.value.trim())); return i; };
  const select = (opts, get, set) => { const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v, text: l }))); s.value = get(); s.addEventListener('change', () => set(s.value)); return s; };

  const swatches = h('div', { class: 'swatches' });
  const drawSw = () => { swatches.innerHTML = ''; for (const [k, t] of Object.entries(THEMES)) swatches.append(h('button', { class: 'sw' + (store.data.theme === k ? ' sel' : ''), title: t.label, style: { background: t.rainbow ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : `hsl(${t.h},${t.s}%,${t.l}%)` }, onclick: () => { store.data.theme = k; store.save(); onChange('theme', k); drawSw(); } })); };
  drawSw();

  const stat = {};
  const sensorRows = SENSORS.map(([id, label]) => {
    const st = h('em', { class: 'st' }); stat[id] = st;
    const i = check(() => S().sensors[id], (v) => { S().sensors[id] = v; store.save(); onChange('sensor', { id, on: v }); });
    return h('label', { class: 'frow' }, h('span', {}, label, ' ', st), i);
  });
  const llmNote = h('p', { class: 'warn', text: 'Khóa API chỉ lưu trong localStorage của máy này, gửi thẳng tới nhà cung cấp bạn chọn. Đừng nhập khóa trên máy dùng chung.' });

  // Thống kê ẩn danh: bật/tắt, giải thích thu gì/không thu gì, xem đúng gói sẽ gửi.
  const teleState = h('p', { class: 'warn', id: 'tele-state' });
  const telePre = h('pre', { class: 'tele-pre', id: 'tele-pre', hidden: true });
  const teleBtn = h('button', { class: 'btn', id: 'tele-preview', text: 'Xem gói sẽ gửi', onclick: () => {
    if (!telePre.hidden) { telePre.hidden = true; return; }
    const pv = telemetry ? telemetry.preview() : { ok: false, text: BLOCK_TEXT['no-endpoint'] };
    telePre.textContent = pv.ok ? '// Gói "active": gửi ngay lần mở đầu tiên mỗi ngày' + (pv.activeSent ? ' (hôm nay đã gửi)' : '') + '.\n' + JSON.stringify(pv.active, null, 1) + '\n\n// Gói "day": số đếm của hôm nay tính đến giờ; gửi sau khi sang ngày (UTC).\n' + JSON.stringify(pv.packet, null, 1) : pv.text;
    telePre.hidden = false;
  } });
  const teleRow = row('Gửi thống kê ẩn danh (giúp cải thiện Pipo)', check(() => S().telemetry !== false, (v) => { S().telemetry = v; store.save(); telePre.hidden = true; onChange('telemetry', v); refreshTele(); }));
  function refreshTele() { const st = telemetry ? telemetry.status() : 'no-endpoint'; teleState.textContent = st === 'on' ? 'Đang bật: mỗi ngày gửi một gói "có mở app" và một gói số đếm của ngày hôm trước.' : BLOCK_TEXT[st]; }
  const teleNote = h('p', { class: 'warn', text: 'Gói "có mở app" (gửi ngay lần mở đầu ngày) chỉ gồm: số ngày kể từ lúc cài, số ngày đã mở trong 7/30 ngày, kiểu máy, trình duyệt hay đã cài, ngôn ngữ 2 chữ. Gói số đếm của ngày hôm trước thu thêm: số lần mở và số phút dùng (làm tròn theo khoảng), số lần dùng từng tính năng (làm tròn theo khoảng), kiểu máy (Android/iOS/máy tính), chạy trong trình duyệt hay đã cài, ngôn ngữ 2 chữ, giao diện, màu mắt, cảm biến đang bật, nhà cung cấp LLM. Không thu: ID hay cookie, IP, vị trí, nội dung trò chuyện, tên Pipo, khóa API, âm thanh, hình ảnh. Tắt ở đây thì xóa luôn bộ đếm chưa gửi.' });

  const el = h('div', { class: 'panel', id: 'settings', hidden: true },
    h('div', { class: 'phead' }, h('b', { text: 'Cài đặt' }), h('button', { class: 'x', text: '✕', 'aria-label': 'Đóng', onclick: () => api.close() })),
    h('div', { class: 'pbody' },
      row('Tên', text(() => store.data.name, (v) => { store.data.name = v || 'Pipo'; store.save(); onChange('name', store.data.name); })),
      h('div', { class: 'frow' }, h('span', { text: 'Màu mắt' }), swatches),
      row('Giao diện', select(SKINS.map((s) => [s.id, s.label]), () => store.data.skin, (v) => { store.data.skin = v; store.save(); onChange('skin', v); })),
      row('Kiểu mắt', select([['solid', 'Khối đặc (robot)'], ['pupil', 'Có đồng tử']], () => store.data.style, (v) => { store.data.style = v; store.save(); onChange('style', v); })),
      row('Âm thanh', check(() => S().sound, (v) => { S().sound = v; store.save(); onChange('sound', v); })),
      row('Rung', check(() => S().vibrate, (v) => { S().vibrate = v; store.save(); })),
      row('Pipo nói thành tiếng (TTS)', check(() => S().tts, (v) => { S().tts = v; store.save(); })),
      row('Chế độ kiểng (giữ sáng, đêm mờ)', check(() => S().kiosk, (v) => { S().kiosk = v; store.save(); onChange('kiosk', v); })),
      row('Giọng nhại', select(Object.entries(MIMIC_PRESETS).map(([k, p]) => [k, p.label]), () => S().mimicPreset, (v) => { S().mimicPreset = v; store.save(); })),
      extra || null,
      h('h4', { text: 'Cảm biến' }), ...sensorRows,
      row('Bắt chước nét mặt (tải MediaPipe)', check(() => S().sensors.mimicFace, (v) => { S().sensors.mimicFace = v; store.save(); onChange('mimicFace', v); })),
      h('div', { class: 'frow' }, h('button', { class: 'btn', text: '🏠 Đặt "nhà" tại vị trí này', onclick: async () => { const ok = await onSetHome(); toast(ok ? 'Đã lưu nhà.' : 'Chưa lấy được vị trí.'); } })),
      h('h4', { text: 'LLM (tùy chọn)' }),
      row('Nhà cung cấp', select(PROVIDERS.map((p) => [p, { none: 'Tắt (rule brain)', 'claude-artifact': 'Claude của artifact (không cần key)', anthropic: 'Anthropic', 'openai-compatible': 'OpenAI-compatible', gemini: 'Gemini' }[p]]), () => S().llm.provider, (v) => { S().llm.provider = v; store.save(); onChange('llm', S().llm); })),
      row('Base URL', text(() => S().llm.baseUrl, (v) => { S().llm.baseUrl = v; store.save(); }, 'text', 'để trống = mặc định')),
      row('API key', text(() => S().llm.apiKey, (v) => { S().llm.apiKey = v; store.save(); }, 'password', 'sk-...')),
      row('Model (Claude luôn dùng Haiku)', text(() => S().llm.model, (v) => { S().llm.model = v || DEFAULT_MODEL; store.save(); }, 'text', DEFAULT_MODEL)),
      row('Độc thoại (≤ 1 lần / 10 phút)', check(() => S().llm.monologue, (v) => { S().llm.monologue = v; store.save(); })),
      llmNote,
      h('h4', { text: 'Thống kê ẩn danh' }), teleRow, teleNote, teleState, h('div', { class: 'frow' }, teleBtn), telePre,
      h('div', { class: 'frow' }, h('button', { class: 'btn danger', text: 'Xóa dữ liệu', onclick: () => { if (confirm('Xóa toàn bộ dữ liệu của Pipo?')) onReset(); } }))));
  const toastEl = h('div', { class: 'toast' }); el.append(toastEl);
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); setTimeout(() => toastEl.classList.remove('on'), 1800); }
  const api = {
    el, open() { el.hidden = false; api.refresh(); refreshTele(); if (onOpen) onOpen(); }, close() { el.hidden = true; onClose && onClose(); },
    refresh() { for (const [id] of SENSORS) { const s = sensors[id]; if (stat[id]) stat[id].textContent = s ? '(' + (STATUS[s.status] || s.status) + ')' : ''; } },
  };
  return api;
}
