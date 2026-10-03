/**
 * UI primitives. Small on purpose: a handful of components that every screen
 * composes, so the app looks like one product on a phone and on a desktop.
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderShownContext } from 'expo-router/react-navigation';

import Ionicons from '@expo/vector-icons/Ionicons';

import { accentFor, accents, MAX_CONTENT, palette, radius, shadow, space, spine as SPINE, tap as tapSize, type, WIDE, type AccentName, type Palette } from './theme';
import { Illustration, type IllustrationName } from './illustrations';
import { tap } from './haptics';

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------
export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palette.dark : palette.light;
}

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE;
}

/** The accent pair (foreground + tinted background) for a name, in the current scheme. */
/**
 * The colour for a key.
 *
 * If the key IS an accent name ('blue', 'green', …) it is used as given. Any
 * other string is hashed to a stable colour, so a list of families or
 * locations gets a consistent palette without anybody choosing one.
 *
 * The name check is not a convenience — without it, passing 'blue' hashed the
 * word "blue" to whatever came out, which is how a deliberate colour choice
 * silently became a random one.
 */
export function useAccent(key: string | AccentName, explicit = false): { fg: string; bg: string } {
  const scheme = useColorScheme();
  const set = scheme === 'dark' ? accents.dark : accents.light;
  const named = (key as AccentName) in set;
  const name = (explicit || named ? key : accentFor(key)) as AccentName;
  return set[name] ?? set.blue;
}

// -----------------------------------------------------------------------------
// Icons
// -----------------------------------------------------------------------------
export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** One icon family only — keeps a single 384KB font in the app instead of ten. */
export function Icon({ name, size = 20, color, tone }: { name: IconName; size?: number; color?: string; tone?: keyof Palette }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? (tone ? t[tone] : t.text)} />;
}

