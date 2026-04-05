/**
 * Synapse OpenAI Service
 *
 * Two functions:
 *  1. structureMorningText  — takes raw user brain-dump → returns MITs + structured todos
 *  2. decomposeProject      — takes a project title/description → returns subtasks
 *
 * Set OPENAI_API_KEY in your .env or via Settings screen.
 * Calls go directly from the app — or proxy through your backend if you prefer.
 */

import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!_client || _client.apiKey !== apiKey) {
    _client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }
  return _client;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface StructuredMorningPlan {
  topPriorities: string[];       // Max 3 MITs
  todos: {
    text: string;
    priority: 'high' | 'medium' | 'low';
    estimatedMinutes: number;
    defer: boolean;              // true = don't do today
  }[];
  energySuggestion: string;      // e.g. "High energy block for MIT #1 first"
  warnings: string[];            // e.g. "You've listed 12 things. I've deferred 9."
}

export interface DecomposedProject {
  tasks: {
    id: string;
    text: string;
    estimatedMinutes: number;
  }[];
  nextAction: string;            // the single best first step
  estimatedTotalHours: number;
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

Return a JSON object matching this schema:
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
}
`.trim();

export async function structureMorningText(
  rawText: string,
  apiKey: string,
  context?: { sleepScore?: number; energyLevel?: number }
): Promise<StructuredMorningPlan> {

  const client = getClient(apiKey);

  const userMessage = context
    ? `Sleep score: ${context.sleepScore ?? '?'}/10\nEnergy: ${context.energyLevel ?? '?'}/10\n\nMy tasks for today:\n${rawText}`
    : rawText;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: MORNING_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content ?? '{}';
  return JSON.parse(content) as StructuredMorningPlan;
}

// ── Project Decomposition ─────────────────────────────────────────────────────

const DECOMPOSE_SYSTEM_PROMPT = `
You are an ADHD executive function assistant specialising in project breakdown.

The user has a project they are struggling to start or progress on. Your job is to break it into the smallest possible concrete subtasks — each one a single, specific action that takes 15–45 minutes.

ADHD-specific rules:
- Each task must start with a verb (Write, Email, Open, Call, Book, Read, etc.)
- No task should say "research X" — instead say "spend 20 minutes googling X and write 5 bullet points"
- No task can be vague. "Work on presentation" is not a task. "Write slide 3 headline and 3 bullet points" is.
- Maximum 12 subtasks. If the project needs more, break it into phases and give Phase 1 only.
- The "nextAction" must be the single easiest, lowest-friction task to do RIGHT NOW

Return a JSON object:
{
  "tasks": [
    { "id": "t1", "text": "string", "estimatedMinutes": number }
  ],
  "nextAction": "string",
  "estimatedTotalHours": number
}
`.trim();

export async function decomposeProject(
  title: string,
  description: string,
  deadline: string | undefined,
  apiKey: string,
  extraContext?: string,
): Promise<DecomposedProject> {

  const client = getClient(apiKey);

  const userMessage = [
    `Project: ${title}`,
    description ? `Description: ${description}` : '',
    deadline ? `Deadline: ${deadline}` : 'No deadline set',
    extraContext?.trim() ? `\nAdditional context from the user:\n${extraContext.trim()}` : '',
  ].filter(Boolean).join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: DECOMPOSE_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 1200,
  });

  const content = response.choices[0].message.content ?? '{}';
  return JSON.parse(content) as DecomposedProject;
}

// ── Evening Reflection Analysis ───────────────────────────────────────────────

export async function analyseWeeklyPerformance(
  logs: Array<{ date: string; sleepScore?: number; focusScore?: number; exercised?: boolean; mitsCompleted: number }>,
  apiKey: string
): Promise<string> {
  const client = getClient(apiKey);

  const summary = logs.map(l =>
    `${l.date}: Sleep ${l.sleepScore ?? '?'}/10, Focus ${l.focusScore ?? '?'}/10, ` +
    `Exercise: ${l.exercised ? 'Yes' : 'No'}, MITs: ${l.mitsCompleted}/3`
  ).join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are an ADHD performance coach. Analyse this week\'s data and give 2–3 specific, actionable insights in plain English. Max 120 words. Be warm and direct.'
    }, {
      role: 'user',
      content: `Here is my week:\n${summary}\n\nWhat patterns do you see and what should I change next week?`
    }],
    temperature: 0.5,
    max_tokens: 200,
  });

  return response.choices[0].message.content ?? 'No analysis available.';
}
