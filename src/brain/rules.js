// Rule brain (không LLM): sự kiện -> intent. Brain không gọi renderer, chỉ đặt intent.
import { Needs, circadian } from './needs.js';
import { Mood, pickBase, needCue } from './mood.js';
import { Reactions } from './reactions.js';
import { FallDirector } from '../eyes/fall.js';

export const SHOT_WINDOW_MS = 30000, SHOT_DEBOUNCE_MS = 800;   // habituation bắn: lần 3 trong 30 s thì né, lần 4 thì bắn trả
export const FACE_AWAY_MS = 10 * 60 * 1000;   // vắng mặt người ≥ 10 phút rồi thấy lại thì vẫy chào
export const FOODS = {
  cookie: { emoji: '🍪', label: 'Bánh quy', hunger: 0.25, fun: 0.1 },
  battery: { emoji: '🔋', label: 'Pin', hunger: 0.2, energy: 0.15 },
  screw: { emoji: '🔩', label: 'Ốc vít', hunger: 0.1, fun: 0.08 },
  icecream: { emoji: '🍦', label: 'Kem', hunger: 0.15, fun: 0.3 },
  sushi: { emoji: '🍣', label: 'Sushi', hunger: 0.3, fun: 0.1 },
  carrot: { emoji: '🥕', label: 'Cà rốt', hunger: 0.25, fun: 0.05 },
};
export const DRINKS = {
  water: { emoji: '💧', label: 'Nước', thirst: 0.3 },
  cup: { emoji: '🥤', label: 'Ly nước', thirst: 0.45, fun: 0.08 },
};

const LINES = {
  bored: ['Chán quá...', 'Chơi với Pipo đi', 'Bíp...'],
  rain: ['Mưa kìa!', 'Ướt hết rồi'],
  hot: ['Nóng quá!'], cold: ['Lạnh run...'], sleepy: ['Buồn ngủ...'], cool: ['Ngầu chưa?'],
  hello: ['Chào bạn!', 'Bíp bíp!'],
};
/** Lệnh/động tác -> phản xạ tay (voice:cmd, khay ✋, LLM action). */
export const GESTURE_REACTIONS = { wave: 'gWave', bye: 'gBye', salute: 'gSalute', punch: 'gPunch', combo: 'gCombo', highfive: 'gHighfive', fistbump: 'gFistbump', thumbsup: 'gThumbsup', clap: 'gClap', point: 'gPoint', peekaboo: 'gPeekaboo' };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

export class RuleBrain {
  constructor({ needs, mood, reactions, rng = Math.random } = {}) {
    this.needs = needs || new Needs(); this.mood = mood || new Mood(); this.reactions = reactions || new Reactions(); this.rng = rng;
    this.asleep = false; this.lastTouch = 0; this.lastCue = {}; this.facePresent = false; this.lastFaceAt = -Infinity;
    this.fall = new FallDirector(rng); this.shots = []; this.lastShot = -1e9; this.pending = [];   // pending: hiệu ứng chờ main xử lý ({sound, shake})
    this.world = { hour: 12, weather: null, dark: false, charging: false, battery: 1 };
  }
  setWorld(p) { Object.assign(this.world, p); }
  touched(now) { this.lastTouch = now; }

  _fire(name, payload, now) { const it = this.reactions.fire(name, payload, now); return it; }

