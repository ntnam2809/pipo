// Pin: yếu / đang sạc.
export function createBatterySensor(bus) {
  const S = { id: 'battery', label: 'Pin', status: 'off', b: null, fns: [], lowSent: false };
  S.supported = () => typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function';
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try {
      const b = (S.b = await navigator.getBattery());
      const onLevel = () => { bus.emit('battery:level', { level: b.level }); if (b.level < 0.2 && !b.charging) { if (!S.lowSent) { S.lowSent = true; bus.emit('battery:low', { level: b.level }); } } else if (b.level >= 0.25) S.lowSent = false; };
      const onCharge = () => bus.emit('battery:charging', { charging: b.charging });
      b.addEventListener('levelchange', onLevel); b.addEventListener('chargingchange', onCharge); S.fns = [['levelchange', onLevel], ['chargingchange', onCharge]];
      S.status = 'on'; onLevel(); if (b.charging) onCharge();
    } catch { S.status = 'error'; }
    return S.status;
  };
  S.stop = () => { if (S.b) for (const [n, f] of S.fns) { try { S.b.removeEventListener(n, f); } catch { /* bỏ qua */ } } S.fns = []; if (S.status === 'on') S.status = 'off'; };
  return S;
}
