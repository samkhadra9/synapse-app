/**
 * proactivePush.ts — CP5.2
 *
 * Once a day, give Haiku the user's portrait, recent completion log, and
 * today's "the one" — let *it* decide whether to ping, and *what to say*.
 *
 * Not "you have 4 tasks due." More like:
 *   "Hey — yesterday you said you were dreading the Monday call. It's 20 min.
 *    Want to chat before?"
 *
 * The proactive push is a one-off local notification. Tap → deep-link into
 * Chat 'dump' mode with the message pre-seeded as the assistant's opener
 * (via the existing `initialMessage` route param), so the user lands inside
 * a conversation already in flight, not a blank textbox.
 *
 * Triggers:
 *   - On app foreground (cheap — guarded by a per-day idempotency check)
 *   - On session ready (post-login, post-cold-start)
 *
 * Banned words apply: no exclaim marks, no "Great job!", no fake urgency,
 * no "remember to". The system prompt enforces the same vocabulary
 * discipline the chat assistant uses.
 *
 * Opt-out: `profile.proactivePushEnabled === false` short-circuits everything.
 * Default = enabled (only matters once notification permission is granted).
 *
 * Idempotency: notifications are scheduled with the stable identifier
 * `synapse-proactive-<YYYY-MM-DD>`. Re-running on the same day is a no-op:
 * the existing one is cancelled and replaced, so the user sees at most
 * one proactive push per day no matter how often the app foregrounds.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { format } from 'date-fns';

import { fetchAnthropic } from '../lib/anthropic';
import { useStore } from '../store/useStore';
import type { CompletionEntry, Portrait, Task } from '../store/useStore';

// ── Stable id ────────────────────────────────────────────────────────────────

function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function notificationId(day = todayKey()): string {
  return `synapse-proactive-${day}`;
}

// ── Module-level throttle ────────────────────────────────────────────────────
// Avoid hammering Haiku if the user opens and closes the app a dozen times
// in the same JS lifetime. This lives in module memory only — a fresh launch
// is happy to call again, but the *scheduled-notification* check below will
// short-circuit if the day's push is already lined up.

let lastDecisionAt = 0;
const MIN_RECHECK_MS = 6 * 60 * 60 * 1000; // 6h

// ── System prompt ────────────────────────────────────────────────────────────

const PROACTIVE_SYSTEM = `You are a quiet, perceptive friend reaching out to ${'${firstName}'} once today. You only get this one shot.

You have:
  - Their portrait — what they're like, what they're building, what trips them up
  - The last 3 days of things they've actually done (their completion log)
  - Today's "the one" task (the single most important thing for today, if any)
  - Tomorrow's calendar headline (if any)

Decide TWO things:
  1. shouldPing: does sending a message right now genuinely help, or is it noise?
  2. message: if yes, what's the single line you'd send?

WHEN TO PING (yes):
  - You notice something specific from the portrait that connects to today's the-one
  - There's a recent stuck-pattern they mentioned and an obvious unblock
  - They flagged dread about something today and a small reframe might help
  - It's been a real day or two of completions and a one-line reflection lands

WHEN TO SKIP (no):
  - You'd just be repeating the calendar / their task list back at them
  - You'd be saying "good luck" / "you got this" / "remember to"
  - You don't have anything specific — generic check-ins are noise
  - Their completion log already shows momentum; don't interrupt it

VOICE RULES (strict):
  - One short sentence, MAX 18 words. A two-sentence message is too long.
  - No exclaim marks. No emoji.
  - No "Great job", "you got this", "remember to", "don't forget"
  - No "you should" / "you need to" / "you must"
  - No fake urgency — never "important", "critical", "deadline"
  - Lower-case casual fine; you can open with "hey" or just dive in
  - Refer to ${'${firstName}'} sparingly — usually skip the name entirely
  - Match the portrait's energy: dry / warm / matter-of-fact, never bouncy

OUTPUT (JSON only, no prose, no markdown fences):
{"shouldPing": true, "message": "the single sentence you'd send"}
or
{"shouldPing": false, "message": null}

If in doubt: shouldPing = false. The cost of a bad ping is much higher than the cost of a missed one.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function summariseSection(text?: string, max = 240): string {
  const t = (text ?? '').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function formatPortrait(portrait: Portrait | undefined): string {
  if (!portrait) return '—';
  return [
    `HOW YOU WORK: ${summariseSection(portrait.howYouWork?.text)}`,
    `WHAT YOU'RE BUILDING: ${summariseSection(portrait.whatYoureBuilding?.text)}`,
    `WHAT GETS IN THE WAY: ${summariseSection(portrait.whatGetsInTheWay?.text)}`,
    `WHERE YOU'RE GOING: ${summariseSection(portrait.whereYoureGoing?.text)}`,
  ].join('\n');
}

function formatRecentCompletions(entries: CompletionEntry[], days = 3): string {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = entries
    .filter(e => {
      const t = Date.parse(e.at);
      return Number.isFinite(t) && t >= cutoff;
    })
    .slice(-30); // safety cap
  if (recent.length === 0) return '— (nothing logged in the last 3 days)';
  return recent.map(e => `  - ${e.text}`).join('\n');
}

function formatTheOne(task: Task | undefined | null): string {
  if (!task) return '— (no the-one set for today)';
  if (task.completed) return `${task.text} ← already done today`;
  return task.text;
}

function formatNextOpenTasks(tasks: Task[], todayStr: string, max = 4): string {
  const upcoming = tasks
    .filter(t => !t.completed)
    .filter(t => !t.date || t.date >= todayStr)
    .filter(t => !t.isInbox)
    .slice(0, max);
  if (upcoming.length === 0) return '—';
  return upcoming.map(t => `  - ${t.text}`).join('\n');
}

// ── JSON parse ───────────────────────────────────────────────────────────────

interface DecisionPayload {
  shouldPing: boolean;
  message: string | null;
}

function parseDecisionJson(raw: string): DecisionPayload {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return { shouldPing: false, message: null };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    const message =
      typeof parsed?.message === 'string' && parsed.message.trim().length > 0
        ? parsed.message.trim()
        : null;
    const shouldPing = parsed?.shouldPing === true && Boolean(message);
    return { shouldPing, message: shouldPing ? message : null };
  } catch {
    return { shouldPing: false, message: null };
  }
}

// ── Banned-word audit ────────────────────────────────────────────────────────
// Belt-and-braces. The system prompt asks the model to avoid these, but if
// it slips through anyway we'd rather skip the ping than send a bad one.

const BANNED_FRAGMENTS = [
  '!',
  'great job',
  'you got this',
  'remember to',
  'don\'t forget',
  'crushing it',
  'congrats',
  'amazing',
  'you should',
  'you need to',
  'you must',
  'critical',
  'urgent',
  'asap',
  'deadline',
];

function passesBannedWordAudit(message: string): boolean {
  const lower = message.toLowerCase();
  return !BANNED_FRAGMENTS.some(b => lower.includes(b));
}

// ── Schedule the actual push ─────────────────────────────────────────────────

/**
 * Pick the next reasonable fire-time for today's proactive push.
 *
 * If we're between 9:00 and 11:00 local — fire in 90 seconds (catches the
 * morning open). Otherwise fire either at 9:30 today (if still in the
 * future) or at 9:30 tomorrow.
 */