  /** Xử lý một sự kiện. Trả intent hoặc null. */
  handle(ev, p = {}, now = 0) {
    const R = this.reactions, N = this.needs, M = this.mood;
    const touchy = ev.startsWith('touch:') || ev === 'motion:shake' || ev === 'motion:hardshake' || ev === 'voice:cmd';
    if (ev.startsWith('touch:')) this.lastTouch = now;
    if (this.asleep && touchy && !(ev === 'voice:cmd' && p.cmd === 'sleep')) {
      this.asleep = false; R.cancel('facedown'); return this._fire('wake', {}, now);
    }
    if (ev.startsWith('touch:') && this.fall.active && this.fall.state !== 'dodge' && this.fall.state !== 'rise') {   // đang giả chết: chạm/nựng = cứu dậy
      if (this.fall.touch()) { N.add('affection', 0.05); M.bump(0.15, 0.2); return this._fire('reviveTouch', p, now); }
      return null;
    }
    switch (ev) {
      case 'meet:search': return this._fire('meetSearch', p, now);
      case 'meet:found': N.add('fun', 0.15); N.add('affection', 0.08); M.bump(0.3, 0.3); return this._fire('meetFound', p, now);
      case 'meet:emo': return this._fire('meetEmo', p, now);
      case 'meet:bye': N.add('fun', 0.05); return this._fire('meetBye', p, now);
      case 'meet:end': return this._fire('meetEnd', p, now);
      case 'hand:aim': return this.aim(now);
      case 'hand:lower': R.cancel('aim'); return null;
      case 'hand:fire': return this.shot(now);
      case 'hand:wave': return this.mirror('wave', now);
      case 'hand:fistbump': return this.mirror('fistbump', now);
      case 'hand:thumbsup': return this.mirror('thumbsup', now);
      case 'hand:highfive': return this.mirror('highfive', now);
      case 'touch:poke': M.bump(-0.05, 0.1); return this._fire('poke', p, now);
      case 'touch:tap': return this._fire('tapAway', p, now);
      case 'touch:pet': R.forget('poke'); N.add('affection', 0.04); N.add('fun', 0.01); M.bump(0.12, 0.05); return this._fire('pet', p, now) || R.cur;
      case 'touch:hug': N.add('affection', 0.12); M.bump(0.3, -0.1); return this._fire('hug', p, now);
      case 'feed:drop': return this.feed(p, now);
      case 'motion:shake': M.bump(0.05, 0.3); return this._fire('shake', p, now);
      case 'motion:hardshake': M.bump(-0.25, 0.5); return this._fire('hardshake', p, now);
      case 'motion:freefall': return this._fire('freefall', p, now);
      case 'motion:impact': if (R.cur && R.cur.name === 'freefall') R.cancel(); return this._fire('impact', p, now);
      case 'motion:facedown': this.asleep = true; return this._fire('facedown', p, now);
      case 'motion:faceup': if (R.cur && R.cur.name === 'facedown') { R.cancel(); this.asleep = false; return this._fire('wake', {}, now); } return null;
      case 'motion:upsidedown': return this._fire('upsidedown', p, now);
      case 'motion:upright': if (R.cur && R.cur.name === 'upsidedown') R.cancel(); return null;
      case 'motion:step': N.add('fun', 0.002); M.bump(0.02, 0.05); return this._fire('step', p, now);
      case 'geo:newplace': N.add('fun', 0.2); M.bump(0.2, 0.3); return this._fire('newplace', p, now);
      case 'geo:home': return this._fire('home', p, now);
      case 'weather:update': this.world.weather = p; return null;
      case 'camera:face':
        if (p.present && !this.facePresent) {
          const away = now - this.lastFaceAt; this.facePresent = true; this.lastFaceAt = now; N.add('affection', 0.05);
          if (away >= FACE_AWAY_MS) { M.bump(0.2, 0.2); const w = this._fire('gWave', {}, now); if (w) return w; }   // lâu mới thấy lại: vẫy chào
          const it = this._fire('faceHi', p, now); if (it) return it;
        }
        if (p.present) this.lastFaceAt = now;
        if (!p.present) this.facePresent = false;
        if (p.present && p.size > 0.4) return this._fire('faceNear', p, now);
        return null;
      case 'camera:facelost': this.facePresent = false; return this._fire('faceLost', p, now);
      case 'camera:peekaboo': N.add('fun', 0.2); M.bump(0.3, 0.3); return this._fire('peekaboo', p, now);
      case 'camera:dark': this.world.dark = !!p.dark; return null;
      case 'camera:expression': return this._fire('mimicFace', p, now);
      case 'mic:loud': return this._fire('loud', p, now);
      case 'mic:clap': return this._fire('clap', p, now);
      case 'mic:clap2': M.bump(0.2, 0.4); return this._fire('clap2', p, now);
      case 'mic:silence': this.world.quiet = true; return null;
      case 'battery:low': this.world.battery = p.level ?? 0.15; return this._fire('batteryLow', p, now);
      case 'battery:charging': this.world.charging = !!p.charging; return p.charging ? this._fire('plugIn', p, now) : null;
      case 'voice:name': return this._fire('nameCall', p, now);
      case 'voice:cmd': return this.command(p.cmd, now);
      case 'idle:bored': return this._fire('bored', p, now);
      case 'touch:highfive': N.add('affection', 0.06); N.add('fun', 0.05); M.bump(0.3, 0.2); return this._fire('highfiveOk', p, now);
      case 'hand:highfiveMiss': M.bump(-0.08, -0.05); return this._fire('highfiveMiss', p, now);
      case 'greet:morning': M.bump(0.2, 0.2); return this._fire('gWave', { say: 'Chào buổi sáng!' }, now);
      default: return null;
    }
  }

