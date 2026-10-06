// Headless browser smoke test: loads the site, waits for full detail, checks the console
// and captures front, side and close-up screenshots (desktop) plus a phone screenshot.
// Usage: node tests/smoke.mjs <url> [--out tests/screenshots/<name>] [--prefix phase1]
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';

const url = process.argv[2];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const out = path.resolve(arg('out', 'tests/screenshots'));
const prefix = arg('prefix', 'smoke');
fs.mkdirSync(out, {recursive: true});

const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']});
const errors = [], warnings = [], requests = [];
const shot = async (page, name) => {
  const file = path.join(out, `${prefix}-${name}.png`);
  await page.screenshot({path: file});
  console.log('screenshot', path.relative(process.cwd(), file));
};
const watch = page => {
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfinished', async r => {
    const response = await r.response();
    const bytes = Number((await response?.allHeaders())?.['content-length'] ?? 0);
    requests.push({url: r.url().replace(url, ''), bytes, status: response?.status()});
  });
  page.on('requestfailed', r => errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
};
const waitForMark = (page, name, timeout = 60000) =>
  page.waitForFunction(n => performance.getEntriesByName(n).length > 0, name, {timeout});

// --- Desktop -------------------------------------------------------------------------------
const desktop = await browser.newPage({viewport: {width: 1440, height: 900}});
watch(desktop);
await desktop.goto(url);
await shot(desktop, 'desktop-splash');
await waitForMark(desktop, 'anima:first-body');
await shot(desktop, 'desktop-first-body');
await waitForMark(desktop, 'anima:full-detail');
await desktop.waitForTimeout(800);
await shot(desktop, 'desktop-intro');
// Leave the landing overlay for the explorer.
await desktop.getByRole('button', {name: 'Start exploring'}).click();
await desktop.waitForTimeout(1200);
await shot(desktop, 'desktop-three-quarter');
// Picking: click the abdomen in the default view and expect the detail sheet to open.
await desktop.mouse.click(700, 500);
await desktop.waitForTimeout(800);
const picked = (await desktop.locator('.detail-title').allTextContents())[0];
console.log('picked structure:', picked ?? 'none');
if (!picked) errors.push('Clicking the body did not select a structure.');
await shot(desktop, 'desktop-picked');
await desktop.keyboard.press('Escape');
await desktop.getByRole('button', {name: 'front view'}).click();
await desktop.waitForTimeout(800);
await shot(desktop, 'desktop-front');
await desktop.getByRole('button', {name: 'side view'}).click();
await desktop.waitForTimeout(800);
await shot(desktop, 'desktop-side');
// Close-up of the head and chest: zoom with the mouse wheel over the upper body.
await desktop.getByRole('button', {name: 'front view'}).click();
await desktop.waitForTimeout(500);
await desktop.mouse.move(720, 300);
for (let i = 0; i < 8; i++) { await desktop.mouse.wheel(0, -300); await desktop.waitForTimeout(60); }
await desktop.waitForTimeout(800);
await shot(desktop, 'desktop-closeup');
const fps = await desktop.evaluate(() => new Promise(resolve => {
  let frames = 0; const start = performance.now();
  const tick = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(tick); else resolve(frames / 2); };
  requestAnimationFrame(tick);
}));
console.log('rAF rate (idle page):', fps);

// --- Phone -----------------------------------------------------------------------------------
const phone = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
watch(phone);
await phone.goto(url);
await waitForMark(phone, 'anima:full-detail');
await phone.waitForTimeout(800);
await shot(phone, 'phone-intro');
await phone.getByRole('button', {name: 'Start exploring'}).tap();
await phone.waitForTimeout(1200);
await shot(phone, 'phone-explore');
await phone.getByRole('button', {name: 'Open layers'}).tap();
await phone.waitForTimeout(500);
await shot(phone, 'phone-layers');

await browser.close();
const geometry = requests.filter(r => /\.bin\.gz$/.test(r.url));
console.log(`requests: ${requests.length}, geometry files: ${geometry.length}, geometry bytes: ${(geometry.reduce((n, r) => n + r.bytes, 0) / 1e6).toFixed(2)} MB`);
const bad = requests.filter(r => r.status && r.status >= 400);
if (bad.length) console.log('HTTP errors:', bad);
console.log(warnings.length ? `Console warnings:\n  ${[...new Set(warnings)].join('\n  ')}` : 'Console warnings: none');
console.log(errors.length ? `Console errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'Console errors: none');
process.exitCode = errors.length ? 1 : 0;
