/**
 * In-app toast + confirm dialog. Used only on web, where a bare
 * window.alert/confirm looks like a browser default rather than part of the
 * product; native keeps the OS Alert, which already looks native. Plain
 * module-level pub/sub so `notify()`/`confirm()` stay callable from anywhere
 * (event handlers, async posting code) without needing a hook.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button, Row, Text, useTheme } from './index';
import { radius, shadow, space } from './theme';

type ToastItem = { id: number; message: string; tone: 'default' | 'danger' };
type ConfirmState = { title: string; message: string; resolve: (v: boolean) => void } | null;

let toastListeners: ((items: ToastItem[]) => void)[] = [];
let toastItems: ToastItem[] = [];
let nextId = 1;

function pushToast(message: string, tone: ToastItem['tone'] = 'default') {
  const item = { id: nextId++, message, tone };
  toastItems = [...toastItems, item];
  toastListeners.forEach((l) => l(toastItems));
  setTimeout(() => {
    toastItems = toastItems.filter((t) => t.id !== item.id);
    toastListeners.forEach((l) => l(toastItems));
  }, 3200);
}

let confirmListener: ((s: ConfirmState) => void) | null = null;

/** Mount once near the root. Renders web toasts and the web confirm sheet. */
export function ToastHost() {
  const t = useTheme();
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  useEffect(() => {
    toastListeners.push(setItems);
    confirmListener = setConfirmState;
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
      confirmListener = null;
    };
  }, []);

  return (
    <>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: space.xl, alignItems: 'center', gap: space.sm, zIndex: 50, pointerEvents: 'box-none' }}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[
              shadow.md,
              {
                backgroundColor: item.tone === 'danger' ? t.danger : t.navy,
                borderRadius: radius.md,
                paddingVertical: 12,
                paddingHorizontal: space.lg,
                maxWidth: 420,
              },
            ]}>
            <Text style={{ color: item.tone === 'danger' ? t.accentText : t.navyText }}>{item.message}</Text>
          </View>
        ))}
      </View>

      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => confirmState?.resolve(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg }}
          onPress={() => confirmState?.resolve(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[shadow.lg, { backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, width: '100%', maxWidth: 400 }]}>
            <Text variant="title">{confirmState?.title}</Text>
            <Text color="textMuted">{confirmState?.message}</Text>
            <Row gap={space.sm} style={{ justifyContent: 'flex-end', marginTop: space.xs }}>
              <Button title="Rehne do" tone="secondary" onPress={() => confirmState?.resolve(false)} />
              <Button title="Aage badho" tone="danger" onPress={() => confirmState?.resolve(true)} />
            </Row>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function showToast(message: string, tone: ToastItem['tone'] = 'default') {
  pushToast(message, tone);
}

export function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmListener?.({
      title,
      message,
      resolve: (v) => {
        confirmListener?.(null);
        resolve(v);
      },
    });
  });
}
