/**
 * portraitV2.ts — structured portrait refresh (Phase 3)
 *
 * The "You" tab is the hero feature. It is the app's answer to the
 * question "what does this thing actually know about me?". Every
 * meaningful chat session should pay back into the portrait, so the
 * user opens the You tab and sees themselves reflected — not a blank
 * form, not a list of traits, but sentences that sound like a friend
 * describing them.
 *
 * Voice: second person. "You work best in short bursts", not "Sam works
 * best in short bursts". This is the AI talking TO the user about
 * themselves — warm, specific, observational.
 *
 * Five sections — intentionally small and human:
 *   howYouWork        — rhythms, focus patterns, when-you're-at-best
 *   whatYoureBuilding — active projects + quiet commitments behind them
 *   whatGetsInTheWay  — friction, sticky loops, shapes of stuckness
 *   whereYoureGoing   — the horizon your choices suggest
 *   whatIDontKnowYet  — AI's admitted blind spots (invite to teach it)
 *
 * Refresh pipeline:
 *   1. ChatScreen unmount triggers refreshPortrait() after a session with
 *      enough signal (2+ user turns, not 'off record').
 *   2. We send (current portrait + recent conversation) to Haiku.
 *   3. Haiku returns JSON of { section: text } for sections worth updating.
 *   4. We diff per section and only persist sections whose text materially
 *      changed — so we don't bump lastUpdated on every session.
 *   5. User-edited sections (source === 'user') are preserved unless the
 *      new AI text is substantially different — we respect their voice.
 */

import type { ChatMessage, Portrait, PortraitSection, PortraitSectionKey } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';

// ── Prompt ────────────────────────────────────────────────────────────────────

const PORTRAIT_SYSTEM = `You write a living portrait of a user for an ADHD productivity app. The portrait has five sections. You speak TO the user, in second person ("You work best when…"), warm and observational — like a thoughtful friend describing them back to themselves.

You DO NOT reply conversationally. You output ONLY a JSON object.

SECTIONS
- howYouWork: rhythms, focus patterns, when they're at their best or worst, how they think/talk, what working environment suits them.
- whatYoureBuilding: the active projects + the quiet commitments behind them. Not a task list — the shape of what they're making.
- whatGetsInTheWay: the friction, the sticky loops, the shapes of stuckness. Compassionate — "you struggle to start when X", not a diagnosis.
- whereYoureGoing: the horizon the last weeks of choices suggest they're aiming at. Gentle, not a prediction. Pull from goals + consistent themes.
- whatIDontKnowYet: your admitted blind spots — things about them you genuinely can't see yet, framed as open questions you'd like to understand. This section specifically invites the user to teach you.

RULES
- Second person. Warm, specific, editorial. Not a personality test.
- Each section: 1–4 sentences. Never bullet points. Never lists.
- Only include things EVIDENCED by what they've shared. Do not invent.
- If the existing section already captures something well, preserve it. Only rewrite a section when you have new material that improves it.
- Avoid therapy-speak, self-help platitudes, and hedging ("seems like", "perhaps you"). Be confident and specific, or say nothing.
- If a section has no new material to add, OMIT it from the output. Don't return stale text.
- whatIDontKnowYet should reference something the user ACTUALLY didn't reveal in the session — not generic "I'd love to know more about you".

OUTPUT SHAPE (JSON only, no prose, no markdown fences):
{
  "howYouWork":        "You …" (optional — only if you have an update),
  "whatYoureBuilding": "You're …" (optional),
  "whatGetsInTheWay":  "…" (optional),
  "whereYoureGoing":   "…" (optional),
  "whatIDontKnowYet":  "…" (optional)
}

If nothing substantive came out of this session, output {}.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function serialisePortrait(p: Portrait): string {
  const line = (label: string, s: PortraitSection) =>
    s.text?.trim() ? `${label}: ${s.text.trim()}` : `${label}: (empty)`;
  return [
    line('howYouWork',        p.howYouWork),
    line('whatYoureBuilding', p.whatYoureBuilding),
    line('whatGetsInTheWay',  p.whatGetsInTheWay),
    line('whereYoureGoing',   p.whereYoureGoing),
    line('whatIDontKnowYet',  p.whatIDontKnowYet),
  ].join('\n\n');
}

function serialiseConversation(messages: ChatMessage[], windowSize = 20): string {
  const tail = messages.slice(-windowSize);
  return tail.map(m => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`).join('\n');
}

