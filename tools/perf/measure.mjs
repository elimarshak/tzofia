// Measures how long openeye.co.il takes to open on a phone over a mobile network, from an empty cache.
// Prints, for each run: when the page first shows something, when the map finishes drawing,
// when the first aircraft data arrives, and how much was downloaded, plus the biggest files.
import { chromium, devices } from 'playwright';
const URL = process.argv[2] || 'https://openeye.co.il/';
const RUNS = Number(process.argv[3] || 3);
const results = [];
for (let i = 0; i < RUNS; i++) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // a typical Israeli 4G connection, and a mid-range phone (4x slower than the runner's processor)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: 12e6 / 8, uploadThroughput: 3e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const files = [];
  page.on('response', async (r) => {
    const req = r.request();
    let size = 0; try { const s = await req.sizes(); size = s.responseBodySize + s.responseHeadersSize; } catch {}
    files.push({ url: r.url(), t: Date.now(), size });
  });
  const t0 = Date.now();
  let firstAc = null;
  page.on('requestfinished', (q) => { if (!firstAc && q.url().includes('/aircraft_live?')) firstAc = Date.now() - t0; });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const dcl = Date.now() - t0;
  await page.waitForFunction(() => document.getElementById('maploading')?.hidden === true, null, { timeout: 60000, polling: 100 }).catch(() => {});
  const mapDone = Date.now() - t0;
  await page.waitForTimeout(4000);
  if (i === 0) await page.screenshot({ path: 'perf-shot.png' });
  const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0));
  const total = files.reduce((a, f) => a + f.size, 0);
  const until = files.filter((f) => f.t - t0 <= mapDone).reduce((a, f) => a + f.size, 0);
  results.push({ run: i + 1, fcp, dcl, firstAircraftData: firstAc, mapDrawn: mapDone, kbUntilMap: Math.round(until / 1024), kbTotal: Math.round(total / 1024), requests: files.length });
  if (i === 0) {
    const big = files.slice().sort((a, b) => b.size - a.size).slice(0, 20).map((f) => `${Math.round(f.size / 1024)} KB  at ${f.t - t0} ms  ${f.url.slice(0, 110)}`);
    console.log('Biggest files on the first run:\n' + big.join('\n'));
    const order = files.filter((f) => f.t - t0 <= mapDone).map((f) => `${f.t - t0} ms  ${Math.round(f.size / 1024)} KB  ${f.url.slice(0, 110)}`);
    console.log('\nEverything that arrived before the map finished drawing:\n' + order.join('\n'));
  }
  await browser.close();
}
console.log('\nRESULTS (milliseconds from opening the address)');
console.table(results);
