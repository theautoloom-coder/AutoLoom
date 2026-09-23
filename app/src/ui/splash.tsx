/**
 * Animated splash.
 *
 * The native splash (expo-splash-screen) paints the mark on garage black, and
 * this picks up from exactly that frame so the handoff is invisible. Then the
 * one idea: the grille louvres slide open and the A is revealed behind them —
 * a car grille opening, and a loom's weft pulling apart. Wordmark rises, then
 * the whole sheet lifts off the app.
 *
 * Built on RN's own Animated with useNativeDriver, so every frame runs off the
 * JS thread — the counter phone is usually a budget Android and the splash is
 * the first thing anyone judges.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { TAGLINE } from './brand';
import { fonts, palette } from './theme';

const INK = palette.dark.navy;
const LOUVRES = 6;
const MARK = 132;
/** The glow sits well outside the mark so its falloff never shows an edge. */
const GLOW = Math.round(MARK * 2.4);
/** 120 delay + staggered louvres + wordmark + hold + lift-off. */
const TOTAL_MS = 120 + 64 * (LOUVRES - 1) + 520 + 480 + 420 + 340;

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  // One value per louvre, 0 = closed over the mark, 1 = slid away.
  const louvres = useRef([...Array(LOUVRES)].map(() => new Animated.Value(0))).current;
  const word = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  // Ignition: the field behind the grille warming up as the slats pull apart.
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The native driver is missing on react-native-web, so Animated falls back
    // to JS there and the sequence callback is not reliable. Dismissal is
    // therefore driven by a plain timer and the animation is purely visual:
    // a splash must never be able to trap the app behind it.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };

    const open = Animated.stagger(
      64,
      louvres.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      )
    );
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        open,
        Animated.timing(glow, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(word, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(140),
          Animated.timing(tag, { toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(420),
      Animated.parallel([
        Animated.timing(sheet, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();

    const timer = setTimeout(finish, TOTAL_MS);
    return () => clearTimeout(timer);
    // Animation is fire-once for the life of the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { opacity: sheet, transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] },
      ]}>
      <View style={styles.center}>
        <View style={styles.markStage}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
              },
            ]}>
            <Svg width={GLOW} height={GLOW} viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id="ignite" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FF3B45" stopOpacity="0.5" />
                  <Stop offset="0.5" stopColor="#D2141E" stopOpacity="0.16" />
                  <Stop offset="1" stopColor="#D2141E" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#ignite)" />
            </Svg>
          </Animated.View>
        <View style={styles.markWrap}>
          <Image source={require('../../assets/images/splash-icon.png')} style={styles.mark} resizeMode="contain" />
          {/* Louvres: black slats sitting over the mark, alternating the side they exit. */}
          {louvres.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.louvre,
                {
                  top: (MARK / LOUVRES) * i,
                  height: MARK / LOUVRES + 1,
                  transform: [
                    {
                      translateX: v.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, i % 2 === 0 ? -width : width],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
        </View>

        <Animated.Text
          style={[
            styles.word,
            { opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
          ]}>
          AutoLoom
        </Animated.Text>
        <Animated.Text style={[styles.tag, { opacity: tag }]}>{TAGLINE}</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: INK, zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  markStage: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  markWrap: { width: MARK, height: MARK, overflow: 'hidden' },
  mark: { width: MARK, height: MARK },
  louvre: { position: 'absolute', left: -2, width: MARK + 4, backgroundColor: INK },
  word: { color: '#F5F6F8', fontFamily: fonts.display, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 22 },
  tag: { color: '#7D838F', fontFamily: fonts.mono, fontSize: 10, fontWeight: '600', letterSpacing: 3, marginTop: 7 },
});
