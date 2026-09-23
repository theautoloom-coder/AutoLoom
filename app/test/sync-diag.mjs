/**
 * Sign in to the live app and capture why sync will not connect.
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/sync-diag.mjs https://app.theautoloom.in
 *
 * Read-only against the business data: it signs in, watches what the PowerSync
 * client does, and reads the Sync screen. It creates no bills, no customers and
 * no items. Credentials come from the environment so they never end up in a
 * file or a shell history.
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

const out = 'test/screens';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const console_ = [];
const netFail = [];
const powersync = [];

page.on('console', (m) => console_.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console_.push(`[pageerror] ${String(e)}`));
page.on('requestfailed', (r) => netFail.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('powersync') || u.includes('/auth/v1/token')) {
    let body = '';
    if (r.status() >= 400) body = (await r.text().catch(() => '')).slice(0, 400);
    powersync.push(`${r.status()} ${r.request().method()} ${u.replace(/\?.*/, '')}${body ? '\n        ' + body : ''}`);
  }
});

console.log('▸ opening', base);
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });

// Past the splash.
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);

console.log('▸ signing in');
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();

// Give the session, the connector and the first sync attempt time to happen.
await page.waitForTimeout(20000);
await page.screenshot({ path: `${out}/diag-home.png` });

console.log('▸ reading the sync screen');
await page.goto(`${base}/sync`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${out}/diag-sync.png`, fullPage: false });

const syncText = await page.locator('body').innerText().catch(() => '');

console.log('\n================ SYNC SCREEN ================');
console.log(syncText.slice(0, 1200));

console.log('\n================ POWERSYNC / AUTH TRAFFIC ================');
console.log(powersync.length ? powersync.slice(0, 25).join('\n') : '  (no requests to powersync at all — the client never tried)');

console.log('\n================ FAILED REQUESTS ================');
console.log(netFail.length ? netFail.slice(0, 15).join('\n') : '  none');

console.log('\n================ CONSOLE ================');
const interesting = console_.filter((l) =>
  /error|sync|powersync|token|jwt|401|403|fail|refus/i.test(l));
console.log((interesting.length ? interesting : console_).slice(0, 40).join('\n') || '  (silent)');

await browser.close();
