import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const packageName = 'com.curatorkim.sixstringtuner';
const sdk = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const adb = join(sdk, 'platform-tools', 'adb.exe');
const command = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', timeout: 20000 });
await mkdir('.tools/screenshots', { recursive: true });
command('shell', 'am', 'force-stop', packageName);
command('shell', 'pm', 'revoke', packageName, 'android.permission.RECORD_AUDIO');
command('shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`);
const pid = command('shell', 'pidof', packageName).trim();
command('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20000);
const screenshot = name => {
 command('shell', 'screencap', '-p', '/sdcard/sixstring.png');
 command('pull', '/sdcard/sixstring.png', `.tools/screenshots/${name}.png`);
};
try {
 await page.locator('.peg').first().waitFor();
 assert.equal(await page.locator('.peg').count(), 6);
 assert.ok(await page.evaluate(() => document.documentElement.classList.contains('native-app')));
 assert.equal(new URL(page.url()).hostname, 'localhost');
 screenshot('android-device');
 await page.locator('[data-string="2"]').click();
 assert.equal(await page.locator('#manual').getAttribute('aria-pressed'), 'true');
 await page.locator('#mic').click();
 command('shell', 'uiautomator', 'dump', '/sdcard/sixstring-ui.xml');
 const ui = command('shell', 'cat', '/sdcard/sixstring-ui.xml');
 const bounds = await page.evaluate(xml => {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return [...document.querySelectorAll('node')].find(node => node.getAttribute('resource-id') === 'com.android.permissioncontroller:id/permission_allow_foreground_only_button')?.getAttribute('bounds');
 }, ui);
 assert.ok(bounds, 'Android microphone permission dialog');
 screenshot('android-permission');
 const [x1, y1, x2, y2] = bounds.match(/\d+/g).map(Number);
 command('shell', 'input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
 await page.waitForFunction(() => document.querySelector('#message').textContent === '麦克风已开启');
 screenshot('android-listening');
 await page.locator('#mic').click();
 assert.equal(await page.locator('#message').textContent(), '麦克风已关闭');
 await page.locator('#auto').click();
 await page.evaluate(() => {
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
   const context = new AudioContext(); await context.resume();
   const osc = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
   osc.frequency.value = 110; gain.gain.value = .2; osc.connect(gain); gain.connect(output); osc.start();
   window.testAudio = { set: hz => { osc.frequency.value = hz; }, stream: output.stream }; return output.stream;
  }});
 });
 await page.locator('#mic').click();
 await page.waitForFunction(() => document.querySelector('.tuning-display').dataset.state === 'accurate');
 assert.match(await page.locator('#string-name').textContent(), /第 5 弦/);
 for (const [frequency, state] of [[108, 'low'], [112, 'high'], [329.6276, 'accurate']]) {
  await page.evaluate(hz => window.testAudio.set(hz), frequency);
  await page.waitForFunction(value => document.querySelector('.tuning-display').dataset.state === value, state);
 }
 assert.match(await page.locator('#string-name').textContent(), /第 1 弦/);
 await page.waitForTimeout(200);
 screenshot('android-tuned');
 await page.locator('#mic').click();
 assert.ok(await page.evaluate(() => window.testAudio.stream.getTracks().every(track => track.readyState === 'ended')));
 command('shell', 'svc', 'wifi', 'disable'); command('shell', 'svc', 'data', 'disable');
 await page.reload(); await page.locator('.peg').first().waitFor();
 assert.equal(await page.locator('.peg').count(), 6);
 console.log('Android verification passed: installed app, offline startup, native layout, microphone permission/capture, automatic pitch and resource release.');
} finally { await browser.close(); command('forward', '--remove', 'tcp:9223'); }