  command(cmd, now) {
    const R = this.reactions;
    switch (cmd) {
      case 'sleep': this.asleep = true; return this._fire('facedown', {}, now);
      case 'wake': this.asleep = false; R.cancel('facedown'); return this._fire('wake', {}, now);
      case 'feed': return this._fire('cue', { expression: 'hungry', duration: 3000, sound: 'curious', say: 'Có gì ăn không?' }, now);
      case 'look': return this._fire('nameCall', {}, now);
      case 'dance': return this._fire('dance', {}, now);
      case 'angry': return this._fire('cue', { expression: 'angry', duration: 2500, sound: 'angry', say: 'Hứ!' }, now);
      case 'shot': return this.shot(now);
      default: return this.gesture(cmd, now);
    }
  }

  /** Một động tác tay theo tên (wave · bye · salute · punch · combo · highfive · fistbump · thumbsup · clap · point · peekaboo). */
  gesture(name, now, p = {}) {
    const r = GESTURE_REACTIONS[name]; if (!r) return null;
    if (name === 'thumbsup') { this.needs.add('affection', 0.03); this.mood.bump(0.15, 0.05); }
    if (name === 'clap' || name === 'fistbump') this.mood.bump(0.08, 0.1);
    this.asleep = false; return this._fire(r, p, now);
  }

  /** Bị chĩa súng (tay người dạng súng giữ ≥ 0,4 s): hoảng, giơ tay đầu hàng. Không đè lên lúc đang nằm/né. */
  aim(now) {
    if (this.asleep || this.fall.active) return null;
    this.mood.bump(-0.1, 0.3); return this._fire('aim', {}, now);
  }
  /** Trúng đạn. Lần 1–2 (trong 30 s) gục giả chết; lần 3 né; lần 4 bắn trả rồi tính lại. Nhiều phát dồn trong 0,8 s chỉ tính một. */
  shot(now) {
    if (this.asleep || now - this.lastShot < SHOT_DEBOUNCE_MS) return null;
    this.lastShot = now; this.shots = this.shots.filter((t) => now - t < SHOT_WINDOW_MS); this.shots.push(now);
    const n = this.shots.length, R = this.reactions; R.cancel('aim');
    if (this.fall.lying) { this.fall.hit(this.fall.dir); return this._fire('shotHit', {}, now); }   // đang nằm mà bị bắn tiếp: giật thêm cú nữa
    if (n === 3) { this.fall.dodge(); this.mood.bump(0.15, 0.3); return this._fire('dodge', {}, now); }
    if (n >= 4) { this.shots = []; this.mood.bump(0.1, 0.4); return this._fire('counter', {}, now); }
    this.mood.bump(-0.2, 0.4); this.fall.hit(); return this._fire('shotHit', {}, now);
  }
  /** Bắt chước tay người (vẫy · cụng · ngón cái · đập tay): Pipo làm lại động tác tương ứng. */
  mirror(name, now) {
    if (this.asleep || this.fall.active) return null;
    this.needs.add('fun', 0.01); return this.gesture(name, now);
  }

