/**
 * The whole approval loop, end to end, against the live site.
 *
 *   OWNER_EMAIL=... OWNER_PASSWORD=... node test/e2e-staff.mjs https://app.theautoloom.in
 *
 * Owner creates a staff login → staff proposes an item → owner rejects it with
 * a reason → staff corrects and resubmits → owner approves → the item is in the
 * catalogue. It also checks the staff member cannot see or reach the owner's
 * screens, which is the half of the feature that is easy to get wrong and
 * impossible to notice.
 *
 * This WRITES REAL DATA: an auth user, a profile, a change request and a
 * product. Everything it makes is named so it can be found and removed.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'https://app.theautoloom.in';
const OWNER = process.env.OWNER_EMAIL;
const OWNER_PW = process.env.OWNER_PASSWORD;
if (!OWNER || !OWNER_PW) { console.error('OWNER_EMAIL / OWNER_PASSWORD required'); process.exit(2); }

const stamp = Date.now().toString().slice(-6);
const STAFF_NAME = `ZZ Test Salesman ${stamp}`;
const STAFF_EMAIL = `zz.test.staff.${stamp}@theautoloom.in`;
const STAFF_PW = `Test-${stamp}-pw`;
const ITEM_NAME = `ZZ Test Mat ${stamp}`;

const out = 'test/screens';
fs.mkdirSync(out, { recursive: true });

const results = [];
const step = (ok, name, detail = '') => {
  results.push({ ok, name, detail });
  console.log(`${ok ? '  PASS ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });

const body = () => page.locator('body').innerText();
const SYNC_WAIT = 30000;

async function signIn(email, pw, who) {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill(pw);
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(SYNC_WAIT);
  const t = await body();
  const ok = !t.includes('you@shop.in');
  step(ok, `${who} sign in`, ok ? email : 'still on the login screen');
  return ok;
}

async function signOut() {
  await page.goto(`${base}/more`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const btn = page.getByRole('button', { name: /sign out/i }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(6000); }
  await ctx.clearCookies();
  // The local database is per-origin; clearing it makes the next sign-in a
  // genuine first sync rather than a read of the previous user's cache.
  await page.evaluate(async () => {
    try {
      localStorage.clear(); sessionStorage.clear();
      const dbs = await indexedDB.databases?.() ?? [];
      await Promise.all(dbs.map((d) => d.name && indexedDB.deleteDatabase(d.name)));
    } catch { /* private mode */ }
  }).catch(() => {});
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------- 1. owner
console.log('\n=== 1. Owner banata hai staff ===');
if (!(await signIn(OWNER, OWNER_PW, 'Owner'))) { await browser.close(); process.exit(1); }

