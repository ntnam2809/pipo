// GPS: nhà, quãng đường, chỗ mới. GeoAnalyzer là logic thuần.
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Góc phương vị (độ, 0 = Bắc, theo chiều kim đồng hồ). */
export function bearing(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

export const NEW_PLACE_M = 300, HOME_NEAR_M = 80, HOME_FAR_M = 200, MAX_PLACES = 50;

export class GeoAnalyzer {
  constructor({ home = null, places = [] } = {}) { this.home = home; this.places = [...places]; this.wasFar = true; this.first = true; }
  setHome(h) { this.home = h; this.wasFar = false; }
  /** Trả danh sách {name,payload}. places được cập nhật tại chỗ (tối đa 50). */
  update(lat, lon) {
    const ev = [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ev;
    const near = this.places.some((p) => haversine(lat, lon, p.lat, p.lon) <= NEW_PLACE_M);
    if (!near) {
      this.places.push({ lat, lon, t: Date.now() }); if (this.places.length > MAX_PLACES) this.places.shift();
      if (!this.first) ev.push({ name: 'geo:newplace', payload: { lat, lon } });
    }
    this.first = false;
    if (this.home) {
      const d = haversine(lat, lon, this.home.lat, this.home.lon);
      if (d > HOME_FAR_M) this.wasFar = true;
      else if (d <= HOME_NEAR_M && this.wasFar) { this.wasFar = false; ev.push({ name: 'geo:home', payload: { d } }); }
      ev.push({ name: 'geo:homebearing', payload: { deg: bearing(lat, lon, this.home.lat, this.home.lon), d } });
    }
    return ev;
  }
}

export function createGeoSensor(bus, store) {
  const S = { id: 'geo', label: 'GPS', status: 'off', watch: null, an: null, pos: null };
  S.supported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;
  S.getOnce = () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition((p) => res(p.coords), rej, { maximumAge: 60000, timeout: 10000 }));
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    S.an = new GeoAnalyzer({ home: store.data.home, places: store.data.places });
    try {
      S.watch = navigator.geolocation.watchPosition((p) => {
        S.status = 'on'; S.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        bus.emit('geo:fix', S.pos);
        for (const ev of S.an.update(S.pos.lat, S.pos.lon)) bus.emit(ev.name, ev.payload);
        store.data.places = S.an.places; store.save();
      }, (err) => { S.status = err && err.code === 1 ? 'denied' : 'error'; bus.emit('sensor:status', { id: 'geo', status: S.status }); }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
      S.status = 'on';
    } catch { S.status = 'error'; }
    return S.status;
  };
  S.stop = () => { try { if (S.watch != null) navigator.geolocation.clearWatch(S.watch); } catch { /* bỏ qua */ } S.watch = null; if (S.status === 'on') S.status = 'off'; };
  S.setHomeHere = async () => {
    try { const c = S.pos ? { latitude: S.pos.lat, longitude: S.pos.lon } : await S.getOnce(); store.data.home = { lat: c.latitude, lon: c.longitude }; store.save(); if (S.an) S.an.setHome(store.data.home); return true; } catch { return false; }
  };
  return S;
}