/** Icon in a soft coloured square — the thing that makes a list look designed. */
export function IconBadge({ name, accent, size = 38 }: { name: IconName; accent: string; size?: number }) {
  const a = useAccent(accent);
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={a.fg} />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Text
// -----------------------------------------------------------------------------
type TextVariant = keyof typeof type;
type TextProps = React.ComponentProps<typeof RNText> & {
  variant?: TextVariant;
  color?: keyof Palette;
  mono?: boolean;
  center?: boolean;
};

export function Text({ variant = 'body', color = 'text', mono, center, style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        type[variant],
        { color: t[color] },
        mono && { fontVariant: ['tabular-nums'] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

/** Money, right-aligned and tabular so columns of figures line up. */
export function Amount({ children, variant = 'mono', color, style }: { children: React.ReactNode; variant?: TextVariant; color?: keyof Palette; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant={variant} color={color} mono style={[{ textAlign: 'right' }, style]}>
      {children}
    </Text>
  );
}

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------
/**
 * Scroll a field to the top of the screen.
 *
 * The keyboard-aware scroll lifts a focused field just clear of the keyboard,
 * which is right for a form and wrong for a search: the field sat on the
 * keyboard's edge and every result it found was drawn underneath it. On the
 * bill a counter hand typed "ZZ", saw nothing, and had to close the keyboard to
 * find out the item was there all along. A search box asks for this instead.
 */
export const ScreenScroll = React.createContext<{ bringToTop: (field: View | TextInput | null) => void } | null>(null);

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const wide = useIsWide();
  const scrollRef = React.useRef<ScrollView>(null);
  const offset = React.useRef(0);
  const scrollApi = React.useMemo(() => ({
    bringToTop(field: View | TextInput | null) {
      // A browser has no on-screen keyboard to dodge, and jumping the page
      // under a mouse click is worse than the problem.
      if (Platform.OS === 'web' || !field) return;
      // After the keyboard has opened and the aware scroll has had its turn.
      setTimeout(() => {
        const sv = scrollRef.current as unknown as View | null;
        if (!sv) return;
        field.measureInWindow((_x, fieldY) => {
          sv.measureInWindow((_sx, top) => {
            const delta = fieldY - top - space.sm;
            if (delta > space.lg) scrollRef.current?.scrollTo({ y: offset.current + delta, animated: true });
          });
        });
      }, 320);
    },
  }), []);
  // Under a stack header the header has already paid for the status bar.
  // Paying for it again here left a band of blank white between "‹ Peeche"
  // and the screen's own title on every pushed screen — about 60px on a
  // OnePlus, more on a phone with a deeper notch. Tab screens have no header,
  // so they still need the top inset themselves.
  const headerShown = React.useContext(HeaderShownContext);
  const inner = (
    <View style={[styles.content, wide && styles.contentWide, padded && styles.padded, style]}>{children}</View>
  );
  return (
    <SafeAreaView edges={headerShown ? ['left', 'right'] : ['top', 'left', 'right']} style={[styles.screen, { backgroundColor: t.bg }]}>
      {scroll ? (
        // Not a plain ScrollView: this is the base every form in the app sits
        // on, so it is what keeps the field you are typing in above the
        // keyboard. bottomOffset leaves a thumb's width of room under it.
        <ScreenScroll.Provider value={scrollApi}>
          <KeyboardAwareScrollView
            ref={scrollRef as never}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={32}
            onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
            bottomOffset={space.xl}>
            {inner}
          </KeyboardAwareScrollView>
        </ScreenScroll.Provider>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Row({ children, gap = space.sm, align = 'center', wrap, style }: { children: React.ReactNode; gap?: number; align?: ViewStyle['alignItems']; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.md, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Spacer() {
  return <View style={{ flex: 1 }} />;
}

/**
 * A wrapping grid that decides its own column count from the space it is given.
 *
 * The screens were built as one tall column, which is right on a phone and
 * wrong on the 1440px counter monitor the shop actually uses — the same stack
 * simply stretched, leaving a metre of white space beside every card. This
 * takes a minimum readable tile width and fits as many as the row allows, so
 * one layout serves both without a breakpoint per screen.
 *
 * Children are wrapped rather than styled directly, so a child that already
 * sets `flex: 1` (StatTile does) does not fight the row for width.
 */
export function Grid({
  children,
  min = 220,
  gap = space.md,
}: {
  children: React.ReactNode;
  /** Narrowest a tile may get before the grid drops to fewer columns. */
  min?: number;
  gap?: number;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  // Measure, because `min` is a wish and the screen is a fact. A Grid asked for
  // 420 on a 412dp phone used to hand every child a 420 minimum, pushing the
  // whole row past the right edge — which is why the "Remind" button at the end
  // of each khata row was sliced in half and could not be tapped.
  const [width, setWidth] = React.useState(0);
  const basis = width > 0 ? Math.min(min, width) : min;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map((child, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: basis, minWidth: basis }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Marks a component whose last instance in a Card should drop its hairline. */
export const DIVIDED_ROW = Symbol.for('autoloom.dividedRow');
const isDividedRow = (t: unknown) =>
  typeof t === 'function' && (t as { [DIVIDED_ROW]?: boolean })[DIVIDED_ROW] === true;

/**
 * Turn off the hairline on the last ListRow in a card.
 *
 * A row cannot know it is last, so the card tells it: otherwise every card
 * ended in a line with nothing under it and looked like it had been cut off
 * mid-load. It walks backwards and stops at the first row it finds, and it
 * looks inside fragments because half the lists in this app are built as
 * `{canEdit ? <>...</> : null}` and a row hidden in one is still the last row.
 *
 * It recognises a row by a flag on the component rather than by importing the
 * component, because the skeleton rows live in a module that imports this one
 * and asking for them by name here would close the circle.
 *
 * The border is set transparent rather than removed, so nothing shifts by the
 * hairline when a row becomes the last one.
 */
function dropLastDivider(nodes: React.ReactNode): { nodes: React.ReactNode; done: boolean } {
  const arr = React.Children.toArray(nodes);
  for (let i = arr.length - 1; i >= 0; i--) {
    const k = arr[i];
    if (!React.isValidElement(k)) continue;
    if (isDividedRow(k.type)) {
      const next = [...arr];
      next[i] = React.cloneElement(k as React.ReactElement<{ divider?: boolean }>, { divider: false });
      return { nodes: next, done: true };
    }
    if (k.type === React.Fragment) {
      const inner = dropLastDivider((k.props as { children?: React.ReactNode }).children);
      if (inner.done) {
        const next = [...arr];
        next[i] = React.cloneElement(k, {}, inner.nodes);
        return { nodes: next, done: true };
      }
    }
  }
  return { nodes, done: false };
}

export function Card({
  children,
  style,
  tone = 'surface',
  elevated,
  keyline,
  spine,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'alt' | 'navy';
  /** Legacy soft shadow. The light pass is flat, so this is off by default. */
  elevated?: boolean;
  /** The one card per screen carrying the figure the screen was opened for:
   *  1.5px ink border and a hard 3px offset shadow, no blur. Max one. */
  keyline?: boolean;
  /** 3px coloured left edge with an asymmetric radius — marks a row or card
   *  as actionable / late / settled without spending a whole fill on it. */
  spine?: 'accent' | 'warn' | 'ok';
}) {
  const t = useTheme();
  const bg = tone === 'navy' ? t.navy : tone === 'alt' ? t.surfaceAlt : t.surface;
  const spineColor = spine === 'warn' ? t.warn : spine === 'ok' ? t.ok : t.accent;
  const body = dropLastDivider(children).nodes;
  return (
    <View
      style={[
        styles.card,
        elevated && shadow.xs,
        { backgroundColor: bg, borderColor: tone === 'navy' ? t.navy : t.border },
        keyline && { borderWidth: 1.5, borderColor: t.keyline, ...shadow.key },
        // A spine INSIDE a keyline card drew a red bar that overshot the ink
        // border's rounded corners at both ends, so the most important card on
        // the screen looked like a rendering fault. They were never meant to
        // stack: keyline says "this is the card", spine says "this row needs
        // you". The card wins.
        spine && !keyline && { borderLeftWidth: SPINE, borderLeftColor: spineColor, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
        style,
      ]}>
      {body}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }, style]} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <Text variant="label" color="textMuted">
        {children}
      </Text>
      {right}
    </Row>
  );
}

/**
 * Nothing here yet.
 *
 * `art` draws the branded line illustration for what is missing — an empty
 * carton, a blank slip, a level scale. A grey circle told the shopkeeper
 * nothing and looked like a screen that had failed to load; a picture of the
 * thing that is absent reads as "nothing yet", which is what it is.
 *
 * `icon` is the old single-character fallback, kept so every existing caller
 * still renders while the screens are moved over one at a time.
 */
export function Empty({
  title,
  hint,
  icon = '○',
  art,
}: {
  title: string;
  hint?: string;
  icon?: string;
  art?: IllustrationName;
}) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center', gap: space.sm }}>
      {art ? (
        <View style={{ marginBottom: space.xs }}>
          <Illustration name={art} size={96} />
        </View>
      ) : (
        <View style={[styles.emptyGlyph, { backgroundColor: t.surfaceAlt }]}>
          <RNText style={{ fontSize: 20, color: t.textFaint }}>{icon}</RNText>
        </View>
      )}
      <Text variant="heading" color="textMuted" center>
        {title}
      </Text>
      {hint ? (
        <Text variant="small" color="textFaint" center style={{ maxWidth: 320 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

/** Placeholder block for content still loading — quieter than a spinner in a list. */
export function Skeleton({ width, height = 14, radius: r = radius.sm, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ width: width ?? '100%', height, borderRadius: r, backgroundColor: t.surfaceAlt }, style]} />;
}

// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------
type ButtonProps = PressableProps & {
  title: string;
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  left?: React.ReactNode;
  full?: boolean;
};

export function Button({ title, tone = 'primary', size = 'md', loading, left, full, disabled, style, onPress, ...rest }: ButtonProps) {
  const t = useTheme();
  // The buzz is the confirmation for someone holding a carton in the other
  // hand and not looking at the screen.
  const press = React.useCallback(
    (e: Parameters<NonNullable<typeof onPress>>[0]) => { tap(); onPress?.(e); },
    [onPress]
  );
  // Flat fills, and a border on every tone so the four sit on one baseline —
  // a secondary button that is white-on-white with no edge is invisible on the
  // light ground, which is how people miss "Rehne do" and tap the red one.
  const colors = {
    primary: { bg: t.accent, fg: t.accentText, border: t.accent },
    secondary: { bg: t.surface, fg: t.text, border: t.borderStrong },
    ghost: { bg: 'transparent', fg: t.textMuted, border: 'transparent' },
    danger: { bg: t.surface, fg: t.danger, border: t.danger },
  }[tone];
  const minHeight = size === 'lg' ? tapSize.lg : size === 'sm' ? tapSize.sm : tapSize.md;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      android_ripple={{ color: tone === 'primary' ? 'rgba(255,255,255,0.22)' : t.surfaceAlt }}
      onPress={press}
      {...rest}
      style={(state) => [
        styles.button,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          minHeight,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.4 : 1,
          // 0.97 was a wobble. 0.985 plus the ripple reads as a press without
          // the whole button appearing to shrink away from the thumb.
          transform: [{ scale: state.pressed && !disabled ? 0.985 : 1 }],
        },
        typeof style === 'function' ? style(state) : style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <Row gap={space.xs} style={{ justifyContent: 'center' }}>
          {left}
          <RNText style={[type.heading, { color: colors.fg, fontSize: size === 'sm' ? 13 : size === 'lg' ? 16 : 15 }]}>{title}</RNText>
        </Row>
      )}
    </Pressable>
  );
}

/** Small square icon-only button — table row actions, sheet close, stepper controls. */
export function IconButton({
  icon,
  onPress,
  tone = 'secondary',
  size = 36,
  disabled,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  tone?: 'secondary' | 'ghost' | 'danger';
  size?: number;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const colors = {
    secondary: { bg: t.surface, border: t.border },
    ghost: { bg: 'transparent', border: 'transparent' },
    danger: { bg: t.dangerSoft, border: t.dangerSoft },
  }[tone];
  // A 36px square is under the 44px minimum, so the extra reach comes from
  // hitSlop rather than from making every row taller.
  const slop = Math.max(0, (44 - size) / 2);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      android_ripple={{ color: t.borderStrong, borderless: false }}
      style={(state) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : state.pressed ? 0.7 : 1,
          transform: [{ scale: state.pressed ? 0.93 : 1 }],
        },
      ]}>
      {icon}
    </Pressable>
  );
}

type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  right?: React.ReactNode;
  left?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, right, left, containerStyle, style, onFocus, onBlur, ...rest },
  ref
) {
  const t = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[{ gap: space.xs }, containerStyle]}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: t.surface,
            // Colour changes, width does not. Growing the border on focus moved
            // every field below it by half a pixel, and on a form that is being
            // tabbed through it made the whole page twitch.
            //
            // Focus is INK, not red. Red was reading as a mistake: an
            // autofocused field — the amount on Kharcha Likho, the search box
            // — opened outlined in red with nothing wrong, and everyone in
            // this shop has been taught that red means galti. Red on a field
            // now means only one thing, which is that the field is wrong.
            borderColor: error ? t.danger : focused ? t.keyline : t.border,
            borderWidth: 1,
          },
        ]}>
        {left}
        {/* The visible label is a separate <Text>, so without this a screen
            reader announces the field as unlabelled — and anything driving the
            app by role cannot find a field that has no placeholder, which the
            password and mobile fields do not. */}
        <TextInput
          accessibilityLabel={typeof label === 'string' ? label : undefined}
          ref={ref}
          placeholderTextColor={t.textFaint}
          {...rest}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, { color: t.text }, style]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export function Badge({ children, tone = 'neutral', dot }: { children: React.ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'; dot?: boolean }) {
  const t = useTheme();
  const map = {
    neutral: { bg: t.surfaceAlt, fg: t.textMuted },
    ok: { bg: t.okSoft, fg: t.ok },
    warn: { bg: t.warnSoft, fg: t.warn },
    danger: { bg: t.dangerSoft, fg: t.danger },
    info: { bg: t.infoSoft, fg: t.info },
    accent: { bg: t.accentSoft, fg: t.accent },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      {dot ? <View style={[styles.badgeDot, { backgroundColor: map.fg }]} /> : null}
      <RNText style={[type.label, { color: map.fg, fontSize: 10, letterSpacing: 0.4 }]}>{children}</RNText>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={(state) => [
        styles.chip,
        {
          backgroundColor: selected ? t.navy : t.surface,
          borderColor: selected ? t.navy : t.border,
          opacity: state.pressed ? 0.85 : 1,
        },
      ]}>
      <RNText style={[type.small, { color: selected ? t.navyText : t.text, fontWeight: '500' }]}>{label}</RNText>
    </Pressable>
  );
}

/** A tappable list row: title, optional subtitle, and something on the right. */
export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  left,
  chevron,
  divider = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  left?: React.ReactNode;
  onPress?: () => void;
  /** Show a trailing “›” affordance. Defaults to on when the row is pressable. */
  chevron?: boolean;
  /** Hairline under the row. Card turns this off for its last row — a line
   *  with nothing under it reads as a card that failed to finish loading. */
  divider?: boolean;
}) {
  const t = useTheme();
  const showChevron = chevron ?? !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: t.surfaceAlt } : undefined}
      style={({ pressed }) => [styles.listRow, { borderColor: divider ? t.border : 'transparent', backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <Text variant="heading">{title}</Text> : title}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text variant="small" color="textMuted">
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
      {showChevron ? (
        <RNText style={{ color: t.textFaint, fontSize: 18, marginLeft: 2 }}>›</RNText>
      ) : null}
    </Pressable>
  );
}