function pickFireDate(now = new Date()): Date {
  const fire = new Date(now);
  const hour = now.getHours();

  if (hour >= 9 && hour < 11) {
    // Morning window — fire shortly so the user sees it on this open
    fire.setTime(now.getTime() + 90 * 1000);
    return fire;
  }

  // Otherwise schedule for the next 9:30 morning slot
  fire.setHours(9, 30, 0, 0);
  if (fire <= now) {
    fire.setDate(fire.getDate() + 1);
  }
  return fire;
}

async function scheduleProactiveNotification(message: string): Promise<void> {
  const id = notificationId();
  // Replace any existing one for today (idempotent re-schedule)
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // not scheduled — fine
  }

  const fireDate = pickFireDate();

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      // No title — keep it as a single quiet line. iOS will use the app
      // name as the sender. Body is the message itself.
      title: 'Aiteall',
      body: message,
      sound: false,
      data: {
        screen: 'ProactivePush',
        // Stash the exact line so the chat can open with it pre-seeded as
        // the model's first turn.
        proactiveSeed: message,
        scheduledFor: fireDate.toISOString(),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });
}

// ── Already-scheduled-today guard ────────────────────────────────────────────

async function alreadyScheduledForToday(): Promise<boolean> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some(n => n.identifier === notificationId());
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a single proactive-push decision pass. Cheap to call repeatedly —
 * everything below short-circuits if the day's decision has already happened
 * or the user has opted out.
 *
 * Force=true bypasses the throttle (used by a Settings "send a test ping").
 */
