/**
 * Solas Notification Service
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
    // CP2.6 — explicitly decline the iOS "badge" capability at the OS prompt.
    // We never want a red dot competing with the in-app log; notifications
    // are for gentle reminders, not for nagging from the home screen.
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Aiteall',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D7377',
    });
  }

  // CP2.6: belt and braces — if a legacy install already had badge permission,
  // wipe whatever count it was carrying so we start at zero.
  await clearBadge();

  return true;
}

/**
 * CP2.6 — clear any app-icon badge count.
 *
 * The app's philosophy is that the app is somewhere you go *to*, not something
 * that nags you back. Badge dots are counts-at-rest, which violates CP1.6 as
 * loudly as any on-screen "14 incomplete" pill. We clear on every foreground
 * and after permission grant.
 */
export async function clearBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    // setBadgeCount can throw on platforms that don't support it (e.g. web);
    // swallow silently — not having a badge is the goal anyway.
  }
}

// ── Stable IDs for recurring daily notifications ──────────────────────────────
const DAILY_MORNING_ID = 'aiteall-daily-morning';
const DAILY_MIDDAY_ID  = 'aiteall-daily-midday';
const DAILY_EVENING_ID = 'aiteall-daily-evening';
const WEEKLY_REVIEW_ID = 'aiteall-weekly-review';

/** Sensible fallback if user hasn't set a weekly review day/time yet. */
export const DEFAULT_WEEKLY_REVIEW_DAY  = 0;      // Sunday (JS getDay() convention)
export const DEFAULT_WEEKLY_REVIEW_TIME = '10:00';

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
 * Cancels only the recurring daily slots — not one-off notifications like morning
 * brief, drift nudge, or lapse recovery — so those survive a time-preference update.
 */
export async function scheduleDailyNotifications(
  morningTime: string,   // 'HH:mm'
  eveningTime: string,   // 'HH:mm'
): Promise<void> {
  // Cancel only the recurring daily ones — leave one-off notifications intact
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(DAILY_MORNING_ID),
    Notifications.cancelScheduledNotificationAsync(DAILY_MIDDAY_ID),
    Notifications.cancelScheduledNotificationAsync(DAILY_EVENING_ID),
  ]);

  const morning = parseTime(morningTime);
  const midday  = { hour: 12, minute: 30 };
  const evening = parseTime(eveningTime);

  // ── Morning: Planning Prompt ──────────────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_MORNING_ID,
    content: {
      title: '🌅 Morning planning — 10 min',
      body: "What are your 3 most important things today? Open Aiteall to structure your day.",
      data: { screen: 'MorningPlanning' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: morning.hour,
      minute: morning.minute,
    } as Notifications.DailyTriggerInput,
  });

  // ── Midday: Decision Fatigue check-in ────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_MIDDAY_ID,
    content: {
      title: '⚡ Overwhelmed? Stuck?',
      body: "Tap to get one clear thing to do right now. Decision fatigue mode.",
      data: { screen: 'Fatigue' },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: midday.hour,
      minute: midday.minute,
    } as Notifications.DailyTriggerInput,
  });

  // ── Evening: Reflection ───────────────────────────────────────────────────
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_EVENING_ID,
    content: {
      title: '🌙 Evening review — 5 min',
      body: "Brain dump your open loops and set tomorrow's MITs. Takes 5 minutes.",
      data: { screen: 'EveningReview' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: evening.hour,
      minute: evening.minute,
    } as Notifications.DailyTriggerInput,
  });
}

// ── Weekly Review Notification ────────────────────────────────────────────────
//
// Fires once a week on the chosen day/time, deep-linking into Chat mode 'weekly'
// so the user walks through projects/areas/goals for a short strategic reset.
// Uses expo-notifications' WEEKLY trigger; weekday is 1-7 where Sunday = 1
// (Apple NSDateComponents convention) — we convert from our 0-6 JS convention.

/**
 * Schedules the weekly review nudge. Idempotent — cancels the existing one
 * first so repeated calls (e.g. user changes the day/time) rebind cleanly.
 *
 * @param day  0 = Sunday ... 6 = Saturday (matches JS Date.getDay())
 * @param time 'HH:MM' 24h
 */
export async function scheduleWeeklyReview(
  day: number = DEFAULT_WEEKLY_REVIEW_DAY,
  time: string = DEFAULT_WEEKLY_REVIEW_TIME,
): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID),
  ]);

  const { hour, minute } = parseTime(time);
  const safeDay = (Number.isInteger(day) && day >= 0 && day <= 6) ? day : DEFAULT_WEEKLY_REVIEW_DAY;
  // JS 0-6 (Sun=0) → Apple 1-7 (Sun=1)
  const weekday = safeDay + 1;

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REVIEW_ID,
    content: {
      title: '🗓️ Weekly reset — 6 min',
      body: "Zoom out. What moved, what stalled, what matters next week? Tap to run a quick audit.",
      data: { screen: 'WeeklyReview' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
    } as Notifications.WeeklyTriggerInput,
  });
}

