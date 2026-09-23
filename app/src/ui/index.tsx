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

import Ionicons from '@expo/vector-icons/Ionicons';

import { accentFor, accents, MAX_CONTENT, palette, radius, shadow, space, spine as SPINE, type, WIDE, type AccentName, type Palette } from './theme';

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
export function useAccent(key: string | AccentName, explicit = false): { fg: string; bg: string } {
  const scheme = useColorScheme();
  const set = scheme === 'dark' ? accents.dark : accents.light;
  const name = (explicit ? key : accentFor(key)) as AccentName;
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
  const inner = (
    <View style={[styles.content, wide && styles.contentWide, padded && styles.padded, style]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: t.bg }]}>
      {scroll ? (
        // Not a plain ScrollView: this is the base every form in the app sits
        // on, so it is what keeps the field you are typing in above the
        // keyboard. bottomOffset leaves a thumb's width of room under it.
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={space.xl}>
          {inner}
        </KeyboardAwareScrollView>
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
  return (
    <View
      style={[
        styles.card,
        elevated && shadow.xs,
        { backgroundColor: bg, borderColor: tone === 'navy' ? t.navy : t.border },
        keyline && { borderWidth: 1.5, borderColor: t.keyline, ...shadow.key },
        spine && { borderLeftWidth: SPINE, borderLeftColor: spineColor, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
        style,
      ]}>
      {children}
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

export function Empty({ title, hint, icon = '○' }: { title: string; hint?: string; icon?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center', gap: space.sm }}>
      <View style={[styles.emptyGlyph, { backgroundColor: t.surfaceAlt }]}>
        <RNText style={{ fontSize: 20, color: t.textFaint }}>{icon}</RNText>
      </View>
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

export function Button({ title, tone = 'primary', size = 'md', loading, left, full, disabled, style, ...rest }: ButtonProps) {
  const t = useTheme();
  const colors = {
    primary: { bg: t.accent, fg: t.accentText, border: t.accent, shadow: true },
    secondary: { bg: t.surface, fg: t.text, border: t.border, shadow: false },
    ghost: { bg: 'transparent', fg: t.textMuted, border: 'transparent', shadow: false },
    danger: { bg: t.dangerSoft, fg: t.danger, border: t.dangerSoft, shadow: false },
  }[tone];
  const pad = size === 'lg' ? 17 : size === 'sm' ? 9 : 13;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      android_ripple={{ color: tone === 'primary' ? 'rgba(255,255,255,0.22)' : t.surfaceAlt }}
      {...rest}
      style={(state) => [
        styles.button,
        colors.shadow && shadow.xs,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingVertical: pad,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: state.pressed && !disabled ? 0.97 : 1 }],
        },
        typeof style === 'function' ? style(state) : style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <Row gap={space.xs} style={{ justifyContent: 'center' }}>
          {left}
          <RNText style={[type.heading, { color: colors.fg, fontSize: size === 'sm' ? 13 : 15 }]}>{title}</RNText>
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
            borderColor: error ? t.danger : focused ? t.accent : t.border,
            borderWidth: focused || error ? 1.5 : 1,
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
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  left?: React.ReactNode;
  onPress?: () => void;
  /** Show a trailing “›” affordance. Defaults to on when the row is pressable. */
  chevron?: boolean;
}) {
  const t = useTheme();
  const showChevron = chevron ?? !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: t.surfaceAlt } : undefined}
      style={({ pressed }) => [styles.listRow, { borderColor: t.border, backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}>
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
  padded: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxl, gap: space.md },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  button: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
  iconButton: { borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md },
  // minWidth 0 is load-bearing on web: react-native-web renders this as a real
  // <input>, which carries an intrinsic width of about twenty characters, and
  // flex:1 will not shrink a box below its intrinsic width. Two fields side by
  // side then overflowed the card on a 360dp phone.
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 16, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  tile: { flex: 1, minWidth: 150, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: 4, overflow: 'hidden' },
  tileAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  emptyGlyph: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
