/**
 * Walk every main screen as a signed-in user and report what is broken.
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/flow-walk.mjs https://app.theautoloom.in
 *
 * Read-only: it opens screens and reads them. It never posts a bill, saves a
 * customer or approves anything, so it is safe against the live shop.
 *
 * It exists because bugs were arriving one screenshot at a time. A screen is
 * reported as broken if it throws, logs an error, shows a spinner that never
 * resolves, or renders nothing at all — the last two being how the
 * "Preparing draft…" failures presented, invisible to any check that only
 * looked for a crash.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'https://app.theautoloom.in';
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) {
  console.error('APP_EMAIL and APP_PASSWORD must be set');
  process.exit(2);
}

const SCREENS = [
  ['Home', '/'],
  ['Search', '/search'],
  ['Billing', '/sell'],
  ['Stock', '/stock'],
  ['More', '/more'],
  ['Admin', '/admin'],
  ['Requests', '/requests'],
  ['Staff', '/admin/users'],
  ['Activity', '/activity'],
  ['Kharcha', '/expenses'],
  ['Shop settings', '/admin/settings'],
  ['Maal aaya', '/stock/add'],
  ['New item', '/admin/item'],
  ['All items', '/admin/products'],
  ['CSV import', '/admin/import'],
  ['Customers', '/customers'],
  ['Suppliers', '/suppliers'],
  ['Reminders', '/reminders'],
  ['Reports', '/reports'],
  ['Sync', '/sync'],
  ['New bill', '/invoice/edit'],
  ['Receive purchase', '/purchase/edit'],
  ['Payment in', '/payment/edit?direction=in'],
  ['Job card', '/job-card/edit'],
  ['Stock adjustment', '/adjustment/edit'],
  ['Transfer', '/transfer/edit'],
  ['Low stock / reorder', '/reorder'],
  ['Purchases', '/purchases'],
  ['Payments', '/payments'],
  ['Job cards', '/job-cards'],
  ['Adjustments', '/adjustments'],
  ['Transfers', '/transfers'],
  ['Audits', '/audits'],
];

/** Words that mean the screen gave up or never arrived. */
const STUCK = /preparing|loading…|khul raha hai|ban raha hai/i;
const BROKEN = /nahi ban paaya|nahi mil|error|unable|failed|something went wrong/i;

const out = 'test/screens';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

let errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // Sync chatter is reported by the sync screen itself; it is not this
  // screen's fault and would mask the per-screen signal.
  if (/PowerSync|favicon/i.test(t)) return;
  errors.push(t.slice(0, 200));
});

console.log('▸ signing in');
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
console.log('▸ waiting for the first full sync');
await page.waitForTimeout(45000);

// Prove we are actually in. Without this the whole walk has a blind spot: a
// failed sign-in leaves every screen showing the login page, which is neither
// blank nor an error, so all of them would be reported as fine.
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  await page.screenshot({ path: `${out}/walk-signin-failed.png` });
  console.error('FAIL  sign-in did not go through — still on the login form');
  process.exit(1);
}

const bad = [];
for (const [name, path] of SCREENS) {
  errors = [];
  let text = '';
  try {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
    // Long enough for a draft to be created, synced and read back.
    await page.waitForTimeout(9000);
    text = (await page.locator('body').innerText()).trim();
  } catch (e) {
    bad.push([name, path, `navigation failed: ${String(e).slice(0, 120)}`]);
    continue;
  }

  const issues = [];
  if (text.length < 20) issues.push('screen is blank');
  if (/Har bill, khata aur stock is phone par/.test(text)) issues.push('bounced to the login screen');
  if (STUCK.test(text)) issues.push(`still loading: "${text.split('\n').find((l) => STUCK.test(l))?.trim()}"`);
  if (BROKEN.test(text)) issues.push(`error on screen: "${text.split('\n').find((l) => BROKEN.test(l))?.trim()}"`);
  if (errors.length) issues.push(`console: ${errors[0]}`);

  if (issues.length) {
    bad.push([name, path, issues.join(' | ')]);
    await page.screenshot({ path: `${out}/walk-${path.replace(/[^a-z0-9]+/gi, '-')}.png` });
    console.log(` FAIL  ${name.padEnd(20)} ${issues.join(' | ')}`);
  } else {
    console.log(`  ok   ${name.padEnd(20)} ${text.split('\n')[0].slice(0, 46)}`);
  }
}

console.log(`\n${SCREENS.length - bad.length}/${SCREENS.length} screens fine`);
if (bad.length) {
  console.log('\nBroken:');
  for (const [n, p, why] of bad) console.log(`  ${n}  (${p})\n      ${why}`);
}
await browser.close();
process.exit(bad.length ? 1 : 0);
