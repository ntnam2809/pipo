// Validate gói thống kê Pipo — hàm thuần, tất định, không phụ thuộc gì (worker và test cùng import).
// Gói lạ thì loại cả gói; khóa lạ thì bỏ; số ngoài bucket thì ép về bucket (cận dưới) hợp lệ gần nhất.

export const MAX_BYTES = 2048;
export const SCHEMA = 1;
export const DAY_MS = 86400000;
export const DAY_WINDOW = 2;   // |day - hôm nay (UTC)| ≤ 2 ngày

export const EV_KEYS = ['poke', 'pet', 'hug', 'feed', 'drink', 'mimic', 'chat_llm', 'music_on', 'dance', 'clock', 'settings_open', 'install_prompt', 'install_accepted', 'gesture', 'shot', 'hand_mirror', 'meet_start', 'meet_ok'];
export const SENSOR_IDS = ['motion', 'compass', 'geo', 'weather', 'camera', 'mic', 'battery', 'voice', 'mimicFace', 'music'];
export const LLM_IDS = ['none', 'claude-artifact', 'anthropic', 'openai-compatible', 'gemini', 'other'];
export const MODES = ['browser', 'standalone'];
export const PLATFORMS = ['android', 'ios', 'desktop', 'other'];
export const BUCKETS = {
  count: [0, 1, 2, 6, 21],
  sessions: [0, 1, 2, 3, 6, 11],
  minutes: [0, 1, 3, 6, 16, 31, 61],
};
/** Khóa cho phép ở gốc từng loại gói (`kind`). */
export const KINDS = ['active', 'day'];
export const ACTIVE_KEYS = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang'];
export const DAY_KEYS = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang', 'skin', 'theme', 'sessions', 'minutes', 'ev', 'sensors', 'llm'];
export const TOP_KEYS = DAY_KEYS;   // tương thích tên cũ

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9_-]{1,16}$/;
const LANG_RE = /^[a-z]{2}$/;

export function dayNum(day) { return Math.round(Date.parse(day + 'T00:00:00Z') / DAY_MS); }
export function validDay(day) { return typeof day === 'string' && DAY_RE.test(day) && !Number.isNaN(Date.parse(day + 'T00:00:00Z')) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day; }

function snap(n, floors) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  let out = floors[0];
  for (const f of floors) if (n >= f) out = f;
  return out;
}
function int(n, lo, hi) { return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

/**
 * → { ok: true, packet } (packet dựng mới, đúng khóa của kind, đúng thứ tự) hoặc { ok: false, reason }.
 * `kind` bắt buộc: 'active' (chỉ phần chung) hoặc 'day' (thêm skin/theme/sessions/minutes/ev/sensors/llm).
 */
export function validatePacket(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not-object' };
  if (raw.v !== SCHEMA) return { ok: false, reason: 'version' };
  if (!KINDS.includes(raw.kind)) return { ok: false, reason: 'kind' };
  if (!validDay(raw.day)) return { ok: false, reason: 'day' };
  const today = Math.floor(nowMs / DAY_MS);
  if (Math.abs(dayNum(raw.day) - today) > DAY_WINDOW) return { ok: false, reason: 'day-window' };
  const dsi = int(raw.dsi, 0, 31), a7 = int(raw.a7, 0, 7), a30 = int(raw.a30, 0, 30);
  if (dsi === null || a7 === null || a30 === null) return { ok: false, reason: 'counters' };
  if (a30 < 1 || a7 > a30) return { ok: false, reason: 'counters' };
  if (!MODES.includes(raw.mode) || !PLATFORMS.includes(raw.platform)) return { ok: false, reason: 'enum' };
  if (typeof raw.lang !== 'string' || !LANG_RE.test(raw.lang)) return { ok: false, reason: 'lang' };
  const head = { v: SCHEMA, kind: raw.kind, day: raw.day, dsi, a7, a30, mode: raw.mode, platform: raw.platform, lang: raw.lang };
  if (raw.kind === 'active') return { ok: true, packet: head };
  if (typeof raw.skin !== 'string' || !SLUG_RE.test(raw.skin) || typeof raw.theme !== 'string' || !SLUG_RE.test(raw.theme)) return { ok: false, reason: 'slug' };
  const sessions = snap(raw.sessions, BUCKETS.sessions), minutes = snap(raw.minutes, BUCKETS.minutes);
  if (sessions === null || minutes === null) return { ok: false, reason: 'bucket' };
  if (!raw.ev || typeof raw.ev !== 'object' || Array.isArray(raw.ev)) return { ok: false, reason: 'ev' };
  const ev = {};
  for (const k of EV_KEYS) {
    const v = raw.ev[k] === undefined ? 0 : snap(raw.ev[k], BUCKETS.count);
    if (v === null) return { ok: false, reason: 'ev' };
    ev[k] = v;
  }
  const sensors = Array.isArray(raw.sensors) ? SENSOR_IDS.filter((s) => raw.sensors.includes(s)) : [];
  const llm = LLM_IDS.includes(raw.llm) ? raw.llm : 'other';
  return { ok: true, packet: { ...head, skin: raw.skin, theme: raw.theme, sessions, minutes, ev, sensors, llm } };
}

/**
 * Gói đã validate -> data point Analytics Engine. Ánh xạ cột (cũng là tài liệu trong README):
 *   index1   = day
 *   blob1 day · blob2 mode · blob3 platform · blob4 lang · blob5 skin · blob6 theme · blob7 llm · blob8 sensors (dấu phẩy) · blob9 kind
 *   double1 v · double2 day_num (số ngày kể từ 1970-01-01 UTC) · double3 dsi · double4 a7 · double5 a30
 *   kind 'day' thêm: double6 sessions · double7 minutes · double8..double25 = ev theo thứ tự EV_KEYS (poke … hand_mirror · meet_start · meet_ok)
 *   kind 'active': chỉ double1..double5; blob5..blob8 để trống.
 */
export function toDataPoint(p) {
  const head = [p.v, dayNum(p.day), p.dsi, p.a7, p.a30];
  if (p.kind === 'active') return { indexes: [p.day], blobs: [p.day, p.mode, p.platform, p.lang, '', '', '', '', 'active'], doubles: head };
  return {
    indexes: [p.day],
    blobs: [p.day, p.mode, p.platform, p.lang, p.skin, p.theme, p.llm, p.sensors.join(','), 'day'],
    doubles: [...head, p.sessions, p.minutes, ...EV_KEYS.map((k) => p.ev[k])],
  };
}

export function parseOrigins(str) {
  return String(str || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}
/** Header CORS cho đúng origin được phép (không bao giờ '*'); origin lạ -> null. */
export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',   // sendBeacon luôn gửi ở chế độ credentials; Worker không đặt/đọc cookie
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
