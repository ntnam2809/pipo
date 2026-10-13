// Thống kê ẩn danh: gom bộ đếm theo ngày UTC trong localStorage. Mỗi ngày gửi tối đa HAI gói:
//   · `active` — ngay lần mở app đầu tiên của ngày (DAU, cài mới, retention; không chứa bộ đếm);
//   · `day`    — bộ đếm chi tiết của ngày hôm trước, gửi khi mở app ngày mới (hoặc ẩn tab sau khi đã sang ngày).
// Không có định danh nào: không cookie, không ID cài đặt/thiết bị, không IP lưu lại, không vị trí, không nội dung chat,
// không tên pet, không âm thanh/hình. Chỉ có số đếm đã bucket hóa và vài thuộc tính thô (xem buildPacket).
// Phần lớn là hàm thuần; `Telemetry` nhận mọi thứ phụ thuộc môi trường (storage, đồng hồ, cổng chặn, hàm gửi) qua tham số để test.

export const TELEMETRY_KEY = 'pipo.telemetry';
export const SCHEMA = 1;
export const DAY_MS = 86400000;

/** Sự kiện được đếm (thứ tự cố định = thứ tự cột phía server). */
export const EV_KEYS = ['poke', 'pet', 'hug', 'feed', 'drink', 'mimic', 'chat_llm', 'music_on', 'dance', 'clock', 'settings_open', 'install_prompt', 'install_accepted', 'gesture', 'shot', 'hand_mirror', 'meet_start', 'meet_ok'];
export const SENSOR_IDS = ['motion', 'compass', 'geo', 'weather', 'camera', 'mic', 'battery', 'voice', 'mimicFace', 'music'];
export const LLM_IDS = ['none', 'claude-artifact', 'anthropic', 'openai-compatible', 'gemini'];
export const MODES = ['browser', 'standalone'];
export const PLATFORMS = ['android', 'ios', 'desktop', 'other'];
/** Cận dưới của từng bucket: giá trị gửi đi là cận dưới ("6" nghĩa là 6–20). */
export const BUCKETS = {
  count: [0, 1, 2, 6, 21],
  sessions: [0, 1, 2, 3, 6, 11],
  minutes: [0, 1, 3, 6, 16, 31, 61],
};
export const LONG_HIDDEN_MS = 30 * 60000;   // ẩn ≥ 30 phút rồi quay lại = phiên mới
export const MAX_DELTA_MS = 5 * 60000;      // mỗi lần tick cộng tối đa 5 phút (đồng hồ nhảy không làm phình thời gian dùng)

export function bucket(n, floors) {
  n = Number.isFinite(+n) ? Math.floor(+n) : 0;
  let out = floors[0];
  for (const f of floors) if (n >= f) out = f;
  return out;
}
export const bucketCount = (n) => bucket(n, BUCKETS.count);
export const bucketSessions = (n) => bucket(n, BUCKETS.sessions);
export const bucketMinutes = (n) => bucket(n, BUCKETS.minutes);

// ---- ngày UTC ----
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayNum = (day) => Math.round(Date.parse(day + 'T00:00:00Z') / DAY_MS);
/** Số ngày từ a đến b (b - a). */
export const dayDiff = (a, b) => dayNum(b) - dayNum(a);
export const addDays = (day, n) => new Date((dayNum(day) + n) * DAY_MS).toISOString().slice(0, 10);

