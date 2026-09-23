/**
 * Where the "password bhool gaye" email lands.
 *
 * Supabase puts a recovery token in the URL and the client turns it into a
 * short-lived session before this screen renders (detectSessionInUrl, web
 * only). From there setting a password is an ordinary updateUser call.
 *
 * This is the owner's escape hatch, not the shop's. Staff logins are addresses
 * the owner invented with no inbox behind them — they get their password reset
 * by the owner from the staff screen. But if the owner forgets theirs, there
 * is nobody above them to ask, and this is the only way back in.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { changeMyPassword } from '@/lib/staff';
import { Button, Input, Stack, Text } from '@/ui';
import { fonts, palette, radius, shadow, space } from '@/ui/theme';

const INK = palette.dark.navy;

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  // No recovery session means the link was never opened, has expired, or was
  // already used. Say that, rather than letting them type a password into a
  // form that cannot possibly save it.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await changeMyPassword(password);
    setBusy(false);
    if (err) { setError(err); return; }
    router.replace('/');
  }

  return (
    <View style={[styles.root, { backgroundColor: INK }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={104}>
          <View style={styles.brand}>
            <Image source={require('../../assets/images/splash-icon.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.wordmark}>AutoLoom</Text>
          </View>

          <View style={[styles.card, shadow.lg]}>
            {ready === false ? (
              <Stack gap={space.md}>
                <Text variant="title">Link kaam nahi kar raha</Text>
                <Text color="textMuted">
                  Ye link purana ho gaya hai ya pehle use ho chuka hai. Sign in screen se dobara
                  "Password bhool gaye?" dabao.
                </Text>
                <Button title="Sign in par jao" size="lg" full onPress={() => router.replace('/sign-in')} />
              </Stack>
            ) : (
              <Stack gap={space.md}>
                <Text variant="title">Naya password</Text>
                <Input
                  label="Naya password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  placeholder="Kam se kam 8 character"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  error={error}
                />
                <Button
                  title="Set karo"
                  size="lg"
                  full
                  onPress={submit}
                  loading={busy}
                  disabled={password.length < 8 || ready === null}
                />
              </Stack>
            )}
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.xxl },
  brand: { alignItems: 'center', marginBottom: space.xl },
  mark: { width: 64, height: 64, marginBottom: space.md },
  wordmark: { color: '#F5F6F8', fontFamily: fonts.display, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: palette.light.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.lg,
  },
});
