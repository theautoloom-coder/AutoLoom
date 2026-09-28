/**
 * Does an item photo actually make it to storage and back?
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/photo.mjs http://127.0.0.1:8208 <sku>
 *
 * The screen rendering is not the question — the flow walk covers that. This
 * one picks a file, waits for the upload, and then checks the image is really
 * being served from the bucket. A photo feature that looks fine and loses the
 * file is worse than no photo feature.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:8208';
const sku = process.argv[3] ?? 'LED-AFY-H4-60W';
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;
if (!email || !password) {
  console.error('APP_EMAIL and APP_PASSWORD must be set');
  process.exit(2);
}

// A tiny red PNG. Small enough to be instant, real enough to be a JPEG/PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR42u3QMQEAAAjDMMC/56ED' +
    'A1SS2mnSAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' +
    'AQEBAQEBAQEBAQEBAQEBAQEB7wZ0mAABxjvZSwAAAABJRU5ErkJggg==',
  'base64'
);
const tmp = path.join(process.env.TEMP || '/tmp', 'autoloom-test-photo.png');
fs.writeFileSync(tmp, PNG);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
let failed = false;
const step = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(email);
await page.getByPlaceholder('••••••••').fill(password);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000);
step(!(await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)), 'signed in');

// Find the item through the stock search, exactly as a person would.
await page.goto(`${base}/stock`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder(/SKU, barcode ya naam/i).fill(sku);
await page.waitForTimeout(2500);
const hit = page.getByText(sku, { exact: false }).first();
step(await hit.isVisible().catch(() => false), `found ${sku} in search`);
await hit.click();
await page.waitForTimeout(6000);

const btn = page.getByRole('button', { name: /Gallery se/i });
step(await btn.isVisible().catch(() => false), 'photo control is on the product page');

const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 20000 }), btn.click()]);
await chooser.setFiles(tmp);
console.log('  ▸ file chosen, waiting for the upload');
await page.waitForTimeout(12000);

// The proof: an <img> on the page now points at the bucket.
const src = await page.evaluate(() => {
  const img = [...document.querySelectorAll('img')].find((i) => /item-photos/.test(i.src || ''));
  return img?.src ?? null;
});
step(Boolean(src), `page shows an image from the bucket${src ? ` (${src.slice(0, 72)}…)` : ''}`);

if (src) {
  const res = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, { method: 'GET' });
      return { ok: r.ok, status: r.status, bytes: (await r.blob()).size };
    } catch (e) {
      return { ok: false, status: 0, bytes: 0, err: String(e) };
    }
  }, src);
  step(res.ok && res.bytes > 0, `the file really downloads (HTTP ${res.status}, ${res.bytes} bytes)`);
}

await page.screenshot({ path: 'test/screens/photo-done.png', fullPage: true });
await browser.close();
console.log(failed ? '\nSOMETHING FAILED' : '\nphoto upload works end to end');
process.exit(failed ? 1 : 0);