ListRow[DIVIDED_ROW] = true;

/** Dashboard figure. */
export function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
  accent,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'danger' | 'accent';
  /** Ionicons name — shown in a tinted square in the corner. */
  icon?: IconName;
  /** Colour key; defaults to a stable hue derived from the label. */
  accent?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  const a = useAccent(accent ?? label);
  const valueColor = tone === 'danger' ? t.danger : tone === 'warn' ? t.warn : tone === 'ok' ? t.ok : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={(state) => [
        styles.tile,
        shadow.sm,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          transform: [{ scale: state.pressed ? 0.985 : 1 }],
          opacity: state.pressed ? 0.92 : 1,
        },
      ]}>
      <View style={[styles.tileAccent, { backgroundColor: tone ? valueColor : a.fg }]} />
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <Text variant="label" color="textMuted" style={{ flex: 1 }}>
          {label}
        </Text>
        {icon ? (
          <View style={{ width: 30, height: 30, borderRadius: radius.sm, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={16} color={a.fg} />
          </View>
        ) : null}
      </Row>
      <RNText style={[type.number, { color: valueColor }]}>{value}</RNText>
      {sub ? (
        <Text variant="small" color="textFaint">
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Initials circle — profile rows, customer/supplier lists. Deterministic tint from the name. */
export function Avatar({ name, size = 40, tone = 'accent' }: { name: string; size?: number; tone?: 'accent' | 'neutral' }) {
  const t = useTheme();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
  const bg = tone === 'accent' ? t.accentSoft : t.surfaceAlt;
  const fg = tone === 'accent' ? t.accent : t.textMuted;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <RNText style={{ color: fg, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</RNText>
    </View>
  );
}

/** Label / value pair used on detail pages and spec tables. */
export function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }} align="flex-start">
      <Text variant="small" color="textMuted" style={{ flex: 1 }}>
        {k}
      </Text>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Text variant="small" mono={mono} style={{ flex: 1.4, textAlign: 'right' }}>
          {v}
        </Text>
      ) : (
        <View style={{ flex: 1.4, alignItems: 'flex-end' }}>{v}</View>
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: MAX_CONTENT },
  // 132, not 32. Two things float over the bottom of a tab screen — the nav
  // bar and the "Nayi entry" pill — and between them they were eating the last
  // row of every list: on Stock the qty, on Bill the grahak's name, on Ghar the
  // oldest entry of the day. The pill grew wider when it got its label, so
  // clearing its height was no longer enough. Whitespace at the end of a scroll
  // reads as deliberate; a number hidden behind a red pill does not.
  padded: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 132, gap: space.md },
  // A full 1px border, not a hairline. On a 3x phone a hairline is a third of
  // a pixel and the card edge disappears; the panel then floats with nothing
  // holding it, which is what made the old screens look unfinished.
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  // Not a pill. A 999-radius button reads as a tag; a 6px one reads as a
  // control, and lines up with the cards and inputs around it.
  button: { borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconButton: { borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 },
  // minWidth 0 is load-bearing on web: react-native-web renders this as a real
  // <input>, which carries an intrinsic width of about twenty characters, and
  // flex:1 will not shrink a box below its intrinsic width. Two fields side by
  // side then overflowed the card on a 360dp phone.
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 16, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  // Chips stay pills — they are the one thing on screen that is a tag and not
  // a control, and the shape is what says so.
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  // 15, not 13: a row has to be 48dp before a thumb hits it reliably while
  // standing at a counter.
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  tile: { flex: 1, minWidth: 150, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: 4, overflow: 'hidden' },
  // A 2px rule, not a 3px band. It marks the tile; it is not decoration.
  tileAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  emptyGlyph: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
