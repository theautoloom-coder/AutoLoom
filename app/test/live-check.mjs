/**
 * Boot check against the LIVE production site. Read-only on purpose: it never
 * signs in, so it creates nothing in the real database. It only answers "does
 * the app actually start in a browser", which serving the right files does not
 * prove on its own.
 *
 *   node boot-check.mjs https://app.theautoloom.in
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'https://app.theautoloom.in';
const out = process.argv[3] ?? '.';
fs.mkdirSync(out, { recursive: true });

const fail = [];
const note = (ok, label, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail.push(label);
};

for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['iphone', devices['iPhone 13']],
]) {
  console.log(`\n=== ${name} ===`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failedReq = [];
  page.on('requestfailed', (r) => failedReq.push(`${r.url()} ${r.failure()?.errorText}`));

  const resp = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  note(resp?.status() === 200, 'page loads', `HTTP ${resp?.status()}`);

  // The splash animates for a couple of seconds before the login screen shows.
  let booted = false;
  try {
    await page.getByRole('button', { name: 'Kholo' }).waitFor({ state: 'visible', timeout: 45000 });
    booted = true;
  } catch { /* reported below */ }
  note(booted, 'app boots to the login screen');

  if (!booted) {
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 300);
    console.log(`        visible text was: ${JSON.stringify(body)}`);
  }

  // The login button becomes visible in the DOM while the splash is still
  // painted over it, so "button is visible" does not mean the screen is usable.
  // The splash dismisses on a fixed timer (its animation callback is unreliable
  // on web), so wait past it and prove the form actually takes input. Do NOT
  // detect the splash by its "DRIVE BETTER" tagline — the login screen carries
  // the same words, which made an earlier version of this check pass on a
  // screen that was still covered.
  await page.waitForTimeout(4000);
  let usable = false;
  try {
    const email = page.getByPlaceholder('you@shop.in');
    await email.waitFor({ state: 'visible', timeout: 15000 });
    await email.click({ timeout: 10000 });
    await email.fill('probe@example.com');
    usable = (await email.inputValue()) === 'probe@example.com';
    await email.fill('');
  } catch (e) { console.log(`        ${String(e).slice(0, 120)}`); }
  note(usable, 'splash clears, login form accepts input');

  // The font gotcha: web injects the Google Fonts link at runtime because
  // +html.tsx is ignored under web.output "single". If that regressed the page
  // silently renders system fallbacks while the CSS still names the family.
  // Await fonts.ready first: check() reports the state right now and does not
  // itself trigger a load, so asking too early reports a false failure.
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    return {
      check: document.fonts.check('800 16px "Bricolage Grotesque"'),
      families: [...new Set(loaded)],
    };
  }).catch(() => ({ check: false, families: [] }));
  note(font.check, 'display font actually loaded', font.families.join(', '));

  // PWA wiring, injected at runtime by src/lib/pwa.ts.
  const pwa = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
    appleIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
    standalone: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content') ?? null,
    sw: !!navigator.serviceWorker,
  }));
  note(!!pwa.manifest, 'manifest link injected', pwa.manifest ?? '');
  note(pwa.appleIcon, 'apple-touch-icon injected');
  note(pwa.standalone === 'yes', 'apple-mobile-web-app-capable', String(pwa.standalone));

  const swReady = await page.evaluate(() =>
    navigator.serviceWorker?.getRegistrations?.().then((r) => r.length > 0).catch(() => false)
  ).catch(() => false);
  note(swReady, 'service worker registered');

  note(errors.length === 0, 'no console/page errors', errors.slice(0, 4).join(' | '));
  const realFails = failedReq.filter((u) => !u.includes('favicon'));
  note(realFails.length === 0, 'no failed requests', realFails.slice(0, 3).join(' | '));

  await page.screenshot({ path: `${out}/live-${name}.png`, fullPage: false });
  await browser.close();
}

console.log(fail.length ? `\n✗ ${fail.length} check(s) failed: ${fail.join(', ')}` : '\n✓ all checks passed');
process.exit(fail.length ? 1 : 0);