  /** Thả đồ ăn/uống lên mắt. */
  feed(p, now) {
    const N = this.needs, isDrink = p.kind === 'drink';
    const item = isDrink ? DRINKS[p.item] : FOODS[p.item];
    if (!item) return null;
    const key = isDrink ? 'thirst' : 'hunger';
    if (N.get(key) > 0.95) return this._fire('full', p, now);
    for (const k of ['hunger', 'thirst', 'energy', 'fun']) if (item[k]) N.add(k, item[k]);
    this.mood.bump(0.25, 0.1);
    return this._fire(isDrink ? 'drink' : 'eat', p, now);
  }

  /** Gọi ~2 lần/giây: ý nghĩ tự phát (chán, thời tiết, kính râm, đêm). */
  idle(now) {
    const w = this.world, since = (now - this.lastTouch) / 1000, cue = (k, every) => { if ((now - (this.lastCue[k] ?? -1e9)) / 1000 >= every) { this.lastCue[k] = now; return true; } return false; };
    if (this.asleep || this.fall.active) return null;
    const night = circadian(w.hour);
    if (since > 120 && this.needs.get('energy') < 0.3 + night * 0.3 && cue('nap', 60)) { this.asleep = true; return this._fire('facedown', {}, now); }
    if (since > 120 && cue('bored', 90)) return this._fire('bored', {}, now);
    const wx = w.weather;
    if (wx) {
      if ((wx.rain || wx.storm) && cue('rain', 90)) return this._fire('cue', { expression: 'rainy', duration: 6000, sound: 'sad', say: pick(LINES.rain, this.rng) }, now);
      if (wx.temp > 33 && cue('hot', 120)) return this._fire('cue', { expression: 'hot', duration: 5000, say: pick(LINES.hot, this.rng) }, now);
      if (wx.temp < 15 && cue('cold', 120)) return this._fire('cue', { expression: 'cold', duration: 5000, sound: 'cold', say: pick(LINES.cold, this.rng) }, now);
      if (wx.clear && wx.isDay && this.mood.valence > 0.3 && cue('cool', 300)) return this._fire('cue', { expression: 'cool', duration: 8000, sound: 'hello', say: pick(LINES.cool, this.rng) }, now);
    }
    if (w.dark && cue('dark', 60)) return this._fire('cue', { expression: 'sleepy', duration: 6000 }, now);
    if (w.charging && cue('charge', 180)) return this._fire('cue', { expression: 'happy', duration: 3000 }, now);
    return null;
  }

  /** Biểu cảm nền. */
  baseExpression(now) {
    if (this.asleep) return { id: 'sleeping', intensity: 1 };
    const w = this.world, hour = w.hour;
    const cue = needCue(this.needs, now / 1000, hour);
    if (cue) return { id: cue, intensity: 1 };
    const night = circadian(hour);
    if (night > 0.6 && (now - this.lastTouch) / 1000 > 30) return { id: 'sleepy', intensity: 0.5 + night * 0.4 };
    return { id: pickBase(this.mood.valence, this.mood.arousal), intensity: 1 };
  }

  tick(dtSec, now, sleeping = false) {
    const fe = this.fall.update(dtSec);
    if (fe === 'selfrise') this._fire('reviveSelf', {}, now);
    else if (fe === 'lie') this.pending.push({ sound: 'thud', shake: 0.7 });
    this.needs.tick(dtSec, { sleeping: sleeping || this.asleep, hour: this.world.hour });
    this.mood.update(dtSec, this.needs, this.world.hour);
  }
}
