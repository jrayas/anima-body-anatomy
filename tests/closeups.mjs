// Repeatable close-up screenshots for mesh-quality work. Each target is found through the
// search UI and isolated with "Focus on this", so framing is identical between runs and
// before/after images can be compared directly.
// Usage: node tests/closeups.mjs <url> --prefix before [--only skull,heart]
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';

const url = process.argv[2];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const prefix = arg('prefix', 'closeup');
const only = arg('only', '')?.split(',').filter(Boolean);
const out = path.resolve('tests/screenshots/closeups');
fs.mkdirSync(out, {recursive: true});

// [file name, exact structure name in the search index]
const TARGETS = [
  ['skull', 'skull'],
  ['hand', 'right hand'],
  ['foot', 'right foot'],
  ['heart', 'heart'],
  ['ribcage', 'rib cage'],
  ['pectoralis', 'right pectoralis major'],
].filter(([name]) => !only?.length || only.includes(name));

const browser = await chromium.launch({args: ['--ignore-gpu-blocklist', '--use-angle=d3d11']});
const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1.5});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => performance.getEntriesByName('anima:full-detail').length > 0, null, {timeout: 60000});
await page.getByRole('button', {name: 'Start exploring'}).click();
await page.waitForTimeout(800);

for (const [name, structure] of TARGETS) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  await page.getByRole('combobox').fill(structure);
  await page.getByRole('option').filter({has: page.locator('.result-name', {hasText: new RegExp(`^${structure}$`, 'i')})}).first().click();
  await page.getByRole('button', {name: 'Focus on this'}).click();
  // Close the panel so the structure is framed against the full viewport.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const file = path.join(out, `${prefix}-${name}.png`);
  // Crop to the centre, where the isolated structure is framed.
  await page.screenshot({path: file, clip: {x: 330, y: 90, width: 880, height: 600}});
  console.log('screenshot', path.relative(process.cwd(), file));
  // Back to the full body for the next target.
  await page.getByRole('button', {name: 'Reset the view and layers'}).click();
  await page.waitForTimeout(600);
}

// Torso muscles in context: front view, zoomed towards the chest.
if (!only?.length || only.includes('torso')) {
  await page.getByRole('button', {name: 'Front view'}).click();
  await page.waitForTimeout(600);
  await page.mouse.move(640, 260);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(50); }
  await page.waitForTimeout(1200);
  const file = path.join(out, `${prefix}-torso.png`);
  // Crop to the centre, where the isolated structure is framed.
  await page.screenshot({path: file, clip: {x: 330, y: 90, width: 880, height: 600}});
  console.log('screenshot', path.relative(process.cwd(), file));
}

await browser.close();
console.log(errors.length ? `Console errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'Console errors: none');
process.exitCode = errors.length ? 1 : 0;
