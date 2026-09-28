/**
 * The shape of what is coming, while it comes.
 *
 * Every list screen asks PowerSync for rows and paints before the answer gets
 * back. PowerSync hands back `data: []` during that first moment — not
 * `undefined` — so `(data ?? [])` is an empty array and the screen draws its
 * "Abhi koi maal nahi" illustration, then throws it away half a second later
 * when the real list lands. On the ₹6,000 Android behind the counter that half
 * second is long enough to read, and what it says is that the shop's maal is
 * gone. A grey outline of the rows says the opposite — it is on its way — and
 * it says it in the same space the rows will occupy, so nothing jumps when
 * they arrive.
 *
 * The shimmer is one loop for the whole app, not one per block. Twenty blocks
 * each running their own timer drift out of phase within a second and the card
 * starts to look like television static; sharing a value keeps the page
 * breathing as one thing, and costs one animation instead of twenty. The loop
 * only runs while something is actually using it.
 *
 * Opacity only. Animating width or offset — the sweeping-highlight shimmer —
 * cannot run on the native driver, so it would be a JS-thread animation
 * playing at exactly the moment the JS thread is busy parsing query results.
 * It would stutter precisely when it is on screen.
 */
import React from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card, useTheme } from './index';
import { radius, space } from './theme';

// -----------------------------------------------------------------------------
// The one loop
// -----------------------------------------------------------------------------

/** Dimmest the blocks go. Below this they read as disabled rather than busy. */
const DIM = 0.55;
/** Held value when the phone asks for less motion — visible, but still. */
const STILL = 0.8;
const HALF_CYCLE = 550;

const pulse = new Animated.Value(DIM);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function joinLoop() {
  users += 1;
  if (users > 1) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: HALF_CYCLE, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: DIM, duration: HALF_CYCLE, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])
  );
  loop.start();
}

function leaveLoop() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  loop?.stop();
  loop = null;
  // Reset, so the next screen's skeleton starts dim and brightens rather than
  // appearing mid-fade at whatever opacity the last one died on.
  pulse.setValue(DIM);
}

/**
 * True when the OS (or, on web, the browser) has been told to go easy on
 * animation. Starts optimistic: a reduced-motion user sees at most one frame
 * of pulse before the promise resolves and it stops, which is cheaper than
 * holding every skeleton back a tick for everyone else.
 */
function useReduceMotion(): boolean {
  const [calm, setCalm] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setCalm(on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm);
    return () => { alive = false; sub?.remove(); };
  }, []);
  return calm;
}

/** The opacity every block on screen shares. A plain number when motion is off. */
function useShimmer(): Animated.Value | number {
  const calm = useReduceMotion();
  React.useEffect(() => {
    if (calm) return;
    joinLoop();
    return leaveLoop;
  }, [calm]);
  return calm ? STILL : pulse;
}

// -----------------------------------------------------------------------------
// Blocks
// -----------------------------------------------------------------------------

/** One block of grey where something will be. */
export function Skeleton({
  width,
  height = 14,
  radius: r = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const opacity = useShimmer();
  return (
    <Animated.View
      // Nothing to read here, and a screen reader announcing eight empty views
      // is worse than silence. The screen says what it is doing elsewhere.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: width ?? '100%', height, borderRadius: r, backgroundColor: t.surfaceAlt, opacity }, style]}
    />
  );
}

/**
 * A line of text's worth of vertical space with a shorter bar centred in it.
 *
 * The bar is not the line height — a 21px slab where a 15px word goes looks
 * like a redaction. But the box around it is, so the skeleton row and the real
 * row come out the same height and the list does not shift when it loads.
 */
function TextLine({ line, bar, width, style }: { line: number; bar: number; width: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  return (
    // `style` exists for one reason: a percentage width measures against the
    // parent, and inside a row a box with no width of its own collapses to
    // nothing, taking the bar with it. The caller passes `flex: 1` there.
    <View style={[{ height: line, justifyContent: 'center' }, style]}>
      <Skeleton width={width} height={bar} />
    </View>
  );
}

/**
 * A `ListRow` before it has anything to say: the 44px photo or avatar, the
 * name, the line of detail under it.
 *
 * `divider` is a prop and not a constant because `Card` only knows to drop the
 * hairline under its last child when that child is a real `ListRow` — it
 * checks the component type. A skeleton row slips past that check, so the
 * bottom of the card would keep a line with nothing beneath it, which is
 * exactly the "failed to finish loading" look this whole file exists to avoid.
 */
export function SkeletonRow({ size = 44, round, divider = true }: { size?: number; round?: boolean; divider?: boolean } = {}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        // The left block is usually the tallest thing in the row, so it sets
        // the height — an avatar list is three pixels shorter than a photo
        // list, and `size` is how the caller says which one is coming.
        paddingVertical: 13,
        borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: divider ? t.border : 'transparent',
      }}>
      <Skeleton width={size} height={size} radius={round ? size / 2 : radius.sm} />
      <View style={{ flex: 1, gap: 2 }}>
        <TextLine line={21} bar={12} width="62%" />
        <TextLine line={18} bar={10} width="40%" />
      </View>
    </View>
  );
}

/**
 * A `StatTile` before its number: the accent strip, the label, the tinted icon
 * square, the figure, the caption. Same padding and same line boxes, so a
 * Grid of these is the exact height of the Grid of tiles that replaces it.
 */
export function SkeletonTile() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 150,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        padding: space.lg,
        gap: 4,
        overflow: 'hidden',
      }}>
      <Skeleton width="100%" height={3} radius={0} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm }}>
        <TextLine line={30} bar={9} width="56%" style={{ flex: 1 }} />
        <Skeleton width={30} height={30} radius={radius.sm} />
      </View>
      <TextLine line={26} bar={20} width="74%" />
      <TextLine line={18} bar={10} width="48%" />
    </View>
  );
}

/**
 * The card a list lives in, with `rows` grey rows in it. Padding matches the
 * `<Card style={{ gap: 0, paddingVertical: 4 }}>` every list screen uses, so
 * this is a like-for-like stand-in and not merely a similar rectangle.
 */
export function SkeletonList({ rows = 5, size, round }: { rows?: number; size?: number; round?: boolean } = {}) {
  return (
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} size={size} round={round} divider={i < rows - 1} />
      ))}
    </Card>
  );
}
