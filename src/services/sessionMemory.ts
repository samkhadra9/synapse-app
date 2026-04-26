/**
 * sessionMemory.ts — CP7.2 + CP7.3
 *
 * Two layers of brain memory that ride inside the system prompt without
 * having to ship the entire chat history every turn.
 *
 * ── CP7.2: Session-continuity memory ────────────────────────────────────────
 * For each chat session key (e.g. `dump:2026-04-26`), keep a short running
 * summary. After every chat session unmounts with ≥2 user turns we ask
 * Haiku to rewrite the summary in light of the new turns. The result is
 * <= ~200 words, written in second-person ("you mentioned X, you decided
 * Y"). Persists for 7 days then ages out — long enough to span a week's
 * worth of conversations, short enough that stale context doesn't bleed
 * into a fresh week.
 *
 * ── CP7.3: Background themes ─────────────────────────────────────────────────
 * One layer up — across all sessions + the completion log — Haiku distills
 * three small lists and one paragraph:
 *   - avoidance   : what the user keeps deferring or skirting
 *   - wins        : what they keep showing up for
 *   - snags       : recurring obstacles ("after lunch the focus dies")
 *   - summary     : a single paragraph the chat brain reads at the top
 *
 * Themes refresh at most once per 24h (cheap throttle) and on unmount of
 * any session with >= 4 user turns. A session below that threshold isn't
 * substantial enough to warrant a re-pass.
 *
 * Both layers are best-effort. Haiku failures degrade silently — the
 * existing memory survives, we just don't update it this round.
 */

import { fetchAnthropic } from '../lib/anthropic';
import type { ChatMessage, CompletionEntry } from '../store/useStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionMemory {
  /** Session key — `${mode}:${windowKey}`. */
  key: string;
  /** Mode prefix off the key — used by the renderer for "the dump 3 days ago". */
  mode: string;
  /** Compressed running summary of this conversation. ≤ ~200 words. */
  summary: string;
  /** ISO — last time the summary was rewritten. */
  updatedAt: string;
  /** How many user turns the summary covers — drives the 4-turn threshold. */
  userTurns: number;
}

export interface ThemesEntry {
  /** ISO — last time themes were re-extracted. */
  updatedAt: string;
  /** ≤ 5 short bullets about avoidance / deferral patterns. */
  avoidance: string[];
  /** ≤ 5 short bullets about completion / win patterns. */
  wins: string[];
  /** ≤ 5 short bullets about recurring obstacles. */
  snags: string[];
  /** One short paragraph the chat brain can paste into its working context. */
  summary: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** A SessionMemory older than this is dropped on next prune. */
export const SESSION_MEMORY_TTL_DAYS = 7;
/** Minimum user turns before we bother summarising a session. */
const MIN_TURNS_FOR_SUMMARY = 2;
/** Minimum user turns before we re-extract themes. */
const MIN_TURNS_FOR_THEMES_TRIGGER = 4;
/** Themes won't refresh more than once per this interval (cheap guard). */
const THEMES_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Pruning ──────────────────────────────────────────────────────────────────

/**
 * Drop session memories older than SESSION_MEMORY_TTL_DAYS. Pure function —
 * returns a new map. Caller is responsible for writing it back to the store.
 */
export function pruneSessionMemories(
  memories: Record<string, SessionMemory>,
  now: Date = new Date(),
): Record<string, SessionMemory> {
  const cutoff = now.getTime() - SESSION_MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
  const next: Record<string, SessionMemory> = {};
  for (const [k, m] of Object.entries(memories)) {
    const t = Date.parse(m.updatedAt);
    if (Number.isFinite(t) && t >= cutoff) {
      next[k] = m;
    }
  }
  return next;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function modeFromKey(key: string): string {
  const i = key.indexOf(':');
  return i > 0 ? key.slice(0, i) : 'chat';
}

function buildTranscript(messages: ChatMessage[], maxLines = 30): string {
  const tail = messages.slice(-maxLines);
  return tail
    .map(m => {
      const who = m.role === 'user' ? 'USER' : 'AITEALL';
      const txt = (m.content ?? '').replace(/\s+/g, ' ').trim();
      const clipped = txt.length > 240 ? txt.slice(0, 237) + '…' : txt;
      return `${who}: ${clipped}`;
    })
    .join('\n');
}

function clipString(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function safeJsonParse(raw: string): any | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last  = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(x => clipString(x, 140))
    .slice(0, max);
}

// ── Session summary (CP7.2) ──────────────────────────────────────────────────

const SUMMARY_SYSTEM = `You distill chat conversations into a short running memory line for an ADHD productivity assistant. The summary is for the assistant's own context — not shown to the user.

Inputs you'll receive:
  - PRIOR_SUMMARY: the previous summary of this same conversation, or "(none)" the first time.
  - NEW_TRANSCRIPT: the latest turns. May overlap with prior context.

Output a single JSON object:
{"summary": "<= ~150 words, second-person, plain prose, no bullets, no markdown"}

The summary should:
  - Capture WHAT the user is working on right now — projects, ideas, deadlines named in the conversation.
  - Capture HOW they are feeling about it (overwhelmed, stuck, energised) — but only when it shows.
  - Capture WHAT THEY DECIDED — concrete commitments, deferrals, "I'll do X tomorrow".
  - Drop pleasantries. Drop the assistant's own framing.
  - Be specific. "You're avoiding the Monday brief because the brief feels political" beats "you're stressed about work".

If the conversation is empty or contains only greetings, return: {"summary": ""}`;

/**
 * Generate or refresh the running summary for one chat session. Best-effort
 * — returns null on any failure so the caller can keep the prior memory.
 *
 * Throttle by checking memory.userTurns vs current count BEFORE calling this;
 * it always issues an API call.
 */
export async function summariseSession(
  sessionKey: string,
  messages: ChatMessage[],
  priorSummary: string | null,
  userAnthropicKey?: string,
): Promise<SessionMemory | null> {
  const userTurns = messages.filter(m => m.role === 'user').length;
  if (userTurns < MIN_TURNS_FOR_SUMMARY) return null;

  const transcript = buildTranscript(messages, 30);
  if (!transcript) return null;

  const userPayload = [
    `PRIOR_SUMMARY: ${priorSummary?.trim() || '(none)'}`,
    '',
    'NEW_TRANSCRIPT:',
    transcript,
    '',
    'Return the JSON object now.',
  ].join('\n');

  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userPayload }],
      temperature: 0.3,
    }, userAnthropicKey);
    if (!res.ok) return null;
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    const parsed = safeJsonParse(raw);
    const summary =
      typeof parsed?.summary === 'string' ? clipString(parsed.summary, 1200) : '';
    if (!summary) return null;

    return {
      key:        sessionKey,
      mode:       modeFromKey(sessionKey),
      summary,
      updatedAt:  new Date().toISOString(),
      userTurns,
    };
  } catch {
    return null;
  }
}

