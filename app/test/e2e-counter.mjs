/**
 * The counter's day, as the counter hand — not the owner.
 *
 *   node test/e2e-counter.mjs http://127.0.0.1:8222
 *
 * Every other end-to-end test signs in as the owner, and the owner holds every
 * permission there is. That is how the worst bug this app has shipped stayed
 * invisible: a salesman's second bill of the day reused the first one's number,
 * the server threw it away, and the stock movement that had gone up ahead of it
 * stayed — a sale with no bill. Found on the shop's own phone, over USB.
 *
 * So this signs in as Counter Sales and does exactly that: a cash bill, then
 * an udhaar bill, back to back. Then it reads Postgres: both posted, different
 * numbers, and not one stock movement pointing at a bill that never posted.
 *
 * Local stack only. It writes real rows.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'http://127.0.0.1:8222';
const email = process.env.APP_EMAIL ?? 'sales@autoloom.local';
const password = process.env.APP_PASSWORD ?? 'autoloom123';
if (!/127\.0\.0\.1|localhost/.test(base)) { console.error('✗ local stack only'); process.exit(2); }

const sql = (q) =>
  execFileSync('docker', ['exec', 'supabase_db_Autogrid', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q],
    { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();
const num = (q) => Number(sql(q) || 0);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok, name, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const user = sql(`select id from auth.users where email = '${email}'`);
if (!user) { console.error(`✗ no local user ${email}`); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });

console.log(`\n▸ sign in as ${email}`);
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(40000);
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  console.error('✗ sign-in failed'); process.exit(1);
}
check('signed in', true);

const mine = `salesperson_id = '${user}' or created_by = '${user}'`;
const before = num(`select count(*) from sales_invoices where status = 'posted' and (${mine})`);

/**
 * Choose the payment mode and post, walking past any warning on the way (a
 * stock-short "phir bhi bechein?" comes before "Bill bana dein?" once a test
 * run has emptied the shelf). The final question names the mode; the chip is
 * pressed again if it does not say the one wanted.
 */
async function postBill(page, mode) {
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    await page.getByText(mode, { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Bill bana do/i }).click();
    for (let k = 0; k < 3; k++) {
      await page.waitForTimeout(1200);
      if (await page.getByText('Bill bana dein?').isVisible().catch(() => false)) break;
      const go = page.getByRole('button', { name: /Aage badho/ });
      if (await go.isVisible().catch(() => false)) await go.click();
    }
    if (await page.getByText(new RegExp(`· ${mode}\\.`)).first().isVisible().catch(() => false)) break;
    await page.getByRole('button', { name: /Rehne do/i }).first().click().catch(() => {});
  }
  await page.getByRole('button', { name: /Aage badho|Haan/i }).first().click().catch(() => {});
}

async function bill(mode) {
  await page.goto(base + '/invoice/edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6500);
  // A new bill opens on the cash customer; udhaar goes on a khata.
  if (mode === 'Udhaar') {
    await page.getByText('Walk-in Customer', { exact: true }).locator('visible=true').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Naam likh ke dhoondo').fill('XYZ');
    await page.waitForTimeout(900);
    await page.getByText('XYZ Accessories', { exact: true }).locator('visible=true').first().click();
  }
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
  await page.waitForTimeout(2800);
  await page.getByText(/X-tremeVision/i).first().click();
  await page.waitForTimeout(2500);
  await postBill(page, mode);
  await page.waitForTimeout(8000);
}

console.log('\n▸ cash bill, then udhaar bill');
await bill('Cash');
await bill('Udhaar');

// Poll: the second upload is the one that used to be refused.
let after = before;
for (let i = 0; i < 12; i++) {
  after = num(`select count(*) from sales_invoices where status = 'posted' and (${mine})`);
  if (after >= before + 2) break;
  await page.waitForTimeout(5000);
}
check('both bills posted on the server', after === before + 2, `${before} → ${after}`);

const nos = sql(`select string_agg(doc_no, ' ' order by posted_at) from (select doc_no, posted_at from sales_invoices where status = 'posted' and (${mine}) order by posted_at desc limit 2) x`);
const [a, b] = nos.split(' ');
check('and they carry different numbers', !!a && !!b && a !== b, nos);

check('no stock movement points at a bill that never posted',
  num(`select count(*) from stock_movements m join sales_invoices i on i.id = m.ref_id
        where m.ref_type = 'sales_invoice' and i.status = 'draft'`) === 0);

check('the counter is past every number it has issued',
  num(`select count(*) from document_sequences s
        where s.doc_type = 'sales_invoice'
          and exists (select 1 from sales_invoices i
                       where left(i.doc_no, length(s.prefix)) = s.prefix
                         and substr(i.doc_no, length(s.prefix) + 1)::int >= s.next_number)`) === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('\nFAILED:'); failed.forEach((f) => console.log(`  ${f.name}${f.detail ? ' — ' + f.detail : ''}`)); }
await browser.close();
process.exit(failed.length ? 1 : 0);
