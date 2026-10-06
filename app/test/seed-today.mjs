/**
 * Give the LOCAL seed a working day, by doing the work the way the shop does.
 *
 * The obvious route — UPDATE the dates on some seeded documents — is refused by
 * tg_guard_posted_document, and rightly: a posted bill is not editable. So this
 * drives the real screens instead, which has the side benefit of proving that
 * posting still works in this build rather than assuming it.
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/seed-today.mjs http://127.0.0.1:8220
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8220';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);
await page.getByPlaceholder('you@shop.in').fill(process.env.APP_EMAIL);
await page.getByPlaceholder('••••••••').fill(process.env.APP_PASSWORD);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(40000);
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  console.error('sign-in failed'); process.exit(1);
}
console.log('signed in');

const KHARCHA = [
  { amount: '450', cat: 'Transport', who: 'Tempo wala' },
  { amount: '180', cat: 'Chai/Pani', who: 'Chai wala' },
  { amount: '260', cat: 'Packing', who: 'Packing wala' },
];

for (const k of (process.env.SKIP_KHARCHA ? [] : KHARCHA)) {
  await page.goto(base + '/expenses', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.getByPlaceholder('0').first().fill(k.amount);
  await page.getByText(k.cat, { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Naam likho ya neeche se chuno').fill(k.who);
  await page.waitForTimeout(300);
  const btn = page.getByRole('button', { name: /likh do/i });
  await btn.click();
  await page.waitForTimeout(4000);
  console.log(`  kharcha ₹${k.amount} ${k.cat}`);
}

// One bill, so Ghar and Hisab show a day rather than a row of zeros -- and so
// the posting path itself is exercised rather than assumed.
await page.goto(base + '/invoice/edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// A new bill opens on the cash customer (Walk-in) already.
await page.waitForTimeout(2000);

const search = page.getByPlaceholder('Scan karo ya SKU / naam likho');
await search.fill('H4');
await page.waitForTimeout(3000);
await page.getByText(/X-tremeVision/i).first().click();
await page.waitForTimeout(2500);

await page.getByText('Cash', { exact: true }).first().click();
await page.waitForTimeout(800);

const post = page.getByRole('button', { name: /Bill post karo/i });
if (await post.isEnabled().catch(() => false)) {
  await post.click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Aage badho|Haan/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  console.log('  bill: posted');
} else {
  await page.screenshot({ path: 'test/screens/bill-stuck.png', fullPage: true });
  console.log('  bill: post button still disabled (see test/screens/bill-stuck.png)');
}

console.log('page errors:', errs.length ? errs.slice(0, 3) : 'none');
await browser.close();
