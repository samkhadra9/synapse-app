/**
 * portrait.ts — Synapse user portrait service
 *
 * Maintains a short (~150 word) evolving portrait of the user that persists
 * across all chat sessions. After any meaningful conversation (≥4 exchanges),
 * one background call to gpt-4o-mini updates the portrait with anything new
 * learned. The portrait is then injected at the top of every future system
 * prompt so Synapse always feels like it knows the person.
 *
 * Cost: ~0.04 cents per update on gpt-4o-mini.
 */

import { ChatMessage } from '../store/useStore';

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

export async function updatePortrait(
  messages: ChatMessage[],
  existingPortrait: string,
  apiKey: string,
  mode = 'general',
): Promise<string | null> {
  if (messages.length < 4) return null; // not enough signal

  const conversationText = messages
    .slice(-30) // cap at last 30 messages so we don't bloat the request
    .map(m => `${m.role === 'user' ? 'User' : 'Synapse'}: ${m.content}`)
    .join('\n\n');

  const prompt = PORTRAIT_UPDATE_PROMPT
    .replace('{{EXISTING_PORTRAIT}}', existingPortrait || '(none yet — this is the first session)')
    .replace('{{MODE}}', mode)
    .replace('{{CONVERSATION}}', conversationText);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,   // low temp — we want consistent, grounded synthesis
        max_tokens: 250,    // ~150 words with headroom
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const updated = data.choices?.[0]?.message?.content?.trim();
    return updated || null;
  } catch {
    return null; // always silent — never block the user for this
  }
}
