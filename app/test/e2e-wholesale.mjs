/**
 * AutoLoom as a wholesaler (owner, 6 Oct 2026), walked by the two kinds of
 * people who use it — a staff member and a partner — against the local stack.
 * Nothing stops at the first failure; every problem is logged.
 *
 *   node test/e2e-wholesale.mjs http://127.0.0.1:8222
 *
 *   staff:  tabs and home without money · stock in waits for approval ·
 *           a new kism made while stocking in ·
 *           kharab goes to the kharab corner · cash bill has no udhaar ·
 *           reports are not theirs
 *   owner:  approves the staff entry with a rate · sends kharab back to the
 *           supplier · replacement settles it · partner money · a PDF ·
 *           an item made once, its kisms chosen while stocking in ·
 *           categories, party list, kharcha types · every new screen opens clean
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

// Stock Chadhao (owner, 8 Oct 2026): search the item, then choose its kism.
async function stockItem(page, q) {
  await page.getByPlaceholder('Naam, category, SKU ya barcode').locator('visible=true').first().fill(q);
  await page.waitForTimeout(2500);
  await page.getByText(/ · \d+ kism$/).locator('visible=true').first().click();
  await page.waitForTimeout(2500);
}
const lastVisible = (page, label) => page.getByLabel(label, { exact: true }).locator('visible=true').last();
async function socket(page, value) {
  // Chips or a list, whichever the category has.
  const chip = page.getByText(value, { exact: true }).locator('visible=true').first();
  if (await chip.isVisible().catch(() => false)) await chip.click();
  else await pickFrom(page, 'Chuno…', value, value);
  await page.waitForTimeout(500);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The same item pickItem() clicks: the first X-tremeVision the "H4" search lists.
const H4 = sql(`select pv.id from product_variants pv join products p on p.id = pv.product_id
                 where p.name ilike '%X-tremeVision%' and pv.search_text ilike '%h4%' order by p.name, pv.sort_order, pv.variant_name limit 1`);
const H4_NAME = sql(`select variant_name from product_variants where id = '${H4}'`);
const H4_ITEM = sql(`select product_id from product_variants where id = '${H4}'`);
const SUPPLIER = sql(`select name from suppliers where is_active and name not ilike 'e2e%' order by name limit 1`);
const SUPPLIER2 = sql(`select name from suppliers where is_active and name not ilike 'e2e%' order by name offset 1 limit 1`);
const yesterday = sql(`select (current_date - 1)::text`);
const variantQty = (id) => num(`select coalesce(sum(m.qty),0) from stock_movements m join locations l on l.id = m.location_id where m.variant_id = '${id}' and l.type <> 'damaged'`);
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
    await stockItem(page, 'xtreme');
    await page.getByText(new RegExp(`^${esc(H4_NAME)} · `)).locator('visible=true').first().click();
    await lastVisible(page, 'Kitne aaye').fill('3');
    await page.waitForTimeout(500);
    check('staff sees no buy-rate box', !(await page.getByLabel(/Kharid rate/).locator('visible=true').first().isVisible().catch(() => false)));
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /pcs owner ko bhejo/i }).click();
    await page.waitForTimeout(9000);
    entryId = sql(`select id from purchases where status = 'draft' and submitted_at is not null order by submitted_at desc limit 1`);
    check('entry reached the server as waiting', !!entryId);
    check('waiting entry carries 3 pcs', num(`select coalesce(sum(qty),0) from purchase_lines where purchase_id = '${entryId}'`) === 3);
    check('stock did not move before approval', godownQty() === before, `${before} → ${godownQty()}`);
  });

  // Owner, 7 Oct 2026: staff see what they sent and can fix it while it waits.
  await step('staff fix their entry while it is in review', async () => {
    if (!entryId) throw new Error('no staff entry');
    await go(page, '/requests', 6000);
    check('"Review mein" lists the staff entry', await visible(page, `${SUPPLIER} · 3 pcs`));
    await page.getByText(`${SUPPLIER} · 3 pcs`).locator('visible=true').first().click();
    await page.waitForTimeout(5000);
    check('entry opens editable, still in review', await visible(page, 'Owner ke review mein hai'));
    await page.getByLabel('Kitne aaye').locator('visible=true').first().fill('5');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Ho gaya' }).click();
    await page.waitForTimeout(8000);
    check('the change reached the server', num(`select coalesce(sum(qty),0) from purchase_lines where purchase_id = '${entryId}'`) === 5);
    check('still waiting for the owner', sql(`select (submitted_at is not null)::text from purchases where id = '${entryId}'`) === 'true');
    check('the change is stamped for the owner', sql(`select coalesce(revised_at::text,'') from purchases where id = '${entryId}'`) !== '');
  });

  // Owner, 8 Oct 2026: the item is made once; another socket or another car
  // is chosen while writing the stock in — staff too, no new item asked for.
  await step('staff make a new kism while stocking in', async () => {
    await go(page, '/stock/add', 6000);
    await pickFrom(page, 'Kis supplier se aaya?', SUPPLIER2.slice(0, 6), SUPPLIER2);
    await page.getByRole('button', { name: 'Parso', exact: true }).locator('visible=true').first().click();
    await stockItem(page, 'x-treme halogen');
    await page.getByText('+ Nayi kism', { exact: true }).locator('visible=true').first().click();
    await page.waitForTimeout(800);
    await socket(page, 'H1');
    await page.getByLabel(/^Wattage/).locator('visible=true').first().fill('55');
    await page.getByText('Single', { exact: true }).locator('visible=true').first().click();
    await pickFrom(page, 'Creta, Swift, Nexon…', 'Swift', 'Maruti Suzuki Swift');
    await lastVisible(page, 'Kitne aaye').fill('2');
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);
    check('the new kism is on the entry, named by car then socket', await page.getByText(/^Swift · H1 · 55 W · Single/).locator('visible=true').first().isVisible().catch(() => false));
    await page.getByRole('button', { name: /2 pcs owner ko bhejo/i }).click();
    await page.waitForTimeout(9000);
    const kism = sql(`select id from product_variants where product_id = '${H4_ITEM}' and variant_name like 'Swift · H1%'`);
    check('staff made exactly one kism, on the same item', !!kism && !kism.includes('\n'), kism);
    check('the kism carries its socket', sql(`select string_agg(display_value, ',') from spec_values where variant_id = '${kism}'`).includes('H1'));
    check('the kism carries its car', num(`select count(*) from product_fitments pf join vehicle_models vm on vm.id = pf.model_id where pf.variant_id = '${kism}' and vm.name = 'Swift'`) === 1);
    const e2 = sql(`select p.id from purchases p join purchase_lines l on l.purchase_id = p.id where l.variant_id = '${kism}' and p.status = 'draft' and p.submitted_at is not null order by p.submitted_at desc limit 1`);
    check('the entry waits for the owner with the kism on it', !!e2);
    check('the entry keeps the day the maal came', sql(`select doc_date::text from purchases where id = '${e2}'`) === sql(`select (current_date - 2)::text`));
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

  // Owner, 7 Oct 2026: staff never see the partners' money, munafa, margin,
  // buy rates or the business's totals — anywhere a staff phone can reach.
  await step('staff see no business money', async () => {
    await go(page, '/parchi');
    // The totals card: partners see Sale and Kharcha there, staff see Entry and Bill.
    check('Bill tab has no sale total', !(await visible(page, 'Sale')) && await visible(page, 'Bill'));
    await go(page, '/payments');
    check('payments list has no money paid to suppliers', !(await visible(page, 'Diya')) && !(await page.getByText(/^−₹/).first().isVisible().catch(() => false)));
    const sid = sql(`select id from suppliers where is_active and name not ilike 'e2e%' order by name limit 1`);
    await go(page, `/supplier/${sid}`);
    check('supplier page shows no balance or bill amounts', !(await page.getByText(/Inhe dena|dena baaki|chuka diya/i).first().isVisible().catch(() => false)));
    await go(page, '/purchases');
    check('supplier entries show no amount', !(await page.getByText(/₹/).first().isVisible().catch(() => false)));
    await go(page, '/help');
    check('help has no partner-only topics', !(await page.getByText(/\(owner\)/).first().isVisible().catch(() => false)));
    await go(page, '/admin/users');
    check('staff list is not open to staff', await visible(page, 'Ye sirf partner aur admin dekh sakte hain.'));
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
    check('approval queue shows the entry', await visible(page, `${SUPPLIER} · 5 pcs`));
    check('owner sees it was changed after sending', await visible(page, 'Badla gaya'));
    await page.getByText(`${SUPPLIER} · 5 pcs`).first().click();
    await page.waitForTimeout(5000);
    check('approve screen says it changed after sending', await page.getByText(/Bhejne ke baad badla/).first().isVisible().catch(() => false));
    await page.getByLabel('Kharid rate').first().fill('1500');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Approve karo/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    check('entry is posted', sql(`select status from purchases where id = '${entryId}'`) === 'posted');
    check('the approver is recorded', sql(`select coalesce(approved_by::text,'') from purchases where id = '${entryId}'`) !== '');
    check('supplier khata got the amount', num(`select grand_total from purchases where id = '${entryId}'`) === 7500);
    check('stock went up on approval', godownQty() === before + 5, `${before} → ${godownQty()}`);
  });

  await step('owner approves the staff entry with a new kism', async () => {
    const kism = sql(`select id from product_variants where product_id = '${H4_ITEM}' and variant_name like 'Swift · H1%' limit 1`);
    if (!kism) throw new Error('no staff kism');
    const before = variantQty(kism);
    await go(page, '/requests', 6000);
    await page.getByText(`${SUPPLIER2} · 2 pcs`).locator('visible=true').first().click();
    await page.waitForTimeout(5000);
    await page.getByLabel('Kharid rate').locator('visible=true').first().fill('300');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Approve karo/i }).click();
    await yes(page);
    await page.waitForTimeout(9000);
    check('the new kism is in stock after approval', variantQty(kism) === before + 2, `${before} → ${variantQty(kism)}`);
    check('the new kism has a selling rate', num(`select retail_price from product_variants where id = '${kism}'`) > 0);
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
  // Owner, 8 Oct 2026: the item is made once — name, category, rate. Its
  // kisms (socket, car, years) are chosen while writing the stock in.
  await step('an item is made once: name, category, rate', async () => {
    const fam = sql(`select f.name from product_families f join spec_definitions d on d.family_id = f.id and d.code = 'socket' and d.is_variant_axis order by f.sort_order limit 1`);
    await go(page, '/admin/item', 6000);
    check('item form asks for no socket or car', !(await visible(page, 'Socket / Base *')) && !(await visible(page, 'Creta, Swift, Nexon…')));
    await pickFrom(page, 'LED Bulb / Mats / Seat cover…', fam.slice(0, 5), fam);
    await page.waitForTimeout(1500);
    await page.getByLabel('Item ka naam').fill(tag);
    await page.getByLabel('Bechne ka rate').fill('999');
    await page.getByRole('button', { name: /Item bana do/i }).click();
    await page.waitForTimeout(10000);
    const pid = sql(`select id from products where name = '${tag}'`);
    check('item reached the server', !!pid);
    check('item has its rate', num(`select default_price from products where id = '${pid}'`) === 999);
    check('item has no kism yet', num(`select count(*) from product_variants where product_id = '${pid}'`) === 0);

    await go(page, '/admin/item', 6000);
    await page.getByLabel('Item ka naam').fill(tag);
    await page.waitForTimeout(2500);
    check('typing an existing name offers that item', await visible(page, 'Ye item pehle se hai?'));
  });

  await step('stock in by item: kism, car, years, date', async () => {
    const pid = sql(`select id from products where name = '${tag}'`);
    if (!pid) throw new Error('no item from the step before');
    await go(page, '/stock/add', 6000);
    await pickFrom(page, 'Kis supplier se aaya?', SUPPLIER.slice(0, 6), SUPPLIER);
    await page.getByRole('button', { name: 'Kal', exact: true }).locator('visible=true').first().click();
    await stockItem(page, tag);
    check('an item with no kism opens on its first kism', await visible(page, 'Is item ki pehli kism — detail aur gaadi chuno.'));
    await socket(page, 'H4');
    await pickFrom(page, 'Creta, Swift, Nexon…', 'Creta', 'Hyundai Creta');
    check('a chosen car is on the kism at once', await page.getByText(/^Hyundai Creta\s+✕/).locator('visible=true').first().isVisible().catch(() => false));
    await page.getByLabel('Saal se').locator('visible=true').first().fill('2019');
    await page.getByLabel('Saal tak').locator('visible=true').first().fill('2023');
    await lastVisible(page, 'Kitne aaye').fill('6');
    await lastVisible(page, 'Kharid rate').fill('700');
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);

    // The same kism chosen again as "new" is the one that exists.
    await page.getByRole('button', { name: '+ Maal jodo' }).click();
    await stockItem(page, tag);
    await socket(page, 'H4');
    await pickFrom(page, 'Creta, Swift, Nexon…', 'Creta', 'Hyundai Creta');
    await page.getByLabel('Saal se').locator('visible=true').first().fill('2019');
    await page.getByLabel('Saal tak').locator('visible=true').first().fill('2023');
    await lastVisible(page, 'Kitne aaye').fill('1');
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);
    check('the same new kism twice is one line', await visible(page, 'Maal · 1', false) || await visible(page, 'MAAL · 1', false));

    await page.getByRole('button', { name: /7 pcs chadha do/i }).click();
    await page.waitForTimeout(10000);
    const kisms = sql(`select variant_name from product_variants where product_id = '${pid}'`);
    check('one kism, named by its car and socket', /^Creta 2019–2023 · H4/.test(kisms) && !kisms.includes('\n'), kisms);
    const vid = sql(`select id from product_variants where product_id = '${pid}'`);
    check('socket stored on the kism', sql(`select string_agg(display_value, ',') from spec_values where variant_id = '${vid}'`).includes('H4'));
    check('car stored with its years', sql(`select year_from || '-' || year_to from product_fitments where variant_id = '${vid}'`) === '2019-2023');
    check('the kism took the item\'s rate', num(`select retail_price from product_variants where id = '${vid}'`) === 999);
    check('7 pcs in stock', variantQty(vid) === 7, String(variantQty(vid)));
    check('the entry is dated the day the maal came', sql(`select p.doc_date::text from purchases p join purchase_lines l on l.purchase_id = p.id where l.variant_id = '${vid}' limit 1`) === yesterday);
    await go(page, '/stock', 5000);
    await page.getByPlaceholder('SKU, barcode ya naam dhoondo').fill(tag);
    await page.waitForTimeout(2500);
    check('stock list shows the car and years', await page.getByText(/Creta 2019–2023/).first().isVisible().catch(() => false));
  });

  // Owner, 8 Oct 2026: "images show nahi hori jo upload karo". The photo is
  // the item's, so it shows on every kism — and it must really reach storage.
  await step('a photo on the item reaches storage and shows on its kism', async () => {
    const pid = sql(`select id from products where name = '${tag}'`);
    if (!pid) throw new Error('no item from the step before');
    await go(page, `/admin/item?id=${pid}`, 6000);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      page.getByRole('button', { name: 'Gallery se' }).locator('visible=true').first().click(),
    ]);
    await chooser.setFiles('assets/images/icon.png');
    let path = '';
    for (let i = 0; i < 10 && !path; i++) {
      await page.waitForTimeout(2000);
      path = sql(`select storage_path from product_images where product_id = '${pid}' and variant_id is null limit 1`);
    }
    check('the item photo row reached the server', !!path, path);
    const size = num(`select coalesce((metadata->>'size')::int, 0) from storage.objects where bucket_id = 'item-photos' and name = '${path}'`);
    check('the photo file is in storage, not empty', size > 0, `${size} bytes`);
    await go(page, '/stock', 5000);
    await page.getByPlaceholder('SKU, barcode ya naam dhoondo').fill(tag);
    await page.waitForTimeout(3000);
    const shown = await page.locator(`img[src*="${path}"]`).locator('visible=true').count().catch(() => 0);
    check('the kism shows the item photo in the stock list', shown > 0);
  });

  // Owner, 7 Oct 2026: an item made once is not made again for another car.
  await step('the same item for another car is a new kism, not a new item', async () => {
    const pid = sql(`select id from products where name = '${tag}'`);
    if (!pid) throw new Error('no bulb item from the step before');
    await go(page, '/stock/add', 6000);
    await pickFrom(page, 'Kis supplier se aaya?', SUPPLIER.slice(0, 6), SUPPLIER);
    await stockItem(page, tag);
    check('the kism that exists is offered', await page.getByText(/^Creta 2019–2023 · H4.* · 7$/).locator('visible=true').first().isVisible().catch(() => false));
    await page.getByText('+ Nayi kism', { exact: true }).locator('visible=true').first().click();
    await socket(page, 'H4');
    await pickFrom(page, 'Creta, Swift, Nexon…', 'Swift', 'Maruti Suzuki Swift');
    await page.getByLabel('Saal se').locator('visible=true').first().fill('2018');
    await lastVisible(page, 'Kitne aaye').fill('2');
    await lastVisible(page, 'Bechne ka rate').fill('1099');
    await page.getByRole('button', { name: 'Line jodo' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /2 pcs chadha do/i }).click();
    await page.waitForTimeout(10000);
    check('still one item', num(`select count(*) from products where name = '${tag}'`) === 1);
    check('the item now has two kisms', num(`select count(*) from product_variants where product_id = '${pid}'`) === 2);
    check('the new kism fits its own car', num(`select count(*) from product_fitments pf join vehicle_models vm on vm.id = pf.model_id
                                                  where pf.product_id = '${pid}' and vm.name = 'Swift' and pf.variant_id is not null`) === 1);
    check('the first kism kept its car', num(`select count(*) from product_fitments pf join vehicle_models vm on vm.id = pf.model_id
                                                where pf.product_id = '${pid}' and vm.name = 'Creta'`) === 1);
    check('the new kism has its own rate', num(`select retail_price from product_variants where product_id = '${pid}' and variant_name like 'Swift%'`) === 1099);
  });

  await step('category, party list and kharcha settings', async () => {
    await go(page, '/admin/categories', 5000);
    check('categories list opens', await visible(page, 'Category banao', false) || await visible(page, '+ Category banao', false));
    const fam = sql(`select f.id from product_families f join spec_definitions d on d.family_id = f.id and d.code = 'socket' limit 1`);
    await go(page, `/admin/categories?id=${fam}`, 5000);
    check('a category shows its details', await visible(page, 'Socket / Base', false));
    await go(page, '/parties?tab=supplier', 5000);
    check('party list shows the suppliers', await visible(page, SUPPLIER));
    await go(page, '/admin/settings', 5000);
    check('kharcha types are set from settings', await visible(page, 'Kharche ke prakar', false));
  });

  await step('every new screen opens clean', async () => {
    for (const path of ['/khata', '/khata?tab=supplier', '/hisab', '/kharab', '/reports', '/partner-paisa', '/purchases', '/admin/users', '/help', '/stock', '/more', '/requests', '/parties', '/admin/categories']) {
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
