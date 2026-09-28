/**
 * Touch feedback.
 *
 * The single largest difference between an app that feels built and one that
 * feels assembled, and it costs almost nothing. A counter hand holding the
 * phone in one hand and a carton in the other often is not looking at the
 * screen when they tap — the buzz is the confirmation, not the toast.
 *
 * Kept deliberately thin. Three events, each meaning one thing:
 *
 *   tap()   something was pressed. Light, so it does not become annoying at
 *           the fiftieth bill of the day.
 *   done()  something was committed — a bill posted, stock put away. This is
 *           the one that matters: it fires when the shop's books changed.
 *   nope()  it did not work.
 *
 * Silent on web, where there is no haptic engine, and silent if the device
 * has no motor. Never throws: feedback failing must never take down the
 * action it was reporting on.
 */
import { Platform } from 'react-native';

type Haptics = typeof import('expo-haptics');

let mod: Haptics | null = null;
function haptics(): Haptics | null {
  if (Platform.OS === 'web') return null;
  if (mod) return mod;
  try {
    mod = require('expo-haptics') as Haptics;
    return mod;
  } catch {
    return null;
  }
}

/** A press was registered. */
export function tap(): void {
  const h = haptics();
  h?.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
}

/** The books changed: a bill posted, stock received, a payment taken. */
export function done(): void {
  const h = haptics();
  h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
}

/** It did not work. */
export function nope(): void {
  const h = haptics();
  h?.notificationAsync(h.NotificationFeedbackType.Error).catch(() => {});
}
