// Compares two builds of the site on the same machine and the same emulated phone connection, run after run,
// using the same two marks in both: the first frame with aircraft on the map, and the first full drawing of the map.
import { chromium, devices } from 'playwright';
const SITES = { before: 'http://127.0.0.1:8081/', after: 'http://127.0.0.1:8082/' };
const RUNS = Number(process.argv[2] || 5);
const rows = [];
const browser = await chromium.launch();
async function once(name) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], bypassCSP: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: 12e6 / 8, uploadThroughput: 3e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(SITES[name], { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByName('oe-aircraft').length > 0, null, { timeout: 30000, polling: 50 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('maploading')?.hidden === true, null, { timeout: 30000, polling: 50 }).catch(() => {});
  const label = Date.now() - t0;
  const m = await page.evaluate(() => Object.fromEntries(['oe-aircraft', 'oe-map-idle'].map((k) => [k, Math.round(performance.getEntriesByName(k)[0]?.startTime || 0)])));
  rows.push({ site: name, aircraftOnMap: m['oe-aircraft'], mapFullyDrawn: m['oe-map-idle'], loadingNoteGone: label });
  await ctx.close();
}
for (let i = 0; i < RUNS; i++) { await once('before'); await once('after'); }
await browser.close();
console.table(rows);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const k of ['aircraftOnMap', 'mapFullyDrawn', 'loadingNoteGone']) {
  const b = med(rows.filter((r) => r.site === 'before').map((r) => r[k])), a = med(rows.filter((r) => r.site === 'after').map((r) => r[k]));
  console.log(`MEDIAN ${k}: before ${b} ms, after ${a} ms, saved ${b - a} ms`);
}
