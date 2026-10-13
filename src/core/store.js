// Lưu trữ localStorage (mọi truy cập bọc try/catch), có version + migrate.
export const STORE_KEY = 'pipo.v1';
export const VERSION = 2;

export function defaults() {
  return {
    version: VERSION,
    onboarded: false,
    name: 'Pipo',
    theme: 'cyan',
    style: 'solid',
    skin: 'classic',
    needs: null,
    lastSeen: 0,
    lastGreet: '',
    home: null,
    places: [],
    friends: [],
    settings: {
      sound: true, vibrate: true, tts: false, kiosk: false, wakeLock: true, mimicPreset: 'chipmunk', autoFullscreen: false, installHintOff: false, telemetry: true,
      sensors: { motion: true, compass: false, geo: false, weather: false, camera: false, mic: false, battery: true, voice: false, mimicFace: false, music: false, hands: false },
      llm: { provider: 'none', baseUrl: '', apiKey: '', model: 'claude-haiku-5-5', monologue: false },
    },
  };
}

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    if (isObj(base[k]) && isObj(over[k])) out[k] = deepMerge(base[k], over[k]);
    else if (over[k] !== undefined) out[k] = over[k];
  }
  return out;
}

export function migrate(data) {
  const d = deepMerge(defaults(), isObj(data) ? data : {});
  if (!Array.isArray(d.places)) d.places = [];
  d.places = d.places.slice(-50);
  if (!Array.isArray(d.friends)) d.friends = [];
  d.friends = d.friends.filter((f) => f && typeof f.name === 'string').slice(0, 50);
  d.version = VERSION;
  return d;
}

function getStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class Store {
  constructor(storage) { this.storage = storage === undefined ? getStorage() : storage; this.data = this.load(); }
  load() {
    try {
      const raw = this.storage && this.storage.getItem(STORE_KEY);
      return migrate(raw ? JSON.parse(raw) : null);
    } catch { return migrate(null); }
  }
  save() {
    try { if (!this.storage) return false; this.storage.setItem(STORE_KEY, JSON.stringify(this.data)); return true; } catch { return false; }
  }
  reset() {
    try { if (this.storage) this.storage.removeItem(STORE_KEY); } catch { /* bỏ qua */ }
    this.data = migrate(null);
    return this.data;
  }
  addPlace(p) { this.data.places.push(p); this.data.places = this.data.places.slice(-50); this.save(); }
}
