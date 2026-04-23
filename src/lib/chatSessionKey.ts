/**
 * Chat session keys — one conversation per (mode, time-window).
 *
 * Phase 2 collapsed the old 9-mode set down to three. The cadences:
 *   dump    → one per calendar day (resume mid-day after interruption)
 *   ritual  → one per ISO week (Mon–Sun) — the weekly reset
 *   project → one per project (keyed by projectId; date fallback)
 *
 * Keys look like:
 *   "dump:2026-04-23"
 *   "ritual:2026-W17"
 *   "project:<uuid>"
 *
 * This lets Aiteall resume a conversation if the user gets interrupted
 * mid-way (e.g. phone call during a morning dump) and come back later
 * that day. When the window rolls over, a new empty session begins.
 */

import type { ChatModeV2 } from '../navigation';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';

/** ISO-week key: "YYYY-Www" (e.g. "2026-W17") */
function isoWeekKey(d: Date): string {
  const year = getISOWeekYear(d);
  const week = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function chatSessionKey(
  mode: ChatModeV2,
  now: Date = new Date(),
  projectId?: string,
): string {
  switch (mode) {
    case 'ritual':
      return `ritual:${isoWeekKey(now)}`;
    case 'project':
      // Projects have their own durable identity — tie the session to the
      // project id, not to a date. If no projectId is provided, fall back
      // to a date-based key so we still persist something sensible.
      return projectId
        ? `project:${projectId}`
        : `project:${format(now, 'yyyy-MM-dd')}`;
    case 'dump':
    default:
      return `dump:${format(now, 'yyyy-MM-dd')}`;
  }
}

/**
 * Max messages kept in the LLM context window. Messages older than this are
 * still stored for the UI / scrollback, but we don't send them to the API.
 * ADHD sessions can get long — capping here prevents token bloat on re-entry.
 */
export const CHAT_CONTEXT_CAP = 30;
