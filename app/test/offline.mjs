/**
 * The promise: signal ho ya na ho, app chalta hai.
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/offline.mjs http://127.0.0.1:8222
 *
 * This is the one thing AutoLoom is sold on and, until this file, the one
 * thing never tested. Everything else in test/ runs with a working network.
 *
 * So: sign in, cut the network, do a real job, prove the app still worked with
 * nothing behind it, put the network back, and then go and look in Postgres.
 * The last step is the whole point — an entry that survives only in the phone's
 * own SQLite is not saved, it is lost with the phone.
 *
 * Local stack only. It writes real rows.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'http://127.0.0.1:8222';
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) { console.error('APP_EMAIL and APP_PASSWORD must be set'); process.exit(2); }
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

/** A marker only this run could have written. */
const tag = `OFFLINE-${Date.now().toString().slice(-6)}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
const page = await ctx.newPage();

console.log('\n▸ sign in (online)');
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
check('signed in and first sync done', true);
await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

const before = num("select count(*) from expenses");

// Open the screen while there is still a network, the way a shopkeeper who was
// already using the app would have it open when the signal drops. Everything
// after this line is the interesting part.
await page.goto(base + '/expenses', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const formOnline = await page.getByPlaceholder('0').first().isVisible().catch(() => false);

console.log('\n▸ network off');
await ctx.setOffline(true);
await page.waitForTimeout(2500);

const formOffline = await page.getByPlaceholder('0').first().isVisible().catch(() => false);
check('the form is still usable with no network', formOnline && formOffline);

await page.getByPlaceholder('0').first().fill('4242');
await page.getByText('Transport', { exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByPlaceholder('Naam likho ya neeche se chuno').fill(tag);
await page.getByRole('button', { name: /likh do/i }).click();
await page.waitForTimeout(5000);

const onScreen = await page.getByText(tag).first().isVisible().catch(() => false);
check('entry is on screen while still offline', onScreen);
check('nothing reached the server yet (it cannot have)',
  num(`select count(*) from expenses where paid_by = '${tag}'`) === 0);

console.log('\n▸ network back');
await ctx.setOffline(false);
// PowerSync reconnects and drains its queue; give it room, then poll rather
// than guess, because a fixed wait that is slightly too short reads as a
// failure and a fixed wait that is far too long hides a slow one.
let landed = 0;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(5000);
  landed = num(`select count(*) from expenses where paid_by = '${tag}'`);
  if (landed > 0) { console.log(`  (reached Postgres after about ${(i + 1) * 5}s)`); break; }
}
check('the offline entry reached Postgres', landed === 1, `${landed} row(s)`);
check('and it is the right one',
  sql(`select amount from expenses where paid_by = '${tag}'`).startsWith('4242'),
  sql(`select coalesce(amount::text,'-') from expenses where paid_by = '${tag}'`));
check('exactly one row, not a duplicate from a retry',
  num("select count(*) from expenses") === before + 1, `${before} → ${num('select count(*) from expenses')}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('\nFAILED:'); failed.forEach((f) => console.log(`  ${f.name}${f.detail ? ' — ' + f.detail : ''}`)); }
await browser.close();
process.exit(failed.length ? 1 : 0);
