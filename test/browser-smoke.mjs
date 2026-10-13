// Smoke test trình duyệt (Playwright). Chạy:  node test/browser-smoke.mjs [baseUrl] [outDir]
// Cần `playwright` hoặc `playwright-core` resolve được (cài NGOÀI repo, ví dụ: cd /tmp/pw && npm i playwright-core
// rồi: NODE_PATH=/tmp/pw/node_modules node test/browser-smoke.mjs). Không `playwright install`: dùng Chromium có sẵn.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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
await browser.close(); if (srv) srv.kill();
console.log(problems ? `THẤT BẠI: ${problems} lỗi` : 'OK: 0 lỗi console/page');
process.exit(problems ? 1 : 0);