/**
 * Render the running-memory block for the system prompt. Returns empty string
 * when there's nothing to say (no memories or all empty after pruning).
 *
 * Includes the *current* session's summary (if it has one) plus up to 3 of
 * the most recent other-session summaries — capped to keep the prompt small.
 */
export function renderRunningMemoryBlock(
  memories: Record<string, SessionMemory>,
  currentKey: string,
  now: Date = new Date(),
): string {
  const list = Object.values(memories).filter(m => m.summary.trim().length > 0);
  if (list.length === 0) return '';

  // Most recent first
  const sorted = [...list].sort((a, b) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const current = sorted.find(m => m.key === currentKey);
  const others  = sorted.filter(m => m.key !== currentKey).slice(0, 3);

  const lines: string[] = [];

  if (current) {
    lines.push('THIS SESSION SO FAR — what you already know about this conversation:');
    lines.push(`  ${current.summary}`);
  }

  if (others.length > 0) {
    lines.push('');
    lines.push('RECENT OTHER SESSIONS — for continuity, refer to only when relevant:');
    for (const m of others) {
      const ageHours = Math.max(1, Math.round((now.getTime() - Date.parse(m.updatedAt)) / 3_600_000));
      const when = ageHours < 24
        ? `${ageHours}h ago`
        : `${Math.round(ageHours / 24)}d ago`;
      lines.push(`  - [${m.mode} · ${when}] ${m.summary}`);
    }
  }

  if (lines.length === 0) return '';

  return `
RUNNING MEMORY (use sparingly — don't recite this back to the user):
${lines.join('\n')}
`;
}

// ── Themes (CP7.3) ───────────────────────────────────────────────────────────

const THEMES_SYSTEM = `You read across one user's recent productivity log + chat session summaries and distill the patterns the assistant should remember between sessions. The output is for the assistant — not for the user.

Inputs:
  - COMPLETIONS_RECENT: the things they actually finished, last 14 days
  - SESSION_SUMMARIES: short summaries of recent chat sessions
  - PRIOR_THEMES: what we extracted last time (or "(none)")

Return a single JSON object:
{
  "avoidance": ["…", "…"],   // up to 5 short lines about what they keep deferring/skirting
  "wins":      ["…", "…"],   // up to 5 short lines about what they reliably show up for
  "snags":     ["…", "…"],   // up to 5 short lines about recurring obstacles ("focus dies after lunch")
  "summary":   "one short paragraph (<= 80 words) the assistant reads at the start of every chat"
}

Rules:
  - Be specific. "You avoid the brief because it touches the founder dispute" beats "you avoid hard work".
  - Drop anything that's just a one-off. Themes are PATTERNS — at least two data points.
  - Lower-case, no exclaim marks, no judgement, no praise language.
  - If there genuinely isn't enough signal, return arrays empty and summary "".

Return the JSON object only. No prose, no fences.`;

/**
 * Re-extract themes if it's been at least THEMES_MIN_INTERVAL_MS since the
 * last refresh. Returns null if throttled or the call failed; caller keeps
 * the existing themes in that case.
 */
export async function maybeRefreshThemes(opts: {
  completions: CompletionEntry[];
  sessionMemories: Record<string, SessionMemory>;
  prior: ThemesEntry | null;
  force?: boolean;
  userAnthropicKey?: string;
  now?: Date;
}): Promise<ThemesEntry | null> {
  const now = opts.now ?? new Date();

  // Throttle
  if (!opts.force && opts.prior?.updatedAt) {
    const lastT = Date.parse(opts.prior.updatedAt);
    if (Number.isFinite(lastT) && now.getTime() - lastT < THEMES_MIN_INTERVAL_MS) {
      return null;
    }
  }

  // Build briefing
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const recentCompletions = (opts.completions ?? [])
    .filter(c => {
      const t = Date.parse(c.at);
      return Number.isFinite(t) && t >= cutoff;
    })
    .slice(-50);

  const summaries = Object.values(opts.sessionMemories ?? {})
    .filter(m => m.summary.trim().length > 0)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);

  // Need *something* to work with. If both lists are empty, skip.
  if (recentCompletions.length === 0 && summaries.length === 0) {
    return null;
  }

  const completionsText = recentCompletions.length > 0
    ? recentCompletions.map(c => `  - ${c.text} (${c.at.slice(0, 10)})`).join('\n')
    : '  (none)';

  const summariesText = summaries.length > 0
    ? summaries.map(m => `  [${m.mode} · ${m.updatedAt.slice(0, 10)}] ${m.summary}`).join('\n')
    : '  (none)';

  const priorText = opts.prior
    ? JSON.stringify({
        avoidance: opts.prior.avoidance,
        wins:      opts.prior.wins,
        snags:     opts.prior.snags,
        summary:   opts.prior.summary,
      })
    : '(none)';

  const userPayload = [
    'COMPLETIONS_RECENT:',
    completionsText,
    '',
    'SESSION_SUMMARIES:',
    summariesText,
    '',
    `PRIOR_THEMES: ${priorText}`,
    '',
    'Return the JSON object now.',
  ].join('\n');

  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: THEMES_SYSTEM,
      messages: [{ role: 'user', content: userPayload }],
      temperature: 0.3,
    }, opts.userAnthropicKey);
    if (!res.ok) return null;
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    const parsed = safeJsonParse(raw);
    if (!parsed) return null;

    return {
      updatedAt: now.toISOString(),
      avoidance: asStringArray(parsed.avoidance, 5),
      wins:      asStringArray(parsed.wins, 5),
      snags:     asStringArray(parsed.snags, 5),
      summary:   typeof parsed.summary === 'string' ? clipString(parsed.summary, 600) : '',
    };
  } catch {
    return null;
  }
}

