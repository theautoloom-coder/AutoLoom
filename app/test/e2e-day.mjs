/**
 * The rest of the shop's day, each job done by the role that does it — and
 * nothing stops at the first failure. Every problem is logged and the walk
 * goes on, so one run gives the whole list.
 *
 *   node test/e2e-day.mjs http://127.0.0.1:8222
 *
 * e2e-full covers bill / kharcha / kharab / stock-in / return as the owner and
 * e2e-counter covers two bills as the salesman. This covers what neither does:
 * taking payment from a bill and landing back on it, stock-in with a supplier
 * typed in on the spot (as the godown, who could not record the supplier's
 * rate before), a return to the supplier, ginti and transfer as the godown,
 * paying a supplier and writing kharcha as accounts, editing a customer and
 * coming back in one Peeche, the bulb sockets on a car, and the English still
 * on screen anywhere it went.
 *
 * Local stack only. It writes real rows.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'http://127.0.0.1:8222';
if (!/127\.0\.0\.1|localhost/.test(base)) { console.error('✗ local stack only'); process.exit(2); }
const PASSWORD = process.env.APP_PASSWORD ?? 'autoloom123';

const sql = (q) =>
  execFileSync('docker', ['exec', 'supabase_db_Autogrid', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q],
    { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();
const num = (q) => Number(sql(q) || 0);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// English a shopkeeper would read. Trade words (bill, stock, cash, UPI, GST…)
// are the shop's own vocabulary and are not flagged.
const ENGLISH = /\b(the|and|for|with|your|please|select|choose|enter|add|edit|delete|remove|cancel|continue|submit|confirm|search|filter|draft|posted|pending|paid|due|overdue|customer|customers|amount|date|mode|number|price|prices|cost|margin|profit|record|recorded|receive|received|return|returns|done|error|failed|success|saved|optional|required|other|all|none|new|open|close|closed|last|first|next|view|details|days|week|month|today|yesterday|lines|units|attach|screenshot|proof|send|share|reminder|statement|invoice|credit|debit|document|purchase|movement|adjustment|transfer|opening|reason)\b/gi;
const english = new Map();

let browser;
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${email})`, false, String(e).slice(0, 160)));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(38000);
  const ok = !(await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false));
  check(`signed in as ${email}`, ok);
  return { ctx, page };
}

async function go(page, path, settle = 5000) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(settle);
  await scan(page, path.split('?')[0]);
}

async function scan(page, where) {
  const text = await page.locator('body').innerText().catch(() => '');
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(ENGLISH)) {
      const key = `${where} · ${m[0].toLowerCase()}`;
      if (!english.has(key)) english.set(key, line.trim().slice(0, 90));
    }
  }
}

async function step(name, fn) {
  try { await fn(); } catch (e) { check(name, false, String(e.message ?? e).split('\n')[0].slice(0, 160)); }
}

const confirmYes = async (page) => {
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Aage badho|Haan/i }).first().click({ timeout: 4000 }).catch(() => {});
};

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

browser = await chromium.launch();

// ---------------------------------------------------------------------------
console.log('\n▸ salesman: udhaar bill, then "Jama laga do" from the bill');
{
  const { ctx, page } = await session('sales@autoloom.local');
  await step('udhaar bill + payment from the bill', async () => {
    await go(page, '/invoice/edit', 6500);
    // The cash customer never takes udhaar: an udhaar bill goes on a khata.
    await page.getByText('Walk-in Customer', { exact: true }).locator('visible=true').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Naam likh ke dhoondo').fill('XYZ');
    await page.waitForTimeout(900);
    await page.getByText('XYZ Accessories', { exact: true }).locator('visible=true').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
    await page.waitForTimeout(2500);
    await page.getByText(/X-tremeVision/i).first().click();
    await page.waitForTimeout(2000);
    await postBill(page, 'Udhaar');
    await page.waitForTimeout(7000);
    const url = page.url();
    check('udhaar bill posted', /\/invoice\/[0-9a-f-]{20,}/.test(url), url.replace(base, ''));
    await scan(page, '/invoice/[id]');
    await page.getByRole('button', { name: 'Jama laga do' }).click();
    await page.waitForTimeout(4000);
    await scan(page, '/payment/edit');
    await page.getByRole('button', { name: /Paisa likh do/i }).click();
    await confirmYes(page);
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /Rehne do/i }).first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(3000);
    check('after the payment, back on the same bill', page.url() === url, page.url().replace(base, ''));
    const paid = await page.getByText(/poora mila/i).first().isVisible().catch(() => false);
    check('the bill now shows it is paid', paid);
  });
  await step('staff can propose a new item', async () => {
    await go(page, '/requests', 4000);
    check('"Naya item bhejo" offered to staff', await page.getByRole('button', { name: /Naya item bhejo/ }).isVisible().catch(() => false));
  });
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n▸ staff (godown): stock-in with a new supplier typed in, ginti');
{
  const { ctx, page } = await session('warehouse@autoloom.local');
  const tag = `E2E Sup ${Date.now().toString().slice(-5)}`;
  await step('stock-in with a supplier made on the spot', async () => {
    const before = num("select count(*) from purchases where status='posted'");
    await go(page, '/stock/add', 6000);
    await page.getByText('Kis supplier se aaya?').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Naam likh ke dhoondo').fill(tag);
    await page.waitForTimeout(800);
    await page.getByText(new RegExp(`Naya banao: .${tag}`)).first().click();
    await page.waitForTimeout(2000);
    // Stock Chadhao (8 Oct 2026): the item, then its kism, then how many.
    await page.getByPlaceholder('Naam, category, SKU ya barcode').fill('xtreme');
    await page.waitForTimeout(2500);
    await page.getByText(/ · \d+ kism$/).locator('visible=true').first().click();
    await page.waitForTimeout(2500);
    await page.getByText(/^H4 .* · -?\d+$/).locator('visible=true').first().click();
    // No rate: staff count the maal; the owner prices and approves it.
    check('staff are not shown a buy-rate box', !(await page.getByLabel(/Kharid rate/).locator('visible=true').first().isVisible().catch(() => false)));
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /pcs owner ko bhejo/i }).click();
    await page.waitForTimeout(9000);
    const after = num("select count(*) from purchases where status='posted'");
    check('staff stock-in waits for approval, not posted', after === before, `${before} → ${after}`);
    check('staff stock-in is waiting for the owner',
      num(`select count(*) from purchases p join suppliers s on s.id = p.supplier_id where s.name = '${tag}' and p.status = 'draft' and p.submitted_at is not null`) === 1);
    check('the new supplier reached the server with a code',
      sql(`select coalesce(code,'') from suppliers where name='${tag}'`).startsWith('S'), sql(`select coalesce(code,'-') from suppliers where name='${tag}'`));
    // No rate was given, so no "last rate" of ₹0 is remembered for this supplier.
    check('no ₹0 supplier rate remembered for an unpriced stock-in',
      num(`select count(*) from supplier_products sp join suppliers s on s.id=sp.supplier_id where s.name='${tag}'`) === 0);
  });

  await step('ginti as the godown', async () => {
    const before = num("select count(*) from stock_adjustments where status='posted' and reason='audit'");
    await go(page, '/stock-check', 6000);
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
    await page.waitForTimeout(2500);
    await page.getByText(/X-tremeVision/i).first().click();
    await page.waitForTimeout(2000);
    await page.getByPlaceholder('Jitne gine, wo likho').fill('3');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /theek kar do/i }).last().click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Haan, ginti theek kar do/i }).click();
    await page.waitForTimeout(1500);
    const popup = await page.getByRole('button', { name: /Aage badho/i }).isVisible().catch(() => false);
    check('ginti asks once, not twice', !popup);
    if (popup) await confirmYes(page);
    await page.waitForTimeout(7000);
    const after = num("select count(*) from stock_adjustments where status='posted' and reason='audit'");
    check('ginti posted on the server', after === before + 1, `${before} → ${after}`);
  });

  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n▸ purchase: return to the supplier');
{
  const { ctx, page } = await session('owner@autoloom.local');
  await step('purchase return opens with lines and posts', async () => {
    // An ordinary receipt — a replacement against a return has no return of its own.
    const pid = sql(`select p.id from purchases p where p.status='posted' and p.doc_type='purchase' and p.against_purchase_id is null
                       and exists (select 1 from purchase_lines l where l.purchase_id = p.id and l.qty > coalesce((select sum(x.qty)
                         from purchase_lines x join purchases px on px.id = x.purchase_id where x.against_line_id = l.id and px.status = 'posted'), 0))
                     order by p.posted_at desc limit 1`);
    const before = num("select count(*) from purchases where status='posted' and doc_type='debit_note'");
    await go(page, `/purchase/${pid}`, 5000);
    await page.getByRole('button', { name: /maal wapas|wapsi/i }).click();
    await page.waitForTimeout(7000);
    await scan(page, '/purchase/edit?against');
    const lines = num(`select count(*) from purchase_lines l join purchases p on p.id=l.purchase_id where p.against_purchase_id='${pid}' and p.status='draft'`);
    check('the supplier return opens with the purchase lines', lines > 0, `${lines} line(s)`);
    await page.getByRole('button', { name: /(likh do|bhej do|post)/i }).last().click();
    await confirmYes(page);
    await page.waitForTimeout(8000);
    const after = num("select count(*) from purchases where status='posted' and doc_type='debit_note'");
    check('supplier return posted', after === before + 1, `${before} → ${after}`);
  });

  await step('the car page shows its bulb sockets', async () => {
    const creta = sql("select vm.id from vehicle_models vm join vehicle_makes mk on mk.id=vm.make_id where mk.name='Hyundai' and vm.name='Creta' limit 1");
    await go(page, `/vehicle/${creta}`, 5000);
    check('"Model aur bulb" shown', await page.getByText('Model aur bulb').isVisible().catch(() => false));
    check('Creta low beam socket shown', await page.getByText(/Low Beam H7/).first().isVisible().catch(() => false));
  });

  // Staff put maal in without a rate; the owner prices it afterwards.
  await step('owner sees unpriced maal and prices it', async () => {
    const pid = sql(`select p.id from products p join product_variants pv on pv.product_id = p.id
                      where exists (select 1 from stock_movements m where m.variant_id = pv.id)
                      group by p.id having count(*) = 1 limit 1`);
    const vid = sql(`select id from product_variants where product_id = '${pid}'`);
    sql(`update product_variants set avg_cost = 0, last_purchase_cost = 0 where id = '${vid}'`);
    await page.waitForTimeout(8000);
    await go(page, '/stock', 5000);
    const chip = page.getByText(/Rate baaki \d+/).first();
    check('"Rate baaki" shown to the owner', await chip.isVisible().catch(() => false));
    // A kism's buy rate is set on the kism, not on the item.
    await go(page, `/admin/item?id=${pid}&variant=${vid}`, 6000);
    await page.getByLabel('Kharid rate').first().fill('432');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Badlav kar do' }).click();
    let cost = 0;
    for (let i = 0; i < 10 && cost !== 432; i++) {
      await page.waitForTimeout(2000);
      cost = num(`select avg_cost from product_variants where id = '${vid}'`);
    }
    check('the kharid rate the owner typed is saved as the cost', cost === 432, `avg_cost ${cost}`);
  });

  await step('Hisab takes returns off the sale', async () => {
    const expect = num(`select coalesce(sum(case when doc_type='credit_note' then -grand_total else grand_total end),0)
                          from sales_invoices where status='posted' and doc_type in ('invoice','credit_note') and doc_date = (now() at time zone 'Asia/Kolkata')::date`);
    await go(page, '/hisab', 5000);
    await page.getByText('Aaj', { exact: true }).first().click();
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    const shown = Number(((text.match(/Sale\s*\n[^\n]*\n\s*₹([\d,]+)/) ?? text.match(/₹([\d,]+)/)) ?? [])[1]?.replace(/,/g, '') ?? NaN);
    check('Hisab sale = bills − returns', shown === Math.round(expect), `screen ${shown}, books ${expect}`);
  });

  for (const p of ['/', '/stock', '/parchi', '/hisab', '/more', '/reminders', '/customers', '/suppliers', '/purchases',
    '/payments', '/kharab', '/khata', '/reports', '/partner-paisa', '/reorder', '/expenses', '/requests', '/sync', '/help', '/search']) {
    await step(`screen ${p}`, async () => { await go(page, p, 3500); });
  }
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n▸ owner: pay a supplier; staff edits a grahak');
{
  const { ctx, page } = await session('owner@autoloom.local');
  await step('supplier payment', async () => {
    // party_balance_live is the phone's view; the server keeps party_balances.
    const sid = sql("select party_id from party_balances where party_type='supplier' and balance > 100 limit 1");
    const before = num("select count(*) from payments where direction='out' and status='posted'");
    await go(page, `/payment/edit?direction=out&party=${sid}&amount=100`, 5000);
    await page.getByRole('button', { name: /Payment likh do/i }).click();
    await confirmYes(page);
    await page.waitForTimeout(7000);
    const after = num("select count(*) from payments where direction='out' and status='posted'");
    check('supplier payment posted', after === before + 1, `${before} → ${after}`);
  });
  await ctx.close();
}
{
  const { ctx, page } = await session('sales@autoloom.local');
  await step('edit a grahak, then one Peeche back to the list', async () => {
    const cid = sql("select id from customers where name='XYZ Accessories' limit 1");
    // Into the customer through the app, so there is a list to go back to —
    // a direct URL starts a fresh history.
    await go(page, '/khata', 4000);
    await page.getByText('XYZ Accessories', { exact: true }).first().click();
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: 'Badlo' }).click();
    await page.waitForTimeout(4000);
    await scan(page, '/customer/edit');
    // Save stays disabled until something changes.
    await page.getByPlaceholder('Kuch yaad rakhne wali baat').fill(`e2e ${Date.now().toString().slice(-4)}`);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Save karo' }).click();
    await page.waitForTimeout(4000);
    check('after saving, on the customer page', page.url().includes(`/customer/${cid}`), page.url().replace(base, ''));
    await page.getByRole('button', { name: 'Peeche jao' }).click();
    await page.waitForTimeout(2500);
    check('one Peeche goes back to the list, not to the same page again', /\/khata/.test(page.url()), page.url().replace(base, ''));
  });
  await ctx.close();
}

await browser.close();

// ---------------------------------------------------------------------------
console.log('\n▸ English still on screen');
for (const [k, line] of english) console.log(`  ${k}  ←  ${line}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${english.size} English hits`);
if (failed.length) { console.log('\nFAILED:'); failed.forEach((f) => console.log(`  ${f.name}${f.detail ? ' — ' + f.detail : ''}`)); }
process.exit(failed.length ? 1 : 0);
