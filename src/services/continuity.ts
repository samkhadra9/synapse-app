/**
 * continuity — the "you were here last Tuesday" helper.
 *
 * An ADHD brain often returns to chat after a gap with no memory of what
 * was said last time. The OS shouldn't either, unless we tell it to. This
 * module scans the persisted chatSessions, finds the most recent non-
 * current conversation, and produces a short continuity block for the
 * system prompt:
 *
 *   - hoursSinceLastChat — how long since any message anywhere
 *   - lastSessionSummary — a compressed snapshot of the last session
 *
 * The prompt composer turns this into a "CONTINUITY CONTEXT" section so
 * the model can open with "welcome back — last time you mentioned X"
 * instead of cold-starting every conversation.
 */
import type { ChatMessage } from '../store/useStore';

export interface ContinuitySnapshot {
  /** Hours since the user's most recent chat message (any session).  */
  hoursSinceLastChat: number | null;
  /** Short summary of the most recent other session (mode + last user line). */
  lastSessionSummary: string | null;
  /** Total user turns in that last session (gives a weight hint). */
  lastSessionUserTurns: number;
  /** Mode (dump/ritual/project) of the last session, parsed from the key. */
  lastSessionMode: string | null;
}

/** Mode prefix off the session key ("dump:2026-04-23" → "dump"). */
function modeFromKey(key: string): string | null {
  const i = key.indexOf(':');
  return i > 0 ? key.slice(0, i) : null;
}

/** Timestamp of the latest message in a session, or 0 if empty. */
function latestTs(msgs: ChatMessage[]): number {
  if (!msgs || msgs.length === 0) return 0;
  const last = msgs[msgs.length - 1];
  const t = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Summarise one session into a single line: the last user turn, truncated,
 * with the mode and how long ago. Kept short — this rides inside the
 * system prompt and tokens matter.
 */
function summariseSession(
  key: string,
  msgs: ChatMessage[],
  now: number,
): { summary: string; userTurns: number; mode: string | null } {
  const mode = modeFromKey(key);
  const userMsgs = msgs.filter(m => m.role === 'user');
  const assistantMsgs = msgs.filter(m => m.role === 'assistant');
  const lastUser = userMsgs[userMsgs.length - 1];
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1];

  // Prefer the last user line (it's the thought they left on); fall back
  // to the last assistant line if the session ended on the model's turn.
  const raw = (lastUser?.content ?? lastAssistant?.content ?? '').trim();
  const clipped = raw.length > 180 ? raw.slice(0, 177) + '…' : raw;

  const hours = Math.round((now - latestTs(msgs)) / (1000 * 60 * 60));
  const when  = hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;

  const summary = clipped
    ? `${mode ?? 'chat'} · ${when} · they said: "${clipped}"`
    : `${mode ?? 'chat'} · ${when} · (no user turns yet)`;

  return { summary, userTurns: userMsgs.length, mode };
}

/**
 * Compute continuity for a freshly-opened session.
 *
 * @param allSessions  The full map of persisted sessions from the store.
 * @param currentKey   The session the user is about to (or just did) open.
 *                     We exclude this one from the search so we don't
 *                     reference the conversation they're in.
 */
export function computeContinuity(
  allSessions: Record<string, ChatMessage[]>,
  currentKey: string,
  now: Date = new Date(),
): ContinuitySnapshot {
  const nowMs = now.getTime();
  let bestKey: string | null = null;
  let bestTs = 0;

  for (const [k, msgs] of Object.entries(allSessions)) {
    if (k === currentKey) continue;
    if (!msgs || msgs.length === 0) continue;
    const ts = latestTs(msgs);
    if (ts > bestTs) {
      bestTs = ts;
      bestKey = k;
    }
  }

  if (!bestKey || bestTs === 0) {
    return {
      hoursSinceLastChat:  null,
      lastSessionSummary:  null,
      lastSessionUserTurns: 0,
      lastSessionMode:     null,
    };
  }

  const hours = (nowMs - bestTs) / (1000 * 60 * 60);
  const { summary, userTurns, mode } = summariseSession(
    bestKey,
    allSessions[bestKey],
    nowMs,
  );

  return {
    hoursSinceLastChat:  hours,
    lastSessionSummary:  summary,
    lastSessionUserTurns: userTurns,
    lastSessionMode:     mode,
  };
}

/**
 * Render the continuity block for the system prompt. Returns empty string
 * when there's nothing worth saying (no prior session, or gap < 24h and
 * the last session was trivial).
 *
 * We deliberately keep the 24h threshold — a user who closed chat an hour
 * ago doesn't need a "welcome back, last time we were talking about…"
 * preamble; it'd feel robotic.
 */
export function renderContinuityBlock(
  snap: ContinuitySnapshot,
  firstName: string,
): string {
  if (snap.hoursSinceLastChat === null) return '';
  const h = snap.hoursSinceLastChat;
  const who = firstName || 'they';

  // Under 24h: only bother if it's a different session worth referencing
  // (2+ user turns). Otherwise silence — the ambient context is enough.
  if (h < 24 && snap.lastSessionUserTurns < 2) return '';

  const gapPhrase = h < 24
    ? `${Math.round(h)}h ago`
    : h < 72
      ? `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} ago`
      : h < 168
        ? `${Math.round(h / 24)} days ago`
        : `about ${Math.round(h / 168)} week${Math.round(h / 168) === 1 ? '' : 's'} ago`;

  const openingCue = h >= 48
    ? `${who} hasn't opened chat in ${gapPhrase}. Open warm — "good to see you" / "been a minute" energy — and DO NOT catch up on the backlog. Ask one gentle question.`
    : h >= 24
      ? `${who} was last in chat ${gapPhrase}. A brief acknowledgement of continuity is welcome but don't dwell.`
      : `Earlier today (${gapPhrase}) they had a separate conversation. Reference it only if directly relevant.`;

  const summaryLine = snap.lastSessionSummary
    ? `Their last conversation — ${snap.lastSessionSummary}`
    : '';

  return `
CONTINUITY CONTEXT (use sparingly — don't parrot it back):
- ${openingCue}
${summaryLine ? `- ${summaryLine}` : ''}
`;
}