/**
 * Render the themes block for the system prompt. Returns empty string when
 * there's nothing to say.
 */
export function renderThemesBlock(themes: ThemesEntry | null | undefined): string {
  if (!themes) return '';
  const has =
    themes.summary.trim().length > 0 ||
    themes.avoidance.length > 0 ||
    themes.wins.length > 0 ||
    themes.snags.length > 0;
  if (!has) return '';

  const lines: string[] = [];
  if (themes.summary.trim()) {
    lines.push(`OVERVIEW: ${themes.summary.trim()}`);
  }
  if (themes.wins.length > 0) {
    lines.push('WHAT THEY RELIABLY SHOW UP FOR:');
    themes.wins.forEach(w => lines.push(`  - ${w}`));
  }
  if (themes.avoidance.length > 0) {
    lines.push('WHAT THEY AVOID:');
    themes.avoidance.forEach(a => lines.push(`  - ${a}`));
  }
  if (themes.snags.length > 0) {
    lines.push('RECURRING SNAGS:');
    themes.snags.forEach(s => lines.push(`  - ${s}`));
  }

  return `
LONG-RUNNING THEMES (you've noticed these across recent sessions — use lightly):
${lines.join('\n')}
`;
}

export const __ChatMemoryConstants = {
  SESSION_MEMORY_TTL_DAYS,
  MIN_TURNS_FOR_SUMMARY,
  MIN_TURNS_FOR_THEMES_TRIGGER,
  THEMES_MIN_INTERVAL_MS,
};
