/**
 * Does "Maal aaya" actually put stock on the shelf?
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/stock-add.mjs http://127.0.0.1:8207 LED-AFY-H4-60W 4
 *
 * Unlike the flow walk, this one writes: it drives the screen exactly as a
 * shopkeeper would — search, set the count, press once — and then prints what
 * the app itself believes the new quantity is. The caller checks the server.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8207';
const sku = process.argv[3] ?? 'LED-AFY-H4-60W';
const addQty = Number(process.argv[4] ?? 4);
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) {
  console.error('APP_EMAIL and APP_PASSWORD must be set');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 880 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const fail = async (why) => {
  console.error(`FAIL  ${why}`);
  await page.screenshot({ path: 'test/screens/stock-add-fail.png' }).catch(() => {});
  await browser.close();
  process.exit(1);
};

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Let the app finish booting before typing: fill it while React is still
// hydrating and the value is wiped by the next render, which looks exactly
// like a wrong password.
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000); // first full sync
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) await fail('sign-in did not go through');
console.log('▸ signed in');

await page.goto(`${base}/stock/add`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
if (!(await page.getByText('Maal aaya').first().isVisible())) await fail('screen did not render');

// Search the way the counter does, then take the first hit.
const search = page.getByPlaceholder(/Scan barcode/i);
await search.fill(sku);
await page.waitForTimeout(1500);
const hit = page.getByText(sku, { exact: false }).first();
if (!(await hit.isVisible())) await fail(`no search hit for ${sku}`);
await hit.click();
await page.waitForTimeout(800);
console.log(`▸ picked ${sku}`);

// The line shows "abhi N → N+1"; bump it to the quantity we want.
const plus = page.getByText('+', { exact: true }).first();
for (let i = 1; i < addQty; i++) {
  await plus.click();
  await page.waitForTimeout(150);
}

const before = await page.getByText(/abhi \d+/).first().textContent();
console.log(`▸ line says: ${before?.trim()}`);

const post = page.getByText(new RegExp(`${addQty} pcs chadha do`));
if (!(await post.isVisible())) await fail(`the post button did not show ${addQty} pcs`);
await post.click();
await page.waitForTimeout(4000);
console.log('▸ posted');

// Back on the item's own page, read what the app now believes.
await page.goto(`${base}/stock`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder(/SKU, barcode ya naam/i).fill(sku);
await page.waitForTimeout(1800);
const row = await page.getByText(sku, { exact: false }).first().textContent().catch(() => null);
console.log(`▸ stock screen shows: ${row?.trim() ?? '(nothing)'}`);

const real = errors.filter((e) => !/favicon|manifest|sourcemap/i.test(e));
if (real.length) {
  console.error('console errors:');
  real.slice(0, 5).forEach((e) => console.error('  ' + e));
}
await page.screenshot({ path: 'test/screens/stock-add-done.png' });
await browser.close();
console.log(real.length ? 'DONE with console errors' : 'DONE clean');
