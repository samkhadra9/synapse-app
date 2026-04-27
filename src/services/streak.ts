// CP9.4 — Streak-without-counting.
//
// A "streak" the way most apps compute it is a punishment: miss one day, lose
// everything; a number above an icon people race to keep. ADHD users
// universally describe this as anxiety-inducing — and the moment the streak
// breaks, the app feels like a failure they can't reopen.
//
// We compute the same underlying signal (consecutive days the user has
// "shown up" — anything that produces a CompletionEntry) but render it as a
// quiet sentence rather than a number above a flame. No reset shame, no
// counting up to milestones, no number-as-trophy.
//
// Source of truth: `state.completions` (any source — task, chat, deep work).
// We treat the local YYYY-MM-DD as the day boundary — same as the rest of
// the app's day logic so the streak matches what the user perceives.
//
// Edge cases handled:
//   - Today empty + yesterday non-empty → still counts (don't punish "I
//     opened the app at 8am before doing anything"). We anchor at the most
//     recent completion day and walk backward from there.
//   - Today and yesterday both empty → returns 0 (gap of 2+ days = quiet
//     reset, no shame line shown).
//   - Empty log → 0.

import type { CompletionEntry } from '../store/useStore';

/** Local YYYY-MM-DD for an ISO timestamp. */
function ymdLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYmdLocal(): string {
  return ymdLocal(new Date().toISOString());
}

/** Subtract one calendar day, in local time. */
function prevYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return ymdLocal(dt.toISOString());
}

export interface StreakInfo {
  /** Consecutive days with at least one completion, anchored at the most recent
   *  completion day. 0 means no recent streak (>=2 day gap from today). */
  days: number;
  /** Gentle one-liner suitable for ambient surfaces. `null` when days === 0. */
  line: string | null;
}

/**
 * Compute the "showing up" streak from a completions log.
 *
 * Anchor rule: streak ends if there's a 2+ day gap from today. So:
 *   - Today done                              → streak counts today + back
 *   - Today empty, yesterday done             → streak counts yesterday + back
 *   - Today empty, yesterday empty            → 0 (gentle reset)
 *
 * The anchor exception (skipping today) means we don't shame the user at
 * 9am for not having logged anything yet on a day that's just begun.
 */
export function computeShowingUpStreak(completions: CompletionEntry[] | undefined | null): StreakInfo {
  if (!completions || completions.length === 0) return { days: 0, line: null };

  // Build a Set of distinct local-YYYY-MM-DD dates with completions.
  const days = new Set<string>();
  for (const c of completions) {
    const d = ymdLocal(c.at);
    if (d) days.add(d);
  }
  if (days.size === 0) return { days: 0, line: null };

  const today = todayYmdLocal();
  const yesterday = prevYmd(today);

  // Anchor: today if present, otherwise yesterday if present, otherwise 0.
  let cursor: string;
  if (days.has(today)) cursor = today;
  else if (days.has(yesterday)) cursor = yesterday;
  else return { days: 0, line: null };

  // Walk backwards from the anchor.
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = prevYmd(cursor);
    // Safety cap — 365 is more than enough; nobody's checking day 9000.
    if (count > 365) break;
  }

  return { days: count, line: gentleLine(count) };
}

/**
 * Quiet, non-counting copy. Deliberately avoids "streak", "day X", flames,
 * fire emojis, number-as-trophy, or any urgency that would punish a miss
 * tomorrow. Voice is observational ("you've shown up"), never directive.
 *
 * The 1-day case ("today") is intentionally soft — a reset day shouldn't
 * feel like starting from zero, it should feel like presence noticed.
 */
function gentleLine(days: number): string | null {
  if (days <= 0) return null;
  if (days === 1) return 'You showed up today.';
  if (days === 2) return "You've shown up two days running.";
  if (days <= 6) return `You've shown up ${days} days running.`;
  if (days < 14) return `You've shown up ${days} days in a row.`;
  if (days < 30) return `${days}-day stretch. Quietly stacking.`;
  return `${days} days. Quietly compounding.`;
}