function parsePortraitJson(raw: string): Partial<Record<PortraitSectionKey, string>> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    const out: Partial<Record<PortraitSectionKey, string>> = {};
    const keys: PortraitSectionKey[] = [
      'howYouWork',
      'whatYoureBuilding',
      'whatGetsInTheWay',
      'whereYoureGoing',
      'whatIDontKnowYet',
    ];
    for (const k of keys) {
      if (typeof parsed[k] === 'string' && parsed[k].trim()) {
        out[k] = parsed[k].trim();
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Crude similarity — if the normalised strings share >80% of their
 * words, we treat them as "not materially changed" and skip the write.
 * This stops us bumping lastUpdated every session when the AI just
 * paraphrases the same observation.
 */
function isMateriallyDifferent(oldText: string, newText: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const a = new Set(norm(oldText));
  const b = new Set(norm(newText));
  if (b.size === 0) return false;
  if (a.size === 0) return true;
  let shared = 0;
  for (const w of b) if (a.has(w)) shared++;
  const overlap = shared / Math.max(a.size, b.size);
  return overlap < 0.8;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch an updated portrait from Haiku given the current one + a recent
 * conversation. Returns only sections that genuinely moved — caller
 * decides what to persist.
 */
export async function computePortraitDelta(
  messages: ChatMessage[],
  current: Portrait,
  userAnthropicKey?: string,
): Promise<Partial<Record<PortraitSectionKey, string>>> {
  if (!messages.some(m => m.role === 'user')) return {};

  const systemPrompt = `${PORTRAIT_SYSTEM}\n\nEXISTING PORTRAIT:\n${serialisePortrait(current)}`;
  const userBlock    = `RECENT CONVERSATION:\n${serialiseConversation(messages)}\n\nReturn the JSON object now.`;

  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userBlock }],
      temperature: 0.4, // a bit warmer than extraction — this is prose
    }, userAnthropicKey);

    if (!res.ok) return {};
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    const parsed = parsePortraitJson(raw);
    if (!parsed) return {};

    // Filter: only keep sections where the new text is materially different.
    const keys: PortraitSectionKey[] = [
      'howYouWork',
      'whatYoureBuilding',
      'whatGetsInTheWay',
      'whereYoureGoing',
      'whatIDontKnowYet',
    ];
    const out: Partial<Record<PortraitSectionKey, string>> = {};
    for (const k of keys) {
      const newText = parsed[k];
      if (!newText) continue;
      const oldText = current[k]?.text ?? '';
      // Respect user edits — if the user wrote this section and the AI's
      // new take isn't substantially different, leave it alone.
      if (current[k]?.source === 'user' && !isMateriallyDifferent(oldText, newText)) continue;
      if (!isMateriallyDifferent(oldText, newText)) continue;
      out[k] = newText;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Run a refresh and write any updated sections into the store.
 *
 * Returns the number of sections updated (0 = nothing worth saying).
 */
export async function refreshPortrait(
  messages: ChatMessage[],
  store: {
    portrait: Portrait;
    updatePortraitSection: (
      key: PortraitSectionKey,
      patch: Partial<PortraitSection>,
    ) => void;
  },
  userAnthropicKey?: string,
): Promise<number> {
  const delta = await computePortraitDelta(messages, store.portrait, userAnthropicKey);
  let written = 0;
  for (const [key, text] of Object.entries(delta) as Array<[PortraitSectionKey, string]>) {
    store.updatePortraitSection(key, { text, source: 'ai' });
    written += 1;
  }
  return written;
}

// ── Export helpers ────────────────────────────────────────────────────────────

/** Markdown export — used by the Portrait screen's share button. */
export function portraitToMarkdown(portrait: Portrait, name = ''): string {
  const title = name ? `# ${name}` : '# You';
  const sections: Array<[string, PortraitSection]> = [
    ['How you work',         portrait.howYouWork],
    ['What you\'re building', portrait.whatYoureBuilding],
    ['What gets in the way', portrait.whatGetsInTheWay],
    ['Where you\'re going',  portrait.whereYoureGoing],
    ['What I don\'t know yet', portrait.whatIDontKnowYet],
  ];
  const body = sections
    .filter(([, s]) => s.text && s.text.trim())
    .map(([label, s]) => `## ${label}\n\n${s.text.trim()}`)
    .join('\n\n');
  const stamp = portrait.lastAnyUpdate
    ? `\n\n---\n_Last updated ${new Date(portrait.lastAnyUpdate).toLocaleDateString()}_`
    : '';
  return `${title}\n\n${body}${stamp}`.trim();
}

/**
 * "What changed this week" — returns sections whose lastUpdated is
 * within the last 7 days. Used by the Portrait screen's diff card.
 */
export function recentPortraitChanges(
  portrait: Portrait,
  days = 7,
): PortraitSectionKey[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const keys: PortraitSectionKey[] = [
    'howYouWork',
    'whatYoureBuilding',
    'whatGetsInTheWay',
    'whereYoureGoing',
    'whatIDontKnowYet',
  ];
  return keys.filter(k => {
    const ts = portrait[k]?.lastUpdated;
    if (!ts) return false;
    return new Date(ts).getTime() >= cutoff;
  });
}
