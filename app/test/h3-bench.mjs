/**
 * How much does HTTP/3 actually save a returning visitor?
 *
 *   node test/h3-bench.mjs app.theautoloom.in
 *
 * Each iteration uses a fresh browser profile, visits twice, and records the
 * second visit — the first is spent learning Alt-Svc, so it is h2 either way
 * and tells us nothing. One run with QUIC allowed, one with it disabled, so
 * the comparison is the same browser on the same path minutes apart rather
 * than a number from before an upgrade against a number from after.
 */
import { chromium } from 'playwright';

const host = process.argv[2] ?? 'app.theautoloom.in';
const N = Number(process.argv[3] ?? 5);

async function measure(quic) {
  const browser = await chromium.launch({ args: quic ? ['--enable-quic'] : ['--disable-quic'] });
  const out = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(800);
      await page.goto(`https://${host}/?x=${i}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const r = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return { proto: n?.nextHopProtocol ?? '?', ttfb: Math.round(n?.responseStart ?? 0) };
      });
      out.push(r);
    } catch {
      /* a timeout on this path is noise, not a result */
    }
    await ctx.close();
  }
  await browser.close();
  return out;
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);

for (const [label, quic] of [['QUIC allowed  ', true], ['QUIC disabled ', false]]) {
  const rows = await measure(quic);
  const ttfbs = rows.map((r) => r.ttfb);
  const protos = [...new Set(rows.map((r) => r.proto))].join('/');
  console.log(`  ${label} n=${rows.length}  proto=${protos.padEnd(6)}  ttfb ${ttfbs.join(', ')}  median ${median(ttfbs)}ms`);
}