// ---- môi trường ----
export function detectPlatform(nav) {
  const ua = String((nav && nav.userAgent) || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (nav && nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ios';
  if (/windows|macintosh|mac os x|linux|cros|x11/i.test(ua)) return 'desktop';
  return 'other';
}
export function detectEnv(nav, standalone) {
  const lang = String((nav && (nav.language || (nav.languages && nav.languages[0]))) || '').slice(0, 2).toLowerCase();
  return { mode: standalone ? 'standalone' : 'browser', platform: detectPlatform(nav), lang: /^[a-z]{2}$/.test(lang) ? lang : 'xx' };
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|.*\.localhost)$/i;
/**
 * Lý do KHÔNG gửi (chuỗi) hoặc null nếu được phép. Mọi nhánh đều chặn cả việc gom lẫn việc gửi.
 * g = { endpoint, enabled, nav, hostname, debug, gallery, artifact }
 */
export function blockReason(g) {
  if (!g.endpoint) return 'no-endpoint';
  if (g.enabled === false) return 'user-off';
  const nav = g.nav || {};
  if (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || nav.msDoNotTrack === '1') return 'dnt';
  if (nav.globalPrivacyControl) return 'gpc';
  if (g.debug || g.gallery) return 'debug';
  if (g.artifact) return 'artifact';
  if (LOCAL_HOST.test(String(g.hostname || ''))) return 'localhost';
  return null;
}
export const BLOCK_TEXT = {
  'no-endpoint': 'Bản này chưa cấu hình máy chủ thống kê — Pipo không gửi và không gom gì cả.',
  'user-off': 'Bạn đã tắt — không gom, không gửi.',
  dnt: 'Trình duyệt bật "Do Not Track" — Pipo không gửi.',
  gpc: 'Trình duyệt bật "Global Privacy Control" — Pipo không gửi.',
  debug: 'Đang ở chế độ debug/gallery — không gửi.',
  artifact: 'Đang chạy trong artifact — không gửi.',
  localhost: 'Đang chạy trên máy cục bộ (localhost) — không gửi.',
};

// ---- gói gửi đi ----
/** Phần chung của mọi gói: tuổi cài, số ngày đã mở, kiểu máy. */
function baseFields(day, installDay, openedDays, cfg) {
  const age = Math.max(0, dayDiff(installDay, day));
  const within = (n) => openedDays.filter((x) => { const k = dayDiff(x, day); return k >= 0 && k < n; }).length;
  return {
    dsi: age > 30 ? 31 : age,
    a7: within(7), a30: within(30),
    mode: MODES.includes(cfg.mode) ? cfg.mode : 'browser',
    platform: PLATFORMS.includes(cfg.platform) ? cfg.platform : 'other',
    lang: /^[a-z]{2}$/.test(cfg.lang) ? cfg.lang : 'xx',
  };
}
/** Gói `active`: gửi ngay lần mở đầu tiên của ngày. Không bộ đếm, không skin/cảm biến. */
export function buildActivePacket(day, installDay, openedDays, cfg) {
  const b = baseFields(day, installDay, openedDays, cfg);
  return { v: SCHEMA, kind: 'active', day, dsi: b.dsi, a7: b.a7, a30: b.a30, mode: b.mode, platform: b.platform, lang: b.lang };
}
/** Gói `day` của một ngày. Chỉ tạo các khóa dưới đây — không bao giờ sao chép object ngoài vào. */
export function buildPacket(day, installDay, openedDays, d, cfg) {
  const b = baseFields(day, installDay, openedDays, cfg);
  const ev = {};
  for (const k of EV_KEYS) ev[k] = bucketCount(d.ev && d.ev[k]);
  const sensors = SENSOR_IDS.filter((s) => Array.isArray(cfg.sensors) && cfg.sensors.includes(s));
  return {
    v: SCHEMA, kind: 'day', day,
    dsi: b.dsi, a7: b.a7, a30: b.a30,
    mode: b.mode, platform: b.platform, lang: b.lang,
    skin: /^[a-z0-9_-]{1,16}$/.test(cfg.skin) ? cfg.skin : 'classic',
    theme: /^[a-z0-9_-]{1,16}$/.test(cfg.theme) ? cfg.theme : 'cyan',
    sessions: bucketSessions(d.sessions),
    minutes: bucketMinutes(Math.floor((d.ms || 0) / 60000)),
    ev, sensors,
    llm: LLM_IDS.includes(cfg.llm) ? cfg.llm : 'none',
  };
}

/** Hàm gửi: sendBeacon trước (text/plain để khỏi preflight), không được thì fetch keepalive (không cookie). Không retry. */
export function makeSender(endpoint, nav, fetchFn) {
  return (packet) => {
    const body = JSON.stringify(packet);
    try {
      if (nav && typeof nav.sendBeacon === 'function' && nav.sendBeacon(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return true;
    } catch { /* thử fetch */ }
    try {
      if (typeof fetchFn === 'function') {
        const p = fetchFn(endpoint, { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8' }, keepalive: true, credentials: 'omit', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (p && p.catch) p.catch(() => {});
        return true;
      }
    } catch { /* bỏ qua */ }
    return false;
  };
}

const emptyDay = (day, cfg) => ({ day, sessions: 0, ms: 0, ev: {}, cfg: { ...cfg } });
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/**
 * opts = { storage, now: () => ms, gate: () => ({...blockReason args}), send: (packet) => bool, legacy: bool }
 * legacy = máy đã dùng Pipo trước khi có thống kê: không biết ngày cài thật nên coi là "cũ" (dsi 31), khỏi lẫn vào cài mới.
 */
export class Telemetry {
  constructor(opts) {
    this.storage = opts.storage || null; this.now = opts.now || Date.now; this.gate = opts.gate; this.send = opts.send || (() => false);
    this.legacy = !!opts.legacy; this.state = null; this.visible = true; this.lastTick = 0; this.hiddenAt = 0; this.dirty = false; this.cfg = { mode: 'browser', platform: 'other', lang: 'xx', skin: 'classic', theme: 'cyan', sensors: [], llm: 'none' };
  }
  reason() { return blockReason(this.gate()); }
  active() { return !!this.state && !this.reason(); }
  today() { return utcDay(this.now()); }

  _load() {
    try {
      const raw = this.storage && this.storage.getItem(TELEMETRY_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (isObj(s) && s.v === SCHEMA && /^\d{4}-\d{2}-\d{2}$/.test(s.install)) {
        return { v: SCHEMA, install: s.install, opened: Array.isArray(s.opened) ? s.opened.filter((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) : [], sent: typeof s.sent === 'string' ? s.sent : '', activeSent: typeof s.activeSent === 'string' ? s.activeSent : '', cur: isObj(s.cur) && typeof s.cur.day === 'string' ? { day: s.cur.day, sessions: +s.cur.sessions || 0, ms: +s.cur.ms || 0, ev: isObj(s.cur.ev) ? s.cur.ev : {}, cfg: isObj(s.cur.cfg) ? s.cur.cfg : {} } : null };
      }
    } catch { /* hỏng thì tạo mới */ }
    return null;
  }
  _save() {
    this.dirty = false;
    try { if (this.storage && this.state) this.storage.setItem(TELEMETRY_KEY, JSON.stringify(this.state)); } catch { /* bỏ qua */ }
  }

  /** Bắt đầu một lần mở app. Trả false (và không đụng storage) nếu đang bị chặn. */
  start(cfg) {
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    if (this.reason()) return false;
    const t = this.today();
    this.state = this._load() || { v: SCHEMA, install: this.legacy ? addDays(t, -31) : t, opened: [], sent: '', activeSent: '', cur: null };
    this.lastTick = this.now(); this.visible = true;
    this._roll(t);
    this.state.cur.sessions++;
    this._markActive(t);
    this._save();
    return true;
  }

  /** Sang ngày mới: chốt ngày cũ (gửi nếu còn trong cửa sổ ±2 ngày của server), mở ngày mới. */
  _roll(t) {
    const s = this.state;
    if (s.cur && s.cur.day !== t) {
      const old = s.cur; s.cur = null;
      const age = dayDiff(old.day, t);
      if (age >= 1 && age <= 2 && old.day > s.sent && s.opened.includes(old.day)) this._flushDay(old);
    }
    if (!s.cur) s.cur = emptyDay(t, this.cfg);
    s.opened = [...new Set(s.opened)].sort().filter((x) => { const k = dayDiff(x, t); return k >= 0 && k <= 31; });
    this.dirty = true;
  }
  /** Lần mở đầu tiên trong ngày (app đang hiện): ghi nhận ngày đã mở và gửi gói `active` ngay, tối đa 1 lần/ngày. */
  _markActive(t) {
    const s = this.state;
    if (!this.visible || s.activeSent === t) return;
    if (!s.opened.includes(t)) s.opened.push(t);
    s.opened.sort();
    s.activeSent = t; this._save();   // ghi trước khi gửi: không gửi lặp, không retry
    try { this.send(buildActivePacket(t, s.install, s.opened, { ...this.cfg })); } catch { /* bỏ qua */ }
  }
  _flushDay(d) {
    const s = this.state;
    const packet = buildPacket(d.day, s.install, s.opened, d, { ...this.cfg, ...d.cfg });
    s.sent = d.day; this._save();   // ghi "đã gửi" trước: tối đa một gói/ngày, không retry
    try { this.send(packet); } catch { /* bỏ qua */ }
  }

  /** Nhịp định kỳ + khi ẩn/hiện tab + pagehide. */
  tick(visible = this.visible) {
    if (!this.state) return;
    if (this.reason()) return;   // bị chặn giữa chừng: giữ nguyên, không gửi
    const t = this.now(), day = utcDay(t);
    if (this.visible && this.lastTick) this.state.cur.ms += Math.max(0, Math.min(t - this.lastTick, MAX_DELTA_MS));
    this.lastTick = t;
    if (this.visible && !visible) this.hiddenAt = t;
    if (!this.visible && visible && this.hiddenAt && t - this.hiddenAt >= LONG_HIDDEN_MS) this.state.cur.sessions++;
    this.visible = visible;
    this._roll(day);
    this._markActive(day);
    this.state.cur.cfg = { ...this.cfg };
    this._save();
  }
  /** Cập nhật cấu hình hiện thời (skin, theme, cảm biến bật, LLM); lưu cùng ngày hiện hành. */
  setCfg(cfg) { this.cfg = { ...this.cfg, ...cfg }; if (this.state && this.state.cur) { this.state.cur.cfg = { ...this.cfg }; this.dirty = true; } }
  count(name, n = 1) {
    if (!this.state || !EV_KEYS.includes(name) || this.reason()) return;
    const ev = this.state.cur.ev; ev[name] = Math.min(10000, (ev[name] || 0) + n); this.dirty = true;
  }
  flush() { if (this.state && this.dirty && !this.reason()) this._save(); }

  /** Xóa mọi thứ local (tắt thống kê / xóa dữ liệu). Không gửi gì. */
  clear() {
    this.state = null; this.dirty = false;
    try { if (this.storage) this.storage.removeItem(TELEMETRY_KEY); } catch { /* bỏ qua */ }
  }

  /** Gói `day` của hôm nay tính đến giờ (gửi sau khi sang ngày) + gói `active` của hôm nay — cho nút "Xem gói sẽ gửi". */
  preview() {
    const why = this.reason();
    if (why) return { ok: false, reason: why, text: BLOCK_TEXT[why] };
    if (!this.state) return { ok: false, reason: 'idle', text: 'Chưa có dữ liệu.' };
    const s = this.state, t = utcDay(this.now());
    const cur = s.cur && s.cur.day === t ? s.cur : emptyDay(t, this.cfg);
    const d = { ...cur, ms: cur.ms + (this.visible && this.lastTick ? Math.max(0, Math.min(this.now() - this.lastTick, MAX_DELTA_MS)) : 0) };
    const opened = s.opened.includes(t) ? s.opened : [...s.opened, t];
    return { ok: true, packet: buildPacket(t, s.install, opened, d, { ...this.cfg }), active: buildActivePacket(t, s.install, opened, { ...this.cfg }), activeSent: s.activeSent === t };
  }
  status() { return this.reason() || 'on'; }
}
