// Smoke test trình duyệt (Playwright). Chạy:  node test/browser-smoke.mjs [baseUrl] [outDir]
// Cần `playwright` hoặc `playwright-core` resolve được (cài NGOÀI repo, ví dụ: cd /tmp/pw && npm i playwright-core
// rồi: NODE_PATH=/tmp/pw/node_modules node test/browser-smoke.mjs). Không `playwright install`: dùng Chromium có sẵn.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeHand } from './handfixtures.js';
import os from 'node:os';

const require = createRequire(import.meta.url);
let pw;
for (const n of ['playwright', 'playwright-core']) { try { pw = require(n); break; } catch { /* thử tiếp */ } }
if (!pw) { try { pw = require(path.join(process.env.NODE_PATH || '/tmp/claude-0/pw/node_modules', 'playwright-core')); } catch { /* */ } }
if (!pw) { console.error('Không tìm thấy playwright(-core). Cài ngoài repo rồi đặt NODE_PATH.'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[3] || process.env.SHOTS || path.join(os.tmpdir(), 'pipo-shots');
mkdirSync(outDir, { recursive: true });

let base = process.argv[2], srv = null;
if (!base) { // tự dựng server tĩnh
  const port = 8800 + Math.floor(Math.random() * 100);
  srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`; await new Promise((r) => setTimeout(r, 900));
}

function findChromium() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined;
  for (const d of readdirSync(dir).filter((x) => x.startsWith('chromium-'))) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return undefined;
}
const browser = await pw.chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
let problems = 0;
async function open(url, viewport = { width: 390, height: 780 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pipo && window.__pipo.frames > 5, null, { timeout: 8000 });
  return { ctx, page, errs };
}

// 1. gallery: chạy tự động ~ vài giây, kiểm không lỗi
{
  const { ctx, page, errs } = await open('/index.html?gallery=1');
  await page.waitForTimeout(3300);
  const inner = await page.evaluate(() => ({ frames: window.__pipo.frames, errors: window.__pipo.errors.slice() }));
  errs.push(...inner.errors);
  console.log(`gallery: ${inner.frames} frame, lỗi: ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 2. debug: chụp từng biểu cảm + giả lập sự kiện
{
  const { ctx, page, errs } = await open('/index.html?debug=1');
  const ids = await page.evaluate(() => window.__pipo.ids);
  await page.screenshot({ path: path.join(outDir, 'debug-panel.png') });
  await page.addStyleTag({ content: '#debug{display:none!important}' }); // chụp mắt không bị panel che
  for (const id of ids) {
    await page.evaluate((x) => { window.__pipo.force(x); window.__pipo.animator.nextBlink = 1e9; window.__pipo.animator.blink = null; }, id); // chụp không trúng lúc chớp
    await page.waitForTimeout(id === 'sleeping' || id === 'love' ? 1500 : 1100);
    await page.screenshot({ path: path.join(outDir, `${id}.png`) });
  }
  await page.evaluate(() => window.__pipo.unforce());
  const events = ['motion:shake', 'motion:hardshake', 'motion:freefall', 'motion:impact', 'motion:facedown', 'motion:faceup', 'motion:upsidedown', 'motion:upright', 'touch:poke', 'touch:pet', 'touch:hug', 'camera:peekaboo', 'mic:clap2', 'battery:low', 'geo:newplace'];
  for (const ev of events) { await page.evaluate((e) => window.__pipo.bus.emit(e, {}), ev); await page.waitForTimeout(250); }
  for (const f of [['food', 'cookie'], ['drink', 'cup']]) { await page.evaluate((x) => window.__pipo.bus.emit('feed:drop', { kind: x[0], item: x[1] }), f); await page.waitForTimeout(900); await page.screenshot({ path: path.join(outDir, `feed-${f[1]}.png`) }); }
  const inner = await page.evaluate(() => window.__pipo.errors.slice()); errs.push(...inner);
  console.log(`debug: ${ids.length} biểu cảm đã chụp -> ${outDir}, lỗi: ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 3. màn ngang + onboarding + drawer
{
  const { ctx, page, errs } = await open('/index.html', { width: 800, height: 400 });
  await page.screenshot({ path: path.join(outDir, '_landscape-onboarding.png') });
  await page.click('#wake'); await page.waitForTimeout(500);
  await page.fill('.onb input', 'Bi'); await page.click('text=Tiếp'); await page.click('#onb-done'); await page.waitForTimeout(800);
  await page.click('#corner'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '_landscape-drawer.png') });
  const inner = await page.evaluate(() => window.__pipo.errors.slice()); errs.push(...inner);
  console.log(`onboarding+drawer: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 4. tương tác thật: kéo món ăn lên mắt, nựng bằng vuốt, chạm đúp hiện giờ, rót nước
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('pipo.v1', JSON.stringify({ onboarded: true, needs: { hunger: 0.4, thirst: 0.4, energy: 0.9, affection: 0.4, fun: 0.5 }, lastSeen: Date.now() })); } catch {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(base + '/index.html'); await page.waitForFunction(() => window.__pipo && window.__pipo.frames > 5);
  await page.click('#corner'); await page.waitForTimeout(400); await page.click('#btn-food'); await page.waitForTimeout(200);
  const box = await page.locator('.item').first().boundingBox(); const h0 = await page.evaluate(() => window.__pipo.needs.get('hunger'));
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(200, 420, { steps: 8 }); await page.mouse.move(195, 330, { steps: 8 }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '_feed-approach.png') });
  await page.mouse.up(); await page.waitForTimeout(700); await page.screenshot({ path: path.join(outDir, '_feed-eating.png') });
  const h1 = await page.evaluate(() => window.__pipo.needs.get('hunger')); const ex = await page.evaluate(() => window.__pipo.animator.expressionId);
  console.log(`kéo món: hunger ${h0.toFixed(2)} -> ${h1.toFixed(2)}, biểu cảm ${ex}`); if (!(h1 > h0) || ex !== 'eating') { errs.push('cho ăn không hoạt động'); }
  await page.waitForTimeout(5200);
  await page.mouse.move(120, 300); await page.mouse.down(); for (let r = 0; r < 3; r++) { for (let x = 120; x <= 280; x += 20) await page.mouse.move(x, 300); for (let x = 280; x >= 120; x -= 20) await page.mouse.move(x, 300); } await page.waitForTimeout(150); await page.screenshot({ path: path.join(outDir, '_pet.png') }); await page.mouse.up();
  const a = await page.evaluate(() => window.__pipo.animator.expressionId); console.log('nựng ->', a); if (!['happy', 'love'].includes(a)) errs.push('nựng không hoạt động: ' + a);
  await page.waitForTimeout(3000); await page.mouse.dblclick(195, 650); await page.waitForTimeout(700); await page.screenshot({ path: path.join(outDir, '_clock.png') });
  const inner = await page.evaluate(() => window.__pipo.errors.slice()); errs.push(...inner);
  console.log(`tương tác: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 5. skin: mỗi skin (classic · pixel · eve) ở gallery (query + hash), màn dọc + ngang, rồi đang nhảy với nhạc giả
for (const skin of ['classic', 'pixel', 'eve']) {
  for (const [vp, tag, url] of [[{ width: 390, height: 780 }, 'portrait', `/index.html?gallery=1&skin=${skin}`], [{ width: 844, height: 390 }, 'landscape', `/index.html#gallery&skin=${skin}`]]) {
    const { ctx, page, errs } = await open(url, vp);
    const got = await page.evaluate(() => window.__pipo.renderer.skin.id); if (got !== skin) errs.push(`skin ${skin}: renderer đang dùng ${got}`);
    await page.waitForTimeout(2300); await page.screenshot({ path: path.join(outDir, `skin-${skin}-${tag}.png`) });
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`skin ${skin} ${tag} (gallery): lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
    await ctx.close();
  }
  const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  await page.screenshot({ path: path.join(outDir, `skin-${skin}-idle.png`) });
  await page.evaluate(() => window.__pipo.setFakeMusic(true, 120)); await page.waitForTimeout(3600);
  const d = await page.evaluate(() => ({ ph: window.__pipo.dance.phaseName, ex: window.__pipo.animator.expressionId, move: window.__pipo.dance.moveId }));
  if (d.ph !== 'dance' || d.ex !== 'groove') errs.push(`${skin}: nhạc giả không làm Pipo nhảy (${JSON.stringify(d)})`);
  await page.waitForTimeout(450); await page.screenshot({ path: path.join(outDir, `skin-${skin}-dance.png`) });
  await page.evaluate(() => window.__pipo.bus.emit('touch:poke', { x: 0, y: 0 })); await page.waitForTimeout(300);
  const ex1 = await page.evaluate(() => window.__pipo.animator.expressionId); if (ex1 !== 'surprised') errs.push(`${skin}: chọc khi đang nhảy phải thắng (được ${ex1})`);
  await page.evaluate(() => window.__pipo.bus.emit('mic:clap', {})); await page.waitForTimeout(2300);
  const ex2 = await page.evaluate(() => window.__pipo.animator.expressionId); if (ex2 !== 'groove') errs.push(`${skin}: sau phản xạ phải quay lại nhảy (được ${ex2})`);
  await page.evaluate(() => window.__pipo.setFakeMusic(false)); await page.waitForTimeout(500);
  const ph = await page.evaluate(() => window.__pipo.dance.phaseName); if (ph !== 'outro') errs.push(`${skin}: nhạc tắt phải vào outro (được ${ph})`);
  errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
  console.log(`skin ${skin} nhảy: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 6. nút debug "Giả lập nhạc", nút drawer 🎵, hàng cài đặt Giao diện + Nghe nhạc, đổi skin sống
{
  const { ctx, page, errs } = await open('/index.html?debug=1#debug&skin=pixel');
  await page.click('#dbg-music'); await page.waitForTimeout(3500);
  const on = await page.evaluate(() => window.__pipo.dance.phaseName); if (on !== 'dance') errs.push('nút giả lập nhạc không bật nhảy: ' + on);
  await page.selectOption('#dbg-skin', 'eve'); await page.waitForTimeout(400);
  const id = await page.evaluate(() => window.__pipo.renderer.skin.id); if (id !== 'eve') errs.push('đổi skin ở debug không ăn: ' + id);
  await page.click('#dbg-music');
  await page.click('#corner'); await page.waitForTimeout(400);
  if (!(await page.locator('#btn-music').count())) errs.push('thiếu nút 🎵 trong drawer');
  await page.screenshot({ path: path.join(outDir, '_drawer-music.png') });
  await page.click('#btn-settings'); await page.waitForTimeout(300);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#settings .frow')].map((r) => r.textContent));
  if (!rows.some((t) => t.includes('Giao diện'))) errs.push('thiếu hàng Giao diện'); if (!rows.some((t) => t.includes('Nghe nhạc'))) errs.push('thiếu hàng Nghe nhạc');
  errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
  console.log(`debug nhạc + settings: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
  await ctx.close();
}
// 7. thống kê ẩn danh: endpoint giả, đồng hồ giả (nhảy ngày), gói gửi đi chỉ có khóa cho phép, tắt thì xóa bộ đếm
{
  const ACTIVE = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang'];
  const TOP = ['v', 'kind', 'day', 'dsi', 'a7', 'a30', 'mode', 'platform', 'lang', 'skin', 'theme', 'sessions', 'minutes', 'ev', 'sensors', 'llm'];
  const EV = ['poke', 'pet', 'hug', 'feed', 'drink', 'mimic', 'chat_llm', 'music_on', 'dance', 'clock', 'settings_open', 'install_prompt', 'install_accepted', 'gesture', 'shot', 'hand_mirror', 'meet_start', 'meet_ok'];
  const sameKeys = (a, b) => JSON.stringify(Object.keys(a)) === JSON.stringify(b);
  const ENDPOINT = 'https://telemetry.test/v1/collect';
  const hits = []; const errs = [];
  const byKind = (k) => hits.filter((h) => { try { return JSON.parse(h.body).kind === k; } catch { return false; } });
  const mkCtx = async (hook) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    if (hook) await ctx.addInitScript((h) => { window.__tOff = 0; window.__pipoTelemetryTest = { ...h, now: () => Date.now() + window.__tOff * 86400000 }; }, hook);
    await ctx.route('https://telemetry.test/**', async (route) => {
      const rq = route.request(); hits.push({ method: rq.method(), headers: rq.headers(), body: rq.postData() });
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true' } });
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(base + '/index.html'); await page.waitForFunction(() => window.__pipo && window.__pipo.frames > 5);
    return { ctx, page };
  };
  const tickAfter = async (page, days) => { await page.evaluate((d) => { window.__tOff = d; window.__pipo.telemetry.tick(); }, days); await page.waitForTimeout(250); };

  // 7a. mặc định (endpoint rỗng) và endpoint có nhưng hostname là localhost: không gom, không gửi
  for (const [tag, hook] of [['endpoint rỗng', null], ['localhost', { endpoint: ENDPOINT, hostname: 'localhost' }]]) {
    const { ctx, page } = await mkCtx(hook);
    await page.evaluate(() => { window.__pipo.bus.emit('touch:poke', {}); }); await tickAfter(page, 2);
    const stored = await page.evaluate(() => localStorage.getItem('pipo.telemetry'));
    if (stored !== null || hits.length) errs.push(`thống kê (${tag}) vẫn gom/gửi: ${stored} / ${hits.length} yêu cầu`);
    await ctx.close();
  }
  // 7b. đường chính
  {
    const { ctx, page } = await mkCtx({ endpoint: ENDPOINT, hostname: 'pipo.test' });
    await page.click('#wake'); await page.waitForTimeout(400); await page.fill('.onb input', 'Bi'); await page.click('text=Tiếp'); await page.click('#onb-done'); await page.waitForTimeout(600);
    await page.evaluate(() => { const b = window.__pipo.bus; for (let i = 0; i < 3; i++) b.emit('touch:poke', {}); b.emit('touch:pet', { count: 3 }); });
    await page.click('#corner'); await page.waitForTimeout(300); await page.click('#btn-settings'); await page.waitForTimeout(300);
    await page.locator('#tele-preview').scrollIntoViewIfNeeded(); await page.click('#tele-preview');
    const shown = await page.evaluate(() => document.getElementById('tele-pre').textContent);
    const pv = await page.evaluate(() => window.__pipo.telemetry.preview());
    if (!pv.ok) errs.push('xem trước không có gói: ' + JSON.stringify(pv));
    else { if (!sameKeys(pv.packet, TOP)) errs.push('xem trước (day) sai khóa: ' + Object.keys(pv.packet)); if (!sameKeys(pv.active, ACTIVE)) errs.push('xem trước (active) sai khóa: ' + Object.keys(pv.active)); }
    if (!shown.includes('"kind": "active"') || !shown.includes('"kind": "day"')) errs.push('nút xem gói phải hiện cả active lẫn day: ' + shown);
    await page.screenshot({ path: path.join(outDir, '_telemetry-settings.png') });
    if (hits.length !== 1 || byKind('active').length !== 1) errs.push('mở app lần đầu phải gửi đúng 1 gói active ngay (và chưa có gói day): ' + hits.length);
    else {
      const a = JSON.parse(hits[0].body);
      if (!sameKeys(a, ACTIVE)) errs.push('gói active sai khóa: ' + Object.keys(a));
      if (a.dsi !== 0 || a.a7 !== 1 || a.a30 !== 1) errs.push('active ngày cài phải dsi=0 a7=1 a30=1: ' + hits[0].body);
      console.log('gói active mẫu:', hits[0].body);
    }
    const row = await page.evaluate(() => [...document.querySelectorAll('#settings .frow')].some((r) => r.textContent.includes('Gửi thống kê ẩn danh')));
    if (!row) errs.push('thiếu hàng cài đặt thống kê');
    // sang ngày kế: đúng 1 gói của hôm qua
    await tickAfter(page, 1); await tickAfter(page, 1); await page.evaluate(() => { window.__pipo.telemetry.tick(false); window.__pipo.telemetry.tick(true); });
    await page.waitForTimeout(200);
    if (byKind('day').length !== 1 || byKind('active').length !== 2) errs.push(`sau 1 ngày phải có đúng 1 gói day + 2 active, được ${byKind('day').length} + ${byKind('active').length}`);
    else {
      const h = byKind('day')[0]; let p = null; try { p = JSON.parse(h.body); } catch { errs.push('gói không phải JSON: ' + h.body); }
      if (h.method !== 'POST') errs.push('phương thức ' + h.method);
      if (h.headers.cookie) errs.push('có cookie trong yêu cầu thống kê');
      if (p) {
        if (!sameKeys(p, TOP)) errs.push('gói sai khóa: ' + Object.keys(p)); if (!sameKeys(p.ev, EV)) errs.push('ev sai khóa: ' + Object.keys(p.ev));
        if (p.dsi !== 0 || p.a7 !== 1 || p.a30 !== 1 || p.sessions !== 1) errs.push('dsi/a7/a30/sessions sai: ' + JSON.stringify(p));
        if (p.ev.poke !== 2 || p.ev.pet !== 1 || p.ev.settings_open !== 1) errs.push('bộ đếm sai: ' + JSON.stringify(p.ev));
        if (p.mode !== 'browser' || p.llm !== 'none' || p.skin !== 'classic' || !/^[a-z]{2}$/.test(p.lang)) errs.push('thuộc tính sai: ' + h.body);
        if (/Bi\b/.test(JSON.stringify(Object.values(p).filter((x) => typeof x === 'string')))) errs.push('tên pet lọt vào gói');
        console.log('gói mẫu:', h.body);
      }
    }
    await tickAfter(page, 2);
    if (byKind('day').length !== 2 || byKind('active').length !== 3) errs.push(`ngày kế tiếp phải thêm đúng 1 day + 1 active, được ${byKind('day').length} + ${byKind('active').length}`);
    else {
      const p = JSON.parse(byKind('day')[1].body); if (p.dsi !== 1 || p.a7 !== 2) errs.push('gói day ngày 2 sai dsi/a7: ' + byKind('day')[1].body);
      const a = JSON.parse(byKind('active')[2].body); if (a.dsi !== 2 || a.a7 !== 3 || !sameKeys(a, ACTIVE)) errs.push('gói active ngày 3 sai: ' + byKind('active')[2].body);
    }
    const nAfter = hits.length;
    // tắt trong cài đặt -> xóa bộ đếm, không gửi nữa; bật lại -> gom lại
    const box = page.locator('#settings .frow', { hasText: 'Gửi thống kê ẩn danh' }).locator('input[type=checkbox]');
    await box.uncheck(); await page.waitForTimeout(150);
    if ((await page.evaluate(() => localStorage.getItem('pipo.telemetry'))) !== null) errs.push('tắt thống kê mà bộ đếm local còn');
    await tickAfter(page, 5); await tickAfter(page, 8);
    if (hits.length !== nAfter) errs.push('đã tắt mà vẫn gửi: ' + (hits.length - nAfter) + ' gói');
    await box.check(); await page.waitForTimeout(150);
    if ((await page.evaluate(() => localStorage.getItem('pipo.telemetry'))) === null) errs.push('bật lại mà không gom');
    if (byKind('active').length !== 4) errs.push('bật lại phải gửi active của ngày đó: ' + byKind('active').length);
    // DNT/GPC (đặt sau khi tải) -> không gửi
    await page.evaluate(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true }));
    const before = hits.length; await tickAfter(page, 12); await tickAfter(page, 14);
    if (hits.length !== before) errs.push('GPC bật mà vẫn gửi');
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    await ctx.close();
  }
  console.log(`thống kê ẩn danh: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
}
// 8. động tác tay: mỗi skin × (wave · salute · punch · highfive) chụp giữa clip; đập tay chạm/hụt; khay ✋; nút debug; màn ngang
{
  const GE = [['wave', 900], ['salute', 1000], ['punch', 800], ['highfive', 1200]];
  for (const skin of ['classic', 'pixel', 'eve']) {
    for (const [g, ms] of GE) {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
      await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
      await page.evaluate((c) => window.__pipo.bus.emit('voice:cmd', { cmd: c, text: c }), g);
      await page.waitForTimeout(ms); await page.evaluate(() => { window.__pipo.animator.nextBlink = 1e9; });
      const st = await page.evaluate(() => ({ clip: window.__pipo.hands.name, px: window.__pipo.renderer.handPx, ex: window.__pipo.animator.expressionId }));
      if (st.clip !== g) errs.push(`${skin}/${g}: clip đang chạy là ${st.clip}`);
      if (!st.px || !(st.px.R || st.px.L)) errs.push(`${skin}/${g}: không có tay trên màn (handPx rỗng)`);
      await page.screenshot({ path: path.join(outDir, `hand-${skin}-${g}.png`) });
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`tay ${skin} ${g}: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
    // đập tay: chạm vào tay đang chờ -> highfiveHit + vui; không chạm -> hụt, buồn
    {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
      await page.addStyleTag({ content: '#debug{display:none!important}' });   // panel debug phủ góc trên, che tay
      await page.evaluate(() => window.__pipo.bus.emit('voice:cmd', { cmd: 'highfive' })); await page.waitForTimeout(1300);
      const p = await page.evaluate(() => window.__pipo.renderer.handPx.R); if (!p) errs.push(`${skin}: không có vị trí tay để chạm`);
      else {
        await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
        const a = await page.evaluate(() => ({ clip: window.__pipo.hands.name, ex: window.__pipo.animator.expressionId, aff: window.__pipo.needs.get('affection') }));
        if (a.clip !== 'highfiveHit' || a.ex !== 'joy') errs.push(`${skin}: chạm tay không thành đập tay (${JSON.stringify(a)})`);
        await page.waitForTimeout(150); await page.screenshot({ path: path.join(outDir, `hand-${skin}-highfive-hit.png`) });
      }
      await page.waitForTimeout(3600);
      await page.evaluate(() => window.__pipo.bus.emit('voice:cmd', { cmd: 'highfive' })); await page.waitForTimeout(3150);
      const m = await page.evaluate(() => window.__pipo.animator.expressionId); if (!['sad', 'neutral'].includes(m)) errs.push(`${skin}: không chạm thì phải buồn nhẹ (được ${m})`);
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`tay ${skin} đập tay chạm/hụt: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
    // màn ngang
    {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`, { width: 844, height: 390 });
      await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
      await page.evaluate(() => window.__pipo.bus.emit('voice:cmd', { cmd: 'bye' })); await page.waitForTimeout(1100);
      await page.screenshot({ path: path.join(outDir, `hand-${skin}-bye-landscape.png`) });
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`tay ${skin} màn ngang: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
  }
  // khay ✋ Động tác trong drawer + nút debug + clap theo nhạc nhảy hype
  {
    const { ctx, page, errs } = await open('/index.html?debug=1');
    await page.evaluate(() => { document.getElementById('dbg-gesture').value = 'thumbsup'; document.getElementById('dbg-gesture-go').click(); }); await page.waitForTimeout(300);
    if ((await page.evaluate(() => window.__pipo.hands.name)) !== 'thumbsup') errs.push('nút debug "Làm" không phát động tác');
    await page.evaluate(() => { window.__pipo.hands.stop(true); });
    await page.click('#corner'); await page.waitForTimeout(400); await page.click('#btn-gesture'); await page.waitForTimeout(200);
    const n = await page.locator('.gitem').count(); if (n !== 11) errs.push('khay động tác phải có 11 nút, có ' + n);
    await page.screenshot({ path: path.join(outDir, 'hand-tray.png') });
    await page.click('.gitem[data-g="clap"]'); await page.waitForTimeout(500);
    if ((await page.evaluate(() => window.__pipo.hands.name)) !== 'clap') errs.push('chạm nút trong khay không làm Pipo vỗ tay');
    const cnt = await page.evaluate(() => window.__pipo.telemetry.state ? 1 : 0); void cnt;
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`khay động tác + debug: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
    await ctx.close();
  }
}
// 9. bắn súng tay → giả chết: mỗi skin chụp bị chĩa súng · giật lùi · đổ · nằm · được nựng dậy · tự dậy · né · bắn trả; landmark tổng hợp đi hết đường tracker → sensor → bus → brain
{
  const GUN = makeHand('gun'), OPEN = (i) => makeHand('open', { cx: 0.5 + 0.1 * Math.sin(i * 0.9) });
  const click = (page, label) => page.evaluate((l) => [...document.querySelectorAll('#debug button')].find((b) => b.textContent === l).click(), label);
  const st = (page) => page.evaluate(() => ({ ex: window.__pipo.animator.expressionId, clip: window.__pipo.hands.name, fall: window.__pipo.brain.fall.state, tilt: window.__pipo.pose && window.__pipo.pose.fall ? window.__pipo.pose.fall.tilt : 0, cur: window.__pipo.brain.reactions.cur && window.__pipo.brain.reactions.cur.name }));
  const shot = async (page, skin, tag) => { await page.evaluate(() => { window.__pipo.animator.nextBlink = 1e9; }); await page.screenshot({ path: path.join(outDir, `fall-${skin}-${tag}.png`) }); };
  for (const skin of ['classic', 'pixel', 'eve']) {
    // 9a. nút debug: chĩa → bắn → nằm → nựng dậy
    {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
      const labels = await page.evaluate(() => [...document.querySelectorAll('#debug button')].map((b) => b.textContent)); for (const l of ['Giả lập chĩa súng', 'Giả lập bắn']) if (!labels.includes(l)) errs.push(`thiếu nút debug "${l}"`);
      await click(page, 'Giả lập chĩa súng'); await page.addStyleTag({ content: '#debug,#corner{display:none!important}' }); await page.waitForTimeout(800);
      let s = await st(page); if (s.ex !== 'scared' || s.clip !== 'handsup') errs.push(`${skin}: bị chĩa súng phải hoảng + giơ tay (${JSON.stringify(s)})`); await shot(page, skin, '1aim');
      await click(page, 'Giả lập bắn'); await page.waitForTimeout(220); await shot(page, skin, '2recoil');
      s = await st(page); if (s.ex !== 'ko' || s.cur !== 'shotHit') errs.push(`${skin}: trúng đạn phải ko (${JSON.stringify(s)})`);
      await page.waitForTimeout(450); await shot(page, skin, '3fall'); await page.waitForTimeout(950); await shot(page, skin, '4lie');
      s = await st(page); if (s.fall !== 'lie' || Math.abs(s.tilt) < 1.2) errs.push(`${skin}: phải nằm ngang (${JSON.stringify(s)})`);
      await page.waitForTimeout(1200); await shot(page, skin, '5twitch');
      await page.evaluate(() => window.__pipo.bus.emit('touch:pet', { count: 3 })); await page.waitForTimeout(500);
      s = await st(page); if (s.ex !== 'dizzy' || s.fall !== 'rise') errs.push(`${skin}: nựng phải bật dậy chóng mặt (${JSON.stringify(s)})`); await shot(page, skin, '6dizzy');
      await page.waitForTimeout(2300); s = await st(page); if (s.ex !== 'happy' || s.fall !== 'idle') errs.push(`${skin}: dậy xong phải vui (${JSON.stringify(s)})`); await shot(page, skin, '7happy');
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`bắn súng ${skin} (nút debug → giả chết → nựng dậy): lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
    // 9b. không ai chạm: tự dậy sau 8 s, nháy mắt
    {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
      await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
      await page.evaluate(() => window.__pipo.bus.emit('voice:cmd', { cmd: 'shot' })); await page.waitForTimeout(7600);
      let s = await st(page); if (s.fall !== 'lie') errs.push(`${skin}: trước 8 s vẫn phải nằm (${JSON.stringify(s)})`);
      await page.waitForTimeout(1200); s = await st(page); if (s.ex !== 'wink') errs.push(`${skin}: tự dậy phải nháy mắt (${JSON.stringify(s)})`); await shot(page, skin, '8selfrise');
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`bắn súng ${skin} (tự dậy sau 8 s): lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
    // 9c. habituation: lần 3 né, lần 4 bắn trả
    {
      const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
      await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
      const fire = (page) => page.evaluate(() => window.__pipo.bus.emit('hand:fire', {}));
      for (let i = 0; i < 2; i++) { await fire(page); await page.waitForTimeout(1500); await page.evaluate(() => window.__pipo.bus.emit('touch:pet', { count: 3 })); await page.waitForTimeout(2300); }
      await fire(page); await page.waitForTimeout(350); let s = await st(page); if (s.cur !== 'dodge' || s.fall !== 'dodge') errs.push(`${skin}: lần 3 phải né (${JSON.stringify(s)})`); await shot(page, skin, '9dodge');
      await page.waitForTimeout(1800); await fire(page); await page.waitForTimeout(900); s = await st(page); if (s.cur !== 'counter' || s.clip !== 'gun') errs.push(`${skin}: lần 4 phải bắn trả (${JSON.stringify(s)})`); await shot(page, skin, '10counter');
      errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
      console.log(`bắn súng ${skin} (né · bắn trả): lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
      await ctx.close();
    }
  }
  // 9d. landmark tổng hợp qua cả đường tracker → sensor → bus → brain (không cần camera): chĩa → tiếng động = bắn; người vẫy → Pipo vẫy
  {
    const { ctx, page, errs } = await open('/index.html?debug=1&skin=classic');
    await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
    const feed = (hands, t) => page.evaluate(([h, t]) => { window.__pipo.handSensor.feed(h, 1, t); }, [hands, t]);
    const t0 = await page.evaluate(() => performance.now() / 1000);
    for (let i = 0; i < 8; i++) await feed([GUN], t0 + i / 12);
    let s = await st(page); if (s.cur !== 'aim') errs.push(`landmark súng không gây aim (${JSON.stringify(s)})`);
    await page.evaluate(() => window.__pipo.bus.emit('mic:clap', {})); await page.waitForTimeout(300);
    s = await st(page); if (s.cur !== 'shotHit') errs.push(`tiếng động lúc đang bị chĩa phải thành phát bắn (${JSON.stringify(s)})`);
    await page.waitForTimeout(1500); await page.evaluate(() => window.__pipo.bus.emit('touch:pet', { count: 3 })); await page.waitForTimeout(4400);   // reviveTouch (priority 10) chạy hết rồi mới bắt chước được
    for (let i = 0; i < 14; i++) await feed([OPEN(i)], t0 + 20 + i / 12);
    await page.waitForTimeout(250); s = await st(page); if (s.clip !== 'wave') errs.push(`người vẫy tay → Pipo phải vẫy (${JSON.stringify(s)})`);
    const rows = await (async () => { await page.click('#corner').catch(() => {}); return page.evaluate(() => 1); })(); void rows;
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`bắn súng: landmark tổng hợp → tracker → Pipo: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
    await ctx.close();
  }
  // 9e. cài đặt có hàng "Nhận dáng tay (tải MediaPipe)"
  {
    const { ctx, page, errs } = await open('/index.html?debug=1#debug');
    await page.evaluate(() => document.getElementById('corner').click()); await page.waitForTimeout(300); await page.evaluate(() => document.getElementById('btn-settings').click()); await page.waitForTimeout(300);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#settings .frow')].map((r) => r.textContent)); if (!rows.some((t) => t.includes('Nhận dáng tay'))) errs.push('thiếu hàng Nhận dáng tay trong cài đặt');
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`cài đặt nhận dáng tay: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs); await ctx.close();
  }
}
// 10. gặp bạn Pipo bằng tiếng bíp: debug "Giả lập bạn Pipo" chạy cả đường encode → Decoder → Meeting trên 3 skin (không cần micro); chụp lúc tìm bạn · gặp bạn · tạm biệt
{
  for (const skin of ['classic', 'pixel', 'eve']) {
    const { ctx, page, errs } = await open(`/index.html?debug=1&skin=${skin}`);
    const labels = await page.evaluate(() => [...document.querySelectorAll('#debug button')].map((b) => b.textContent)); if (!labels.includes('Giả lập bạn Pipo')) errs.push('thiếu nút debug "Giả lập bạn Pipo"');
    await page.evaluate(() => [...document.querySelectorAll('#debug button')].find((b) => b.textContent === 'Giả lập bạn Pipo').click());
    await page.addStyleTag({ content: '#debug,#corner{display:none!important}' });
    const shot = async (tag) => { await page.evaluate(() => { window.__pipo.animator.nextBlink = 1e9; }); await page.screenshot({ path: path.join(outDir, `meet-${skin}-${tag}.png`) }); };
    const st = () => page.evaluate(() => { const m = window.__pipo.meet; return m ? { log: m.log, ex: window.__pipo.animator.expressionId, clip: window.__pipo.hands.name, cur: window.__pipo.brain.reactions.cur && window.__pipo.brain.reactions.cur.name } : null; });
    const seen = {}, t0 = Date.now();
    while (Date.now() - t0 < 70000) {
      await page.waitForTimeout(120); const s = await st(); if (!s) break;
      for (const k of ['search', 'met', 'bye']) if (s.log.includes(k) && !seen[k]) { seen[k] = true; await page.waitForTimeout(k === 'search' ? 300 : 400); seen[k] = (await st()) || s; await shot(k); }   // đợi một nhịp cho biểu cảm kịp áp dụng rồi mới đo/chụp
    }
    if (!seen.search) errs.push(`${skin}: không thấy đang tìm bạn`); else if (seen.search.ex !== 'curious') errs.push(`${skin}: tìm bạn phải curious (${seen.search.ex})`);
    if (!seen.met) errs.push(`${skin}: không gặp được bạn ảo`); else if (!['excited', 'love'].includes(seen.met.ex) || seen.met.clip !== 'wave') errs.push(`${skin}: gặp bạn phải excited + vẫy tay (${JSON.stringify(seen.met)})`);
    if (!seen.bye) errs.push(`${skin}: không có tạm biệt`); else if (seen.bye.clip !== 'bye') errs.push(`${skin}: tạm biệt phải vẫy hai tay (${seen.bye.clip})`);
    const fin = await page.evaluate(() => ({ meet: !!window.__pipo.meet, friends: window.__pipo.store.data.friends, btn: !!document.getElementById('btn-meet') }));
    if (fin.meet) errs.push(`${skin}: chế độ gặp phải tự kết thúc sau tạm biệt`); if (!fin.friends.length || fin.friends[0].name !== 'Bibi') errs.push(`${skin}: bạn đã gặp chưa được lưu (${JSON.stringify(fin.friends)})`); if (!fin.btn) errs.push('thiếu nút 📡 Gặp bạn trong drawer');
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`gặp bạn ${skin} (giả lập: tìm → gặp → tạm biệt): lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs);
    await ctx.close();
  }
  // nút 📡 thật (không micro trong headless): từ chối êm, không kẹt chế độ gặp, không lỗi
  {
    const { ctx, page, errs } = await open('/index.html?debug=1');
    await page.evaluate(() => document.getElementById('corner').click()); await page.waitForTimeout(350); await page.evaluate(() => document.getElementById('btn-meet').click()); await page.waitForTimeout(800);
    const m = await page.evaluate(() => !!window.__pipo.meet); if (m) errs.push('không có micro mà vẫn vào chế độ gặp');
    errs.push(...await page.evaluate(() => window.__pipo.errors.slice()));
    console.log(`nút Gặp bạn không micro: lỗi ${errs.length}`); problems += errs.length; if (errs.length) console.log(errs); await ctx.close();
  }
}
await browser.close(); if (srv) srv.kill();
console.log(problems ? `THẤT BẠI: ${problems} lỗi` : 'OK: 0 lỗi console/page');
process.exit(problems ? 1 : 0);
