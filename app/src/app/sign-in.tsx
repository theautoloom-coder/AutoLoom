/**
 * Sign in.
 *
 * The counter phone is the shop's till, so this screen is the shutter going
 * up. It carries the brand on its own terms: the louvred A on garage black,
 * the card sitting on top of it in paper white. Everything below the button
 * is quiet — a working tool, not a landing page.
 */
import React, { useRef, useState } from 'react';
import { Image, StyleSheet, View, type TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';
import { Button, Input, Stack, Text } from '@/ui';
import { TAGLINE } from '@/ui/brand';
import { fonts, palette, radius, shadow, space } from '@/ui/theme';

const INK = palette.dark.navy;

export default function SignInScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<TextInput>(null);

  async function submit() {
    if (!email || !password) {
      setError('Email aur password dono daalo.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <View style={[styles.root, { backgroundColor: INK }]}>
      {/* Grille bands: the icon's louvres, blown up and bled off the top. */}
      <View style={styles.bands} pointerEvents="none">
        {[0.10, 0.08, 0.06, 0.04, 0.03].map((opacity, i) => (
          <View key={i} style={[styles.band, { opacity, top: i * 34 }]} />
        ))}
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The password box is the last thing on screen and the keyboard is
            tall. This lifts it clear on both platforms — the old
            KeyboardAvoidingView was passed no behavior on Android, so it did
            nothing there and the field stayed hidden behind the keys. */}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={space.xxl}>
          <View style={styles.brand}>
            <Image source={require('../../assets/images/splash-icon.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.wordmark}>AutoLoom</Text>
            <Text style={styles.tagline}>{TAGLINE}</Text>
          </View>

          <View style={[styles.card, shadow.lg]}>
            <Stack gap={space.md}>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                placeholder="you@shop.in"
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
                submitBehavior="submit"
              />
              <Input
                ref={pwRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                placeholder="••••••••"
                returnKeyType="go"
                onSubmitEditing={submit}
                error={error}
              />
            </Stack>
            <Button title="Kholo" size="lg" full onPress={submit} loading={busy} />
            {!isConfigured() ? (
              <Text variant="small" color="danger">
                App configured nahi hai — .env mein Supabase aur PowerSync URL daalo.
              </Text>
            ) : null}
          </View>

          <Text style={styles.foot}>Har bill, khata aur stock is phone par — signal ho ya na ho.</Text>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.xxl },
  bands: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  band: { position: 'absolute', left: -40, right: -40, height: 18, backgroundColor: palette.light.accent },
  brand: { alignItems: 'center', marginBottom: space.xl },
  mark: { width: 72, height: 72, marginBottom: space.md },
  wordmark: { color: '#F5F6F8', fontFamily: fonts.display, fontSize: 32, fontWeight: '800', letterSpacing: -0.9 },
  tagline: { color: '#7D838F', fontFamily: fonts.mono, fontSize: 10, fontWeight: '600', letterSpacing: 3, marginTop: 7 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: palette.light.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.lg,
  },
  foot: { color: '#6B717C', fontFamily: fonts.sans, fontSize: 12, textAlign: 'center', marginTop: space.xl, maxWidth: 340, alignSelf: 'center', lineHeight: 18 },
});
