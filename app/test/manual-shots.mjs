/**
 * Screens for the user manual, from the LOCAL stack.
 *
 * Deliberately not production: a manual is a document that gets forwarded, and
 * the real shop's customers, rates and balances have no business being in it.
 * The seeded catalogue looks like the real one without being anybody's.
 *
 *   APP_EMAIL=owner@autoloom.local APP_PASSWORD=autoloom123 \
 *     node test/manual-shots.mjs http://127.0.0.1:8220
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8220';
const PROD = process.env.PROD_ID;
const VAR = process.env.VAR_ID;
const CUST = process.env.CUST_ID;
const INV = process.env.INV_ID;

const out = 'test/screens/manual';
fs.mkdirSync(out, { recursive: true });

const SHOTS = [
  ['ghar', '/'],
  ['stock', '/stock'],
  ['maal-aaya', '/stock/add'],
  ['maal-gaya', '/invoice/edit'],
  ['parchi', '/parchi'],
  ['hisab', '/hisab'],
  ['kharcha', '/expenses'],
  ['kharab-maal', '/kharab-maal'],
  ['stock-check', '/stock-check'],
  ['warehouse', '/warehouse'],
  ['grahak-list', '/customers'],
  ['supplier-list', '/suppliers'],
  ['dhoondo', '/search'],
  ['yaad-dilao', '/reminders'],
  ['aur', '/more'],
  ['madad', '/help'],
  ['admin', '/admin'],
  ['staff', '/admin/users'],
  ['naya-item', '/admin/item'],
  ['partner-kharcha', '/partner-kharcha'],
  ['kya-mangwana', '/reorder'],
  PROD && VAR ? ['item-page', `/product/${PROD}?variant=${VAR}`] : null,
  CUST ? ['grahak-khata', `/customer/${CUST}`] : null,
  INV ? ['bill', `/invoice/${INV}`] : null,
].filter(Boolean);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/00-login.png` });
await page.getByPlaceholder('you@shop.in').fill(process.env.APP_EMAIL);
await page.getByPlaceholder('••••••••').fill(process.env.APP_PASSWORD);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(40000);
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  console.error('sign-in failed'); process.exit(1);
}
console.log('  signed in');

let n = 1;
for (const [name, path] of SHOTS) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6500);
  const file = `${out}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path} → ${file}`);
  n += 1;
}

// A bill half-written, because an empty form teaches nobody anything: the
// manual needs to show what a line looks like once the maal is on it.
await page.goto(base + '/invoice/edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.getByText('Chuno…').first().click();
await page.waitForTimeout(1500);
await page.getByText('Walk-in Customer', { exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
await page.waitForTimeout(2500);
await page.getByText(/X-tremeVision/i).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-bill-bharte-hue.png`, fullPage: true });
console.log(`  bill mid-flow → ${out}/${String(n).padStart(2, '0')}-bill-bharte-hue.png`);
n += 1;

// The "+" open, because it is the single most-used control in the app and a
// manual that only shows the tab bar never shows where the work starts.
await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.getByRole('button', { name: 'Nayi entry' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-plus-sheet.png` });
console.log(`  "+" sheet → ${out}/${String(n).padStart(2, '0')}-plus-sheet.png`);

console.log('page errors:', errs.length ? errs.slice(0, 5) : 'none');
await browser.close();
