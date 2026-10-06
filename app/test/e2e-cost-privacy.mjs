/**
 * Buy rates, munafa and loss are the owner's (owner's call, 6 Oct 2026).
 *
 *   node test/e2e-cost-privacy.mjs http://127.0.0.1:8222
 *
 * Signs in as staff and walks the screens that carry money, checking that no
 * cost, margin or profit figure is on them — then as the owner, checking the
 * same figures are there, so a check that passes because a screen broke does
 * not pass for long.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8222';
if (!/127\.0\.0\.1|localhost/.test(base)) { console.error('✗ local stack only'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// What would give a cost or a profit away on each screen.
const SCREENS = [
  ['/', /Aaj ka munafa|Total stock|godown ki keemat/i],
  // The figure labels, not the sentence that explains Hisab is the owner's.
  ['/hisab', /Maal Ki Cost|Maal par munafa|MUNAFA|Kharab \/ Loss/],
  ['/stock', /Kharid ₹/],
  ['/warehouse', /₹/],
];

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('you@shop.in').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByPlaceholder('you@shop.in').fill(email);
  await page.getByPlaceholder('••••••••').fill('autoloom123');
  await page.getByRole('button', { name: 'Kholo' }).click();
  await page.waitForTimeout(38000);
  return { ctx, page };
}

async function text(page, path) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  return page.locator('body').innerText();
}

const browser = await chromium.launch();

for (const email of ['accounts@autoloom.local', 'sales@autoloom.local', 'warehouse@autoloom.local']) {
  console.log(`\n▸ ${email} must not see cost or profit`);
  const { ctx, page } = await signIn(email);
  for (const [path, leak] of SCREENS) {
    const t = await text(page, path);
    const hit = t.match(leak);
    check(`${path} hides cost/profit`, !hit, hit ? `found "${hit[0]}"` : '');
  }
  // A bill being made: the cost and margin panel.
  if (email === 'sales@autoloom.local') {
    await page.goto(base + '/invoice/edit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.getByPlaceholder('Scan karo ya SKU / naam likho').fill('H4');
    await page.waitForTimeout(2500);
    const pickerText = await page.locator('body').innerText();
    check('item search hides the buy rate', !/lagat ₹/.test(pickerText));
    await page.getByText(/X-tremeVision/i).first().click();
    await page.waitForTimeout(2500);
    const t = await page.locator('body').innerText();
    check('bill hides "Maal ki cost" and munafa', !/Maal ki cost|IS BILL PAR MUNAFA|margin ₹/i.test(t));
    await page.getByRole('button', { name: 'Chhod do' }).click().catch(() => {});
    await page.getByRole('button', { name: /Aage badho/ }).click().catch(() => {});
  }
  await ctx.close();
}

console.log('\n▸ owner still sees them');
{
  const { ctx, page } = await signIn('owner@autoloom.local');
  const home = await text(page, '/');
  check('owner sees munafa on Home', /Aaj ka munafa/i.test(home));
  const hisab = await text(page, '/hisab');
  check('owner sees Maal Ki Cost on Hisab', /Maal Ki Cost/.test(hisab));
  const stock = await text(page, '/stock');
  check('owner sees buy rates on Stock', /Kharid ₹/.test(stock));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('\nFAILED:'); failed.forEach((f) => console.log(`  ${f.name}${f.detail ? ' — ' + f.detail : ''}`)); }
process.exit(failed.length ? 1 : 0);
