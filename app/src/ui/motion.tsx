/**
 * Motion.
 *
 * Two jobs only, both of which answer something the user did or is waiting on:
 * content arriving (staggered entrance) and a number changing (count-up). No
 * ambient animation — a shop counter screen is looked at fifty times a day and
 * anything that moves for decoration becomes noise by the third look.
 *
 * react-native-web has no native animated module, so these run on the JS
 * driver there. Every animation is short and on few nodes, which keeps that
 * honest even on a budget Android.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

/**
 * Fade + rise, staggered by position, so a list assembles instead of snapping
 * in all at once. `index` is the item's place in its group.
 */
export function useEntrance(index = 0, distance = 14) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(v, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, Math.min(index, 8) * 55);
    return () => clearTimeout(t);
  }, [index, v]);

  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  } as Animated.WithAnimatedObject<ViewStyle>;
}

/** Animated wrapper that applies the entrance to whatever it wraps. */
export function Enter({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: ViewStyle }) {
  const anim = useEntrance(index);
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * Counts a figure up to its value. The money on this screen is the reason the
 * owner opened the app, so it earns the one moment of movement.
 */
export function useCountUp(value: number, duration = 700): number {
  const [shown, setShown] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    anim.setValue(0);
    const id = anim.addListener(({ value: p }) => setShown(start + (value - start) * p));
    Animated.timing(anim, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      from.current = value;
      setShown(value);
    });
    return () => anim.removeListener(id);
  }, [value, duration, anim]);

  return shown;
}
