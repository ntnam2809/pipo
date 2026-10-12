// Thời tiết qua Open-Meteo (không key), cache 30 phút. classifyWeather là hàm thuần.
export const CACHE_MS = 30 * 60 * 1000;

export function classifyWeather({ code, temp, isDay, sunset, now }) {
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const storm = code >= 95;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const clear = code === 0 || code === 1;
  const sunsetMs = sunset ? Date.parse(sunset) : NaN;
  const lateNight = Number.isFinite(sunsetMs) && now ? now >= sunsetMs + 3 * 3600 * 1000 : false;
  return { code, temp, isDay: !!isDay, rain, storm, snow, clear, fog: code === 45 || code === 48, hot: temp > 33, cold: temp < 15, lateNight };
}
export function weatherUrl(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto`;
}
export function parseOpenMeteo(j, now = Date.now()) {
  const c = j && j.current; if (!c) return null;
  return classifyWeather({ code: c.weather_code, temp: c.temperature_2m, isDay: c.is_day === 1, sunset: j.daily && j.daily.sunset && j.daily.sunset[0], now });
}

export function createWeatherSensor(bus, geo, store) {
  const S = { id: 'weather', label: 'Thời tiết', status: 'off', timer: null, cache: null, at: 0 };
  S.supported = () => typeof fetch !== 'undefined' && !!geo.supported();
  S.refresh = async () => {
    try {
      if (S.cache && Date.now() - S.at < CACHE_MS) { bus.emit('weather:update', S.cache); return; }
      let pos = geo.pos; if (!pos && store.data.home) pos = store.data.home;
      if (!pos) { const c = await geo.getOnce(); pos = { lat: c.latitude, lon: c.longitude }; }
      const res = await fetch(weatherUrl(pos.lat, pos.lon)); if (!res.ok) throw new Error('http');
      const w = parseOpenMeteo(await res.json()); if (!w) throw new Error('parse');
      S.cache = w; S.at = Date.now(); S.status = 'on'; bus.emit('weather:update', w);
    } catch { if (S.status !== 'on') S.status = 'error'; }
  };
  S.start = async () => {
    if (!S.supported()) { S.status = 'unsupported'; return S.status; }
    S.status = 'on'; await S.refresh(); S.timer = setInterval(S.refresh, CACHE_MS); return S.status;
  };
  S.stop = () => { clearInterval(S.timer); S.timer = null; if (S.status === 'on') S.status = 'off'; };
  return S;
}
