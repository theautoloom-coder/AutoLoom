/**
 * Screens for the user manual, from the LOCAL stack.
 *
 * Deliberately not production: a manual is a document that gets forwarded, and
 * the real shop's customers, rates and balances have no business being in it.
 * The seeded catalogue looks like the real one without being anybody's.
 *
 *   node test/manual-shots.mjs http://127.0.0.1:8222
 *
 * Signs in as the owner (the manual covers the owner's screens too). Files are
 * named after the screen, not numbered, so manual-content.json can refer to
 * them and a new screen does not renumber every other one.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8222';
if (!/127\.0\.0\.1|localhost/.test(base)) { console.error('✗ local stack only'); process.exit(2); }
const email = process.env.APP_EMAIL ?? 'owner@autoloom.local';
const password = process.env.APP_PASSWORD ?? 'autoloom123';

const sql = (q) =>
  execFileSync('docker', ['exec', 'supabase_db_Autogrid', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q],
    { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();

const out = 'test/screens/manual';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Real rows to point the detail screens at.
const prod = sql(`select p.id || '|' || pv.id from products p join product_variants pv on pv.product_id = p.id
                   where p.name ilike '%X-tremeVision%' limit 1`).split('|');
const cust = sql(`select customer_id from sales_invoices where status = 'posted' and doc_type = 'invoice'
                   group by customer_id order by count(*) desc limit 1`);
const inv = sql(`select id from sales_invoices where status = 'posted' and doc_type = 'invoice' and customer_id = '${cust}'
                  order by posted_at desc limit 1`);
const creta = sql(`select vm.id from vehicle_models vm join vehicle_makes mk on mk.id = vm.make_id
                    where mk.name = 'Hyundai' and vm.name = 'Creta' limit 1`);

// One item without a buy rate, so "Rate baaki" has something to show; put
// back exactly as it was at the end.
const unpriced = sql(`select pv.id || '|' || pv.avg_cost || '|' || pv.last_purchase_cost from product_variants pv
                       where exists (select 1 from stock_movements m where m.variant_id = pv.id)
                         and pv.id <> '${prod[1]}' order by pv.sku limit 1`).split('|');
sql(`update product_variants set avg_cost = 0, last_purchase_cost = 0 where id = '${unpriced[0]}'`);

// Suppliers the e2e runs made ("E2E Sup 04078") would fill the supplier list
// and name today's entries. For the shots they get a shop-like name and drop
// out of the list; the end puts back each one's own name and state.
const SHOP_NAMES = ['Sharma Auto Parts', 'Delhi Light House', 'Raj Accessories', 'Gupta Mats',
  'Noida Auto Store', 'Kapoor Traders', 'Singh Auto World', 'Jain Car Care'];
const e2eSuppliers = sql(`select id || '|' || is_active || '|' || name from suppliers where name ~* '^e2e'
                          order by created_at desc`).split('\n').filter(Boolean).map((l) => l.split('|'));
e2eSuppliers.forEach(([id], i) => sql(`update suppliers set is_active = false,
  name = '${SHOP_NAMES[i % SHOP_NAMES.length]}${i >= SHOP_NAMES.length ? ` ${i + 1}` : ''}' where id = '${id}'`));

const SHOTS = [
  ['ghar', '/'],
  ['stock-chadhao', '/stock/add'],
  ['kharcha', '/expenses'],
  ['stock', '/stock'],
  ['item', `/product/${prod[0]}?variant=${prod[1]}`],
  ['warehouse', '/warehouse'],
  ['ginti', '/stock-check'],
  ['kya-mangwana', '/reorder'],
  ['parchi', '/parchi'],
  ['bill', `/invoice/${inv}`],
  ['grahak-khata', `/customer/${cust}`],
  ['paisa-aaya', `/payment/edit?direction=in&party=${cust}`],
  ['yaad-dilao', '/reminders'],
  ['hisab', '/hisab'],
  ['gaadi', `/vehicle/${creta}`],
  ['admin', '/admin'],
  ['staff', '/admin/users'],
  ['naya-item', '/admin/item'],
  ['requests', '/requests'],
  ['partner-kharcha', '/partner-kharcha'],
  ['aur', '/more'],
  ['madad', '/help'],
  ['grahak-list', '/customers'],
  ['supplier-list', '/suppliers'],
  ['sync', '/sync'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/login.png` });
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(40000);
  if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
    throw new Error('sign-in failed');
  }
  console.log('  signed in');

  for (const [name, path] of SHOTS) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6500);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    console.log(`  ${path} → ${name}.png`);
  }

  // "Rate baaki" selected, for the owner's pricing page.
  await page.goto(base + '/stock', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.getByText(/Rate baaki \d+/).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/rate-baaki.png`, fullPage: true });
  console.log('  Rate baaki → rate-baaki.png');

  // A bill half-written: the manual has to show what a line looks like.
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
  await page.screenshot({ path: `${out}/bill-bharte-hue.png`, fullPage: true });
  console.log('  bill mid-flow → bill-bharte-hue.png');
  await page.getByRole('button', { name: 'Chhod do' }).click().catch(() => {});
  await page.getByRole('button', { name: /Aage badho/ }).click().catch(() => {});
  await page.waitForTimeout(1500);

  // Kharab Likho and a transfer with a line on them.
  for (const [name, path, button] of [['kharab', '/kharab-maal', null], ['transfer', '/transfer/edit', null]]) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
    await page.waitForTimeout(2500);
    await page.getByText(/X-tremeVision/i).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    console.log(`  ${path} with a line → ${name}.png`);
    void button;
  }

  // The "+" open: where every job starts.
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.getByRole('button', { name: 'Nayi entry' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/plus.png` });
  console.log('  "+" sheet → plus.png');
} finally {
  sql(`update product_variants set avg_cost = ${Number(unpriced[1]) || 0}, last_purchase_cost = ${Number(unpriced[2]) || 0}
        where id = '${unpriced[0]}'`);
  for (const [id, active, name] of e2eSuppliers) {
    sql(`update suppliers set is_active = ${active === 'true'}, name = '${name.replace(/'/g, "''")}' where id = '${id}'`);
  }
  console.log('page errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
}
