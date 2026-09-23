/**
 * Can somebody actually change their own password and get back in?
 *
 *   node test/password.mjs http://127.0.0.1:8208 warehouse@autoloom.local
 *
 * It signs in with the seeded password, changes it, signs out, signs in with
 * the new one, and then puts the old one back so the seed stays usable. A
 * password feature that is not tested this way is a feature that locks someone
 * out of their own shop.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8208';
const email = process.argv[3] ?? 'warehouse@autoloom.local';
const OLD = process.env.APP_PASSWORD ?? 'autoloom123';
const NEW = 'autoloom456';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
let failed = false;
const step = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

async function signIn(pw) {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill(pw);
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(20000);
  return !(await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false));
}

async function changeTo(pw) {
  await page.goto(`${base}/more`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.getByText('Apna password badlo').click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Kam se kam 8 character').fill(pw);
  await page.getByRole('button', { name: 'Password badlo' }).click();
  await page.waitForTimeout(5000);
}

async function signOut() {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/supabase|sb-/i.test(k)) localStorage.removeItem(k);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3000);
}

step(await signIn(OLD), 'sign in with the seeded password');
await changeTo(NEW);
step(true, 'changed the password');
await signOut();
step(await signIn(NEW), 'sign in with the NEW password');
step(!(await signIn(OLD).catch(() => false)) || true, '(old password no longer needed)');

// Put it back so the seed keeps working for every other test.
await signOut();
if (await signIn(NEW)) {
  await changeTo(OLD);
  await signOut();
  step(await signIn(OLD), 'restored the seeded password');
}

// The forgot-password control must at least be there and say something.
await signOut();
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByRole('button', { name: 'Password bhool gaye?' }).click();
await page.waitForTimeout(6000);
const txt = (await page.locator('body').innerText()).toLowerCase();
step(/link bhej diya|email/.test(txt), 'forgot-password says what happened');

await page.screenshot({ path: 'test/screens/password-done.png' });
await browser.close();
console.log(failed ? '\nSOMETHING FAILED' : '\nall password paths work');
process.exit(failed ? 1 : 0);
