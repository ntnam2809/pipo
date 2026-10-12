// Đồng hồ: giờ trong ngày. Hàm thuần + sensor đếm nhịp.
export function formatClock(d) { const p = (n) => String(n).padStart(2, '0'); return [p(d.getHours()), p(d.getMinutes())]; }
export function hourFloat(d) { return d.getHours() + d.getMinutes() / 60; }
export function createClock(bus) {
  const S = { id: 'clock', status: 'on', timer: null };
  S.supported = () => true;
  const tick = () => { const d = new Date(); bus.emit('clock:tick', { hour: hourFloat(d), minute: d.getMinutes() }); };
  S.start = async () => { tick(); S.timer = setInterval(tick, 30000); return 'on'; };
  S.stop = () => clearInterval(S.timer);
  return S;
}
