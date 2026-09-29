/**
 * Form controls shared by the admin and party screens.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Switch, View, type StyleProp, type TextInput, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Divider, Empty, Input, Row, Text, useTheme } from './index';
import { radius, shadow, space } from './theme';
import { showConfirm, showToast } from './toast';
import { done, nope } from './haptics';

export type Option = { value: string; label: string; sublabel?: string };

/** Tap to open a searchable full-screen list. Works on phone and web. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Chuno…',
  allowClear,
  error,
  hint,
  onCreate,
}: {
  label?: string;
  value: string | null | undefined;
  options: Option[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  error?: string | null;
  hint?: string;
  /** Called with the typed text when the user wants to add a new entry. */
  onCreate?: (text: string) => void | Promise<void>;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term) || o.sublabel?.toLowerCase().includes(term));
  }, [options, q]);

  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[styles.field, { backgroundColor: t.surface, borderColor: error ? t.danger : t.border }]}>
        <Text style={{ flex: 1 }} color={selected ? 'text' : 'textFaint'}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text color="textFaint">▾</Text>
      </Pressable>
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={[styles.sheet, { maxWidth: 640 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="title">{label ?? 'Chuno'}</Text>
              <Button title="Band karo" tone="ghost" size="sm" onPress={() => setOpen(false)} />
            </Row>
            <Input value={q} onChangeText={setQ} placeholder="Type to filter" autoFocus autoCapitalize="none" autoCorrect={false} />
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={Divider}
              ListEmptyComponent={<Empty title="Kuch nahi mila" />}
              ListHeaderComponent={
                allowClear && value ? (
                  <Pressable
                    onPress={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    style={styles.row}>
                    <Text color="danger">Chuna hua hatao</Text>
                  </Pressable>
                ) : null
              }
              ListFooterComponent={
                onCreate && q.trim() && !filtered.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) ? (
                  <Pressable
                    onPress={async () => {
                      await onCreate(q.trim());
                      setQ('');
                      // Close it. Adding an entry is the answer to the question
                      // the sheet asked, so leaving it open reads as "nothing
                      // happened" — and on web the open sheet swallows every
                      // click on the form behind it.
                      setOpen(false);
                    }}
                    style={styles.row}>
                    <Text color="accent">+ Add “{q.trim()}”</Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQ('');
                  }}
                  style={[styles.row, item.value === value && { backgroundColor: t.surfaceAlt }]}>
                  <View style={{ flex: 1 }}>
                    <Text>{item.label}</Text>
                    {item.sublabel ? (
                      <Text variant="small" color="textMuted">
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </View>
                  {item.value === value ? <Text color="accent">✓</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** Multi-select variant: returns the chosen values as a list. */
export function MultiSelectField({
  label,
  values,
  options,
  onChange,
  hint,
}: {
  label?: string;
  values: string[];
  options: Option[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const set = new Set(values);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, q]);
  const chosen = options.filter((o) => set.has(o.value));

  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.field, { backgroundColor: t.surface, borderColor: t.border, minHeight: 46 }]}>
        <Text style={{ flex: 1 }} color={chosen.length ? 'text' : 'textFaint'}>
          {chosen.length ? chosen.map((c) => c.label).join(', ') : 'Chuno…'}
        </Text>
        <Text color="textFaint">▾</Text>
      </Pressable>
      {hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={[styles.sheet, { maxWidth: 640 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="title">{label ?? 'Chuno'}</Text>
              <Button title="Ho gaya" size="sm" onPress={() => setOpen(false)} />
            </Row>
            <Input value={q} onChangeText={setQ} placeholder="Type to filter" autoCapitalize="none" autoCorrect={false} />
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={Divider}
              renderItem={({ item }) => {
                const on = set.has(item.value);
                return (
                  <Pressable
                    onPress={() => onChange(on ? values.filter((v) => v !== item.value) : [...values, item.value])}
                    style={[styles.row, on && { backgroundColor: t.surfaceAlt }]}>
                    <Text style={{ flex: 1 }}>{item.label}</Text>
                    <Text color={on ? 'accent' : 'textFaint'}>{on ? '☑' : '☐'}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="small" color="textFaint">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.border }} thumbColor={Platform.OS === 'android' ? t.surface : undefined} />
    </Row>
  );
}

/** Numeric input that keeps a string while typing and yields a number. */
/**
 * A money or quantity box.
 *
 * It owns its own text so a half-typed "12." is not thrown away by a round
 * trip through a number, and it forwards the ref and the rest of the TextInput
 * props. That last part is not decoration: without it, Enter could not move
 * from Qty to Rate on any line of any bill, because every money and quantity
 * field in this app is one of these. The chain stopped dead at the first one.
 *
 * `prefix` renders inside the box. It used to only cancel the left padding and
 * draw nothing at all, so a field marked with ₹ showed no ₹.
 */
type NumberFieldProps = Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'keyboardType'> & {
  label?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  hint?: string;
  error?: string | null;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const NumberField = React.forwardRef<TextInput, NumberFieldProps>(function NumberField(
  { label, value, onChange, hint, error, decimals = 2, prefix, suffix, containerStyle, ...rest },
  ref
) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [lastProp, setLastProp] = useState(value);
  if (value !== lastProp) {
    setLastProp(value);
    setText(value == null ? '' : String(value));
  }
  return (
    <Input
      ref={ref}
      label={label}
      value={text}
      hint={hint}
      error={error}
      containerStyle={containerStyle}
      keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
      {...rest}
      onChangeText={(s) => {
        const cleaned = s.replace(/[^0-9.\-]/g, '');
        setText(cleaned);
        const n = cleaned === '' || cleaned === '-' || cleaned === '.' ? null : Number(cleaned);
        onChange(n == null || Number.isNaN(n) ? null : n);
      }}
      left={prefix ? <Text color="textFaint">{prefix}</Text> : undefined}
      right={suffix ? <Text color="textFaint">{suffix}</Text> : undefined}
    />
  );
});

export function FormSection({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text variant="label" color="textMuted">
        {title}
      </Text>
      {hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A section that stays shut until asked for.
 *
 * Most items a shop adds need a name, a quantity and a rate. Colour, warranty,
 * pack size and which car it fits matter on maybe one item in ten — but shown
 * all at once they make a thirty-second job look like paperwork, which is
 * exactly the complaint this answers. They are all still here, one tap away.
 */
export function Disclosure({
  title,
  hint,
  children,
  defaultOpen = false,
  titleVariant = 'label',
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /**
   * 'label' for a field group ("AUR DETAIL"), 'heading' for anything that is a
   * sentence. Uppercase mono is a signpost; a question set in it is a shout.
   */
  titleVariant?: 'label' | 'heading';
}) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
        <Text variant={titleVariant} color={open ? 'text' : 'textMuted'} style={{ flex: 1 }}>
          {title}
        </Text>
        <Text color="textFaint">{open ? '▴' : '▾'}</Text>
      </Pressable>
      {!open && hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
      {open ? children : null}
    </View>
  );
}

/** Sticky footer with the primary action, for long forms. */
export function FormFooter({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[styles.footer, { backgroundColor: t.surface, borderTopColor: t.border }]}>{children}</View>;
}

/** Ask before a destructive or irreversible action. */
export function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return showConfirm(title, message);
  const { Alert } = require('react-native') as typeof import('react-native');
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

/**
 * Say something happened.
 *
 * A toast on every platform, not an OS Alert on native: a blocking dialog for
 * "Photo lag gayi" is an interruption between the counter and the next
 * customer. The buzz carries the same news to a hand that is not looking.
 *
 * `tone` decides both the colour and which buzz: 'ok' is for the moments the
 * shop's books actually changed — a bill posted, stock put away — and is the
 * one worth feeling.
 */
export function notify(message: string, tone: 'default' | 'ok' | 'danger' = 'default') {
  showToast(message, tone);
  if (tone === 'ok') done();
  else if (tone === 'danger') nope();
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12 },
  sheet: { flex: 1, width: '100%', alignSelf: 'center', padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.sm, borderRadius: radius.sm },
  section: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md, ...shadow.sm },
  footer: {
    padding: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
});
