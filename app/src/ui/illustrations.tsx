/**
 * Empty-state illustrations, drawn in code.
 *
 * Every empty state used to be the same grey disc with a `○` in it, which is
 * indistinguishable from a rendering bug — "Abhi koi maal nahi" looked like the
 * screen had failed rather than like the shop was simply empty. These are eight
 * small line drawings of the actual thing that is missing, so the state reads
 * as a fact about the shop instead of a fault in the app.
 *
 * Rules that keep the set looking like one family:
 *
 * · One 96 viewBox, 1.8 stroke, round caps and joins. Nothing is filled except
 *   the camera's shutter light; nothing is animated, gradient or shadowed.
 * · TWO colours, both from the theme. `t.textFaint` carries the drawing — an
 *   empty state is a quiet moment, not a headline — and `t.accent` is spent on
 *   exactly ONE element per illustration. That single red note is the whole
 *   difference between "our illustration" and "a free icon set".
 * · `sahi` is the exception: its accent is `t.ok`, because it is the good empty
 *   state. "Sab theek hai" should feel like a result, not a lack.
 * · Nothing is hardcoded, so dark mode is handled by `useTheme()` alone.
 *
 * `maal` and `khatam` carry the brand's grille: two stacked bars on the carton
 * face, three shelf rails on the rack. The logo's A sits behind two thick
 * louvres, and a warehouse shelf happens to be the same shape, so the motif
 * arrives on its own rather than being applied.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from './index';

export type IllustrationName =
  | 'maal'
  | 'parchi'
  | 'kharcha'
  | 'hisab'
  | 'khatam'
  | 'photo'
  | 'search'
  | 'sahi';

/** Shared stroke geometry. Round everywhere — a warehouse app should not feel sharp. */
const S = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none', strokeWidth: 1.8 } as const;

type Ink = { line: string; accent: string };

export function Illustration({ name, size = 96 }: { name: IllustrationName; size?: number }) {
  const t = useTheme();
  // `sahi` means everything is fine, so its one coloured stroke is green, not red.
  const c: Ink = { line: t.textFaint, accent: name === 'sahi' ? t.ok : t.accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {DRAW[name](c)}
    </Svg>
  );
}

/**
 * An open carton with its flaps standing up and nothing inside. The two bars on
 * the front are the shipping label, and the grille.
 */
function maal(c: Ink) {
  return (
    <>
      {/* flaps, hinged at the top corners and folded outward */}
      <Path d="M22 42 L10 32 L13 27 L25 37 Z" stroke={c.line} {...S} />
      <Path d="M74 42 L86 32 L83 27 L71 37 Z" stroke={c.line} {...S} />
      {/* body, open at the top */}
      <Path d="M22 42 L22 76 L74 76 L74 42 Z" stroke={c.line} {...S} />
      <Path d="M35 54 L61 54" stroke={c.accent} {...S} />
      <Path d="M35 62 L55 62" stroke={c.line} {...S} />
    </>
  );
}

/** A slip torn off the pad with one line written on it and the rest of the day blank. */
function parchi(c: Ink) {
  return (
    <>
      <Path
        d="M27 14 L69 14 L69 70 L62 77 L55 70 L48 77 L41 70 L34 77 L27 70 Z"
        stroke={c.line}
        {...S}
      />
      <Path d="M35 30 L61 30" stroke={c.line} {...S} />
      <Path d="M35 40 L51 40" stroke={c.accent} {...S} />
    </>
  );
}

/**
 * A note going out of the wallet: paisa bahar gaya.
 *
 * The first version of this was a wallet lying open with a slot across it, and
 * every single person who saw it called it a printer — an open rectangle with a
 * straight line across the middle and a sheet of paper standing up out of it is
 * a printer, whatever you meant by it. So: no slot line, a clasp on the right
 * edge that no printer has, and the note comes out on a tilt, because paper
 * feeds out of a machine straight and is pulled out of a wallet crooked.
 *
 * There was a ₹ on the note, traced from the real glyph. At 96px it is about
 * 20px tall, and in a real empty-state card it stopped being a ₹ and became a
 * red scribble — which reads as a mistake, not as money. Making it bigger
 * meant making the note bigger, and then the wallet is a detail on a banknote.
 * So the red moved to the arrow, where it carries the actual sentence: the
 * money is going OUT. A wallet with paper coming out of it is already a note;
 * it never needed to be labelled.
 */
