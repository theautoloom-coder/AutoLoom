/**
 * Write every brand raster the app needs, from the one vector.
 *
 *   node scripts/brand-assets.mjs
 *
 * Icons are the classic place for a brand to rot: someone exports a PNG once,
 * the logo changes, and the Android icon keeps the old one for a year because
 * nobody remembers it exists. Generating all of them from brand/system.mjs
 * means "change the logo" is one edit and one command.
 *
 * Sizes are not arbitrary:
 *   · Android adaptive icons are 108dp with only the middle 72dp guaranteed
 *     visible — the launcher masks the rest to whatever shape the phone uses.
 *     So the foreground layer keeps the mark inside ~60% of the canvas.
 *   · A maskable PWA icon has the same problem with a different number: the
 *     safe area is the middle 80%.
 *   · Anything at or under 64px uses the shallow-relief mark, because eleven
 *     extrusion steps inside three pixels is just noise.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark, markSmall, markMono, buildLockup, buildBadge, INK } from '../../brand/system.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const images = path.join(root, 'app', 'assets', 'images');
const pub = path.join(root, 'app', 'public');
const out = path.join(root, 'brand', 'out');
for (const d of [images, pub, out]) fs.mkdirSync(d, { recursive: true });

const browser = await chromium.launch();

/**
 * @param inner  how much of the canvas the mark fills (0–1). This is the whole
 *               game for icons: too big and the launcher crops the legs off.
 */
async function icon(file, size, { bg = null, inner = 0.62, small = false, mono = null, id } = {}) {
  const px = Math.round(size * inner);
  const svg = mono ? markMono(mono, { id }) : (small || size <= 64 ? markSmall({ id }) : mark({ id }));
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${size}px;height:${size}px;
       background:${bg ?? 'transparent'};display:flex;align-items:center;justify-content:center">
     <div style="width:${px}px;height:${px}px">${svg}</div></body>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: file, omitBackground: !bg });
  await page.close();
  console.log(`  ${path.relative(root, file).replace(/\\/g, '/')}  ${size}px`);
}

async function flat(file, w, h, html, bg = 'transparent') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${bg}">
     <div style="width:${w}px;height:${h}px">${html}</div></body>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
  await page.close();
  console.log(`  ${path.relative(root, file).replace(/\\/g, '/')}  ${w}×${h}`);
}

// A slightly lifted field rather than flat ink: a phone home screen is busy,
// and a dead-flat square disappears against a dark wallpaper.
const FIELD = `radial-gradient(120% 100% at 50% 22%, #1B1F26 0%, ${INK} 62%, #06070A 100%)`;

console.log('▸ app + store icons');
await icon(path.join(images, 'icon.png'), 1024, { bg: FIELD, inner: 0.60, id: 'i1' });
await icon(path.join(images, 'android-icon-foreground.png'), 1024, { inner: 0.58, id: 'i2' });
await icon(path.join(images, 'android-icon-monochrome.png'), 1024, { inner: 0.58, mono: '#FFFFFF', id: 'i3' });
await icon(path.join(images, 'splash-icon.png'), 1024, { inner: 0.78, id: 'i4' });
await icon(path.join(images, 'favicon.png'), 64, { bg: INK, inner: 0.72, id: 'i5' });

// The adaptive background layer is a field, not a logo — the launcher may
// parallax it behind the foreground, so it must carry no detail of its own.
await flat(
  path.join(images, 'android-icon-background.png'), 1024, 1024,
  `<div style="width:1024px;height:1024px;background:${FIELD}"></div>`, INK,
);

console.log('▸ PWA / iOS home screen');
await icon(path.join(pub, 'pwa-192.png'), 192, { bg: FIELD, inner: 0.62, id: 'p1' });
await icon(path.join(pub, 'pwa-512.png'), 512, { bg: FIELD, inner: 0.62, id: 'p2' });
await icon(path.join(pub, 'pwa-maskable-512.png'), 512, { bg: FIELD, inner: 0.48, id: 'p3' });
await icon(path.join(pub, 'apple-touch-icon.png'), 180, { bg: FIELD, inner: 0.62, id: 'p4' });

console.log('▸ lockups');
await flat(path.join(images, 'brand-lockup.png'), 1200, 336, buildLockup({ on: 'ink', w: 1200 }));

console.log('▸ press kit');
await flat(path.join(out, 'badge.png'), 900, 900, buildBadge({ size: 900 }), INK);
await flat(path.join(out, 'badge-2048.png'), 2048, 2048, buildBadge({ size: 2048 }), INK);
await flat(path.join(out, 'lockup-ink.png'), 1200, 336, buildLockup({ on: 'ink', w: 1200 }));
await flat(path.join(out, 'lockup-light.png'), 1200, 336, buildLockup({ on: 'light', w: 1200 }));
await icon(path.join(out, 'mark-1024.png'), 1024, { inner: 0.86, id: 'k1' });

await browser.close();
console.log('✓ done');
