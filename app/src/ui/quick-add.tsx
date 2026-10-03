/**
 * The "+".
 *
 * Five jobs make up almost every entry this shop will ever make: maal came in,
 * maal went out, money was spent, maal was written off, the count was wrong.
 * Before this they lived on separate screens reached separate ways, and the
 * tab bar carried a tab for one of them because it had to go somewhere.
 *
 * A tab bar is for places you go. This is for jobs you do, which is why it is
 * a button and not a sixth tab — and why it sits where a thumb already rests
 * rather than at the top of a screen.
 *
 * It says "Nayi entry", not just "+". A bare red circle is a convention among
 * people who use a lot of apps; the owner of this shop opened it, looked for
 * the way to add stock, and did not find one. A button that has to be guessed
 * at is a button that does not exist.
 *
 * Every label here is a verb, and it is the SAME wording as the heading of the
 * screen it opens. People were telling the owner they could not follow the
 * app, and a button called "Maal Gaya" opening a screen about making a bill
 * is exactly how that happens.
 *
 * What is offered depends on what the person may actually do. A counter hand
 * with no stock permission is not shown a stock correction and then refused.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useSession } from '@/lib/session';

import { IconBadge, Row, Text, useTheme } from './index';
import { tap } from './haptics';
import { Sheet } from './sheet';
import { radius, shadow, space } from './theme';

type Action = { label: string; hint: string; icon: string; accent: string; href: string; allowed: boolean };

export function QuickAdd() {
  const t = useTheme();
  const router = useRouter();
  const { can } = useSession();
  const [open, setOpen] = useState(false);

  const actions: Action[] = [
    {
      label: 'Stock Chadhao',
      hint: 'Supplier se naya maal aaya',
      icon: 'arrow-down-circle-outline',
      accent: 'green',
      href: '/stock/add',
      allowed: can('stock.adjust') || can('purchase.create'),
    },
    {
      label: 'Bill Banao',
      hint: 'Grahak ko maal de rahe ho',
      icon: 'arrow-up-circle-outline',
      accent: 'blue',
      href: '/invoice/edit',
      allowed: can('sale.create'),
    },
    {
      label: 'Kharcha Likho',
      hint: 'Dukaan ka paisa bahar gaya',
      icon: 'wallet-outline',
      accent: 'amber',
      href: '/expenses',
      // This file's own rule, broken in this one place: a counter hand with no
      // permission was shown Kharcha Likho and then landed on a screen with no
      // form on it. expense.record belongs to owner, admin and accounts only.
      allowed: can('expense.record'),
    },
    {
      label: 'Kharab Likho',
      hint: 'Toota, kharab nikla ya gum ho gaya',
      icon: 'alert-circle-outline',
      accent: 'rose',
      href: '/kharab-maal',
      allowed: can('stock.adjust'),
    },
    {
      label: 'Ginti Karo',
      hint: 'Shelf par gino, farak ho to theek karo',
      icon: 'checkbox-outline',
      accent: 'violet',
      href: '/stock-check',
      allowed: can('stock.count') || can('stock.adjust'),
    },
  ].filter((a) => a.allowed);

  if (actions.length === 0) return null;

  function go(href: string) {
    setOpen(false);
    // Let the sheet start closing before the screen changes, or the push
    // fights the dismissal and both look jerky.
    setTimeout(() => router.push(href as never), 120);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nayi entry"
        onPress={() => { tap(); setOpen(true); }}
        style={(s) => [
          {
            position: 'absolute',
            right: space.lg,
            // Clear of the tab bar, where the thumb already is.
            bottom: Platform.OS === 'web' ? 76 : 92,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 52,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            backgroundColor: t.accent,
            transform: [{ scale: s.pressed ? 0.97 : 1 }],
          },
          shadow.lg,
        ]}>
        <Text style={{ color: t.accentText, fontSize: 26, lineHeight: 30, marginTop: -2 }}>+</Text>
        <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 15 }}>Nayi entry</Text>
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Kya karna hai?">
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => { tap(); go(a.href); }}
            style={(s) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.md,
                borderRadius: radius.lg,
                backgroundColor: s.pressed ? t.surfaceAlt : 'transparent',
              },
            ]}>
            <IconBadge name={a.icon as never} accent={a.accent} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{a.label}</Text>
              <Text variant="small" color="textMuted">
                {a.hint}
              </Text>
            </View>
            <Text color="textFaint">›</Text>
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}
