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
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr ?? '');
  if (!match) {
    console.warn('[notifications] Invalid time string, using fallback 08:00:', timeStr);
    return { hour: 8, minute: 0 };
  }
  const hour   = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.warn('[notifications] Time out of range, using fallback 08:00:', timeStr);
    return { hour: 8, minute: 0 };
  }
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

// ── Smart Morning Brief ────────────────────────────────────────────────────────
// One-time notification with actual task data for today

export async function scheduleMorningBrief(
  morningTime: string,  // 'HH:mm' — user's set morning time
  mitText?: string,     // text of today's top MIT (if one exists)
  taskCount?: number,   // total tasks for today
  calendarEventCount?: number, // number of calendar events today
): Promise<void> {
  // Cancel any existing brief
  await Notifications.cancelScheduledNotificationAsync('synapse-morning-brief').catch(() => {});

  const morning = parseTime(morningTime);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fireDate = new Date(today);
  fireDate.setHours(morning.hour, morning.minute, 0);

  // If that time has already passed today, fire in 30 seconds instead
  if (fireDate <= now) {
    fireDate.setTime(now.getTime() + 30000);
  }

  const title = mitText ? '☀️ Morning, time to focus' : '☀️ Good morning';
  const body = mitText
    ? `Your MIT: ${mitText}. ${taskCount ?? 0} tasks + ${calendarEventCount ?? 0} events today.`
    : `${taskCount ?? 0} tasks waiting. Tap to plan your day.`;

  await Notifications.scheduleNotificationAsync({
    identifier: 'synapse-morning-brief',
    content: {
      title,
      body,
      data: { screen: 'Home' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });
}

export async function cancelMorningBrief(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('synapse-morning-brief').catch(() => {});
}

// ── Drift Detection Nudge ───────────────────────────────────────────────────────
// Gentle nudge if MIT hasn't been completed by its scheduled time + 20 min

export async function scheduleDriftNudge(
  mitText: string,
  scheduledTime?: string,  // 'HH:mm' — when the MIT was planned for
  mitId?: string,
): Promise<void> {
  // Cancel any existing drift nudge first
  await Notifications.cancelScheduledNotificationAsync('synapse-drift-nudge').catch(() => {});

  // Calculate fire time
  let fireDate: Date;
  const now = new Date();

  if (scheduledTime) {
    const scheduled = parseTime(scheduledTime);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    fireDate = new Date(today);
    fireDate.setHours(scheduled.hour, scheduled.minute, 0);
    // Add 20 minutes
    fireDate.setMinutes(fireDate.getMinutes() + 20);
  } else {
    // Current time + 45 minutes
    fireDate = new Date(now.getTime() + 45 * 60 * 1000);
  }

  // If fire time is in the past, don't schedule
  if (fireDate <= now) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: 'synapse-drift-nudge',
    content: {
      title: 'Still with you 👋',
      body: `You planned: "${mitText.slice(0, 60)}" — still want to do this today?`,
      data: { screen: 'Home', mitId: mitId ?? undefined },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });
}

export async function cancelDriftNudge(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('synapse-drift-nudge').catch(() => {});
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