export async function cancelWeeklyReview(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID);
  } catch {
    // no-op if not scheduled
  }
}

// ── Forgiveness / Lapse Recovery Notifications ────────────────────────────────
// Scheduled once when a lapse is detected. Cancelled if user returns.

const LAPSE_NOTIFICATION_ID = 'synapse-lapse-recovery';

export async function scheduleLapseNotification(daysSilent: number): Promise<void> {
  // Don't double-schedule — ignore if notification doesn't exist
  try {
    await Notifications.cancelScheduledNotificationAsync(LAPSE_NOTIFICATION_ID);
  } catch (e) {
    // Expected if notification was never scheduled — ignore
  }

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
  try {
    await Notifications.cancelScheduledNotificationAsync(LAPSE_NOTIFICATION_ID);
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }
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
  try {
    await Notifications.cancelScheduledNotificationAsync('synapse-morning-brief');
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }

  const morning = parseTime(morningTime);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fireDate = new Date(today);
  fireDate.setHours(morning.hour, morning.minute, 0);

  // If that time has already passed today, fire in 30 seconds instead
  if (fireDate <= now) {
    fireDate.setTime(now.getTime() + 30000);
  }

  const title = mitText ? '☀️ Morning' : '☀️ Good morning';
  const body = mitText
    ? `Today's focus: ${mitText}. ${taskCount ?? 0} tasks + ${calendarEventCount ?? 0} events today.`
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
  try {
    await Notifications.cancelScheduledNotificationAsync('synapse-morning-brief');
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }
}

// ── Drift Detection Nudge ───────────────────────────────────────────────────────
// Gentle nudge if MIT hasn't been completed by its scheduled time + 20 min

export async function scheduleDriftNudge(
  mitText: string,
  scheduledTime?: string,  // 'HH:mm' — when the MIT was planned for
  mitId?: string,
): Promise<void> {
  // Cancel any existing drift nudge first
  try {
    await Notifications.cancelScheduledNotificationAsync('synapse-drift-nudge');
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }

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
  try {
    await Notifications.cancelScheduledNotificationAsync('synapse-drift-nudge');
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }
}

// ── Onboarding Notifications ──────────────────────────────────────────────────

const ONBOARDING_WELCOME_ID = 'synapse-onboarding-welcome';
const ONBOARDING_REMINDER_ID = 'synapse-onboarding-reminder';

/**
 * Fire 30 minutes after first install — gentle nudge to start onboarding.
 * Call once from navigation when `!profile.onboardingCompleted && isFirstLaunch`.
 * iOS will present the permissions dialog before scheduling.
 */
export async function scheduleOnboardingWelcome(): Promise<void> {
  // Don't schedule if one already exists
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.some(n => n.identifier === ONBOARDING_WELCOME_ID)) return;

  const fireDate = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now

  await Notifications.scheduleNotificationAsync({
    identifier: ONBOARDING_WELCOME_ID,
    content: {
      title: '👋 Ready when you are.',
      body: "Aiteall takes about 5 minutes to set up. Tap to build your personal operating system.",
      data: { screen: 'Onboarding' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });
}

export async function cancelOnboardingWelcome(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ONBOARDING_WELCOME_ID);
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }
}

/**
 * Let the user pick their own time to do onboarding.
 * The onboarding chat calls this if the user says "I'll do it at 8pm".
 */
export async function scheduleOnboardingReminder(fireDate: Date): Promise<void> {
  // Cancel any existing reminder first
  try {
    await Notifications.cancelScheduledNotificationAsync(ONBOARDING_REMINDER_ID);
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }

  if (fireDate <= new Date()) return; // Don't schedule in the past

  await Notifications.scheduleNotificationAsync({
    identifier: ONBOARDING_REMINDER_ID,
    content: {
      title: '⏰ You asked me to remind you.',
      body: "Now's your time to set up Aiteall — 5 minutes, then your system is ready.",
      data: { screen: 'Onboarding' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });
}

export async function cancelOnboardingReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ONBOARDING_REMINDER_ID);
  } catch (e) {
    // Expected if notification doesn't exist — ignore
  }
}

// ── One-Off Notification (for testing) ────────────────────────────────────────

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Aiteall notifications are working!',
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
