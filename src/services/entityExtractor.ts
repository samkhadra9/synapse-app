/**
 * entityExtractor.ts — background entity extraction (Phase 2)
 *
 * Zero-config premise: the user just talks. The AI listens and quietly
 * notices when new Areas, Projects, Tasks or Goals are mentioned, and
 * writes them into the store as INFERRED entities (origin: 'inferred').
 *
 * Inferred entities stay local-only (sync.ts guards against pushing
 * them) until the "emergence moment" (Phase 5) surfaces them for the
 * user to confirm, edit, or kill. That's how structure emerges without
 * anyone filling in a form.
 *
 * Pipeline:
 *   1. After a chat turn, extractorDebouncer schedules a run.
 *   2. The run sends (recent messages + existing entity names) to Haiku.
 *   3. Haiku returns JSON of net-new entity candidates.
 *   4. Each candidate is added via addArea/addProject/addTask/addGoal
 *      with { origin: 'inferred', confidence }.
 *
 * Called from ChatScreen on message turns + on unmount.
 */

import type { ChatMessage, Area, Project, Task, LifeGoal, DomainKey } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InferredArea   = { name: string; domain: DomainKey; description?: string; confidence: number };
export type InferredProject = { title: string; domain: DomainKey; description?: string; deadline?: string; confidence: number };
export type InferredTask   = { text: string; domain: DomainKey; projectTitle?: string; confidence: number };
export type InferredGoal   = { text: string; horizon: '1year' | '5year' | '10year'; confidence: number };

export type ExtractionResult = {
  areas:    InferredArea[];
  projects: InferredProject[];
  tasks:    InferredTask[];
  goals:    InferredGoal[];
};

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a silent listener for an ADHD productivity app. Your job is to extract any NEW life-structure entities the user has mentioned in their recent chat — without asking them anything.

You do not reply to the user. You output ONLY a JSON object.

CATEGORIES
- AREA: an ongoing domain of life (health, finances, relationships, a specific job, a band, a degree). Never "done". Examples: "my PhD", "parenting", "running".
- PROJECT: has a clear end state. Examples: "finish the tax return", "launch the v2 website".
- TASK: one concrete action with a verb. Examples: "email Sarah", "book the dentist".
- GOAL: an aspirational target over months or years. Horizon is '1year', '5year', or '10year'.

RULES
- Only include entities the user MENTIONED in this window. Do not invent.
- Do not re-extract anything that already exists in EXISTING_ENTITIES — treat those as known.
- Do not extract worries, moods, or past events. Only actionable/ongoing structures.
- If the user is VAGUE ("I should probably sort my life out"), skip it. Structure requires specifics.
- confidence: 0.0–1.0. High (0.85+) when they named it clearly and said they're doing it. Medium (0.6–0.8) when implied but not declared. Low (0.3–0.5) when inferred softly.
- Skip anything below 0.5 confidence — we don't want noise.
- domain ∈ 'work' | 'personal' | 'health' | 'creative' | 'social' | 'learning'. Guess if unclear.

OUTPUT SHAPE (JSON only, no prose, no markdown fences):
{"areas":[{"name":"...","domain":"personal","description":"...","confidence":0.8}],
 "projects":[{"title":"...","domain":"work","deadline":"YYYY-MM-DD or null","confidence":0.9}],
 "tasks":[{"text":"...","domain":"personal","projectTitle":"optional link","confidence":0.7}],
 "goals":[{"text":"...","horizon":"1year","confidence":0.75}]}

If nothing new was mentioned, output: {"areas":[],"projects":[],"tasks":[],"goals":[]}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a plain-text block of what's already in the user's system. */
function serialiseExisting(existing: {
  areas:    Area[];
  projects: Project[];
  tasks:    Task[];
  goals:    LifeGoal[];
}): string {
  const areaLines    = existing.areas.map(a => `  • ${a.name}`).join('\n')    || '  (none)';
  const projectLines = existing.projects.filter(p => p.status === 'active').map(p => `  • ${p.title}`).join('\n') || '  (none)';
  const goalLines    = existing.goals.map(g => `  • ${g.text}`).join('\n')    || '  (none)';
  // Tasks deliberately excluded — there are too many and the dedupe
  // doesn't need exact task matches (the `text` field is fuzzy).
  return `EXISTING AREAS:\n${areaLines}\n\nEXISTING ACTIVE PROJECTS:\n${projectLines}\n\nEXISTING GOALS:\n${goalLines}`;
}

