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

  // ── Midday: Check-in ──────────────────────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚡ Midday check-in',
      body: "How are your MITs going? Tap to review your afternoon plan.",
      data: { screen: 'Home' },
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

// ── One-Off Notification (for testing) ────────────────────────────────────────

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Synapse notifications are working!',
      body: 'You will receive your morning planning prompt every day at your set time.',
      sound: true,
    },
    trigger: { seconds: 2 },
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
