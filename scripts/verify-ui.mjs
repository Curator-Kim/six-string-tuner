import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
 let audio, osc, gain, output;
 Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { writable: true, value: async () => {
  audio = new AudioContext(); await audio.resume();
  osc = audio.createOscillator(); gain = audio.createGain(); output = audio.createMediaStreamDestination();
  osc.frequency.value = 110; gain.gain.value = .2;
  osc.connect(gain); gain.connect(output); osc.start();
  window.testAudio = { set: (hz, level = .2) => { osc.frequency.value = hz; gain.gain.value = level; }, stream: output.stream };
  return output.stream;
 }});
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
// Serve the production build directly to avoid host-specific loopback proxy rules.
await page.route('http://127.0.0.1:5173/**', async route => {
 const pathname = new URL(route.request().url()).pathname;
 const file = pathname === '/' ? 'index.html' : pathname.slice(1);
 if (file.includes('..')) return route.abort();
 try {
  const body = await readFile(`dist/${file}`);
  const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
  await route.fulfill({ body, contentType });
 } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
});
await mkdir('.tools/screenshots', { recursive: true });
try {
 await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
 await page.locator('.peg').first().waitFor();
 assert.equal(await page.locator('.peg').count(), 6);
 assert.ok(await page.locator('#guitar-art').evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let pixels = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) pixels++;
  return pixels > 80000;
 }));
 await page.screenshot({ path: '.tools/screenshots/desktop.png', fullPage: true });
 for (const width of [320, 390, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  assert.ok(await page.locator('.headstock').evaluate(el => {
   const parent = el.getBoundingClientRect();
   return [...el.querySelectorAll('.peg')].every(peg => { const rect = peg.getBoundingClientRect(); return rect.left >= parent.left - 1 && rect.right <= parent.right + 1; });
  }), `clipped pegs at ${width}`);
 }
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: '.tools/screenshots/mobile.png', fullPage: true });
 await page.locator('[data-string="2"]').click();
 assert.equal(await page.locator('#manual').getAttribute('aria-pressed'), 'true');
 assert.equal(await page.locator('#note').textContent(), 'B');
 await page.locator('#settings').click(); await page.locator('#reference').fill('432'); await page.locator('#save-settings').click();
 assert.match(await page.locator('#reference-label').textContent(), /432/);
 await page.reload(); assert.match(await page.locator('#reference-label').textContent(), /432/);
 await page.locator('#settings').click(); await page.locator('#reference').fill('440'); await page.locator('#save-settings').click();
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.locator('#mic').click();
 await page.waitForFunction(() => document.querySelector('.tuning-display').dataset.state === 'accurate');
 assert.match(await page.locator('#string-name').textContent(), /第 5 弦/);
 for (const [frequency, state] of [[110 * 2 ** (-30 / 1200), 'low'], [110 * 2 ** (30 / 1200), 'high'], [329.6276, 'accurate']]) {
  await page.evaluate(hz => window.testAudio.set(hz), frequency);
  await page.waitForFunction(expected => document.querySelector('.tuning-display').dataset.state === expected, state);
 }
 assert.match(await page.locator('#string-name').textContent(), /第 1 弦/);
 await page.locator('[data-string="6"]').click();
 await page.waitForFunction(() => document.querySelector('.tuning-display').dataset.state === 'high');
 assert.match(await page.locator('#string-name').textContent(), /第 6 弦/);
 await page.evaluate(() => window.testAudio.set(82.4069));
 await page.waitForFunction(() => document.querySelector('.tuning-display').dataset.state === 'accurate');
 await page.screenshot({ path: '.tools/screenshots/tuned.png', fullPage: true });
 await page.locator('[data-tone="5"]').click();
 assert.ok(await page.locator('[data-tone="5"]').evaluate(el => el.classList.contains('playing')));
 await page.waitForFunction(() => document.querySelector('.tuning-display').dataset.state === 'waiting');
 await page.evaluate(() => window.testAudio.set(82.4069, 0));
 await page.waitForFunction(() => document.querySelector('#signal-label').textContent === '输入信号');
 assert.equal(await page.locator('#pitch-status').textContent(), '等待拨弦');
 await page.locator('#mic').click();
 assert.ok(await page.evaluate(() => window.testAudio.stream.getTracks().every(track => track.readyState === 'ended')));
 await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
 await page.locator('#mic').click();
 await page.waitForFunction(() => document.querySelector('#message').textContent.includes('权限被拒绝'));
 assert.equal(await page.locator('#mic').isDisabled(), false);
 assert.deepEqual(errors, []);
 console.log('UI verification passed: responsive layout, canvas, string selection, settings, automatic/manual pitch, reference tone, silence, microphone release and permission errors.');
} catch (error) {
 console.error('Browser URL:', page.url(), 'Errors:', errors);
 await page.screenshot({ path: '.tools/screenshots/failure.png', fullPage: true }).catch(() => {});
 throw error;
} finally { await browser.close(); }
