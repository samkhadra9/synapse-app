/**
 * completionExtractor.ts — pull "I did X" mentions from chat (Phase 6)
 *
 * Runs alongside entityExtractor and portraitV2 on ChatScreen unmount.
 * Haiku reads the recent conversation and returns a list of concrete
 * past-tense actions the user reports having done ("I emailed Sarah",
 * "finished the PDF", "went for a run").
 *
 * Each is logged to the store's `completions` slice so the DayEndReflection
 * card (and any future weekly summary) can surface "here's what you did"
 * without the user having to journal.
 *
 * Rules for what counts as a completion:
 *   - Past tense, clearly done ("I finished", "I sent", "I ran 5k")
 *   - Actual actions — not moods, not plans, not observations about others
 *   - Skip weak signals ("I kinda started", "I thought about") — the log
 *     is for real progress, not anxiety transcription.
 */

import type { ChatMessage, CompletionEntry } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';

const COMPLETION_SYSTEM = `You are a silent listener for an ADHD productivity app. Your job is to extract any things the user has clearly ALREADY DONE — past tense, real actions — from the recent chat.

You do NOT reply to the user. You output ONLY a JSON object.

RULES
- Only past-tense completed actions. "I emailed Sarah", "finished the tax draft", "went to the gym".
- Not plans ("I'll email Sarah"), not intentions ("I should go to the gym"), not moods ("I'm tired").
- Not opinions about other people ("my boss sent me an email").
- Skip weak / hedged signals ("I kinda started", "I thought about"). This log is for real progress.
- Rewrite each to 3–8 words in the user's own voice, past tense: "emailed Sarah", "finished tax draft", "ran 5k".
- If the user already told you about the same completion earlier in the conversation, include it once.

OUTPUT SHAPE (JSON only, no prose, no markdown fences):
{"completions": [{"text": "emailed Sarah"}, {"text": "finished the tax draft"}]}

If nothing qualifies, output: {"completions": []}`;

function serialiseConversation(messages: ChatMessage[], windowSize = 16): string {
  const tail = messages.slice(-windowSize);
  return tail.map(m => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`).join('\n');
}

function parseCompletionJson(raw: string): string[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    if (!Array.isArray(parsed.completions)) return [];
    return parsed.completions
      .map((c: any) => (typeof c?.text === 'string' ? c.text.trim() : ''))
      .filter((t: string) => t.length > 2 && t.length < 120);
  } catch {
    return [];
  }
}

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract past-tense completions from recent chat and write them into
 * the store's completion log. De-dupes against today's existing entries
 * so a long session doesn't double-log the same "I ran" mention.
 *
 * Returns number of new entries written.
 */
export async function runCompletionExtraction(
  messages: ChatMessage[],
  store: {
    completions: CompletionEntry[];
    logCompletion: (c: Omit<CompletionEntry, 'id' | 'at'> & { at?: string }) => void;
  },
  userAnthropicKey?: string,
): Promise<number> {
  if (!messages.some(m => m.role === 'user')) return 0;

  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: COMPLETION_SYSTEM,
      messages: [{ role: 'user', content: `RECENT CONVERSATION:\n${serialiseConversation(messages)}\n\nReturn the JSON object now.` }],
      temperature: 0.2,
    }, userAnthropicKey);
    if (!res.ok) return 0;
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    const items = parseCompletionJson(raw);
    if (items.length === 0) return 0;

    // De-dupe against today's existing completions.
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set(
      store.completions
        .filter(c => c.at.slice(0, 10) === today)
        .map(c => normalise(c.text)),
    );

    let written = 0;
    for (const text of items) {
      const key = normalise(text);
      if (seen.has(key)) continue;
      seen.add(key);
      store.logCompletion({ source: 'chat', text });
      written += 1;
    }
    return written;
  } catch {
    return 0;
  }
}
