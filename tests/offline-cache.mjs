// Verifies the service worker: after one online visit, the site must load fully offline.
// Usage: node tests/offline-cache.mjs <url>   (needs a production build; the SW is not used in dev)
import {chromium} from '@playwright/test';

const url = process.argv[2];
const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--use-angle=d3d11']});
const context = await browser.newContext({viewport: {width: 1280, height: 800}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const mark = name => page.waitForFunction(n => performance.getEntriesByName(n).length > 0, name, {timeout: 60000});

await page.goto(url);
await mark('anima:full-detail');
await page.evaluate(() => navigator.serviceWorker.ready);
// The first visit asks the worker to cache everything once full detail has loaded.
await page.waitForFunction(async () => (await (await caches.open('anima-immutable-v1')).keys()).length >= 20 && (await (await caches.open('anima-shell-v1')).keys()).length >= 2, null, {timeout: 30000});
const cached = await page.evaluate(async () => (await (await caches.open('anima-immutable-v1')).keys()).length);

await context.setOffline(true);
const start = Date.now();
await page.reload();
await mark('anima:full-detail');
const offlineMs = Date.now() - start;
const firstBody = await page.evaluate(() => Math.round(performance.getEntriesByName('anima:first-body')[0].startTime));
await browser.close();

console.log(`cached immutable files: ${cached}`);
console.log(`offline reload: first body ${firstBody} ms, full detail after ${offlineMs} ms`);
console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'errors: none');
process.exitCode = errors.length ? 1 : 0;
