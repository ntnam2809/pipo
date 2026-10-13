// Khe LLM tùy chọn. Validator tất định đứng trên LLM: JSON hỏng/id lạ/số ngoài khoảng -> clamp hoặc bỏ -> fallback rule brain.
import { EXPRESSION_IDS, isExpression } from '../eyes/expressions.js';
import { SOUND_IDS } from '../audio/sounds.js';

export const PROVIDERS = ['none', 'claude-artifact', 'anthropic', 'openai-compatible', 'gemini'];
export const ACTIONS = ['none', 'sleep', 'wake', 'dance', 'look_around', 'follow_face', 'wave', 'bye', 'salute', 'punch', 'highfive', 'fistbump', 'thumbsup', 'clap', 'point', 'peekaboo'];
/** Động tác tay trong ACTIONS (main.js đổi sang phản xạ tay). */
export const HAND_ACTIONS = ACTIONS.slice(ACTIONS.indexOf('wave'));
// Claude luôn chạy Haiku (nhanh, rẻ); ô Model chỉ áp cho OpenAI-compatible / Gemini.
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const TIMEOUT_MS = 8000;

export function buildSystemPrompt(name = 'Pipo') {
  return `Bạn là ${name}, một robot thú cưng nhỏ dễ thương, chỉ có đôi mắt và một cái miệng nhỏ. Bạn nói tiếng Việt cực ngắn (tối đa 12 từ), có thể chỉ đáp "bíp". Bạn hiền, tinh nghịch, không bao giờ chết hay bỏ đi.
BẮT BUỘC chỉ trả về MỘT đối tượng JSON, không thêm chữ nào khác:
{"expression":"<một trong: ${EXPRESSION_IDS.join('|')}>","intensity":0..1,"duration_ms":500..8000,"say":"…","sound":"<một trong: ${SOUND_IDS.join('|')}>","action":"${ACTIONS.join('|')}"}
action là động tác (không bắt buộc, chỉ dùng khi hợp ngữ cảnh): sleep ngủ · wake dậy · dance nhảy · look_around nhìn quanh · follow_face nhìn theo mặt · wave vẫy tay chào · bye vẫy tạm biệt · salute đưa tay lên trán tuân lệnh · punch đấm về phía người · highfive giơ tay chờ đập tay · fistbump cụng tay · thumbsup giơ ngón cái khen · clap vỗ tay · point chỉ vào người · peekaboo che mắt rồi ú òa.`;
}

export function buildContext({ name, needs, mood, hour, weather, recent = [], text = '' }) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const o = { ten: name, gio: hour, nhu_cau: needs ? Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, r2(v)])) : undefined, tam_trang: mood ? { valence: r2(mood.valence), arousal: r2(mood.arousal) } : undefined, thoi_tiet: weather || undefined, gan_day: recent.slice(-6), nguoi_noi: text };
  return JSON.stringify(o);
}

/** Lấy JSON đầu tiên (cân ngoặc) trong chuỗi, chịu được rào ```json. */
export function extractJSON(text) {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  const s = text.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'); if (a < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { try { return JSON.parse(s.slice(a, i + 1)); } catch { return null; } }
  }
  return null;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Trả {ok, intent, issues}. ok=false nghĩa là phải fallback về rule brain. */
export function validateLLM(raw) {
  const issues = [];
  const j = extractJSON(raw);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, intent: null, issues: ['JSON hỏng'] };
  const it = {};
  if (j.expression != null) { if (isExpression(j.expression)) it.expression = j.expression; else issues.push('expression lạ: bỏ'); }
  let n = Number(j.intensity); if (j.intensity != null) { if (Number.isFinite(n)) { if (n < 0 || n > 1) issues.push('intensity clamp'); it.intensity = clamp(n, 0, 1); } else issues.push('intensity không phải số'); }
  n = Number(j.duration_ms); if (j.duration_ms != null) { if (Number.isFinite(n)) { if (n < 500 || n > 8000) issues.push('duration clamp'); it.duration = clamp(n, 500, 8000); } else issues.push('duration không phải số'); }
  if (typeof j.say === 'string') {
    const s = j.say.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = s.split(' ').filter(Boolean);
    if (words.length > 12) issues.push('say cắt còn 12 từ');
    const out = words.slice(0, 12).join(' ').slice(0, 80); if (out) it.say = out;
  }
  if (j.sound != null) { if (SOUND_IDS.includes(j.sound)) it.sound = j.sound; else issues.push('sound lạ: bỏ'); }
  if (j.action != null) { if (ACTIONS.includes(j.action)) { if (j.action !== 'none') it.action = j.action; } else issues.push('action lạ: bỏ'); }
  const useful = it.expression || it.say || it.action || it.sound;
  if (!useful) return { ok: false, intent: null, issues: [...issues, 'không có trường hợp lệ'] };
  if (it.expression && it.intensity == null) it.intensity = 1;
  if (it.duration == null) it.duration = 2500;
  return { ok: true, intent: it, issues };
}

