/**
 * Synapse AI Service — now powered by Anthropic Claude
 *
 * Same exported function signatures as before, but switched from OpenAI to
 * the Anthropic Messages API. Nothing else in the codebase needs to change.
 *
 * Main model:    claude-sonnet-4-5-20250929  (planning, decomposition)
 * Light model:   claude-haiku-4-5-20251001   (weekly analysis, quick tasks)
 *
 * Pass the user's Anthropic API key (from profile.anthropicKey or
 * EXPO_PUBLIC_ANTHROPIC_KEY env var).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface StructuredTask {
  text: string;
  priority: 'high' | 'medium' | 'low' | number;
  estimatedMinutes: number;
  defer: boolean;
}

export interface StructuredMorningPlan {
  topPriorities: string[];
  todos: StructuredTask[];
  energySuggestion: string;
  warnings: string[];
}

export interface DecomposedProject {
  tasks: {
    id: string;
    text: string;
    estimatedMinutes: number;
  }[];
  nextAction: string;
  estimatedTotalHours: number;
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

/** Strip markdown code fences that Claude sometimes wraps JSON in. */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userContent: string,
  maxTokens = 1000,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return stripCodeFences(data.content?.[0]?.text ?? '{}');
}

// ── Morning Text Structuring ──────────────────────────────────────────────────

const MORNING_SYSTEM_PROMPT = `
You are an ADHD executive function assistant. The user has sent you their morning brain dump — a messy, unfiltered list of everything on their mind for today.

Your job is to:
1. Extract the 3 MOST IMPORTANT tasks (MITs) for today — tasks that would make the day a genuine success
2. Categorise all remaining tasks as high/medium/low priority
3. Estimate realistic time for each task (be honest — people always underestimate)
4. Flag tasks that should be deferred to tomorrow or later this week (anything beyond 8 hours of real work)
5. Give one sentence of energy management advice based on the workload

ADHD-specific rules:
- Max 3 MITs. Non-negotiable. If the user listed 15 things, still only 3 MITs.
- Be honest about time estimates — multiply the user's implicit estimates by 1.5
- Tasks without clear outcomes should be flagged as vague and refined
- Prefer specific, concrete tasks over vague ones (e.g. "email Dr Smith re: referral" not "emails")

Return a JSON object matching this schema exactly:
{
  "topPriorities": ["string", "string", "string"],
  "todos": [
    {
      "text": "string",
      "priority": "high" | "medium" | "low",
      "estimatedMinutes": number,
      "defer": boolean
    }
  ],
  "energySuggestion": "string",
  "warnings": ["string"]
}`.trim();

export async function structureMorningText(
  rawText: string,
  apiKey: string,
  context?: { sleepScore?: number; energyLevel?: number },
): Promise<StructuredMorningPlan> {
  const userMessage = context
    ? `Sleep score: ${context.sleepScore ?? '?'}/10\nEnergy: ${context.energyLevel ?? '?'}/10\n\nMy tasks for today:\n${rawText}`
    : rawText;

  const content = await callClaude(apiKey, 'claude-sonnet-4-5-20250929', MORNING_SYSTEM_PROMPT, userMessage, 1000);
  return JSON.parse(content) as StructuredMorningPlan;
}

// ── Project Decomposition ─────────────────────────────────────────────────────

const DECOMPOSE_SYSTEM_PROMPT = `
You are an ADHD executive function assistant specialising in project breakdown.

The user has a project they are struggling to start or progress on. Your job is to break it into the smallest possible concrete subtasks — each one a single, specific action that takes 30–60 minutes.

ADHD-specific rules:
- Each task must start with a verb (Write, Email, Open, Call, Book, Read, etc.)
- No task should say "research X" — instead say "spend 30 minutes googling X and write 5 bullet points"
- No task can be vague. "Work on presentation" is not a task. "Write slide 3 headline and 3 bullet points" is.
- All estimatedMinutes MUST be one of: 30, 60, 90, 120 — no other values
- Maximum 12 subtasks. If the project needs more, break it into phases and give Phase 1 only.
- The "nextAction" must be the single easiest, lowest-friction task to do RIGHT NOW

Return a JSON object:
{
  "tasks": [
    { "id": "t1", "text": "string", "estimatedMinutes": number }
  ],
  "nextAction": "string",
  "estimatedTotalHours": number
}`.trim();

export async function decomposeProject(
  title: string,
  description: string,
  deadline: string | undefined,
  apiKey: string,
  extraContext?: string,
): Promise<DecomposedProject> {
  const userMessage = [
    `Project: ${title}`,
    description ? `Description: ${description}` : '',
    deadline ? `Deadline: ${deadline}` : 'No deadline set',
    extraContext?.trim() ? `\nAdditional context from the user:\n${extraContext.trim()}` : '',
  ].filter(Boolean).join('\n');

  const content = await callClaude(apiKey, 'claude-sonnet-4-5-20250929', DECOMPOSE_SYSTEM_PROMPT, userMessage, 1200);
  return JSON.parse(content) as DecomposedProject;
}

// ── Weekly Performance Analysis ───────────────────────────────────────────────

export async function analyseWeeklyPerformance(
  logs: Array<{ date: string; sleepScore?: number; focusScore?: number; exercised?: boolean; mitsCompleted: number }>,
  apiKey: string,
): Promise<string> {
  const summary = logs.map(l =>
    `${l.date}: Sleep ${l.sleepScore ?? '?'}/10, Focus ${l.focusScore ?? '?'}/10, ` +
    `Exercise: ${l.exercised ? 'Yes' : 'No'}, MITs: ${l.mitsCompleted}/3`,
  ).join('\n');

  const system = "You are an ADHD performance coach. Analyse this week's data and give 2–3 specific, actionable insights in plain English. Max 120 words. Be warm and direct.";
  const user   = `Here is my week:\n${summary}\n\nWhat patterns do you see and what should I change next week?`;

  const content = await callClaude(apiKey, 'claude-haiku-4-5-20251001', system, user, 200);
  return content || 'No analysis available.';
}
