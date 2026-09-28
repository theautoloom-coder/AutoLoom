/**
 * Does Maal Aaya move the stock AND fix the cost?
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/maal-aaya.mjs http://127.0.0.1:8208 <sku> <qty> <rate>
 *
 * The old receiving screen posted a "found" adjustment, which moved stock and
 * left avg_cost alone — so a new item kept a cost of zero and every sale of it
 * looked like pure profit. That is the bug this screen exists to fix, so the
 * test checks the cost, not just the count. The caller checks the database.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8208';
const sku = process.argv[3] ?? 'LED-AFY-H4-60W';
const qty = process.argv[4] ?? '5';
const rate = process.argv[5] ?? '1500';
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) {
  console.error('APP_EMAIL and APP_PASSWORD must be set');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
let failed = false;
const step = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const shot = async (n) => page.screenshot({ path: `test/screens/maal-aaya-${n}.png` }).catch(() => {});

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000);
step(!(await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)), 'signed in');

await page.goto(`${base}/stock/add`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(4000);
step(await page.getByText('Maal Aaya').first().isVisible(), 'screen renders');

// Supplier. The picker opens a sheet with a filter box at the top, so type
// into that and take the row it leaves — clicking blind hits the filter.
await page.getByText('Kisse aaya?').click();
await page.waitForTimeout(900);
const filter = page.getByPlaceholder('Type to filter');
await filter.waitFor({ state: 'visible', timeout: 10000 });
await filter.fill('Bright');
await page.waitForTimeout(900);
await page.getByText('Bright Auto Imports').last().click();
await page.waitForTimeout(900);
step(!(await filter.isVisible().catch(() => false)), 'supplier chosen');
await shot('1-supplier');

// The maal.
const search = page.getByPlaceholder(/Scan karo ya SKU/i);
await search.fill(sku);
await page.waitForTimeout(1800);
const hit = page.getByText(sku, { exact: false }).first();
step(await hit.isVisible().catch(() => false), `found ${sku}`);
await hit.click();
await page.waitForTimeout(900);

const inputs = page.locator('input');
const n = await inputs.count();
await inputs.nth(n - 3).fill(qty);   // Kitne aaye
await inputs.nth(n - 2).fill(rate);  // Kitne ka pada
await page.waitForTimeout(700);
await shot('2-line');

const post = page.getByText(new RegExp(`${qty} pcs chadha do`));
step(await post.isVisible().catch(() => false), `post button shows ${qty} pcs`);
if (await post.isVisible().catch(() => false)) {
  await post.click();
  await page.waitForTimeout(6000);
}
await shot('3-done');

const body = (await page.locator('body').innerText()).toLowerCase();
step(!/nahi chadha/.test(body), 'no failure message on screen');

await browser.close();
console.log(failed ? '\nSOMETHING FAILED' : '\nscreen flow ok — now check the database');
process.exit(failed ? 1 : 0);
