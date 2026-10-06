// Measures load performance in Chromium under a throttled "broadband" profile.
// Reports transfer sizes by resource type and time to: first paint, first visible body,
// and full detail. The app records the latter two as performance marks
// ('anima:first-body', 'anima:full-detail'); for older builds without marks we fall back
// to watching the loading progress text.
// Usage: node tests/measure-load.mjs <url> [--mbps 50] [--latency 20] [--runs 3] [--cold]
import {chromium} from '@playwright/test';

const url = process.argv[2];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const mbps = arg('mbps', 50), latency = arg('latency', 20), runs = arg('runs', 3);

const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const results = [];
for (let run = 0; run < runs; run++) {
  // Service workers are blocked: their fetches bypass the page's CDP throttling and accounting.
  const context = await browser.newContext({viewport: {width: 1366, height: 768}, serviceWorkers: 'block'});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency, downloadThroughput: (mbps * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8,
  });
  const requests = new Map(), bytes = {};
  cdp.on('Network.responseReceived', e => requests.set(e.requestId, {url: e.response.url, type: e.type}));
  cdp.on('Network.loadingFinished', e => {
    const r = requests.get(e.requestId);
    if (!r) return;
    const key = /\.(bin|gz|amesh)$/.test(new URL(r.url).pathname) ? 'geometry' : r.type;
    bytes[key] = (bytes[key] ?? 0) + e.encodedDataLength;
  });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  const start = Date.now();
  await page.goto(url, {waitUntil: 'commit'});
  // Poll for milestones from inside the page so timings use the page clock.
  const timings = await page.evaluate(() => new Promise(resolve => {
    const out = {};
    const tick = () => {
      const now = performance.now();
      const mark = n => performance.getEntriesByName(n)[0]?.startTime;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      if (fcp && out.firstPaint === undefined) out.firstPaint = fcp;
      const status = document.querySelector('[role=status]')?.textContent ?? '';
      const pct = Number((status.match(/(\d+)%/) ?? [])[1] ?? -1);
      if (out.firstBody === undefined && (mark('anima:first-body') ?? (pct > 0 ? now : undefined)) !== undefined)
        out.firstBody = mark('anima:first-body') ?? now;
      const fullMark = mark('anima:full-detail');
      if (fullMark !== undefined || (out.firstBody !== undefined && !document.querySelector('.loading') && !mark('anima:first-body')))
        out.fullDetail = fullMark ?? now;
      if (out.fullDetail !== undefined || now > 120000) resolve(out);
      else setTimeout(tick, 50);
    };
    tick();
  }));
  await page.waitForTimeout(500);
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const i = c?.getExtension('WEBGL_debug_renderer_info');
    return i ? c.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  results.push({run, ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])), bytes, errors, gl, wall: Date.now() - start});
  await context.close();
}
await browser.close();

const mb = n => (n / 1e6).toFixed(2) + ' MB';
console.log(`Profile: ${mbps} Mbps down, ${latency} ms latency, cache disabled, ${runs} runs`);
console.log(`GPU: ${results[0].gl}`);
for (const r of results) {
  const total = Object.values(r.bytes).reduce((a, b) => a + b, 0);
  console.log(`run ${r.run}: first paint ${r.firstPaint} ms, first body ${r.firstBody} ms, full detail ${r.fullDetail} ms, transfer ${mb(total)}`);
}
const last = results.at(-1);
console.log('Transfer by type (last run):', Object.fromEntries(Object.entries(last.bytes).map(([k, v]) => [k, mb(v)])));
const errors = [...new Set(results.flatMap(r => r.errors))];
console.log(errors.length ? `Console errors:\n  ${errors.join('\n  ')}` : 'Console errors: none');
