/**
 * Browser smoke test against the running web dev server + local Supabase +
 * local PowerSync. Run:  node test/smoke.mjs [baseUrl] [outDir]
 *
 * Signs in, waits for the first sync, walks the main workflows and saves a
 * screenshot per step. Exits non-zero on a page error or a failed step.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:8081';
const out = process.argv[3] ?? path.resolve('test/screens');
fs.mkdirSync(out, { recursive: true });

const errors = [];
const logs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('dialog', async (d) => { logs.push(`dialog(${d.type()}): ${d.message()}`); console.log(`  dialog: ${d.message().slice(0, 160)}`); await d.accept(); });
page.on('response', async (r) => {
  if (r.status() >= 400) {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch {}
    errors.push(`http ${r.status()} ${r.url()} ${body}`);
  }
});
page.on('requestfailed', (r) => logs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('console', (m) => {
  const t = m.text();
  logs.push(`${m.type()}: ${t}`);
  if (m.type() === 'error' && !/favicon|Download the React DevTools|ExperimentalWarning/.test(t)) errors.push(`console: ${t}`);
});

let step = 0;
async function shot(name) {
  step++;
  await page.screenshot({ path: path.join(out, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
  console.log(`✓ ${step} ${name}`);
}
async function fail(msg) {
  await shot('FAILED');
  console.error('✗', msg);
  console.error('--- errors ---\n' + errors.join('\n'));
  console.error('--- last logs ---\n' + logs.slice(-40).join('\n'));
  await browser.close();
  process.exit(1);
}
/** confirm()/notify() on web are an in-app dialog (see ui/toast.tsx), not a
 * native browser dialog — accept the "Continue" button it renders. */
async function acceptConfirm() {
  const btn = page.getByRole('button', { name: 'Continue' }).filter({ visible: true }).first();
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
}

await page.addInitScript(() => {
  window.__opened = [];
  const orig = window.open.bind(window);
  window.open = (u, ...rest) => { window.__opened.push(String(u)); return orig(u, ...rest); };
});

