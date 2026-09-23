/**
 * The AutoLoom identity, built from one mark.
 *
 * A brand is not a logo, it is a set of lockups that each do a different job,
 * all recognisably the same thing. Three exist here and the split matters:
 *
 *   · MARK    — the letter alone. App icon, favicon, avatar, anywhere it is
 *               under ~64px or already surrounded by the name.
 *   · LOCKUP  — mark + wordmark, horizontal. App header, website nav, the top
 *               of a bill, an email signature.
 *   · BADGE   — the full circular emblem. Shop board, WhatsApp display picture,
 *               visiting card, sticker, invoice letterhead.
 *
 * The badge is deliberately the only crowded one, because it is the only one
 * that is ever seen large and standing alone. Putting the badge on a phone home
 * screen is the mistake that makes a good identity look cheap: at 48px its ring,
 * its two text sizes and its strapline all collapse into a smudge. That is why
 * the mark exists separately rather than as "the logo, smaller".
 */
import { buildMark } from './mark.mjs';

/** The chosen mark: two thick louvres, 14° lean, open counter. */
export const MARK = {
  lean: 14,
  louvres: { count: 2, from: 92, to: 186, ratio: 0.34 },
  letter: { counterTopY: 88, counterBottomY: 176, counterHalf: 45, notchTopY: 196 },
};

/**
 * Small sizes get a shallower extrusion. The depth that reads as machined metal
 * at 200px reads as mud at 48px, because those eleven offset copies are landing
 * inside two or three pixels. Same shape, less relief — which is exactly what a
 * die-struck badge does when it is made smaller.
 */
export const mark = (o = {}) => buildMark({ ...MARK, ...o });
export const markSmall = (o = {}) => buildMark({ ...MARK, depth: 4, ...o });
export const markMono = (colour, o = {}) => buildMark({ ...MARK, mono: colour, ...o });

export const INK = '#0B0D10';
export const RED = '#D2141E';

const FONTS =
  '<style>@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Mono:wght@500;600&display=swap");</style>';

/**
 * Horizontal lockup. The wordmark stays upright while the mark leans: pairing a
 * raked mark with a raked wordmark is how a logo starts to look like a 1990s
 * car decal, and the one leaning element reads as intent rather than as a
 * filter applied to everything.
 */
export function buildLockup({ on = 'ink', w = 1200 } = {}) {
  const h = Math.round(w * 0.28);
  const dark = on === 'ink';
  const fg = dark ? '#FFFFFF' : INK;
  const sub = dark ? '#8A929C' : '#5C646E';
  const markPx = Math.round(h * 0.70);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  ${FONTS}
  <rect width="${w}" height="${h}" fill="${dark ? INK : '#FFFFFF'}"/>
  <g transform="translate(${Math.round(h * 0.16)}, ${Math.round((h - markPx) / 2)})">
    <svg width="${markPx}" height="${markPx}" viewBox="0 0 240 240">${strip(mark({ id: 'lk' }))}</svg>
  </g>
  <text x="${Math.round(h * 0.16) + markPx + Math.round(h * 0.13)}" y="${Math.round(h * 0.55)}"
        font-family="Bricolage Grotesque" font-weight="800" font-size="${Math.round(h * 0.42)}"
        fill="${fg}" letter-spacing="-${(h * 0.012).toFixed(1)}">AutoLoom</text>
  <text x="${Math.round(h * 0.16) + markPx + Math.round(h * 0.14)}" y="${Math.round(h * 0.78)}"
        font-family="IBM Plex Mono" font-weight="600" font-size="${Math.round(h * 0.125)}"
        fill="${sub}" letter-spacing="${(h * 0.05).toFixed(1)}">CAR ACCESSORIES</text>
</svg>`;
}

/**
 * The circular badge — the one the shop board and the WhatsApp picture want.
 *
 * Built as four bands down the circle rather than as a collage, so it stays
 * composed at any size it is printed. The reference the owner liked had eight
 * competing elements; this keeps the energy — chrome ring, red, depth, a hard
 * banner — and drops the gear, the wheels, the car silhouette and the four
 * service icons, none of which survive being cast in vinyl on a shutter.
 */
export function buildBadge({ size = 900, strapline = 'HAR GAADI KA MAAL' } = {}) {
  const c = size / 2;
  const r = c - size * 0.012;
  const markPx = Math.round(size * 0.325);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${FONTS}
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.2" stop-color="#C9D0D9"/>
      <stop offset="0.38" stop-color="#6E7783"/><stop offset="0.52" stop-color="#FFFFFF"/>
      <stop offset="0.7" stop-color="#8A929C"/><stop offset="0.88" stop-color="#EDF1F5"/>
      <stop offset="1" stop-color="#5A626D"/>
    </linearGradient>
    <radialGradient id="field" cx="0.5" cy="0.36" r="0.75">
      <stop offset="0" stop-color="#20242B"/><stop offset="0.62" stop-color="#101318"/>
      <stop offset="1" stop-color="#070809"/>
    </radialGradient>
    <linearGradient id="banner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F0323D"/><stop offset="1" stop-color="#A50D16"/>
    </linearGradient>
  </defs>

  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#ring)"/>
  <circle cx="${c}" cy="${c}" r="${r - size * 0.035}" fill="${RED}"/>
  <circle cx="${c}" cy="${c}" r="${r - size * 0.046}" fill="url(#field)"/>

  <g transform="translate(${c - markPx / 2}, ${size * 0.115})">
    <svg width="${markPx}" height="${markPx}" viewBox="0 0 240 240">${strip(mark({ id: 'bd' }))}</svg>
  </g>

  <text x="${c}" y="${size * 0.585}" text-anchor="middle"
        font-family="Bricolage Grotesque" font-weight="800" font-size="${size * 0.125}"
        fill="#FFFFFF" letter-spacing="-${(size * 0.002).toFixed(1)}">AutoLoom</text>

  <text x="${c}" y="${size * 0.645}" text-anchor="middle"
        font-family="IBM Plex Mono" font-weight="600" font-size="${size * 0.032}"
        fill="#9AA3AF" letter-spacing="${(size * 0.0125).toFixed(1)}">PREMIUM CAR ACCESSORIES</text>

  <g transform="translate(0, ${size * 0.678})">
    <path d="M ${size * 0.17} 0 L ${size * 0.83} 0 L ${size * 0.795} ${size * 0.082} L ${size * 0.205} ${size * 0.082} Z"
          fill="url(#banner)"/>
    <text x="${c}" y="${size * 0.059}" text-anchor="middle"
          font-family="Bricolage Grotesque" font-weight="800" font-size="${size * 0.054}"
          fill="#FFFFFF" letter-spacing="${(size * 0.006).toFixed(1)}">WHOLESALER</text>
  </g>

  <text x="${c}" y="${size * 0.845}" text-anchor="middle"
        font-family="IBM Plex Mono" font-weight="600" font-size="${size * 0.036}"
        fill="#E4E8ED" letter-spacing="${(size * 0.011).toFixed(1)}">${strapline}</text>

</svg>`;
}

/** Inline one generated SVG inside another: keep its guts, drop its wrapper. */
function strip(svgText) {
  return svgText.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
