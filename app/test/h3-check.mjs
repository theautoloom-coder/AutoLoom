/**
 * Is HTTP/3 actually being used, or only advertised?
 *
 *   node test/h3-check.mjs app.theautoloom.in admissionhands.com
 *
 * curl here has no HTTP/3 support, and "Alt-Svc is in the header" proves
 * nothing — that header was being sent the whole time the firewall was
 * dropping the UDP packets. A real browser is the only honest test: it reports
 * the protocol it actually negotiated in nextHopProtocol.
 *
 * The first visit is expected to be h2: that is when the browser learns the
 * Alt-Svc. The second is the one that matters.
 */
import { chromium } from 'playwright';

const hosts = process.argv.slice(2);
if (!hosts.length) {
  console.error('usage: node test/h3-check.mjs <host> [host…]');
  process.exit(2);
}

const browser = await chromium.launch({ args: ['--enable-quic'] });

for (const host of hosts) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const seen = [];
  for (let visit = 1; visit <= 3; visit++) {
    try {
      await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const info = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return { proto: n?.nextHopProtocol ?? '?', ttfb: Math.round(n?.responseStart ?? 0) };
      });
      seen.push(`${info.proto} (${info.ttfb}ms)`);
    } catch (e) {
      seen.push(`failed: ${String(e).slice(0, 40)}`);
    }
    await page.waitForTimeout(1200);
  }
  const got3 = seen.some((s) => s.startsWith('h3'));
  console.log(`  ${host.padEnd(26)} ${seen.join('  →  ')}   ${got3 ? '✓ HTTP/3 in use' : '✗ still TCP only'}`);
  await ctx.close();
}

await browser.close();