/** Dựng request cho từng provider (thuần, không gọi mạng). */
export function buildRequest(cfg, systemPrompt, history, userContent) {
  const prov = cfg.provider, model = prov === 'anthropic' ? DEFAULT_MODEL : (cfg.model || DEFAULT_MODEL);
  const msgs = [...history.slice(-6).map((h) => ({ role: h.role === 'pet' ? 'assistant' : 'user', content: h.text })), { role: 'user', content: userContent }];
  if (prov === 'anthropic') {
    return { url: (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages', init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey || '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 220, system: systemPrompt, messages: msgs }) } };
  }
  if (prov === 'openai-compatible') {
    return { url: (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions', init: { method: 'POST', headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {}) }, body: JSON.stringify({ model, max_tokens: 220, messages: [{ role: 'system', content: systemPrompt }, ...msgs] }) } };
  }
  if (prov === 'gemini') {
    const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    return { url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey || '')}`, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 220 } }) } };
  }
  return null;
}

export function parseProviderResponse(prov, json) {
  try {
    if (prov === 'anthropic') return (json.content || []).map((c) => c.text || '').join('');
    if (prov === 'openai-compatible') return json.choices[0].message.content;
    if (prov === 'gemini') return json.candidates[0].content.parts.map((p) => p.text || '').join('');
  } catch { /* rơi xuống null */ }
  return null;
}

export function intentFromLLM(v) {
  const it = { ...v, priority: 6 };
  if (!it.expression) it.expression = 'happy';
  return it;
}

/** Gọi LLM. Trả {ok, intent, issues}; mọi lỗi mạng -> ok=false (im lặng dùng rule brain). */
export async function callLLM(cfg, ctx, userText, history = [], fetchImpl, sampleImpl) {
  if (!cfg || cfg.provider === 'none' || !PROVIDERS.includes(cfg.provider)) return { ok: false, intent: null, issues: ['LLM tắt'] };
  if (cfg.provider === 'claude-artifact') return callSample(sampleImpl, ctx, userText, history);
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return { ok: false, intent: null, issues: ['không có fetch'] };
  const req = buildRequest(cfg, buildSystemPrompt(ctx.name), history, buildContext({ ...ctx, text: userText }));
  if (!req) return { ok: false, intent: null, issues: ['provider lạ'] };
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac && ac.abort(), TIMEOUT_MS);
  try {
    const res = await f(req.url, { ...req.init, signal: ac ? ac.signal : undefined });
    if (!res.ok) return { ok: false, intent: null, issues: ['HTTP ' + res.status] };
    const text = parseProviderResponse(cfg.provider, await res.json());
    const v = validateLLM(text);
    return v.ok ? { ...v, intent: intentFromLLM(v.intent) } : v;
  } catch (e) {
    return { ok: false, intent: null, issues: ['mạng: ' + (e && e.name === 'AbortError' ? 'quá 8s' : 'lỗi')] };
  } finally { clearTimeout(timer); }
}

/** Claude có sẵn khi chạy trong artifact claude.ai (capability `sample`, không cần key). */
export async function getArtifactSample() {
  try { const c = globalThis.claude; return c && typeof c.use === 'function' ? await c.use('sample') : null; } catch { return null; }
}

async function callSample(sampleImpl, ctx, userText, history) {
  const sample = sampleImpl || await getArtifactSample();
  if (!sample) return { ok: false, intent: null, issues: ['không có Claude của artifact'] };
  const sys = buildSystemPrompt(ctx.name);
  const msgs = history.slice(-6).map((h) => ({ role: h.role === 'pet' ? 'assistant' : 'user', content: h.text }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  msgs.push({ role: 'user', content: buildContext({ ...ctx, text: userText }) });
  msgs[0] = { role: 'user', content: sys + '\n\n' + msgs[0].content };
  const merged = [];
  for (const m of msgs) { const last = merged[merged.length - 1]; if (last && last.role === m.role) last.content += '\n' + m.content; else merged.push({ ...m }); }
  try {
    const r = await sample(merged, { model: DEFAULT_MODEL, modelTier: 'quick', cache: false });
    const v = validateLLM(r && r.text);
    return v.ok ? { ...v, intent: intentFromLLM(v.intent) } : v;
  } catch (e) {
    return { ok: false, intent: null, issues: ['claude-artifact: ' + ((e && e.code) || 'lỗi')] };
  }
}