try {
  await page.goto(base, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  await shot('sign-in');

  const email = page.getByPlaceholder('you@shop.in');
  if (!(await email.count())) await fail('sign-in form did not render');
  await email.fill('admin@autoloom.local');
  await page.getByPlaceholder('••••••••').fill('autoloom123');
  await page.getByRole('button', { name: 'Kholo' }).click();

  // Dashboard renders once profile + permissions have synced.
  await page.getByText('Stock by location', { exact: false }).waitFor({ timeout: 60000 }).catch(() => {});
  // wait until the low-stock list is populated (proves the catalogue synced)
  const synced = await page.getByText('HB4 60W Pair', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
  await shot('dashboard');
  if (!synced) await fail('first sync did not deliver the catalogue within 90s');

  // Universal search
  await page.getByRole('link', { name: 'Search' }).or(page.getByText('Search', { exact: true })).filter({ visible: true }).first().click();
  const box = page.getByPlaceholder(/H4 LED/);
  await box.waitFor({ timeout: 15000 });
  await box.fill('creta 2024');
  await page.waitForTimeout(1200);
  await shot('search-creta-2024');
  const vehicleHit = page.getByText('Hyundai Creta', { exact: false }).filter({ visible: true }).first();
  if (!(await vehicleHit.count())) await fail('vehicle search returned no Creta');
  await vehicleHit.click();
  await page.getByText('Fits this model', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await shot('vehicle-creta');
  if (!(await page.getByText('Elegant 7D Luxury Car Mat', { exact: false }).count())) await fail('Creta page missing the 7D mat fitment');

  // Product detail via the mat
  await page.getByText('Elegant 7D Luxury Car Mat', { exact: false }).filter({ visible: true }).first().click();
  await page.getByText('Stock by location', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await shot('product-mat');

  // Search by socket alias: 9005 should find the HB3 variant
  await page.goto(`${base}/search`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await box.waitFor({ timeout: 15000 });
  await box.fill('9005');
  await page.waitForTimeout(2000);
  if (!(await page.getByText('HB3 60W', { exact: false }).count())) await fail('alias search 9005 did not find HB3');
  await shot('search-9005');

  // Customer page
  await box.fill('xyz');
  await page.waitForTimeout(2500);
  await page.getByText('9811001100', { exact: false }).filter({ visible: true }).first().click();
  await page.getByText('Khata baaki', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await shot('customer-xyz');

  // New invoice for this customer: add an item, post as cash
  await page.getByRole('button', { name: 'New bill' }).filter({ visible: true }).first().click();
  await page.getByText('Naya bill', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const picker = page.getByPlaceholder(/Scan barcode/).filter({ visible: true }).first();
  await picker.fill('LED-AFY-H4-60W');
  await page.waitForTimeout(1000);
  await page.getByText('H4 60W Pair', { exact: false }).filter({ visible: true }).first().click();
  await page.waitForTimeout(800);
  await shot('invoice-draft');
  if (!(await page.getByText('Special price for this customer', { exact: false }).count()) && !(await page.getByText('customer price', { exact: false }).count())) {
    console.warn('! negotiated price badge not visible (non-fatal)');
  }
  await page.getByRole('button', { name: 'Bill post karo' }).filter({ visible: true }).first().click();
  await acceptConfirm();
  await page.waitForTimeout(3500);
  const posted = await page.getByText(/NOI\/A\/26-27\/\d{4}/).filter({ visible: true }).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  await shot('invoice-posted');
  if (!posted) await fail('invoice did not post / number not shown');

  // Mark this udhaar bill as paid (online), with remarks; accept the WhatsApp offer and capture the wa.me link
  const popups = [];
  page.context().on('page', async (pg) => { try { await pg.waitForURL(/wa\.me|whatsapp/, { timeout: 8000 }); } catch {} popups.push(pg.url()); });
  await page.getByRole('button', { name: 'Mark paid' }).filter({ visible: true }).first().click();
  await page.getByText('Payment received', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByText('Online / UPI', { exact: true }).filter({ visible: true }).first().click();
  await page.getByPlaceholder(/Rakesh ji ke HDFC/).filter({ visible: true }).first().fill('Rakesh ji ke HDFC me');
  await shot('mark-paid');
  await page.getByRole('button', { name: 'Mark as paid' }).filter({ visible: true }).first().click();
  await acceptConfirm(); // "Mark payment received?"
  await page.waitForTimeout(2000);
  await acceptConfirm(); // "Send payment received WhatsApp?"
  await page.waitForTimeout(5000);
  await page.getByText('Khata baaki', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await shot('customer-after-payment');
  const opened = await page.evaluate(() => window.__opened ?? []);
  const wa = [...popups, ...opened].find((u) => /wa\.me/.test(u)) ?? '';
  console.log('  whatsapp link:', decodeURIComponent(wa).slice(0, 220).replace(/\n/g, ' | '));
  if (!/wa\.me\/919811001100/.test(wa)) await fail('payment-received WhatsApp link was not opened for the customer number');
  if (!/mil gayi/.test(decodeURIComponent(wa))) await fail('WhatsApp message is not the Hinglish paid template');

  // Reminders screen: today's slips + pending list with UPI link
  await page.goto(`${base}/reminders`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await shot('reminders');
  await page.getByRole('button', { name: 'Remind' }).filter({ visible: true }).first().click();
  await page.waitForTimeout(5000);
  const opened2 = await page.evaluate(() => window.__opened ?? []);
  const rem = [...popups, ...opened2].filter((u) => /wa\.me/.test(u)).pop() ?? '';
  const remText = decodeURIComponent(rem);
  console.log('  reminder link:', remText.slice(0, 220).replace(/\n/g, ' | '));
  if (!/upi:\/\/pay\?pa=autoloom%40upi|pa=autoloom@upi/.test(rem) && !/autoloom@upi/.test(remText)) await fail('reminder message has no UPI pay link');

  // Back to the bill: stock decreased? Open the product and check the ledger
  await page.goto(`${base}/sell`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.getByText(/NOI\/A\/26-27\/\d{4}/).filter({ visible: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('H4 60W Pair', { exact: false }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Movement history' }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Movement history' }).filter({ visible: true }).first().click();
  await page.getByText('Sale NOI/A', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await shot('stock-ledger');

  // Workshop: job card for XYZ → add a part and labour → close → invoice
  await page.goto(`${base}/customers`, { waitUntil: 'load' });
  await page.getByText('XYZ Accessories', { exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Job card' }).filter({ visible: true }).first().click();
  await page.getByText('Customer & vehicle', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder(/Scan barcode/).filter({ visible: true }).first().fill('HORN-RTS-WIND');
  await page.waitForTimeout(1000);
  await page.getByText('Windtone Twin', { exact: false }).filter({ visible: true }).first().click();
  await page.getByPlaceholder('Headlight fitting').filter({ visible: true }).first().fill('Horn fitting');
  await page.getByPlaceholder('Horn labour amount').filter({ visible: true }).first().fill('400');
  await page.getByRole('button', { name: 'Add', exact: true }).filter({ visible: true }).last().click();
  await page.waitForTimeout(800);
  await shot('job-card');
  await page.getByRole('button', { name: /Close job card/ }).filter({ visible: true }).first().click();
  await acceptConfirm();
  await page.waitForTimeout(3500);
  const jobPosted = await page.getByText(/Job card JOB\/26-27\/\d{4}/).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  await shot('job-card-invoice');
  if (!jobPosted) await fail('job card did not close into an invoice');

  // Reports
  await page.goto(`${base}/reports`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await shot('reports');

  // Admin product wizard opens
  await page.goto(`${base}/admin/product/new`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await shot('wizard');

  // Sync status: no pending uploads left
  await page.goto(`${base}/sync`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  await shot('sync');
  const pending = await page.getByText('Pending local changes').locator('..').textContent().catch(() => '');
  console.log('sync row:', pending?.trim());

  if (errors.length) await fail(`${errors.length} page/console errors`);
  console.log('ALL STEPS PASSED');
} catch (e) {
  await fail(e.message);
}
await browser.close();
