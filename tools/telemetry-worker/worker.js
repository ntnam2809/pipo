// Cloudflare Worker nhận thống kê ẩn danh của Pipo (module syntax) và ghi vào Workers Analytics Engine.
//   POST /v1/collect  -> 204 (gói hợp lệ) | 400 | 403 | 413
//   GET  /v1/health   -> 200 {"ok":true}
// Worker này KHÔNG đọc và KHÔNG lưu IP, User-Agent, cookie hay bất kỳ header định danh nào: chỉ đọc `Origin` (để CORS)
// và `Content-Length`/thân yêu cầu. Cột dữ liệu ghi ra: xem toDataPoint() trong validate.js và README.
import { MAX_BYTES, validatePacket, toDataPoint, parseOrigins, corsHeaders } from './validate.js';

const json = (obj, status, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

/** Đọc thân tối đa `max` byte; vượt thì trả null (không đọc tiếp). */
async function readLimited(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await reader.cancel(); } catch { /* bỏ qua */ } return null; }
    chunks.push(value);
  }
  const buf = new Uint8Array(total); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(buf);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/v1/health' && request.method === 'GET') return json({ ok: true }, 200);
    if (url.pathname !== '/v1/collect') return json({ error: 'not-found' }, 404);

    const allowed = parseOrigins(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(request.headers.get('Origin'), allowed);
    if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, cors || {});
    if (!cors) return json({ error: 'origin' }, 403);

    const len = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(len) && len > MAX_BYTES) return json({ error: 'too-large' }, 413, cors);
    const text = await readLimited(request, MAX_BYTES);
    if (text === null) return json({ error: 'too-large' }, 413, cors);

    let raw; try { raw = JSON.parse(text); } catch { return json({ error: 'json' }, 400, cors); }
    const v = validatePacket(raw, Date.now());
    if (!v.ok) return json({ error: 'invalid', reason: v.reason }, 400, cors);
    if (!env.PIPO || typeof env.PIPO.writeDataPoint !== 'function') return json({ error: 'no-binding' }, 503, cors);
    env.PIPO.writeDataPoint(toDataPoint(v.packet));
    return new Response(null, { status: 204, headers: cors });
  },
};
