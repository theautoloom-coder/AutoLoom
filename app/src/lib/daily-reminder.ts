/**
 * "Shaam ka hisaab" — a local notification every day at 6:30pm nudging
 * whoever is signed in to check pending customer payments and send
 * reminders. Scheduled entirely on-device (expo-notifications' daily
 * trigger, handled by the OS) — no push server, no backend, works offline
 * and keeps firing even if the app has been closed since it was scheduled.
 *
 * Native only: a browser tab has no reliable way to notify once it's
 * closed, so the web build skips this rather than pretend to promise it.
 */
import { Platform } from 'react-native';

const IDENTIFIER = 'autoloom-daily-pending-reminder';
const HOUR = 18;
const MINUTE = 30;

/** Ask for notification permission once, then schedule the 6:30pm daily reminder if it isn't already set. */
export async function ensureDailyPendingReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = require('expo-notifications') as typeof import('expo-notifications');

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  const perms = await N.getPermissionsAsync();
  if (!perms.granted) {
    if (!perms.canAskAgain) return;
    const req = await N.requestPermissionsAsync();
    if (!req.granted) return;
  }

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('reminders', { name: 'Payment reminders', importance: N.AndroidImportance.DEFAULT });
  }

  const existing = await N.getAllScheduledNotificationsAsync();
  const already = existing.find((n) => n.identifier === IDENTIFIER);
  const trigger = already?.trigger as { hour?: number; minute?: number } | null;
  if (already && trigger?.hour === HOUR && trigger?.minute === MINUTE) return;
  if (already) await N.cancelScheduledNotificationAsync(IDENTIFIER);

  await N.scheduleNotificationAsync({
    identifier: IDENTIFIER,
    content: {
      title: 'AutoLoom · Shaam ka hisaab',
      body: 'Aaj ke pending payments check karo aur customers ko reminder bhejo.',
      data: { url: '/reminders' },
    },
    trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: HOUR, minute: MINUTE },
  });
}

/** Cancel the daily reminder (Settings → "Turn off the 6:30pm reminder"). */
export async function cancelDailyPendingReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  const N = require('expo-notifications') as typeof import('expo-notifications');
  await N.cancelScheduledNotificationAsync(IDENTIFIER).catch(() => {});
}
