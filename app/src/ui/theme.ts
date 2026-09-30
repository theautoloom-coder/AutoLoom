/**
 * Visual language for AutoLoom — bold flat (Sept 2026 rebuild).
 *
 * The shop's own users said the app was hard to understand, so this pass is
 * about clarity before decoration: fewer surfaces, harder edges, one accent,
 * and numbers big enough to read across a counter.
 *
 * Structure borrowed from Linear's system — not its colour. What is taken is
 * the reasoning: surfaces are separated by a single hairline rather than by
 * blur, radii are small enough that a card reads as a panel and not a pill,
 * type tightens as it grows, and the accent appears only where something can
 * be pressed. AutoLoom keeps its own signal red on garage black, and its tap
 * targets are far larger than Linear's — this is a phone held in one hand by
 * somebody standing up, not a mouse on a desk.
 *
 * Three rules that decide most arguments:
 * - A border separates. A shadow only lifts something that genuinely floats
 *   (sheet, toast, the "+"). Nothing else gets a shadow.
 * - Red means "you can press this". Money that is late is amber, money that
 *   is settled is green; neither is ever red, or red stops meaning anything.
 * - Every figure is mono and tabular, so a column of rupees lines up and a
 *   changing number does not make the row jump.
 */
import { Platform } from 'react-native';

export const palette = {
  light: {
    // A colder, quieter ground so white panels read as paper on a desk.
    bg: '#F4F5F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F5F7',
    surfaceRaised: '#FFFFFF',
    // One border colour. Two was always a guess about which to use.
    border: '#E3E5EA',
    borderStrong: '#C9CCD4',
    keyline: '#0B0D10',
    text: '#0B0D10',
    textMuted: '#5A5E68',
    textFaint: '#8E929C',
    accent: '#D91E2E',
    accentStrong: '#B0151F',
    accentText: '#FFFFFF',
    accentSoft: '#FDECEE',
    navy: '#0B0D10',
    navyText: '#F7F8F9',
    ok: '#137A48',
    okSoft: '#E7F5EC',
    warn: '#9A6413',
    warnSoft: '#FBF0DC',
    danger: '#B3111A',
    dangerSoft: '#FCE8E9',
    info: '#1B4FA0',
    infoSoft: '#E6EDF9',
    overlay: 'rgba(11,13,16,0.50)',
  },
  dark: {
    bg: '#0A0B0D',
    surface: '#141518',
    surfaceAlt: '#1B1D21',
    surfaceRaised: '#1B1D21',
    border: '#26282D',
    borderStrong: '#3A3D44',
    keyline: '#F7F8F9',
    text: '#F7F8F9',
    textMuted: '#A3A7B0',
    textFaint: '#6B6F79',
    accent: '#FF4552',
    accentStrong: '#FF6B75',
    accentText: '#FFFFFF',
    accentSoft: '#2C1115',
    navy: '#141518',
    navyText: '#F7F8F9',
    ok: '#3ECB86',
    okSoft: '#0E2A1D',
    warn: '#E8A33D',
    warnSoft: '#31240F',
    danger: '#FF5C63',
    dangerSoft: '#341416',
    info: '#6CA4EE',
    infoSoft: '#122238',
    overlay: 'rgba(0,0,0,0.72)',
  },
} as const;

export type Palette = { readonly [K in keyof (typeof palette)['light']]: string };
export type ThemeColor = keyof Palette;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
/**
 * Small radii on purpose. At 13–22px every panel started to read as a pill and
 * the screen lost its grid; at 6–8px a card reads as a panel with a straight
 * edge, which is what makes a dense list look deliberate instead of soft.
 */
export const radius = { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 } as const;

/** Minimum tap heights. A counter phone is used standing up, often one-handed. */
export const tap = { sm: 36, md: 44, lg: 52 } as const;

/** Width of the red spine on an actionable row / active rail item. */
export const spine = 3;

/**
 * The accent set is for telling one kind of row from another at a glance — the
 * icon square in "Aur", the strip on a tile. It is deliberately muted: these
 * are marks, not fills, and the only loud colour in the app is the red that
 * means "press me".
 */
