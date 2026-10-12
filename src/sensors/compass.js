// La bàn: hướng Bắc. dirVector là hàm thuần.
/** Vector (x phải, y xuống) chỉ hướng tương đối rel (độ, theo chiều kim đồng hồ từ đỉnh màn hình). */
export function dirVector(relDeg) { const r = (relDeg * Math.PI) / 180; return { x: Math.sin(r), y: -Math.cos(r) }; }
/** Hướng Bắc nằm ở -heading so với đỉnh màn hình. */
export function northVector(headingDeg) { return dirVector(-headingDeg); }
export function angleDiff(a, b) { return ((b - a + 540) % 360) - 180; }

export function createCompassSensor(bus) {
  const S = { id: 'compass', label: 'La bàn', status: 'off', heading: null, handlers: [], last: 0 };
  S.supported = () => typeof window !== 'undefined' && ('DeviceOrientationEvent' in window);
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') { S.status = 'denied'; return S.status; }
      }
    } catch { S.status = 'denied'; return S.status; }
    const on = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
      if (h == null) return;
      S.heading = S.heading == null ? h : (S.heading + angleDiff(S.heading, h) * 0.25 + 360) % 360;
      const now = performance.now(); if (now - S.last < 90) return; S.last = now;
      S.status = 'on'; bus.emit('compass:heading', { deg: S.heading });
    };
    for (const n of ['deviceorientationabsolute', 'deviceorientation']) { window.addEventListener(n, on); S.handlers.push([n, on]); }
    S.status = 'on';
    setTimeout(() => { if (S.heading == null && S.status === 'on') { S.stop(); S.status = 'unsupported'; bus.emit('sensor:status', { id: 'compass', status: S.status }); } }, 2000);
    return S.status;
  };
  S.stop = () => { for (const [n, f] of S.handlers) { try { window.removeEventListener(n, f); } catch { /* bỏ qua */ } } S.handlers = []; if (S.status === 'on') S.status = 'off'; };
  return S;
}
