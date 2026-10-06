/**
 * AutoLoom as a wholesaler (owner, 6 Oct 2026), walked by the two kinds of
 * people who use it — a staff member and a partner — against the local stack.
 * Nothing stops at the first failure; every problem is logged.
 *
 *   node test/e2e-wholesale.mjs http://127.0.0.1:8222
 *
 *   staff:  tabs and home without money · stock in waits for approval ·
 *           kharab goes to the kharab corner · cash bill has no udhaar ·
 *           reports are not theirs
 *   owner:  approves the staff entry with a rate · sends kharab back to the
 *           supplier · replacement settles it · partner money · a PDF ·
 *           a bulb with its socket and cars · every new screen opens clean
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

let browser;
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${email})`, false, String(e).slice(0, 200)));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(38000);
  check(`signed in as ${email}`, !(await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)));
  return { ctx, page };
}

const go = async (page, path, settle = 5500) => {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(settle);
};
async function step(name, fn) {
  try { await fn(); } catch (e) { check(name, false, String(e.message ?? e).split('\n')[0].slice(0, 200)); }
}
const yes = async (page) => {
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Aage badho|Haan/i }).first().click({ timeout: 4000 }).catch(() => {});
};
const visible = (page, text, exact = true) => page.getByText(text, { exact }).first().isVisible().catch(() => false);
async function pickFrom(page, placeholderText, search, option) {
  await page.getByText(placeholderText).locator('visible=true').first().click();
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('Naam likh ke dhoondo').fill(search);
  await page.waitForTimeout(900);
  await page.getByText(option, { exact: true }).locator('visible=true').first().click();
  await page.waitForTimeout(1200);
}
async function pickItem(page, q = 'H4') {
  await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill(q);
  await page.waitForTimeout(2500);
  // Visible only: on the web the screen underneath stays mounted, and the
  // same item named there is hidden — clicking it waits forever.
  await page.getByText(/X-tremeVision/i).locator('visible=true').first().click();
  await page.waitForTimeout(1800);
}

const H4 = sql(`select pv.id from product_variants pv join products p on p.id = pv.product_id where p.name ilike '%X-tremeVision%' limit 1`);
const SUPPLIER = sql(`select name from suppliers where is_active and name not ilike 'e2e%' order by name limit 1`);
const STAFF = 'sales@autoloom.local';
const OWNER = 'owner@autoloom.local';
const godownQty = () => num(`select coalesce(sum(m.qty),0) from stock_movements m join locations l on l.id = m.location_id where m.variant_id = '${H4}' and l.type <> 'damaged'`);
const kharabQty = () => num(`select coalesce(sum(m.qty),0) from stock_movements m join locations l on l.id = m.location_id where m.variant_id = '${H4}' and l.type = 'damaged'`);

browser = await chromium.launch();
let entryId = '';

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await session(STAFF);

  await step('staff tabs and home', async () => {
    await go(page, '/');
    const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
    const bar = tabs.join(' | ');
    check('staff tab bar has Khata and Bill, not Hisab', /Khata/.test(bar) && /Bill/.test(bar) && !/Hisab/.test(bar), bar);
    check('staff home shows bills, not the day\'s sale', await visible(page, 'AAJ KE BILL', false) || await visible(page, 'Aaj ke bill', false));
    check('staff home has no "Aaj ki sale"', !(await visible(page, 'Aaj ki sale', false)) && !(await visible(page, 'AAJ KI SALE', false)));
  });

  await step('staff stock-in waits for approval', async () => {
    const before = godownQty();
    await go(page, '/stock/add', 6000);
    await pickFrom(page, 'Kis supplier se aaya?', SUPPLIER.slice(0, 6), SUPPLIER);
    await pickItem(page);
    await page.getByLabel('Kitne aaye').first().fill('3');
    await page.waitForTimeout(500);
    check('staff sees no buy-rate box', !(await page.getByLabel(/Kharid rate/).first().isVisible().catch(() => false)));
    await page.getByRole('button', { name: /owner ko bhejo/i }).click();
    await page.waitForTimeout(9000);
    entryId = sql(`select id from purchases where status = 'draft' and submitted_at is not null order by submitted_at desc limit 1`);
    check('entry reached the server as waiting', !!entryId);
    check('waiting entry carries 3 pcs', num(`select coalesce(sum(qty),0) from purchase_lines where purchase_id = '${entryId}'`) === 3);
    check('stock did not move before approval', godownQty() === before, `${before} → ${godownQty()}`);
  });

  await step('staff puts kharab maal aside', async () => {
    const g0 = godownQty(); const k0 = kharabQty();
    await go(page, '/kharab-maal', 6000);
    await pickItem(page);
    await page.getByRole('button', { name: /kharab mein daalo/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    check('kharab maal left the godown', godownQty() === g0 - 1, `${g0} → ${godownQty()}`);
    check('kharab maal is in the kharab corner', kharabQty() === k0 + 1, `${k0} → ${kharabQty()}`);
    check('no loss booked for maal set aside',
      num(`select count(*) from stock_movements where variant_id = '${H4}' and movement_type = 'damage' and created_at > now() - interval '2 minutes'`) === 0);
  });

  await step('cash bill has no udhaar', async () => {
    await go(page, '/invoice/edit', 8000);
    check('new bill starts on the cash customer', await visible(page, 'Walk-in Customer') || await visible(page, 'Cash Grahak'));
    await pickItem(page);
    check('no Udhaar chip for the cash customer', !(await visible(page, 'Udhaar')));
    await page.getByRole('button', { name: /Chhod do/i }).click().catch(() => {});
    await yes(page);
  });

  await step('reports are the partners\'', async () => {
    await go(page, '/reports');
    check('staff get no reports', await visible(page, 'Report sirf partner dekh sakte hain'));
  });

  await ctx.close();
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await session(OWNER);

  await step('owner tabs', async () => {
    await go(page, '/');
    const bar = (await page.getByRole('tab').allInnerTexts().catch(() => [])).join(' | ');
    check('owner tab bar has Khata and Hisab, not Bill', /Khata/.test(bar) && /Hisab/.test(bar) && !/\bBill\b/.test(bar), bar);
  });

  await step('owner approves the staff entry with a rate', async () => {
    if (!entryId) throw new Error('no staff entry to approve');
    const before = godownQty();
    await go(page, '/requests', 6000);
    check('approval queue shows the entry', await visible(page, `${SUPPLIER} · 3 pcs`));
    await page.getByText(`${SUPPLIER} · 3 pcs`).first().click();
    await page.waitForTimeout(5000);
    await page.getByLabel('Kharid rate').first().fill('1500');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Approve karo/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    check('entry is posted', sql(`select status from purchases where id = '${entryId}'`) === 'posted');
    check('the approver is recorded', sql(`select coalesce(approved_by::text,'') from purchases where id = '${entryId}'`) !== '');
    check('supplier khata got the amount', num(`select grand_total from purchases where id = '${entryId}'`) === 4500);
    check('stock went up on approval', godownQty() === before + 3, `${before} → ${godownQty()}`);
  });

  let dn = '';
  await step('owner sends kharab back to the supplier', async () => {
    const k0 = kharabQty();
    await go(page, '/kharab', 6000);
    check('kharab corner lists the maal', await page.getByText(/X-tremeVision/i).first().isVisible().catch(() => false));
    await page.getByRole('button', { name: /Supplier ko wapas bhejo/i }).click();
    await page.waitForTimeout(6000);
    await pickFrom(page, 'Kis supplier ka maal?', SUPPLIER.slice(0, 6), SUPPLIER);
    await pickItem(page);
    await page.getByRole('button', { name: /Wapsi likh do/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    dn = sql(`select id from purchases where doc_type = 'debit_note' and status = 'posted' order by posted_at desc limit 1`);
    check('return posted from the kharab corner', kharabQty() === k0 - 1, `${k0} → ${kharabQty()}`);
    check('return is open until settled', sql(`select coalesce(settled_at::text,'') from purchases where id = '${dn}'`) === '');
  });

  await step('replacement settles the return', async () => {
    if (!dn) throw new Error('no return to settle');
    const g0 = godownQty();
    await go(page, `/purchase/${dn}`, 6000);
    await page.getByRole('button', { name: /Replacement aaya/i }).click();
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /Stock chadha do/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    check('replacement came into the godown', godownQty() === g0 + 1, `${g0} → ${godownQty()}`);
    check('return settled by the replacement', sql(`select coalesce(settled_at::text,'') from purchases where id = '${dn}'`) !== '');
  });

  await step('partner money', async () => {
    const before = num(`select count(*) from payments where party_type = 'partner'`);
    await go(page, '/partner-paisa', 6000);
    await page.getByLabel('Kitna').first().fill('50000');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /lagaya — likh do/i }).click();
    await yes(page);
    await page.waitForTimeout(8000);
    check('partner entry reached the server', num(`select count(*) from payments where party_type = 'partner'`) === before + 1);
    check('partner money is not in the day\'s collection',
      num(`select count(*) from payments where party_type = 'partner' and doc_no is not null`) === 0);
  });

  await step('sale report PDF', async () => {
    await go(page, '/reports', 5000);
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 20000 }),
      page.getByRole('button', { name: /Sale ki PDF banao/i }).click(),
    ]);
    await popup.waitForTimeout(1500);
    const html = await popup.content();
    check('sale report opens as a printable page', /Sale ka hisaab/.test(html) && /Din ke hisaab se/.test(html));
    await popup.close().catch(() => {});
  });

  const tag = `E2E Bulb ${Date.now().toString().slice(-5)}`;
  await step('a bulb with its socket and cars', async () => {
    const fam = sql(`select f.name from product_families f join spec_definitions d on d.family_id = f.id and d.code = 'socket' and d.is_variant_axis order by f.sort_order limit 1`);
    await go(page, '/admin/item', 6000);
    await pickFrom(page, 'LED Bulb / Mats / Seat cover…', fam.slice(0, 5), fam);
    await page.waitForTimeout(1500);
    await page.getByLabel('Item ka naam').fill(tag);
    await page.getByLabel('Bechne ka rate').fill('999');
    // Socket: chips or a list, whichever the family has.
    const chip = page.getByRole('button', { name: 'H4', exact: true }).first();
    if (await chip.isVisible().catch(() => false)) await chip.click();
    else await pickFrom(page, 'Chuno…', 'H4', 'H4');
    await pickFrom(page, 'Creta, Swift, Nexon…', 'Creta', 'Hyundai Creta');
    await page.getByLabel('Saal se').fill('2019');
    await page.getByLabel('Saal tak').fill('2023');
    await page.getByRole('button', { name: /Gaadi jodo/i }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Item bana do/i }).click();
    await page.waitForTimeout(10000);
    const pid = sql(`select id from products where name = '${tag}'`);
    check('item reached the server', !!pid);
    check('socket stored as a spec', sql(`select string_agg(display_value, ',') from spec_values where product_id = '${pid}'`).includes('H4'));
    check('car stored with its years', sql(`select year_from || '-' || year_to from product_fitments where product_id = '${pid}'`) === '2019-2023');
    check('variant named by its socket', sql(`select variant_name from product_variants where product_id = '${pid}'`).startsWith('H4'));
    await go(page, '/stock', 5000);
    await page.getByPlaceholder('SKU, barcode ya naam dhoondo').fill(tag);
    await page.waitForTimeout(2500);
    check('stock list shows the car and years', await page.getByText(/Creta 2019–2023/).first().isVisible().catch(() => false));
  });

  await step('every new screen opens clean', async () => {
    for (const path of ['/khata', '/khata?tab=supplier', '/hisab', '/kharab', '/reports', '/partner-paisa', '/purchases', '/admin/users', '/help', '/stock', '/more', '/requests']) {
      await go(page, path, 4500);
      const blank = (await page.locator('body').innerText().catch(() => '')).trim().length < 20;
      check(`opens ${path}`, !blank);
    }
  });

  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
if (failed.length) { for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`); process.exit(1); }
