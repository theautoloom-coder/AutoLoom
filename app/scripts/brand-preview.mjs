/**
 * Render the full identity to brand/out/ for review.
 *
 *   node scripts/brand-preview.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark, markSmall, buildLockup, buildBadge, INK } from '../../brand/system.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'brand', 'out');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

/** Rasterise an SVG string at an exact box, waiting for webfonts first. */
async function shot(svgText, w, h, file, bg = 'transparent') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${bg}">
     <div style="width:${w}px;height:${h}px">${svgText}</div></body>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, file), omitBackground: bg === 'transparent' });
  await page.close();
  console.log(`  ${file}`);
}

await shot(buildBadge({ size: 900 }), 900, 900, 'badge.png', INK);
await shot(buildLockup({ on: 'ink', w: 1200 }), 1200, 336, 'lockup-ink.png');
await shot(buildLockup({ on: 'light', w: 1200 }), 1200, 336, 'lockup-light.png');
await shot(
  `<div style="width:420px;height:420px;background:${INK};display:flex;align-items:center;justify-content:center">
     <div style="width:250px;height:250px">${mark({ id: 'ic' })}</div></div>`,
  420, 420, 'icon-large.png',
);
await shot(
  `<div style="width:96px;height:96px;background:${INK};display:flex;align-items:center;justify-content:center">
     <div style="width:66px;height:66px">${markSmall({ id: 'is' })}</div></div>`,
  96, 96, 'icon-small.png',
);

await browser.close();
console.log('✓ brand/out');
