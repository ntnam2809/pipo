import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLLM, extractJSON, buildRequest, buildSystemPrompt, parseProviderResponse, callLLM, DEFAULT_MODEL, ACTIONS } from '../src/brain/llm.js';
import { EXPRESSION_IDS } from '../src/eyes/expressions.js';
import { SOUND_IDS } from '../src/audio/chirp.js';
import { parseCommand, normalize } from '../src/audio/voice.js';
import { processMimic, MIMIC_PRESETS, envAt, MAX_SEC } from '../src/audio/mimic.js';

test('validator: JSON hợp lệ qua, có clamp', () => {
  const r = validateLLM('{"expression":"happy","intensity":0.8,"duration_ms":2000,"say":"Chào!","sound":"happy","action":"dance"}');
  assert.ok(r.ok); assert.deepEqual(r.intent, { expression: 'happy', intensity: 0.8, duration: 2000, say: 'Chào!', sound: 'happy', action: 'dance' });
  const c = validateLLM({ expression: 'sad', intensity: 5, duration_ms: 99999 }); assert.ok(c.ok && c.intent.intensity === 1 && c.intent.duration === 8000 && c.issues.length === 2);
  assert.equal(validateLLM({ expression: 'sad', duration_ms: 10 }).intent.duration, 500);
});
test('validator: chặn JSON hỏng / id lạ / số bậy -> fallback', () => {
  for (const bad of ['', 'không phải json', '{"expression":', '[1,2]', null, undefined, 42, '{}', '{"expression":"sieu_nhan"}', '{"sound":"pew","action":"fly"}']) assert.equal(validateLLM(bad).ok, false, String(bad));
  const part = validateLLM('{"expression":"lạ","say":"bíp","intensity":"abc"}'); assert.ok(part.ok && !part.intent.expression && part.intent.say === 'bíp' && part.issues.length >= 2);
  assert.equal(validateLLM('{"expression":"happy","action":"none"}').intent.action, undefined);
});
test('validator: chịu rào markdown, cắt say còn 12 từ, lọc ký tự điều khiển', () => {
  const r = validateLLM('Đây:\n```json\n{"expression":"love","say":"a b c d e f g h i j k l m n o\\u0001"}\n```'); assert.ok(r.ok); assert.equal(r.intent.say.split(' ').length, 12);
  assert.deepEqual(extractJSON('xx {"a":{"b":"}"}} yy'), { a: { b: '}' } });
});
test('validator: id đều nằm trong bảng', () => { for (const e of EXPRESSION_IDS) assert.ok(validateLLM({ expression: e }).ok); for (const s of SOUND_IDS) assert.ok(validateLLM({ sound: s }).ok); for (const a of ACTIONS.slice(1)) assert.ok(validateLLM({ action: a }).ok); });
test('system prompt liệt kê biểu cảm + yêu cầu JSON', () => { const p = buildSystemPrompt('Bi'); assert.ok(p.includes('Bi') && p.includes('miệng') && p.includes('JSON') && p.includes('cloud') === false && EXPRESSION_IDS.every((e) => p.includes(e))); });
test('request: header Anthropic + model mặc định + 3 provider', () => {
  const a = buildRequest({ provider: 'anthropic', apiKey: 'k' }, 'sys', [], 'hi'); assert.equal(a.init.headers['anthropic-dangerous-direct-browser-access'], 'true'); assert.equal(a.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(DEFAULT_MODEL, 'claude-haiku-5-5'); assert.equal(JSON.parse(a.init.body).model, 'claude-haiku-5-5'); assert.match(a.url, /anthropic\.com\/v1\/messages$/);
  const o = buildRequest({ provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1/', model: 'm', apiKey: '' }, 'sys', [{ role: 'user', text: 'x' }], 'hi'); assert.equal(o.url, 'http://localhost:11434/v1/chat/completions'); assert.ok(!o.init.headers.authorization);
  const g = buildRequest({ provider: 'gemini', apiKey: 'K', model: 'gem' }, 'sys', [], 'hi'); assert.match(g.url, /gem:generateContent\?key=K/); assert.equal(buildRequest({ provider: 'none' }, '', [], ''), null);
  assert.equal(JSON.parse(a.init.body).messages.length, 1); assert.equal(buildRequest({ provider: 'anthropic' }, 's', Array(20).fill({ role: 'user', text: 'x' }), 'q').init.body.includes('"q"'), true);
  assert.equal(parseProviderResponse('anthropic', { content: [{ text: '{"a":1}' }] }), '{"a":1}'); assert.equal(parseProviderResponse('openai-compatible', { choices: [{ message: { content: 'x' } }] }), 'x'); assert.equal(parseProviderResponse('gemini', {}), null);
});
test('callLLM: fallback im lặng khi lỗi mạng/HTTP/JSON hỏng; thành công trả intent', async () => {
  const cfg = { provider: 'anthropic', apiKey: 'k', model: 'm' }, ctx = { name: 'Pipo' };
  assert.equal((await callLLM({ provider: 'none' }, ctx, 'hi')).ok, false);
  assert.equal((await callLLM(cfg, ctx, 'hi', [], async () => { throw new Error('mất mạng'); })).ok, false);
  assert.equal((await callLLM(cfg, ctx, 'hi', [], async () => ({ ok: false, status: 500 }))).ok, false);
  assert.equal((await callLLM(cfg, ctx, 'hi', [], async () => ({ ok: true, json: async () => ({ content: [{ text: 'bíp bíp' }] }) }))).ok, false);
  const ok = await callLLM(cfg, ctx, 'hi', [], async () => ({ ok: true, json: async () => ({ content: [{ text: '{"expression":"joy","say":"Bíp!"}' }] }) })); assert.ok(ok.ok && ok.intent.expression === 'joy' && ok.intent.priority);
});
test('voice: parse lệnh tiếng Việt', () => {
  assert.equal(normalize('Ngủ đi!'), 'ngu di');
  const c = (t) => parseCommand(t, 'Pipo'); assert.deepEqual(c('Pipo ngủ đi'), { type: 'cmd', cmd: 'sleep' }); assert.equal(c('dậy đi').cmd, 'wake'); assert.equal(c('ăn không').cmd, 'feed'); assert.equal(c('nhìn anh đây').cmd, 'look'); assert.equal(c('Nhìn tao').cmd, 'look');
  assert.equal(c('nhảy đi').cmd, 'dance'); assert.equal(c('giận à').cmd, 'angry'); assert.equal(c('Pipo ơi').type, 'name'); assert.equal(c('hôm nay trời đẹp').type, 'text'); assert.equal(c(''), null);
});
test('mimic: pitch-shift/robot hóa, envelope nhép miệng, tối đa 6s', () => {
  const sr = 16000, x = new Float32Array(sr * 8).map((_, i) => Math.sin(i / 20) * (i < sr ? 0.4 : 0));
  const r = processMimic(x, sr, 'chipmunk'); assert.equal(r.data.length, sr * MAX_SEC); assert.equal(r.rate, MIMIC_PRESETS.chipmunk.rate); assert.ok(r.duration < MAX_SEC / 1.5);
  assert.ok(r.data.every((v) => v >= -1 && v <= 1)); assert.ok(envAt(r.env, 0.1) > 0.2 && envAt(r.env, 3) < 0.01); assert.ok(processMimic(x, sr, 'deep').rate < 1); assert.ok(processMimic(x, sr, 'robot').rate > 1);
  assert.equal(processMimic(new Float32Array(0), sr).data.length, 0); assert.equal(Object.keys(MIMIC_PRESETS).length, 3);
});

test('claude-artifact: dùng sample của artifact, validator vẫn đứng trên', async () => {
  const { callLLM } = await import('../src/brain/llm.js');
  let got = null;
  let opts = null;
  const fake = async (msgs, o) => { got = msgs; opts = o; return { text: '{"expression":"love","say":"thương anh","duration_ms":99999}' }; };
  const r = await callLLM({ provider: 'claude-artifact' }, { name: 'Pipo' }, 'chào', [{ role: 'pet', text: 'bíp' }], null, fake);
  assert.equal(r.ok, true); assert.equal(r.intent.expression, 'love'); assert.equal(r.intent.duration, 8000);
  assert.equal(opts.model, 'claude-haiku-5-5'); assert.equal(got[0].role, 'user'); assert.match(got[0].content, /JSON/);
  const bad = await callLLM({ provider: 'claude-artifact' }, { name: 'Pipo' }, 'chào', [], null, async () => ({ text: 'không phải json' }));
  assert.equal(bad.ok, false);
  const none = await callLLM({ provider: 'claude-artifact' }, { name: 'Pipo' }, 'chào', [], null, null);
  assert.equal(none.ok, false);
});

test('anthropic: luôn Haiku dù ô Model ghi model khác', () => {
  const r = buildRequest({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' }, 'sys', [], 'hi');
  assert.equal(JSON.parse(r.init.body).model, 'claude-haiku-5-5');
});
