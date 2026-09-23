/**
 * What English is still visible on screen?
 *
 *   APP_EMAIL=... APP_PASSWORD=... node test/english-left.mjs http://127.0.0.1:8208
 *
 * Scanning the source misses whatever is built at runtime, and flags constants
 * that never reach a screen. This reads the rendered text of every page instead
 * and reports the English words actually in front of the shopkeeper.
 *
 * KEEP is the vocabulary a Noida shop says in English anyway — bill, stock,
 * rate, GST, SKU. Translating those would read as worse Hinglish, not better.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8208';

const SCREENS = [
  '/', '/search', '/sell', '/stock', '/more', '/admin', '/requests', '/activity',
  '/expenses', '/reports', '/reminders', '/customers', '/suppliers', '/purchases',
  '/payments', '/job-cards', '/adjustments', '/transfers', '/audits', '/reorder',
  '/sync', '/stock/add', '/admin/item', '/admin/products', '/admin/users',
  '/admin/settings', '/admin/masters', '/admin/vehicles', '/admin/families',
  '/admin/import', '/invoice/edit', '/purchase/edit', '/payment/edit',
  '/adjustment/edit', '/transfer/edit', '/job-card/edit',
];

// Words that stay English on purpose: trade vocabulary, statutory terms,
// units, and proper nouns.
const KEEP = new Set(`a about admin all and app apple autoloom bank batch bill bills brand
cash cgst chrome code counter csv customer customers damaged dealer delivery discount draft
email export fitting for gst gstin hsn id ifsc igst import in invoice item items job
label led location locations margin mat mats mm mrp no note number of offline ok on online
owner pack paid pan pcs pdf per phone pin pm am proof qr qty rate reset retail return returns
role sale sales scan screenshot seat sgst share shop sku stock sub subtotal supply supplier
suppliers sync tax taxable template total transport type unit units upi upload uploads
value van vs warehouse warranty whatsapp workshop www com http https new the to`.split(/\s+/));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByPlaceholder('you@shop.in').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByPlaceholder('you@shop.in').fill(process.env.APP_EMAIL);
await page.getByPlaceholder('••••••••').fill(process.env.APP_PASSWORD);
await page.getByRole('button', { name: 'Kholo' }).click();
await page.waitForTimeout(45000);
if (await page.getByPlaceholder('you@shop.in').isVisible().catch(() => false)) {
  console.error('sign-in failed');
  process.exit(1);
}

// A small English wordlist is hopeless; instead flag words that look English by
// shape — they end in the suffixes Hinglish almost never uses.
const ENGLISHY = /^(?:[a-z]+(?:tion|ment|ance|ence|ing|ed|ly|ness|able|ible|ity|ive|ous|ful|less)|the|this|that|with|from|your|you|they|their|have|has|does|not|cannot|only|every|each|which|when|where|what|who|how|why|choose|change|create|delete|remove|select|enter|type|show|hide|open|close|save|cancel|search|find|first|last|next|previous|before|after|until|while|still|already|yet|here|there|nothing|something|anything|everything|none|some|any|more|less|most|least|other|another|same|different|new|old)$/;

const seen = new Map();
for (const path of SCREENS) {
  try {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const text = await page.locator('body').innerText();
    for (const raw of text.split(/[^A-Za-z'’]+/)) {
      const w = raw.toLowerCase();
      if (w.length < 3 || KEEP.has(w)) continue;
      if (!ENGLISHY.test(w)) continue;
      if (!seen.has(w)) seen.set(w, new Set());
      seen.get(w).add(path);
    }
  } catch {
    console.log(`  (could not open ${path})`);
  }
}

const rows = [...seen.entries()].sort((a, b) => b[1].size - a[1].size);
console.log(`\n${rows.length} English-looking words still on screen:\n`);
for (const [w, where] of rows.slice(0, 60)) {
  console.log(`  ${w.padEnd(16)} ${[...where].slice(0, 4).join(' ')}${where.size > 4 ? ' …' : ''}`);
}
await browser.close();
