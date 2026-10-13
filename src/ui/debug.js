// ?debug=1: chọn mọi biểu cảm, slider nhu cầu, giả lập sự kiện cảm biến.
import { h } from './dom.js';
import { EXPRESSION_IDS } from '../eyes/expressions.js';
import { FOODS, DRINKS } from '../brain/rules.js';
import { SKINS } from '../skins/index.js';

const EVENTS = [
  ['Lắc', 'motion:shake'], ['Lắc mạnh', 'motion:hardshake'], ['Rơi', 'motion:freefall'], ['Chạm đất', 'motion:impact'], ['Úp mặt', 'motion:facedown'], ['Ngửa lại', 'motion:faceup'],
  ['Lật ngược', 'motion:upsidedown'], ['Dựng lại', 'motion:upright'], ['Bước chân', 'motion:step'],
  ['Mưa', 'weather:update', { rain: true, temp: 24, isDay: true }], ['Nóng', 'weather:update', { temp: 36, isDay: true, clear: true }], ['Lạnh', 'weather:update', { temp: 9, isDay: true }], ['Trời quang', 'weather:update', { clear: true, temp: 27, isDay: true }],
  ['Có mặt người', 'camera:face', { present: true, x: 0.3, y: -0.1, size: 0.3 }], ['Mặt lại gần', 'camera:face', { present: true, x: 0, y: 0, size: 0.6 }], ['Mất mặt', 'camera:facelost'], ['Ú òa', 'camera:peekaboo'], ['Camera tối', 'camera:dark', { dark: true }],
  ['Vỗ tay', 'mic:clap'], ['Vỗ 2 lần', 'mic:clap2'], ['Tiếng to', 'mic:loud'], ['Pin yếu', 'battery:low', { level: 0.15 }], ['Cắm sạc', 'battery:charging', { charging: true }],
  ['Chỗ mới', 'geo:newplace'], ['Về nhà', 'geo:home'], ['Chọc', 'touch:poke'], ['Nựng', 'touch:pet', { count: 3 }], ['Ôm', 'touch:hug'], ['Gọi tên', 'voice:name'], ['Ngủ đi', 'voice:cmd', { cmd: 'sleep' }], ['Dậy đi', 'voice:cmd', { cmd: 'wake' }],
  ['Nhảy đi', 'voice:cmd', { cmd: 'dance' }],
];

export function createDebug({ bus, force, needs, animator, getSkin, setSkin, toggleMusic }) {
  const sel = h('select', { id: 'dbg-expr' }, EXPRESSION_IDS.map((id) => h('option', { value: id, text: id })));
  sel.addEventListener('change', () => force(sel.value));
  const skinSel = h('select', { id: 'dbg-skin' }, SKINS.map((s) => h('option', { value: s.id, text: s.label })));
  skinSel.value = getSkin ? getSkin() : 'classic'; skinSel.addEventListener('change', () => setSkin && setSkin(skinSel.value));
  const musicBtn = h('button', { id: 'dbg-music', onclick: () => { const on = toggleMusic && toggleMusic(); musicBtn.textContent = on ? 'Tắt nhạc giả' : 'Giả lập nhạc 120 BPM'; } }, 'Giả lập nhạc 120 BPM');
  const sliders = ['hunger', 'thirst', 'energy', 'affection', 'fun'].map((k) => {
    const i = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: needs.get(k) }); i.addEventListener('input', () => needs.set(k, Number(i.value)));
    return h('label', { class: 'dl' }, k, i);
  });
  const amp = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0 }); amp.addEventListener('input', () => animator.setVoiceAmp(Number(amp.value)));
  const evBtns = EVENTS.map(([l, n, p]) => h('button', { onclick: () => bus.emit(n, p || {}) }, l));
  const feedBtns = [...Object.keys(FOODS).map((k) => h('button', { onclick: () => bus.emit('feed:drop', { kind: 'food', item: k }) }, FOODS[k].emoji)), ...Object.keys(DRINKS).map((k) => h('button', { onclick: () => bus.emit('feed:drop', { kind: 'drink', item: k }) }, DRINKS[k].emoji))];
  const body = h('div', { class: 'dbody' }, h('div', {}, 'Biểu cảm ', sel), h('div', {}, 'Giao diện ', skinSel), ...sliders, h('label', { class: 'dl' }, 'nhép miệng', amp), h('div', { class: 'dbtns' }, musicBtn, evBtns, feedBtns));
  const tg = h('button', { class: 'dtog', text: 'debug', onclick: () => { body.hidden = !body.hidden; } });
  return h('div', { class: 'debug', id: 'debug' }, tg, body);
}
