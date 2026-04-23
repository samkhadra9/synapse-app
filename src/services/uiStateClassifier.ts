/**
 * uiStateClassifier.ts — pure function: the UI mode-picker
 *
 * Three states, inferred from recent behaviour and store snapshot:
 *
 *   'open'   — user has space. Recently active, completing things,
 *               conversations feel generative. Show the full Dashboard —
 *               horizontal pager, projects, habits, goals.
 *
 *   'narrow' — user is compressed. Many short sessions, low completion
 *               rate, high task backlog on today, close to a calendar
 *               event. Show the narrow home: MIT + next action only.
 *
 *   'held'   — user has been away, or is opening the app with no clear
 *               intent. Show the held home: a gentle "what's on your
 *               mind?" welcome that routes straight into chat.
 *
 * The classifier is a pure function so it can be tested and reasoned
 * about without pulling React. The caller (HomeAdaptive) passes a
 * snapshot; it returns a decision + a short "why" string for debugging.
 */

import type { SessionEvent, Task } from '../store/useStore';

export type UIState = 'open' | 'narrow' | 'held';

export interface UIStateSnapshot {
  /** ISO string of now. Injectable for tests. */
  now?: string;
  /** Rolling session log (most recent last). */
  sessionLog: SessionEvent[];
  /** All tasks in the store. */
  tasks: Task[];
  /** When the user first opened the app (YYYY-MM-DD). */
  firstOpenDate?: string;
  /** Last active day (YYYY-MM-DD). */
  lastActiveDate?: string;
}

export interface UIStateDecision {
  state: UIState;
  /** Short string describing why — for diagnostics, not end users. */
  reason: string;
}

// ── Thresholds ───────────────────────────────────────────────────────────────
//
// All time windows in hours. Tuned by feel; easy to tweak.

const HELD_GAP_HOURS    = 48;  // >2 days since last session => held
const HELD_NEW_USER_DAY = 1;   // first 24h of app use => held-ish
const NARROW_SHORT_SESSIONS_WINDOW_HOURS = 6;
const NARROW_SHORT_SESSIONS_THRESHOLD    = 4; // 4+ sessions in 6h = compressed
const NARROW_TODAY_TASKS_HEAVY = 6;           // 6+ tasks today with few done
const NARROW_TODAY_COMPLETION_LOW = 0.15;     // <15% done on a heavy day

// ── Helpers ──────────────────────────────────────────────────────────────────

function hoursBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60);
}

function sessionsInLastHours(log: SessionEvent[], nowIso: string, hours: number): number {
  const now = new Date(nowIso).getTime();
  const cutoff = now - hours * 60 * 60 * 1000;
  let n = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const t = new Date(log[i].at).getTime();
    if (t < cutoff) break; // log is append-ordered
    n++;
  }
  return n;
}

function todayYmd(nowIso: string): string {
  return nowIso.slice(0, 10);
}

// ── Classifier ───────────────────────────────────────────────────────────────

export function classifyUIState(snap: UIStateSnapshot): UIStateDecision {
  const nowIso = snap.now ?? new Date().toISOString();

  // ── 1) HELD ── big gap, or brand-new user with no real session history
  if (snap.sessionLog.length === 0) {
    return { state: 'held', reason: 'no session history yet' };
  }
  const lastEvt = snap.sessionLog[snap.sessionLog.length - 1];
  const hoursSince = hoursBetween(lastEvt.at, nowIso);
  if (hoursSince >= HELD_GAP_HOURS) {
    return { state: 'held', reason: `last session ${Math.round(hoursSince)}h ago` };
  }
  if (snap.firstOpenDate) {
    const firstDaysAgo = hoursBetween(`${snap.firstOpenDate}T00:00:00Z`, nowIso) / 24;
    if (firstDaysAgo < HELD_NEW_USER_DAY && snap.sessionLog.length < 3) {
      return { state: 'held', reason: 'brand-new user, not enough signal yet' };
    }
  }

  // ── 2) NARROW ── many short sessions OR a heavy, low-completion day
  const recent = sessionsInLastHours(
    snap.sessionLog,
    nowIso,
    NARROW_SHORT_SESSIONS_WINDOW_HOURS,
  );
  if (recent >= NARROW_SHORT_SESSIONS_THRESHOLD) {
    return {
      state: 'narrow',
      reason: `${recent} sessions in last ${NARROW_SHORT_SESSIONS_WINDOW_HOURS}h`,
    };
  }

  const today = todayYmd(nowIso);
  const todayTasks = snap.tasks.filter(
    t => (t.isToday || t.date === today) && !t.isInbox,
  );
  if (todayTasks.length >= NARROW_TODAY_TASKS_HEAVY) {
    const done = todayTasks.filter(t => t.completed).length;
    const rate = done / todayTasks.length;
    if (rate < NARROW_TODAY_COMPLETION_LOW) {
      return {
        state: 'narrow',
        reason: `${todayTasks.length} tasks today, ${Math.round(rate * 100)}% done`,
      };
    }
  }

  // ── 3) OPEN ── default. Active, varied, completing things.
  return { state: 'open', reason: 'active, balanced' };
}
