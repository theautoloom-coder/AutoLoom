/**
 * Render mark variants side by side at the sizes they have to survive.
 *
 *   node scripts/brand-variants.mjs
 *
 * The point of this sheet is the right-hand columns, not the left. Anything
 * looks good at 240px; the mark is chosen on what is still legible at 48 and
 * 32, because that is a home screen and a browser tab, which is where people
 * actually meet a logo most often.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMark } from '../../brand/mark.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'brand', 'out');
fs.mkdirSync(out, { recursive: true });

const VARIANTS = [
  {
    key: 'A',
    note: '4 louvres · lean 11° — the baseline',
    opts: { id: 'a', lean: 11, louvres: { count: 4, from: 72, to: 184, ratio: 0.38 } },
  },
  {
    key: 'B',
    note: '3 louvres · lean 12°',
    opts: { id: 'b', lean: 12, louvres: { count: 3, from: 78, to: 182, ratio: 0.36 } },
  },
  {
    key: 'C',
    note: '2 thick louvres · lean 14° · open counter',
    opts: {
      id: 'c',
      lean: 14,
      louvres: { count: 2, from: 92, to: 186, ratio: 0.34 },
      letter: { counterTopY: 88, counterBottomY: 176, counterHalf: 45, notchTopY: 196 },
    },
  },
  {
    key: 'D',
    note: 'chevron, no counter · 3 louvres · lean 14°',
    opts: {
      id: 'd',
      lean: 14,
      louvres: { count: 3, from: 84, to: 190, ratio: 0.4 },
      letter: { counter: false, apexY: 28, halfBase: 92 },
    },
  },
];

const SIZES = [200, 96, 64, 48, 32, 20];

const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');

const rows = VARIANTS.map((v) => {
  const src = uri(buildMark(v.opts));
  const cells = SIZES.map(
    (s) => `<td><div class="c"><img src="${src}" width="${s}" height="${s}" alt=""></div></td>`,
  ).join('');
  return `<tr><td class="k"><b>${v.key}</b><span>${v.note}</span></td>${cells}</tr>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#0B0D10;color:#6F7883;font:12px/1.45 ui-monospace,monospace;padding:30px;width:1060px}
  table{border-collapse:collapse}
  th{color:#9AA3AF;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;padding:0 0 14px}
  td{padding:10px 8px;vertical-align:middle;text-align:center}
  td.k{text-align:left;width:230px;padding-right:18px}
  td.k b{color:#fff;font-size:15px;display:block;margin-bottom:3px}
  td.k span{color:#6F7883}
  .c{display:inline-flex;align-items:center;justify-content:center;background:#15181D;border-radius:12px;padding:10px}
  tr+tr td{border-top:1px solid #1C2026}
  img{display:block}
</style></head><body>
  <table>
    <tr><th></th>${SIZES.map((s) => `<th>${s}px</th>`).join('')}</tr>
    ${rows}
  </table>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
await page.setContent(html, { waitUntil: 'load' });
const h = await page.evaluate(() => document.documentElement.scrollHeight);
await page.setViewportSize({ width: 1120, height: h + 30 });
await page.screenshot({ path: path.join(out, 'sheet-variants.png') });
await browser.close();
console.log('✓ brand/out/sheet-variants.png');
