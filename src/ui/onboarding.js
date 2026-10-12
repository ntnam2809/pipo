// Onboarding lần đầu: mắt mở từ từ -> "Đánh thức Pipo" (cử chỉ: xin quyền motion iOS + mở audio) -> đặt tên -> chọn màu.
import { h } from './dom.js';
import { THEMES } from '../eyes/animator.js';

export function runOnboarding({ store, onWake, onTheme, onDone }) {
  const root = h('div', { class: 'onb' });
  const wakeBtn = h('button', { class: 'btn big', id: 'wake', text: 'Đánh thức Pipo' });
  const step1 = h('div', { class: 'step' }, wakeBtn);
  const nameIn = h('input', { type: 'text', placeholder: 'Đặt tên cho tớ nhé', maxlength: 14, value: store.data.name === 'Pipo' ? '' : store.data.name });
  const go2 = h('button', { class: 'btn', text: 'Tiếp' });
  const step2 = h('div', { class: 'step', hidden: true }, h('p', { text: 'Chào! Cậu gọi tớ là gì?' }), nameIn, go2);
  const sw = h('div', { class: 'swatches' });
  for (const [k, t] of Object.entries(THEMES)) sw.append(h('button', { class: 'sw' + (k === store.data.theme ? ' sel' : ''), title: t.label, style: { background: t.rainbow ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : `hsl(${t.h},${t.s}%,${t.l}%)` }, onclick: (e) => { store.data.theme = k; onTheme(k); sw.querySelectorAll('.sw').forEach((b) => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); } }));
  const done = h('button', { class: 'btn', id: 'onb-done', text: 'Xong, chơi thôi!' });
  const step3 = h('div', { class: 'step', hidden: true }, h('p', { text: 'Chọn màu mắt cho tớ:' }), sw, done);
  root.append(step1, step2, step3);
  wakeBtn.addEventListener('click', async () => { wakeBtn.disabled = true; try { await onWake(); } catch { /* bỏ qua */ } step1.hidden = true; step2.hidden = false; nameIn.focus(); });
  go2.addEventListener('click', () => { store.data.name = nameIn.value.trim() || 'Pipo'; step2.hidden = true; step3.hidden = false; });
  done.addEventListener('click', () => { store.data.onboarded = true; store.save(); root.remove(); onDone(); });
  document.body.append(root);
  return root;
}
