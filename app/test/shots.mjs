/**
 * Phone-width screenshots of whichever screens I am working on.
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/shots.mjs http://127.0.0.1:8208 /stock /stock/add
 *
 * The desktop flow walk proves a screen renders; it says nothing about whether
 * it is usable at 412dp, which is the only width that matters here.
 */
import { chromium } from 'playwright';

const [, , base = 'http://127.0.0.1:8208', ...paths] = process.argv;
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) {
  console.error('APP_EMAIL and APP_PASSWORD must be set');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 412), height: 900 }, deviceScaleFactor: 2 });

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.screenshot({ path: 'test/screens/phone-sign-in.png' });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000);
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  console.error('sign-in failed');
  process.exit(1);
}

for (const p of paths.length ? paths : ['/', '/stock', '/stock/add', '/admin/item']) {
  await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(6000);
  const name = 'phone' + (process.env.WIDTH ?? '') + p.replace(/[^a-z0-9]+/gi, '-');
  await page.screenshot({ path: `test/screens/${name}.png`, fullPage: true });
  console.log(`  ${p} → test/screens/${name}.png`);
}
await browser.close();