export async function runProactiveDecision(opts: { force?: boolean } = {}): Promise<{
  scheduled: boolean;
  reason: string;
}> {
  if (!Device.isDevice) return { scheduled: false, reason: 'not-a-device' };

  const state    = useStore.getState();
  const profile  = state.profile;

  // Honour user opt-out (default enabled — explicit `false` to disable)
  if (profile.proactivePushEnabled === false) {
    return { scheduled: false, reason: 'opted-out' };
  }

  // CP9.1 — Pause mode. While the user has explicitly said "I'm cooked",
  // we do NOT ping. We also tear down any push that might already be queued
  // for today so a stale Haiku message can't fire mid-pause.
  const pauseUntilMs = profile.pauseModeUntil ? Date.parse(profile.pauseModeUntil) : 0;
  if (Number.isFinite(pauseUntilMs) && pauseUntilMs > Date.now()) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId());
    } catch { /* ignore — wasn't scheduled */ }
    return { scheduled: false, reason: 'paused' };
  }

  // Notification permission — don't prompt here; if not granted, skip silently.
  const perms = await Notifications.getPermissionsAsync();
  if (perms.status !== 'granted') {
    return { scheduled: false, reason: 'no-permission' };
  }

  if (!opts.force) {
    if (Date.now() - lastDecisionAt < MIN_RECHECK_MS) {
      return { scheduled: false, reason: 'throttle' };
    }
    if (await alreadyScheduledForToday()) {
      // Already decided today — leave it alone
      lastDecisionAt = Date.now();
      return { scheduled: false, reason: 'already-scheduled' };
    }
  }

  // Build the briefing
  const todayStr   = todayKey();
  const firstName  = (profile.name?.trim().split(/\s+/)[0]) || 'there';
  const portrait   = profile.portrait;
  const completions = state.completions ?? [];
  const tasks      = state.tasks ?? [];

  const theOne = typeof state.theOneForToday === 'function'
    ? state.theOneForToday()
    : tasks.find(t => t.isTheOne && t.date === todayStr && !t.completed);

  const briefing = [
    `TODAY: ${todayStr}`,
    '',
    'PORTRAIT:',
    formatPortrait(portrait),
    '',
    'LAST 3 DAYS — THINGS THEY ACTUALLY DID:',
    formatRecentCompletions(completions, 3),
    '',
    `THE-ONE FOR TODAY:\n  ${formatTheOne(theOne)}`,
    '',
    'NEXT FEW OPEN TASKS:',
    formatNextOpenTasks(tasks, todayStr, 4),
    '',
    'Decide and return the JSON object now.',
  ].join('\n');

  // Substitute firstName into the system prompt
  const systemPrompt = PROACTIVE_SYSTEM.replace(/\$\{firstName\}/g, firstName);

  let decision: DecisionPayload;
  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: briefing }],
      temperature: 0.4,
    }, profile.anthropicKey || undefined);

    if (!res.ok) {
      return { scheduled: false, reason: `http-${res.status}` };
    }
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    decision = parseDecisionJson(raw);
  } catch (e) {
    console.warn('[proactivePush] decision call failed', e);
    return { scheduled: false, reason: 'fetch-error' };
  } finally {
    lastDecisionAt = Date.now();
  }

  if (!decision.shouldPing || !decision.message) {
    return { scheduled: false, reason: 'model-said-skip' };
  }

  // Belt-and-braces audit. If the model snuck in a banned phrase, drop it.
  if (!passesBannedWordAudit(decision.message)) {
    console.warn('[proactivePush] dropped — banned word in:', decision.message);
    return { scheduled: false, reason: 'banned-word' };
  }

  // Length sanity — 18 words = ~140 chars hard cap
  if (decision.message.length > 200) {
    return { scheduled: false, reason: 'too-long' };
  }

  await scheduleProactiveNotification(decision.message);
  return { scheduled: true, reason: 'scheduled' };
}

/**
 * Cancel any scheduled proactive push (used when the user toggles the
 * Settings opt-out or wipes their data).
 */
export async function cancelProactivePush(day = todayKey()): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId(day));
  } catch {
    // not scheduled — nothing to do
  }
}

/**
 * Read the seed line off a proactive-push tap. Returns null if the
 * notification response wasn't a proactive push.
 */
export function extractProactiveSeed(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const seed = (data as Record<string, unknown>).proactiveSeed;
  return typeof seed === 'string' && seed.trim().length > 0 ? seed.trim() : null;
}