export const accents = {
  light: {
    blue: { fg: '#1B4FA0', bg: '#E8EEF8' },
    green: { fg: '#137A48', bg: '#E7F3EB' },
    amber: { fg: '#8F5E12', bg: '#F9F0DE' },
    violet: { fg: '#5B2FB5', bg: '#EDE9F8' },
    rose: { fg: '#A81238', bg: '#F9E8ED' },
    teal: { fg: '#0D6A63', bg: '#E2F0EF' },
  },
  dark: {
    blue: { fg: '#7FA8F0', bg: '#16233A' },
    green: { fg: '#55CE8A', bg: '#102D1F' },
    amber: { fg: '#E4A64C', bg: '#2F2411' },
    violet: { fg: '#A98CF0', bg: '#211A38' },
    rose: { fg: '#F07E95', bg: '#33161E' },
    teal: { fg: '#4FC9BF', bg: '#0E2927' },
  },
} as const;

export type AccentName = keyof (typeof accents)['light'];
const ACCENT_NAMES = ['blue', 'green', 'amber', 'violet', 'rose', 'teal'] as const;

/** Same word always gets the same colour, so a category keeps its identity everywhere. */
export function accentFor(key: string): AccentName {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENT_NAMES[h % ACCENT_NAMES.length];
}

/**
 * Elevation, and there is much less of it than there used to be.
 *
 * A border separates two surfaces; a shadow says one of them is floating above
 * the screen. Only three things in this app genuinely float — the sheet, the
 * toast and the "+" — so only those get one. Cards do not. Blur on a cheap LCD
 * in daylight reads as smudge, and twenty smudged cards is what made the old
 * screens feel soft instead of sharp.
 *
 * `key` stays for the one card per screen carrying the figure the screen was
 * opened for: a hard ink offset with no blur, which survives that LCD.
 */
export const shadow = {
  none: {},
  key: { shadowColor: '#0B0D10', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 },
  xs: {},
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 10 },
} as const;

/**
 * Family names as registered by `useAppFonts()` in `./fonts.ts` (native) and
 * by the Google Fonts stylesheet (web). Keep the two in step.
 */
export const fonts = Platform.select({
  web: {
    display: '"Bricolage Grotesque", system-ui, sans-serif',
    sans: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  default: {
    display: 'BricolageGrotesque_800ExtraBold',
    sans: 'IBMPlexSans_400Regular',
    mono: 'IBMPlexMono_500Medium',
  },
})!;

/** Weight-specific native families (web resolves weight from fontWeight). */
const sansMedium = Platform.OS === 'web' ? fonts.sans : 'IBMPlexSans_500Medium';
const sansBold = Platform.OS === 'web' ? fonts.sans : 'IBMPlexSans_600SemiBold';
const monoBold = Platform.OS === 'web' ? fonts.mono : 'IBMPlexMono_600SemiBold';

/**
 * The scale tightens as it grows. A 46px figure with normal tracking looks
 * loose and amateur; the same figure at -2.2 reads as engineered. Below 15px
 * tracking goes the other way, because small text needs air to stay legible on
 * a phone held at arm's length in a shop.
 *
 * Three weights do all the work: 400 to read, 600 to emphasise, 800 for the
 * display face. Anything else is a decision nobody can repeat.
 */
export const type = {
  /** Screen titles. One per screen, at the top, saying where you are. */
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -1.1 },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, fontWeight: '800' as const, letterSpacing: -0.55 },
  heading: { fontFamily: sansBold, fontSize: 15.5, lineHeight: 21, fontWeight: '600' as const, letterSpacing: -0.15 },
  body: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, fontWeight: '400' as const },
  small: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, fontWeight: '400' as const, letterSpacing: 0.05 },
  /** Section labels and column headers: mono, uppercase, wide. */
  label: { fontFamily: monoBold, fontSize: 10, lineHeight: 13, fontWeight: '600' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  /** Every rupee figure, quantity, SKU and doc number. */
  number: { fontFamily: monoBold, fontSize: 21, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.4, fontVariant: ['tabular-nums' as const] },
  /** The one figure per screen that is the reason the screen was opened. */
  hero: { fontFamily: fonts.display, fontSize: 50, lineHeight: 51, fontWeight: '800' as const, letterSpacing: -2.2, fontVariant: ['tabular-nums' as const] },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontWeight: '500' as const, fontVariant: ['tabular-nums' as const] },
  rowTitle: { fontFamily: sansMedium, fontSize: 14.5, lineHeight: 20, fontWeight: '600' as const, letterSpacing: -0.15 },
};

/** Breakpoint above which the web/desktop layout uses a left rail and wider content. */
export const WIDE = 900;
export const MAX_CONTENT = 1280;
