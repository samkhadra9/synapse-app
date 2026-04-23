/**
 * portrait.ts — Aiteall user portrait service
 *
 * NOTE (v2 rebuild, Phase 3): The legacy free-text portrait pipeline below
 * is scheduled to be replaced by a structured JSON Portrait with five
 * named sections. For now we keep `updatePortrait` callable so ChatScreen
 * can no-op on the unmount path without breaking. The serialiser at the
 * bottom of this file (portraitToString) bridges the new structured
 * Portrait into the string-shaped interfaces that still exist elsewhere.
 */

import type { ChatMessage, Portrait, PortraitSection } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';

const PORTRAIT_UPDATE_PROMPT = `You maintain a concise, evolving portrait of a user to help their AI assistant know them better across sessions.

EXISTING PORTRAIT:
{{EXISTING_PORTRAIT}}

RECENT CONVERSATION ({{MODE}} session):
{{CONVERSATION}}

Based on this conversation, update the portrait. Rules:
- Maximum 150 words
- Write in third person
- Capture: how they communicate and think, what motivates or blocks them, working patterns and energy rhythms, known friction points, personality, what they are building toward
- Only include things genuinely evidenced by what they have shared — do not invent or pad
- If the existing portrait already captures something well, keep it (don't re-state it differently just to change it)
- Be specific and human — not a personality test result

Output the updated portrait only, nothing else.`;

/**
 * Legacy free-text portrait updater.
 *
 * Phase 1: disabled — the old string portrait is gone, and the new
 * structured refresh pipeline lives in Phase 3 (portraitV2.ts). We keep
 * the function signature so existing callsites in ChatScreen can stay
 * shaped the same until Phase 3 replaces them.
 */
export async function updatePortrait(
  _messages: ChatMessage[],
  _existingPortrait: string,
  _apiKey: string,
  _mode = 'general',
): Promise<string | null> {
  // intentionally a no-op; Phase 3 will replace this call site with a
  // structured JSON refresh that writes section-by-section.
  return null;
}

/**
 * Flatten the structured Portrait into a paragraph suitable for injection
 * at the top of a system prompt. Second-person "you" framing. Empty
 * sections are dropped. Returns '' when nothing has been written yet.
 *
 * Why this exists: the AI chat still wants a single compact string of
 * "what we know about this person" to prime responses. The new Portrait
 * type stores each section separately so the UI can diff and edit, but
 * for the LLM we just fold them together.
 */
export function portraitToString(portrait: Portrait | undefined | null): string {
  if (!portrait) return '';
  const parts: Array<[string, PortraitSection]> = [
    ['How you work',        portrait.howYouWork],
    ['What you\'re building', portrait.whatYoureBuilding],
    ['What gets in the way', portrait.whatGetsInTheWay],
    ['Where you\'re going',  portrait.whereYoureGoing],
    ['What I don\'t know yet', portrait.whatIDontKnowYet],
  ];
  const lines = parts
    .filter(([, s]) => s && s.text && s.text.trim())
    .map(([label, s]) => `${label}: ${s.text.trim()}`);
  return lines.join('\n\n');
}
