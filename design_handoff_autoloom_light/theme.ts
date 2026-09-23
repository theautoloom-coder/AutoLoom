/**
 * Visual language for AutoLoom — light evolution (Sept 2026 design pass).
 *
 * Drop-in replacement for `app/src/ui/theme.ts`. Every key the app already
 * imports is still here; the additions are `keyline`, `shadow.key` and
 * `fontFamily` on the type scale.
 *
 * Direction:
 * - Light grey ground (#EDEEF1), white paper cards, hairline borders.
 * - ONE keyline card per screen: 1.5px ink border + hard 3px offset shadow,
 *   no blur. It carries the number the user opened the screen for.
 * - Red is action + spine only. Status money is amber (late) / green (paid),
 *   never red, so red always means "tap me".
 * - Titles: Bricolage Grotesque. Body: IBM Plex Sans. Money/SKU/labels:
 *   IBM Plex Mono, tabular.
 */
import { Platform } from 'react-native';

export const palette = {
  light: {
    bg: '#EDEEF1',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F7F9',
    surfaceRaised: '#FFFFFF',
    border: '#DEE0E6',
    borderStrong: '#CBCCD4',
    keyline: '#0B0D10',
    text: '#12151A',
    textMuted: '#5B5E68',
    textFaint: '#8D8F99',
    accent: '#D91E2E',
    accentStrong: '#AE1120',
    accentText: '#FFFFFF',
    accentSoft: '#FBE4E4',
    navy: '#0B0D10',
    navyText: '#F6F6F8',
    ok: '#1E8E5A',
    okSoft: '#EDF7EE',
    warn: '#C7791A',
    warnSoft: '#FBECD5',
    danger: '#B3111A',
    dangerSoft: '#FAE1E1',
    info: '#1E5FA8',
    infoSoft: '#DFEAF8',
    overlay: 'rgba(11,13,16,0.44)',
  },
  dark: {
    bg: '#08090B',
    surface: '#161619',
    surfaceAlt: '#1F1F23',
    surfaceRaised: '#202024',
    border: '#2A2A30',
    borderStrong: '#3C3C44',
    keyline: '#F3F3F5',
    text: '#F3F3F5',
    textMuted: '#A6A8B2',
    textFaint: '#6C6E78',
    accent: '#FF4552',
    accentStrong: '#FF5B60',
    accentText: '#FFFFFF',
    accentSoft: '#341315',
    navy: '#13161B',
    navyText: '#F3F3F5',
    ok: '#3CC382',
    okSoft: '#123324',
    warn: '#F0A13A',
    warnSoft: '#3A2A12',
    danger: '#FF5C63',
    dangerSoft: '#3D1A1A',
    info: '#5B9BE6',
    infoSoft: '#15283F',
    overlay: 'rgba(0,0,0,0.68)',
  },
} as const;

export type Palette = { readonly [K in keyof (typeof palette)['light']]: string };
export type ThemeColor = keyof Palette;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 9, md: 13, lg: 16, xl: 22, pill: 999 } as const;

/** Width of the red spine on an actionable row / active rail item. */
export const spine = 3;

export const accents = {
  light: {
    blue: { fg: '#1D4ED8', bg: '#E7EEFD' },
    green: { fg: '#15803D', bg: '#E2F6E9' },
    amber: { fg: '#B45309', bg: '#FDF0D9' },
    violet: { fg: '#6D28D9', bg: '#EEE7FD' },
    rose: { fg: '#BE123C', bg: '#FCE3E9' },
    teal: { fg: '#0F766E', bg: '#DBF2F0' },
  },
  dark: {
    blue: { fg: '#7EA6FF', bg: '#16243F' },
    green: { fg: '#5BD98C', bg: '#123123' },
    amber: { fg: '#F5B34A', bg: '#3A2A12' },
    violet: { fg: '#B694FF', bg: '#251A3D' },
    rose: { fg: '#FF8098', bg: '#3A1620' },
    teal: { fg: '#5AD6CB', bg: '#0F2E2C' },
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
 * Elevation. `xs`–`lg` stay for sheets, toasts and menus. `key` is the new
 * default for the single most important card on a screen: a hard ink offset,
 * no blur — readable on a cheap LCD in daylight and cheap to composite.
 * Pair it with `borderWidth: 1.5, borderColor: t.keyline`.
 */
export const shadow = {
  none: {},
  key: { shadowColor: '#0B0D10', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  xs: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.14, shadowRadius: 32, elevation: 12 },
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

export const type = {
  /** Screen titles, customer names, the money on the keyline card. */
  display: { fontFamily: fonts.display, fontSize: 27, lineHeight: 29, fontWeight: '800' as const, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.4 },
  heading: { fontFamily: sansBold, fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  body: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, fontWeight: '400' as const },
  small: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, fontWeight: '400' as const },
  /** Section labels and column headers: mono, uppercase, wide. */
  label: { fontFamily: monoBold, fontSize: 10, lineHeight: 13, fontWeight: '600' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
  /** Every rupee figure, quantity, SKU and doc number. */
  number: { fontFamily: monoBold, fontSize: 21, lineHeight: 26, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
  /** The one figure per screen that is the reason the screen was opened. */
  hero: { fontFamily: fonts.display, fontSize: 46, lineHeight: 47, fontWeight: '800' as const, letterSpacing: -1.8, fontVariant: ['tabular-nums' as const] },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontWeight: '500' as const, fontVariant: ['tabular-nums' as const] },
  rowTitle: { fontFamily: sansMedium, fontSize: 14, lineHeight: 19, fontWeight: '600' as const },
};

/** Breakpoint above which the web/desktop layout uses a left rail and wider content. */
export const WIDE = 900;
export const MAX_CONTENT = 1280;
