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
// The three-item bill staff make, and later send a change to (owner, 15 Oct 2026).
let threeBill = '';
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
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('xtreme');
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
  // Owner, 13 Oct 2026: "ek bill mein multiple items nahi ho pa rahe".
  await step('one bill, three items', async () => {
    await go(page, '/invoice/edit', 6500);
    const box = page.getByPlaceholder('Scan karo ya SKU / naam likho');
    // A wide search used to stop at 30 rows without a word: the rest of the
    // shop's items were simply not there to pick.
    const h4 = num(`select count(*) from product_variants pv join products p on p.id = pv.product_id where pv.is_active and p.is_active and pv.search_text like '%h4%'`);
    if (h4 > 30) {
      await box.fill('h4');
      await page.waitForTimeout(2500);
      const left = async () => Number((await page.getByText(/aur mile — gaadi/).first().innerText().catch(() => '0')).match(/^(\d+)/)?.[1] ?? 0);
      const before = await left();
      check('a wide search says how many more there are', before === h4 - 30, `${before} of ${h4}`);
      await page.getByRole('button', { name: 'Aur dikhao' }).click();
      await page.waitForTimeout(2000);
      check('and shows them on asking', (await left()) === Math.max(h4 - 60, 0), `${await left()} left`);
    }
    const picks = [['xtreme', /X-tremeVision/i], ['mat set', /^7D Mat Set · Coffee$/], ['elegant creta black', /^Elegant 7D Luxury Car Mat · Creta 2024\+ Black$/]];
    for (const [n, [term, row]] of picks.entries()) {
      await box.fill(term);
      await page.waitForTimeout(2500);
      await page.getByText(row).first().click();
      await page.waitForTimeout(1800);
      check(`item ${n + 1} is added and said so`, await page.getByText(new RegExp(`jud gaya · Maal · ${n + 1}$`)).first().isVisible().catch(() => false));
    }
    check('the box says the next item goes in it', await page.getByText(/Aur maal\? Yahin naam likho/).first().isVisible().catch(() => false)
      || await page.getByText(/jud gaya · Maal · 3/).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: 'Line hatao' }).first().click();
    check('removing a line asks first', await page.getByText('Ye maal bill se hatayein?').isVisible().catch(() => false));
    await page.getByRole('button', { name: /Rehne do/i }).first().click();
    await page.waitForTimeout(800);
    const draft = sql(`select id from sales_invoices where status = 'draft' and doc_type = 'invoice' order by created_at desc limit 1`);
    await postBill(page, 'Cash');
    await page.waitForTimeout(9000);
    check('the bill is posted', sql(`select status from sales_invoices where id = '${draft}'`) === 'posted');
    check('with all three items', num(`select count(*) from sales_invoice_lines where invoice_id = '${draft}'`) === 3);
    check('and three stock movements', num(`select count(*) from stock_movements where ref_id = '${draft}'`) === 3);
    threeBill = draft;
  });
  // Owner, 15 Oct 2026: "bill banane ke baad edit ka option ho — sab options;
  // approval ke baad bhi, re-approval ke process se".
  await step('staff send a change to a bill already made', async () => {
    if (!threeBill) throw new Error('no bill to change');
    await go(page, `/invoice/${threeBill}`, 5000);
    check('the bill says its date', await page.getByText(/· Aaj · \d+ \w+ ·/).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: 'Galti hai — badlav bhejo' }).click();
    await page.waitForTimeout(6000);
    check('the change opens on the bill as it was', await page.getByText(/ka badlav$/).first().isVisible().catch(() => false));
    await page.getByLabel(/^Qty/).first().fill('4');
    await page.waitForTimeout(1500);
    check('a changed line says what it was', await page.getByText(/^Pehle 1 × .* → ab 4 ×/).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: 'Line hatao' }).last().click();
    await confirmYes(page);
    await page.waitForTimeout(1500);
    check('a removed line is listed', await page.getByText(/^Bill se hataye:/).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: 'Owner ko bhejo' }).click();
    await page.waitForTimeout(7000);
    check('the change waits for the owner', num(`select count(*) from sales_invoices where corrects_invoice_id = '${threeBill}' and status = 'draft' and submitted_at is not null`) === 1);
    check('the bill itself is untouched until then', sql(`select status from sales_invoices where id = '${threeBill}'`) === 'posted');
  });
  // Owner, 16 Oct 2026: "user not able to make new grahak". The shop's cash
  // grahak has the code CASH, and a C code with no number in it made every new
  // grahak C0001 — a code already taken, so the server refused each one.
  await step('staff make a new grahak', async () => {
    sql(`insert into customers (code, name, is_active, search_text) select 'CZZZ', 'E2E code with no number', false, '' where not exists (select 1 from customers where code = 'CZZZ')`);
    const name = `E2E Grahak ${Date.now().toString().slice(-5)}`;
    await go(page, '/customer/edit', 5000);
    await page.getByLabel('Naam').first().fill(name);
    await page.getByRole('button', { name: 'Grahak bana do' }).click();
    await page.waitForTimeout(8000);
    const code = sql(`select code from customers where name = '${name}'`);
    check('the new grahak reaches the server', !!code, code || 'not there');
    check('with a code of its own', /^C\d{4,}$/.test(code) && num(`select count(*) from customers where code = '${code}'`) === 1, code);
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

  // Owner, 8 Oct 2026: a staff ginti asks; the stock moves when the owner
  // approves it (e2e-wholesale walks the approval).
  await step('ginti as the godown goes to the owner', async () => {
    const posted = num("select count(*) from stock_adjustments where status='posted' and reason='audit'");
    const asked = num("select count(*) from stock_adjustments where status='draft' and submitted_at is not null");
    await go(page, '/stock-check', 6000);
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('xtreme');
    await page.waitForTimeout(2500);
    await page.getByText(/X-tremeVision/i).first().click();
    await page.waitForTimeout(2000);
    await page.getByPlaceholder('Jitne gine, wo likho').fill('3');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /theek kar do/i }).last().click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Haan, owner ko bhejo/i }).click();
    await page.waitForTimeout(1500);
    const popup = await page.getByRole('button', { name: /Aage badho/i }).isVisible().catch(() => false);
    check('ginti asks once, not twice', !popup);
    if (popup) await confirmYes(page);
    await page.waitForTimeout(7000);
    check('staff ginti reached the owner as a request',
      num("select count(*) from stock_adjustments where status='draft' and submitted_at is not null") === asked + 1);
    check('staff ginti did not change the stock by itself',
      num("select count(*) from stock_adjustments where status='posted' and reason='audit'") === posted);
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
  await step('owner puts in the change staff sent to a bill', async () => {
    if (!threeBill) throw new Error('no bill was changed');
    const cid = sql(`select id from sales_invoices where corrects_invoice_id = '${threeBill}' and status = 'draft' and submitted_at is not null limit 1`);
    if (!cid) throw new Error('no change waiting');
    await go(page, '/requests', 6000);
    await page.getByRole('button', { name: /^Bill badlav · \d+$/ }).click();
    await page.waitForTimeout(1200);
    check('the change waits in the approval list', await page.getByText(/^Badlav NOI\//).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await confirmYes(page);
    await page.waitForTimeout(9000);
    check('the old bill is cancelled', sql(`select status from sales_invoices where id = '${threeBill}'`) === 'cancelled');
    check('the changed bill is made, with a number', sql(`select status || ' ' || coalesce(doc_no, '-') from sales_invoices where id = '${cid}'`).startsWith('posted NOI/'));
    check('it has two lines, one of them 4 pcs', sql(`select string_agg(qty::int::text, ',' order by qty) from sales_invoice_lines where invoice_id = '${cid}'`) === '1,4');
    check('the old bill’s maal came back and the new one’s left',
      num(`select coalesce(sum(qty), 0) from stock_movements where ref_id = '${threeBill}'`) === 0
      && num(`select coalesce(sum(qty), 0) from stock_movements where ref_id = '${cid}'`) === -5);
    check('the money moved with it', num(`select paid_total from sales_invoices where id = '${cid}'`) === num(`select grand_total from sales_invoices where id = '${cid}'`));
  });

  // Owner, 15 Oct 2026: "grahak wale ledger mein jaake kuch bhi edit nahi kar pa raha".
  await step('a bill is changed from the grahak’s khata', async () => {
    const cust = sql(`select id from customers where name = 'XYZ Accessories'`);
    await go(page, `/customer/${cust}`, 6000);
    const change = page.getByRole('button', { name: 'Bill badlo' }).first();
    check('the khata offers to change a bill', await change.isVisible().catch(() => false));
    await page.getByText(/^Bill NOI\//).first().click();
    await page.waitForTimeout(4000);
    check('a khata line opens its bill', /\/invoice\/[0-9a-f-]{20,}$/.test(page.url()), page.url().replace(base, ''));
    await go(page, `/customer/${cust}`, 6000);
    const before = num(`select count(*) from sales_invoices where corrects_invoice_id is not null and status = 'draft'`);
    await page.getByRole('button', { name: 'Bill badlo' }).first().click();
    await page.waitForTimeout(5000);
    check('it opens the change, every part of the bill editable', /\/invoice\/edit\?id=/.test(page.url()) && await page.getByText(/ka badlav$/).first().isVisible().catch(() => false));
    check('a change was opened for it', num(`select count(*) from sales_invoices where corrects_invoice_id is not null and status = 'draft'`) === before + 1);
    await page.getByRole('button', { name: 'Chhod do' }).click();
    await confirmYes(page);
    await page.waitForTimeout(3000);
    check('left alone, the change is gone and the bill stays', num(`select count(*) from sales_invoices where corrects_invoice_id is not null and status = 'draft'`) === before);
  });
  await step('a stock entry opens from the supplier’s page', async () => {
    const sup = sql(`select supplier_id from purchases where status = 'posted' and doc_type = 'purchase' order by created_at desc limit 1`);
    await go(page, `/supplier/${sup}`, 6000);
    check('the khata offers to correct an entry', await page.getByRole('button', { name: 'Entry sudhaaro' }).first().isVisible().catch(() => false));
    await page.getByText(/^PUR\//).first().click();
    await page.waitForTimeout(4000);
    check('an entry line opens the entry', /\/purchase\/[0-9a-f-]{20,}$/.test(page.url()), page.url().replace(base, ''));
  });

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