function kharcha(c: Ink) {
  return (
    <>
      {/* the wallet, and the clasp that stops it being a printer */}
      <Rect x={10} y={50} width={62} height={32} rx={8} stroke={c.line} {...S} />
      <Rect x={48} y={59} width={24} height={14} rx={7} stroke={c.line} {...S} />
      {/* the note, cut off where the wallet's mouth crosses it */}
      <Path d="M22 50 L27.6 18.5 L65 25.3 L60.6 50" stroke={c.line} {...S} />
      {/* the note's ruling — two short bars riding its tilt, which is what
          says "paper money" rather than "a receipt" */}
      <Path d="M34 27.5 L52 30.7 M33 33 L46 35.3" stroke={c.line} {...S} />
      {/* where it is going, and the one red thing: out. */}
      <Path
        d="M68 33 Q84 31 85 15 M81.1 20.8 L85 15 L88.1 21.3"
        stroke={c.accent}
        {...S}
        strokeWidth={2.4}
      />
    </>
  );
}

/** A taraazu hanging dead level: nothing on either pan, so there is nothing to weigh. */
function hisab(c: Ink) {
  return (
    <>
      <Path d="M48 22 L48 59" stroke={c.line} {...S} />
      <Path d="M36 73 L48 59 L60 73" stroke={c.line} {...S} />
      <Path d="M32 73 L64 73" stroke={c.line} {...S} />
      <Path d="M19 29 L77 29" stroke={c.line} {...S} />
      {/* left pan */}
      <Path d="M19 29 L10 42" stroke={c.line} {...S} />
      <Path d="M19 29 L28 42" stroke={c.line} {...S} />
      <Path d="M10 42 Q19 53 28 42" stroke={c.line} {...S} />
      {/* right pan */}
      <Path d="M77 29 L68 42" stroke={c.line} {...S} />
      <Path d="M77 29 L86 42" stroke={c.line} {...S} />
      <Path d="M68 42 Q77 53 86 42" stroke={c.line} {...S} />
      {/* the pivot — the one point the whole thing balances on */}
      <Circle cx={48} cy={29} r={3.2} stroke={c.accent} {...S} />
    </>
  );
}

/** A two-shelf rack, top shelf bare, one carton left in the corner of the bottom one. */
function khatam(c: Ink) {
  return (
    <>
      {/* uprights */}
      <Path d="M20 18 L20 78" stroke={c.line} {...S} />
      <Path d="M76 18 L76 78" stroke={c.line} {...S} />
      {/* three rails, running past the uprights — a rack, and the grille */}
      <Path d="M15 30 L81 30" stroke={c.line} {...S} />
      <Path d="M15 52 L81 52" stroke={c.line} {...S} />
      <Path d="M15 74 L81 74" stroke={c.line} {...S} />
      {/* the last one */}
      <Path d="M56 60 L72 60 L72 74 L56 74 Z" stroke={c.accent} {...S} />
      <Path d="M56 64 L72 64" stroke={c.accent} {...S} />
    </>
  );
}

/** A camera, waiting. */
function photo(c: Ink) {
  return (
    <>
      <Path d="M34 30 L39 22 L57 22 L62 30" stroke={c.line} {...S} />
      <Rect x={12} y={30} width={72} height={48} rx={9} stroke={c.line} {...S} />
      <Circle cx={48} cy={54} r={15} stroke={c.line} {...S} />
      <Circle cx={48} cy={54} r={6.5} stroke={c.line} {...S} />
      <Circle cx={72} cy={40} r={2.6} fill={c.accent} />
    </>
  );
}

/**
 * A glass with nothing under it: dhoonda, kuch nahi mila.
 *
 * The lens used to hold three dots, which is a typing indicator in every other
 * app on the phone — it said the app was still thinking, not that the search had
 * come back empty. The lens is empty now and stays empty, and the drawing is
 * bigger to pay for the dots being gone.
 *
 * It was drawn over a bare shelf first, which reads beautifully on the search
 * tab and is a lie on the other twelve screens that use this: "Ye grahak is
 * phone par nahi mila" and "Ye bill is phone par nahi mila" are not questions
 * about a shelf. One glass, no shelf, so the one drawing fits all thirteen.
 * The handle is the red one — somebody went and looked.
 */
function search(c: Ink) {
  return (
    <>
      <Circle cx={40} cy={38} r={23} stroke={c.line} {...S} />
      <Path d="M56.3 54.3 L80 78" stroke={c.accent} {...S} strokeWidth={3.2} />
    </>
  );
}

/** The good empty state. Nothing is missing here; everything has been dealt with. */
function sahi(c: Ink) {
  return (
    <>
      <Circle cx={48} cy={48} r={30} stroke={c.line} {...S} />
      <Path d="M34 49 L44 59 L63 38" stroke={c.accent} {...S} strokeWidth={2.6} />
    </>
  );
}

const DRAW: Record<IllustrationName, (c: Ink) => React.ReactElement> = {
  maal,
  parchi,
  kharcha,
  hisab,
  khatam,
  photo,
  search,
  sahi,
};
