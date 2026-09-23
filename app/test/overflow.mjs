/**
 * Which elements are wider than the phone screen?
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/overflow.mjs http://127.0.0.1:8208 / /stock
 *
 * A screenshot shows that something is cut off; it does not say which node did
 * it. This walks the tree and reports the outermost offenders, so the fix goes
 * on the container that is actually too wide rather than the first child that
 * looked guilty.
 */
import { chromium } from 'playwright';

const [, , base = 'http://127.0.0.1:8208', ...paths] = process.argv;
const W = 412;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 900 } });

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(process.env.APP_EMAIL);
await page.getByPlaceholder('••••••••').fill(process.env.APP_PASSWORD);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000);

for (const p of paths.length ? paths : ['/']) {
  await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(6000);
  const bad = await page.evaluate((W) => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) continue;
      // Report only the outermost offender in each branch.
      if (el.parentElement && el.parentElement.getBoundingClientRect().right > W + 1) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40),
        right: Math.round(r.right),
        width: Math.round(r.width),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 55),
      });
    }
    return out;
  }, W);

  console.log(`\n${p} — viewport ${W}px`);
  if (!bad.length) console.log('  nothing overflows');
  bad.slice(0, 12).forEach((b) => console.log(`  right=${b.right} w=${b.width}  <${b.tag}> "${b.text}"`));
}
await browser.close();