function serialiseConversation(messages: ChatMessage[], windowSize = 12): string {
  const tail = messages.slice(-windowSize);
  return tail.map(m => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`).join('\n');
}

/** Normalise titles/names for dedupe — case + whitespace insensitive. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseExtractionJson(raw: string): ExtractionResult | null {
  // Strip any accidental code fence and trim to the first JSON object.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    return {
      areas:    Array.isArray(parsed.areas)    ? parsed.areas    : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      tasks:    Array.isArray(parsed.tasks)    ? parsed.tasks    : [],
      goals:    Array.isArray(parsed.goals)    ? parsed.goals    : [],
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run one extraction pass over the recent conversation.
 *
 * Returns only the net-new candidates — anything already in `existing`
 * (matched by normalised name/title/text) is filtered out so we don't
 * propose duplicates.
 */
export async function extractEntities(
  messages: ChatMessage[],
  existing: {
    areas:    Area[];
    projects: Project[];
    tasks:    Task[];
    goals:    LifeGoal[];
  },
  userAnthropicKey?: string,
): Promise<ExtractionResult> {
  const empty: ExtractionResult = { areas: [], projects: [], tasks: [], goals: [] };

  // Need at least one user message to bother the LLM.
  if (!messages.some(m => m.role === 'user')) return empty;

  const systemPrompt = `${EXTRACTION_SYSTEM}\n\n${serialiseExisting(existing)}`;
  const userBlock    = `RECENT CONVERSATION:\n${serialiseConversation(messages)}\n\nReturn the JSON object now.`;

  try {
    const res = await fetchAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userBlock }],
      temperature: 0.2, // low — we want stable, deterministic extraction
    }, userAnthropicKey);

    if (!res.ok) {
      // Silent failure — extraction is best-effort background work.
      return empty;
    }
    const data = await res.json();
    const raw  = data?.content?.[0]?.text ?? '';
    const parsed = parseExtractionJson(raw);
    if (!parsed) return empty;

    // Dedupe against existing entities.
    const knownAreaNames    = new Set(existing.areas.map(a => norm(a.name)));
    const knownProjectNames = new Set(existing.projects.map(p => norm(p.title)));
    const knownGoalTexts    = new Set(existing.goals.map(g => norm(g.text)));
    const knownTaskTexts    = new Set(existing.tasks.filter(t => !t.completed).map(t => norm(t.text)));

    return {
      areas:    parsed.areas.filter(a => a?.name && a.confidence >= 0.5 && !knownAreaNames.has(norm(a.name))),
      projects: parsed.projects.filter(p => p?.title && p.confidence >= 0.5 && !knownProjectNames.has(norm(p.title))),
      tasks:    parsed.tasks.filter(t => t?.text && t.confidence >= 0.5 && !knownTaskTexts.has(norm(t.text))),
      goals:    parsed.goals.filter(g => g?.text && g.confidence >= 0.5 && !knownGoalTexts.has(norm(g.text))),
    };
  } catch {
    return empty;
  }
}

/**
 * Run extraction and write the results into the store as inferred entities.
 *
 * The store's persist merge + sync.ts guards ensure `origin: 'inferred'`
 * entities stay local-only until the user confirms them (Phase 5).
 */
export async function runBackgroundExtraction(
  messages: ChatMessage[],
  // Keep the store contract loose here — the store's addArea/addProject/...
  // signatures are broader than what we narrow to (they accept optional
  // fields we don't care about). Typing this strictly creates friction
  // every time the store evolves, so we accept the looser shape.
  store: {
    areas:    Area[];
    projects: Project[];
    tasks:    Task[];
    goals:    LifeGoal[];
    addArea:    (a: any) => string;
    addProject: (p: any) => void;
    addTask:    (t: any) => void;
    addGoal:    (g: any) => void;
  },
  userAnthropicKey?: string,
): Promise<number> {
  const result = await extractEntities(messages, store, userAnthropicKey);
  let written = 0;

  for (const a of result.areas) {
    store.addArea({
      name:        a.name,
      domain:      a.domain,
      description: a.description,
      isActive:    true,
      isArchived:  false,
      origin:      'inferred',
      confidence:  a.confidence,
    });
    written += 1;
  }
  for (const p of result.projects) {
    store.addProject({
      title:       p.title,
      domain:      p.domain,
      description: p.description ?? '',
      deadline:    p.deadline,
      status:      'active',
      origin:      'inferred',
      confidence:  p.confidence,
    });
    written += 1;
  }
  for (const t of result.tasks) {
    store.addTask({
      text:      t.text,
      domain:    t.domain,
      completed: false,
      priority:  'medium',
      isMIT:     false,
      isToday:   false,
      isInbox:   true,  // inferred tasks go to inbox — they need a real date
      date:      '',
      origin:    'inferred',
      confidence: t.confidence,
    });
    written += 1;
  }
  for (const g of result.goals) {
    store.addGoal({
      text:       g.text,
      horizon:    g.horizon,
      domain:     'personal',
      milestones: [],
      origin:     'inferred',
      confidence: g.confidence,
    });
    written += 1;
  }

  return written;
}
