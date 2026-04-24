/**
 * fifteen.ts — the 15-minute opener.
 *
 * Design: a tiny global store (zustand, not persisted) so every surface
 * in the app can see whether a fifteen session is currently live. The
 * store holds the task id/text, the start/end epoch-ms, and a tick
 * counter that rev-bumps every second so components re-render as time
 * passes.
 *
 * Haptics:
 *   t+5min, t+10min, t+15min — a soft pulse at each. The last one is
 *   also the session-complete tick. Stop() cancels any pending.
 *
 * Why 15 (not 10 or 25):
 *   Short enough that the threshold to start is near-zero for an ADHD
 *   brain in a bad state. Long enough to actually make a dent on the
 *   task. Matches the "just open the doc" micro-action pattern.
 *
 * This file deliberately does NOT import any screens / navigation — it
 * is a pure service. Any UI surface that cares can subscribe via
 * useFifteen(...).
 */

import { create } from 'zustand';
import { Vibration } from 'react-native';

const DEFAULT_DURATION_MIN = 15;
/** When to buzz during a session, measured from start. */
const HAPTIC_MARKS_MIN = [5, 10, 15] as const;

interface FifteenState {
  /** Is a fifteen session currently running? */
  active: boolean;
  /** The task this session is working on — null if started without a task. */
  taskId: string | null;
  taskText: string;
  /** Epoch ms when the session started. */
  startedAt: number;
  /** Epoch ms when the session will end. */
  endsAt: number;
  /** Ticks up every second — forces subscribers to re-render. */
  tick: number;

  start: (args: { taskId?: string | null; taskText?: string; durationMinutes?: number }) => void;
  stop: () => void;
  /** Seconds remaining. Negative if already done. */
  remaining: () => number;
}

// Timer handles — kept outside the store so we don't trigger renders
// when we mutate them. Cleared on stop() or app reload.
let tickInterval: ReturnType<typeof setInterval> | null = null;
const hapticTimers: ReturnType<typeof setTimeout>[] = [];

function buzz(intensityMs = 40) {
  // RN Vibration has no "soft" option — keep it short so it reads as
  // a gentle tick, not an alert. expo-haptics upgrade lives in CP3.
  try { Vibration.vibrate(intensityMs); } catch { /* noop on web */ }
}

function clearAllTimers() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  while (hapticTimers.length) {
    const h = hapticTimers.pop();
    if (h) clearTimeout(h);
  }
}

export const useFifteen = create<FifteenState>((set, get) => ({
  active: false,
  taskId: null,
  taskText: '',
  startedAt: 0,
  endsAt: 0,
  tick: 0,

  start: ({ taskId = null, taskText = '', durationMinutes = DEFAULT_DURATION_MIN }) => {
    // Cancel any existing session's timers before replacing.
    clearAllTimers();

    const now = Date.now();
    const endsAt = now + durationMinutes * 60_000;

    set({
      active: true,
      taskId,
      taskText,
      startedAt: now,
      endsAt,
      tick: 0,
    });

    // Opening buzz — confirms the tap.
    buzz(30);

    // One-second tick so any <FifteenBanner /> countdown stays accurate.
    tickInterval = setInterval(() => {
      const { endsAt: e, active: a } = get();
      if (!a) return;
      if (Date.now() >= e) {
        // Final tick handled by the scheduled haptic at t+15; just flip state.
        clearAllTimers();
        set(s => ({ active: false, tick: s.tick + 1 }));
        return;
      }
      set(s => ({ tick: s.tick + 1 }));
    }, 1000);

    // Schedule the 5 / 10 / 15 min haptics.
    HAPTIC_MARKS_MIN.forEach(min => {
      const ms = min * 60_000;
      // The last mark is a slightly stronger "session complete" tick; the
      // earlier ones are gentle "still with you" pulses.
      const strength = min === HAPTIC_MARKS_MIN[HAPTIC_MARKS_MIN.length - 1] ? 60 : 30;
      hapticTimers.push(setTimeout(() => buzz(strength), ms));
    });
  },

  stop: () => {
    clearAllTimers();
    set({
      active: false,
      taskId: null,
      taskText: '',
      startedAt: 0,
      endsAt: 0,
    });
  },

  remaining: () => {
    const { active, endsAt } = get();
    if (!active) return 0;
    return Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
  },
}));

/** Format seconds as "MM:SS". */
export function formatRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
