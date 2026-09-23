/**
 * The AutoLoom mark, generated rather than hand-drawn.
 *
 * A logo has to work at 240px and at 16px, and those two want opposite things:
 * detail at the top end, ruthless simplification at the bottom. Keeping the
 * geometry in code means a variant costs one line instead of a careful redraw,
 * so the shape can be tuned against the sizes it actually has to survive
 * rather than designed once at poster size and hoped for.
 *
 * Everything downstream — app icon, PWA icons, Android layers, favicon, the
 * splash — is built from this one function, so the assets cannot drift apart.
 */

const VB = 240;

const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const mix = (a, b, t) => '#' + [0, 1, 2].map((i) => hex(a[i] + (b[i] - a[i]) * t)).join('');

/** Geometry of the letter, upright; the lean is applied to the whole group. */
function letterPath({
  apexY = 24,
  baseY = 216,
  halfBase = 96,
  counterTopY = 98,
  counterBottomY = 172,
  counterHalf = 39,
  notchTopY = 193,
  notchHalfTop = null,
  counter = true,
} = {}) {
  const cx = VB / 2;
  const outer = `M ${cx} ${apexY} L ${cx + halfBase} ${baseY} L ${cx - halfBase} ${baseY} Z`;
  if (!counter) return outer;

  // The counter's edges, extended below the crossbar, give the inner edge of
  // each leg — so the notch lines up with the counter instead of guessing it.
  const slope = counterHalf / (counterBottomY - counterTopY);
  const halfAt = (y) => counterHalf + slope * (y - counterBottomY);
  const nb = halfAt(baseY);
  const nt = notchHalfTop ?? halfAt(notchTopY);

  const counterPath =
    `M ${cx} ${counterTopY} L ${cx + counterHalf} ${counterBottomY} L ${cx - counterHalf} ${counterBottomY} Z`;
  const notchPath =
    `M ${cx - nt.toFixed(2)} ${notchTopY} L ${cx + Number(nt.toFixed(2))} ${notchTopY} ` +
    `L ${cx + Number(nb.toFixed(2))} ${baseY} L ${cx - Number(nb.toFixed(2))} ${baseY} Z`;

  return `${outer} ${counterPath} ${notchPath}`;
}

/** Evenly spaced horizontal slots across a band. */
function louvreBars({ count = 3, from = 74, to = 182, ratio = 0.4 } = {}) {
  if (!count) return '';
  const pitch = (to - from) / count;
  const h = pitch * ratio;
  return Array.from({ length: count }, (_, i) => {
    const y = from + pitch * i + (pitch - h) / 2;
    return `<rect x="-30" y="${y.toFixed(2)}" width="300" height="${h.toFixed(2)}" fill="#000"/>`;
  }).join('\n      ');
}

/**
 * @param {number} lean    forward lean in degrees — what makes a static letter
 *                         read as motion. Every fast automotive wordmark leans.
 * @param {number} depth   extrusion steps. Metal has thickness and a drop
 *                         shadow does not, which is why this is stacked copies.
 * @param {string} id      prefix for every internal id, so several marks can
 *                         sit in one HTML document without their gradients and
 *                         masks resolving to each other's.
 * @param {string|null} mono  render as one flat colour (Android monochrome
 *                         icon, stamps, single-colour print).
 */
export function buildMark({
  lean = 11,
  depth = 11,
  louvres = { count: 3, from: 74, to: 182, ratio: 0.4 },
  letter = {},
  id = 'm',
  mono = null,
} = {}) {
  const d = letterPath(letter);
  const shift = (Math.tan((lean * Math.PI) / 180) * VB) / 2;
  const lean_ = `translate(${shift.toFixed(2)},0) skewX(-${lean})`;

  const defsLetter = `<path id="${id}L" fill-rule="evenodd" d="${d}"/>`;
  const defsMask = `<mask id="${id}V">
      <rect x="0" y="0" width="${VB}" height="${VB}" fill="#fff"/>
      ${louvreBars(louvres)}
    </mask>`;

  if (mono) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="AutoLoom">
  <defs>${defsLetter}${defsMask}</defs>
  <g mask="url(#${id}V)"><g transform="${lean_}">
    <use href="#${id}L" fill="${mono}"/>
  </g></g>
</svg>`;
  }

  // Extrusion: the body of the metal, stepping away from the light into a red
  // so dark it is nearly black. Furthest step is darkest.
  const near = [128, 14, 24];
  const far = [46, 4, 9];
  const extrude = Array.from({ length: depth }, (_, k) => {
    const i = depth - k;
    const c = mix(near, far, i / depth);
    return `<use href="#${id}L" fill="${c}" transform="translate(${i},${(i * 1.1).toFixed(1)})"/>`;
  }).join('\n        ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="AutoLoom">
  <defs>
    ${defsLetter}
    ${defsMask}
    <clipPath id="${id}C"><use href="#${id}L"/></clipPath>
    <linearGradient id="${id}F" x1="0.12" y1="0" x2="0.5" y2="1">
      <stop offset="0"    stop-color="#FF6168"/>
      <stop offset="0.22" stop-color="#F32B36"/>
      <stop offset="0.55" stop-color="#D2141E"/>
      <stop offset="0.82" stop-color="#A80D16"/>
      <stop offset="1"    stop-color="#7C060C"/>
    </linearGradient>
    <linearGradient id="${id}R" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0"    stop-color="#FFFFFF"/>
      <stop offset="0.18" stop-color="#E7ECF2"/>
      <stop offset="0.36" stop-color="#9BA4B0"/>
      <stop offset="0.52" stop-color="#FFFFFF"/>
      <stop offset="0.7"  stop-color="#AEB7C3"/>
      <stop offset="1"    stop-color="#79828E"/>
    </linearGradient>
    <linearGradient id="${id}G" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="0.6"  stop-color="#FFFFFF" stop-opacity="0.1"/>
      <stop offset="1"    stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g mask="url(#${id}V)">
    <g transform="${lean_}">
      <g>
        ${extrude}
      </g>
      <use href="#${id}L" fill="url(#${id}R)" transform="translate(-2.2,-2.6)"/>
      <use href="#${id}L" fill="url(#${id}F)"/>
      <g clip-path="url(#${id}C)">
        <rect x="0" y="${(letter.apexY ?? 24) - 4}" width="${VB}" height="92" fill="url(#${id}G)"/>
      </g>
    </g>
  </g>
</svg>`;
}
