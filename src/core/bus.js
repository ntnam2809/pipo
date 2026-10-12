// Event bus tối giản: sensor -> brain -> eyes/audio. Hỗ trợ '*' (nghe tất cả).
export class Bus {
  constructor() { this.m = new Map(); }
  on(name, fn) {
    if (!this.m.has(name)) this.m.set(name, new Set());
    this.m.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { const s = this.m.get(name); if (s) s.delete(fn); }
  emit(name, payload = {}) {
    for (const key of [name, '*']) {
      const s = this.m.get(key);
      if (!s) continue;
      for (const fn of [...s]) {
        try { key === '*' ? fn(name, payload) : fn(payload, name); } catch (e) { if (typeof console !== 'undefined') console.warn('[bus]', name, e); }
      }
    }
  }
}
