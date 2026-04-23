/**
 * Chat session keys — one conversation per (mode, time-window).
 *
 * Each chat mode has a natural cadence:
 *   morning / evening / dump / quick / fatigue → one per calendar day
 *   weekly   → one per ISO week (Mon-Sun)
 *   monthly  → one per calendar month
 *   yearly   → one per calendar year
 *   project  → one per project (keyed by projectId)
 *
 * Keys look like:
 *   "morning:2026-04-23"
 *   "weekly:2026-W17"
 *   "monthly:2026-04"
 *   "yearly:2026"
 *   "project:<uuid>"
 *
 * This lets Aiteall resume a conversation if the user gets interrupted mid-way
 * (e.g. phone call during the morning chat) and come back into the same thread
 * later that day. When the window rolls over, a new empty session begins.
 */

import type { ChatMode } from '../screens/ChatScreen';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';

/** ISO-week key: "YYYY-Www" (e.g. "2026-W17") */
function isoWeekKey(d: Date): string {
  const year = getISOWeekYear(d);
  const week = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function chatSessionKey(
  mode: ChatMode,
  now: Date = new Date(),
  projectId?: string,
): string {
  switch (mode) {
    case 'weekly':
      return `weekly:${isoWeekKey(now)}`;
    case 'monthly':
      return `monthly:${format(now, 'yyyy-MM')}`;
    case 'yearly':
      return `yearly:${format(now, 'yyyy')}`;
    case 'project':
      // Projects have their own durable identity — tie the session to the
      // project id, not to a date. If no projectId is provided, fall back to
      // a date-based key so we still persist something sensible.
      return projectId ? `project:${projectId}` : `project:${format(now, 'yyyy-MM-dd')}`;
    case 'morning':
    case 'evening':
    case 'dump':
    case 'quick':
    case 'fatigue':
    default:
      return `${mode}:${format(now, 'yyyy-MM-dd')}`;
  }
}

/**
 * Max messages kept in the LLM context window. Messages older than this are
 * still stored for the UI / scrollback, but we don't send them to the API.
 * ADHD sessions can get long — capping here prevents token bloat on re-entry.
 */
export const CHAT_CONTEXT_CAP = 30;