await page.goto(`${base}/admin/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const addBtn = page.getByRole('button', { name: '+ Naya staff' });
if (!(await addBtn.count())) {
  step(false, 'staff form reachable', '"+ Naya staff" button missing');
} else {
  await addBtn.click();
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('Ramesh Kumar').fill(STAFF_NAME);
  await page.getByPlaceholder('ramesh@shop.in').fill(STAFF_EMAIL);
  // The staff password field has no placeholder; it is found by its label.
  await page.getByLabel('Password').first().fill(STAFF_PW);
  await page.getByRole('button', { name: 'Staff banao' }).click();
  await page.waitForTimeout(12000);
  const t = await body();
  const made = t.includes(STAFF_NAME);
  step(made, 'staff login banaya', made ? STAFF_EMAIL : t.slice(0, 200));
  await page.screenshot({ path: `${out}/e2e-1-staff-made.png` });
}

// ---------------------------------------------------------------- 2. staff
console.log('\n=== 2. Staff login karke item bhejta hai ===');
await signOut();
if (await signIn(STAFF_EMAIL, STAFF_PW, 'Staff')) {
  const nav = await body();
  step(!nav.includes('OWNER'), 'staff ko OWNER section nahi dikhta',
    nav.includes('OWNER') ? 'sidebar shows the owner group' : 'hidden, as it should be');

  await page.goto(`${base}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const staffScreen = await body();
  const blocked = !staffScreen.includes('+ Naya staff');
  step(blocked, 'staff staff-list se blocked hai', blocked ? 'no create button' : 'CAN CREATE STAFF — hole');

  await page.goto(`${base}/admin/item`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const itemScreen = await body();
  const canPropose = !itemScreen.includes('Sirf admin');
  step(canPropose, 'staff item form khol sakta hai', canPropose ? '' : 'dead end for staff');

  if (canPropose) {
    // Category is a create-as-you-type select; the item needs one.
    // Category is a dropdown, not a text box: open it, type in its filter, then
    // take the "+ Add" option. The shop has no categories yet, and a staff
    // member cannot create one — the name rides along with the proposal.
    const CAT = `ZZ Test Cat ${stamp}`;
    await page.getByText('Mats / LED / Side stepper…').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Type to filter').fill(CAT);
    await page.waitForTimeout(1200);
    const addOpt = page.getByText(/^\+ Add/).first();
    if (await addOpt.count()) { await addOpt.click(); await page.waitForTimeout(2500); }
    else { await page.getByRole('button', { name: 'Close' }).click(); }
    const catNoted = (await body()).includes(CAT);
    step(catNoted, 'nayi category proposal mein darj hui', catNoted ? CAT : 'category not recorded');

    await page.getByPlaceholder('7D Luxury Mat').fill(ITEM_NAME);
    await page.getByPlaceholder('1550').fill('2400');
    await page.getByPlaceholder('10').fill('5');
    const send = page.getByRole('button', { name: /Admin ko bhejo|Dobara bhejo|Save item/i }).first();
    const label = (await send.textContent().catch(() => '')) ?? '';
    step(/bhejo/i.test(label), 'staff ko "Admin ko bhejo" milta hai, "Save item" nahi', `button: "${label.trim()}"`);
    await send.click();
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${out}/e2e-2-submitted.png` });

    await page.goto(`${base}/requests`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const q = await body();
    step(q.includes(ITEM_NAME), 'request queue mein dikh rahi hai', q.includes(ITEM_NAME) ? '' : q.slice(0, 160));
  }
}

// ------------------------------------------------------- 3. owner rejects
console.log('\n=== 3. Owner reject karta hai wajah ke saath ===');
await signOut();
if (await signIn(OWNER, OWNER_PW, 'Owner')) {
  await page.goto(`${base}/requests`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const q = await body();
  step(q.includes(ITEM_NAME), 'owner ko staff ki request dikhti hai', q.includes(ITEM_NAME) ? '' : q.slice(0, 200));
  await page.screenshot({ path: `${out}/e2e-3-queue.png` });

  if (q.includes(ITEM_NAME)) {
    await page.getByText(ITEM_NAME, { exact: false }).first().click();
    await page.waitForTimeout(6000);
    const reason = page.getByPlaceholder(/Rate zyada hai/i);
    if (await reason.count()) {
      await reason.fill('Kharid rate likho, warna margin pata nahi chalega');
      await page.getByRole('button', { name: 'Wapas bhejo' }).click();
      await page.waitForTimeout(10000);
      const after = await body();
      step(!after.includes('Wapas bhejo'), 'reject ho gaya', '');
    } else {
      step(false, 'reject form mila', 'no reason field on the review screen');
    }
  }
}

// -------------------------------------------- 4. staff fixes and resubmits
console.log('\n=== 4. Staff theek karke dobara bhejta hai ===');
await signOut();
if (await signIn(STAFF_EMAIL, STAFF_PW, 'Staff')) {
  await page.goto(`${base}/requests`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const t = await body();
  const sawReason = t.includes('Kharid rate likho');
  step(sawReason, 'staff ko rejection ki wajah dikhi', sawReason ? '' : t.slice(0, 200));
  await page.screenshot({ path: `${out}/e2e-4-rejected.png` });

  const fix = page.getByRole('button', { name: /Theek karke/i }).first();
  if (await fix.count()) {
    await fix.click();
    await page.waitForTimeout(8000);
    const prefilled = (await page.getByPlaceholder('7D Luxury Mat').inputValue().catch(() => '')) === ITEM_NAME;
    step(prefilled, 'form pehle wale data se bhara hua hai', prefilled ? '' : 'fields came back empty');
    await page.getByPlaceholder('1200').fill('1800');
    await page.getByRole('button', { name: /bhej/i }).first().click();
    await page.waitForTimeout(12000);
    step(true, 'dobara bhej diya');
  } else {
    step(false, '"Theek karke dobara bhejo" button mila');
  }
}

// ------------------------------------------------------- 5. owner approves
console.log('\n=== 5. Owner approve karta hai ===');
await signOut();
if (await signIn(OWNER, OWNER_PW, 'Owner')) {
  await page.goto(`${base}/requests`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const q = await body();
  const back = q.includes(ITEM_NAME);
  step(back, 'dobari bheji request queue mein aayi', back ? '' : q.slice(0, 200));

  if (back) {
    await page.getByText(ITEM_NAME, { exact: false }).first().click();
    await page.waitForTimeout(6000);
    const twice = (await body()).includes('2 baar');
    step(twice, 'revision count 2 dikh raha hai');
    page.once('dialog', (d) => d.accept());
    const ok = page.getByRole('button', { name: /Approve karo/i });
    if (await ok.count()) {
      await ok.click();
      await page.waitForTimeout(3000);
      const cont = page.getByRole('button', { name: 'Continue' });
      if (await cont.count()) { await cont.click(); }
      await page.waitForTimeout(14000);
      step(true, 'approve daba diya');
    } else {
      step(false, 'approve button mila');
    }
  }

  // The only question that matters: did the item actually get made?
  await page.goto(`${base}/admin/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const cat = await body();
  step(cat.includes(ITEM_NAME), 'item CATALOGUE mein aa gaya', cat.includes(ITEM_NAME) ? '' : cat.slice(0, 200));
  await page.screenshot({ path: `${out}/e2e-5-catalogue.png` });
}

console.log('\n================ RESULT ================');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('\nFailed:'); failed.forEach((f) => console.log(`  · ${f.name} — ${f.detail}`)); }
if (consoleErrors.length) { console.log(`\nConsole errors (${consoleErrors.length}):`); [...new Set(consoleErrors)].slice(0, 6).forEach((e) => console.log('  ' + e)); }
console.log(`\nBanaya gaya: staff ${STAFF_EMAIL} · item "${ITEM_NAME}"`);
await browser.close();
process.exit(failed.length ? 1 : 0);
