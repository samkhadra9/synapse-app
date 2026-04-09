/**
 * Synapse Notification Service
 *
 * Schedules local push notifications for:
 *   - Morning planning reminder
 *   - Midday check-in
 *   - Evening review reminder
 *
 * Also handles the "deep link" when user taps a notification → navigates
 * them to the correct screen.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Setup ─────────────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Synapse',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D7377',
    });
  }

  return true;
}

// ── Schedule Daily Notifications ──────────────────────────────────────────────

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}

/**
 * Schedules all three daily notifications.
 * Call this whenever the user updates their timing preferences.
 */
export async function scheduleDailyNotifications(
  morningTime: string,   // 'HH:mm'
  eveningTime: string,   // 'HH:mm'
): Promise<void> {
  // Cancel all existing scheduled notifications first
  await Notifications.cancelAllScheduledNotificationsAsync();

  const morning = parseTime(morningTime);
  const midday  = { hour: 12, minute: 30 };
  const evening = parseTime(eveningTime);

  // ── Morning: Planning Prompt ──────────────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🌅 Morning planning — 10 min',
      body: "What are your 3 most important things today? Open Synapse to structure your day.",
      data: { screen: 'MorningPlanning' },
      sound: true,
    },
    trigger: {
      hour: morning.hour,
      minute: morning.minute,
      repeats: true,
    } as Notifications.CalendarTriggerInput,
  });

  // ── Midday: Decision Fatigue check-in ────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚡ Overwhelmed? Stuck?',
      body: "Tap to get one clear thing to do right now. Decision fatigue mode.",
      data: { screen: 'Fatigue' },
      sound: false,
    },
    trigger: {
      hour: midday.hour,
      minute: midday.minute,
      repeats: true,
    } as Notifications.CalendarTriggerInput,
  });

  // ── Evening: Reflection ───────────────────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🌙 Evening review — 5 min',
      body: "Brain dump your open loops and set tomorrow's MITs. Takes 5 minutes.",
      data: { screen: 'EveningReview' },
      sound: true,
    },
    trigger: {
      hour: evening.hour,
      minute: evening.minute,
      repeats: true,
    } as Notifications.CalendarTriggerInput,
  });

  console.log('Notifications scheduled:', { morning: morningTime, midday: '12:30', evening: eveningTime });
}

// ── Forgiveness / Lapse Recovery Notifications ────────────────────────────────
// Scheduled once when a lapse is detected. Cancelled if user returns.

const LAPSE_NOTIFICATION_ID = 'synapse-lapse-recovery';

export async function scheduleLapseNotification(daysSilent: number): Promise<void> {
  // Don't double-schedule
  await Notifications.cancelScheduledNotificationAsync(LAPSE_NOTIFICATION_ID).catch(() => {});

  const isWeekPlus = daysSilent >= 7;
  await Notifications.scheduleNotificationAsync({
    identifier: LAPSE_NOTIFICATION_ID,
    content: {
      title: isWeekPlus ? 'Still here when you\'re ready.' : 'No pressure.',
      body: isWeekPlus
        ? 'No backlog, no catch-up. Just one small win today if you want it.'
        : 'Want to plan one small thing? That\'s all. Tap to open.',
      data: { screen: 'QuickWin' },
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 60 * 60 * 3 } as Notifications.TimeIntervalTriggerInput,
  });
}

export async function cancelLapseNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LAPSE_NOTIFICATION_ID).catch(() => {});
}

// ── One-Off Notification (for testing) ────────────────────────────────────────

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Synapse notifications are working!',
      body: 'You will receive your morning planning prompt every day at your set time.',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 } as Notifications.TimeIntervalTriggerInput,
  });
}

// ── Notification Response Listener ───────────────────────────────────────────

/**
 * Call once at app root. Returns cleanup function.
 * When user taps a notification, navigates to the correct screen.
 */
export function addNotificationResponseListener(
  navigate: (screen: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const screen = response.notification.request.content.data?.screen as string;
    if (screen) navigate(screen);
  });

  return () => subscription.remove();
}
