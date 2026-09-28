/**
 * Bottom sheet.
 *
 * The one place in this app where motion is not decoration: a panel that
 * slides up from the edge it belongs to tells you where it came from and where
 * it will go back to. Dropped in with no transition it reads as a screen
 * replacing the screen, and you lose your place.
 *
 * Fast on purpose — 220ms in on an ease-out so it settles rather than arrives,
 * 160ms out because leaving should not be something you wait for. Dismissing
 * never waits for the animation: tap the backdrop and the close is already
 * happening.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, useTheme } from './index';
import { radius, space } from './theme';

export function Sheet({
  open,
  onClose,
  title,
  hint,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** One short line. If it needs two, the sheet is doing too much. */
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 160,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      // The web has no native driver; everything else gets one.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, slide]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: '#0B0D10', opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Band karo" />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: height * 0.85,
          backgroundColor: t.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
        }}>
        <SafeAreaView edges={['bottom']}>
          {/* The grabber. It says "this came from the bottom and goes back
              there" without anybody having to be told. */}
          <View style={{ alignItems: 'center', paddingTop: space.sm, paddingBottom: space.xs }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          </View>

          {title ? (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xs, gap: 2 }}>
              <Text variant="title">{title}</Text>
              {hint ? (
                <Text variant="small" color="textMuted">
                  {hint}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ padding: space.lg, paddingTop: space.sm, gap: space.sm }}>{children}</View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
