#!/usr/bin/env node
/**
 * eval-brain.mjs — CP7.6 fixed-prompt eval harness for Aiteall's chat brain.
 *
 * Runs 10 representative prompts against the same model + tool definitions
 * the app uses, captures the responses, and writes them to a timestamped
 * JSON file. Use it pre/post any brain change (system prompt edits, model
 * swap, tool definition tweak) to spot regressions before TestFlight.
 *
 *   $ ANTHROPIC_KEY=sk-ant-... node scripts/eval-brain.mjs
 *   $ ANTHROPIC_KEY=sk-ant-... node scripts/eval-brain.mjs --label post-cp7
 *   $ node scripts/eval-brain.mjs --diff eval-output/<a>.json eval-output/<b>.json
 *
 * The harness is intentionally hermetic — it doesn't import the React
 * Native bundle. Instead it ships a minimal stub of the user context and
 * mirrors the four CP7 tools (edit_task, schedule_push, search_history,
 * log_completion). That keeps the eval cheap, deterministic, and usable
 * from a regular Node shell.
 *
 * NOTE on parity: the system prompt here is a CONDENSED stand-in for the
 * full ChatScreen prompt — same rules, same vocabulary, same tool
 * guidance. Full-prompt eval would need the React Native runtime; that's
 * a CP10 problem, not a CP7 one.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY?.trim();
const MODEL = process.env.EVAL_MODEL?.trim() || 'claude-sonnet-4-5-20250929';
const OUTPUT_DIR = path.join(process.cwd(), 'eval-output');

// ── 10 fixed prompts ──────────────────────────────────────────────────────────
//
// Each prompt covers a distinct capability surface. Order is stable —
// prompt #N must mean the same thing in every run for diffs to be useful.

const PROMPTS = [
  {
    id: 1,
    label: 'completion-without-ticking',
    user: "ok done the email to sarah",
    notes: 'Should call edit_task with operation=complete on the matching task id, not propose new actions.',
  },
  {
    id: 2,
    label: 'fresh-task-add',
    user: "actually add a task to test the new wireframe tomorrow morning",
    notes: 'Should propose via [SYNAPSE_ACTIONS] with type=task, dueDate=tomorrow.',
  },
  {
    id: 3,
    label: 'snooze-task',
    user: "push the deck review to tomorrow, head\'s not in it today",
    notes: 'Should call edit_task with operation=defer_to_tomorrow on the deck review task.',
  },
  {
    id: 4,
    label: 'reminder-request',
    user: "remind me at 6pm today to text mum back",
    notes: 'Should call schedule_push with whenIso for 18:00 today and a short message.',
  },
  {
    id: 5,
    label: 'history-recall',
    user: "did i finish the q2 brief already?",
    notes: 'Should call search_history scope=completion_log query about q2 brief BEFORE answering.',
  },
  {
    id: 6,
    label: 'plain-conversation',
    user: "i\'m tired",
    notes: 'Should be a short empathic reply — no tool use, no [SYNAPSE_ACTIONS].',
  },
  {
    id: 7,
    label: 'banned-word-vigilance',
    user: "great work today!!! you crushed it!!!",
    notes: 'Reply must not echo banned words (great job, crushed it, exclaim marks).',
  },
  {
    id: 8,
    label: 'fatigue-redirect',
    user: "i don\'t know where to start, my brain is full and everything feels equally important",
    notes: 'Should detect decision-fatigue and offer to redirect, NOT propose tasks.',
  },
  {
    id: 9,
    label: 'log-passing-completion',
    user: "i went for a 5k run this morning before logging on",
    notes: 'Should call log_completion (no matching task, off-app activity).',
  },
  {
    id: 10,
    label: 'overlapping-actions',
    user: "ok i finished the deck review AND the email, please push the wireframe test to friday",
    notes: 'Should call edit_task three times (two completes + one date change) — surgical, not a batch propose.',
  },
];

// ── Tool definitions (mirrors src/services/chatTools.ts) ──────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'edit_task',
    description:
      "Modify a single existing task. Use for mark-done, push-to-tomorrow, snooze, delete, rename. Always use the taskId from the user's task list — never invent one.",
    input_schema: {
      type: 'object',
      properties: {
        taskId:        { type: 'string' },
        operation:     { type: 'string', enum: ['complete', 'snooze', 'defer_to_tomorrow', 'delete', 'rename'] },
        rename:        { type: 'string' },
        snoozeMinutes: { type: 'number' },
      },
      required: ['taskId', 'operation'],
    },
  },
  {
    name: 'schedule_push',
    description:
      "Schedule a one-off local push at a specific time. Max 18 words, no exclaim marks, no 'remember to'.",
    input_schema: {
      type: 'object',
      properties: {
        whenIso: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['whenIso', 'message'],
    },
  },
  {
    name: 'search_history',
    description: "Read-only lookup over completion_log / session_log / chat. Use BEFORE answering recall questions.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        scope: { type: 'string', enum: ['completion_log', 'session_log', 'chat'] },
        limit: { type: 'number' },
      },
      required: ['query', 'scope'],
    },
  },
  {
    name: 'log_completion',
    description: "Record a 'what I did' entry that isn't tied to an existing task.",
    input_schema: {
      type: 'object',
      properties: {
        taskText: { type: 'string' },
        whenIso:  { type: 'string' },
      },
      required: ['taskText'],
    },
  },
];

// ── Stub user context ─────────────────────────────────────────────────────────

const STUB_TASKS = [
  { id: 'task-001', text: 'Email to Sarah re: Monday brief',         isToday: true,  completed: false },
  { id: 'task-002', text: 'Q2 brief - first draft',                  isToday: false, completed: false },
  { id: 'task-003', text: 'Deck review for Thursday pitch',          isToday: true,  completed: false },
  { id: 'task-004', text: 'Test the new wireframe',                  isToday: false, completed: false },
];

function buildSystemPrompt() {
  const tasksBlock = STUB_TASKS.map(t =>
    `  - id=${t.id} text="${t.text}" today=${t.isToday} done=${t.completed}`
  ).join('\n');

  return `You are Aiteall — an ADHD-aware thinking partner for Sam. This is the eval harness; respond as you would in the live app.

CONTEXT (today's tasks — use the id when calling edit_task):
${tasksBlock}

RULES:
- One message at a time. 2–4 sentences max.
- Banned words: "Great job", "Nice work", "Amazing", "Awesome", "crushed it", "you got this", "remember to". No exclaim marks.
- "Today's focus" / task name when speaking; never "the one" or "MIT".

COMPLETION-WITHOUT-TICKING: If Sam mentions in passing that they finished one of today's open tasks ("ok done the email"), call edit_task with operation=complete and the matching task id. Reply minimally ("Done.", "Noted.", "Mm — handled.").

TOOLS — prefer tools over [SYNAPSE_ACTIONS] for surgical changes. Use [SYNAPSE_ACTIONS] only for proposing batches of new tasks/projects/schedules that need a review sheet.

  - edit_task — for single-task mutations (complete, defer_to_tomorrow, snooze, delete, rename). Always use the actual task id from above.
  - schedule_push — for one-off nudges Sam essentially asks for ("remind me at 6"). 18 words max, no exclaim marks.
  - search_history — read-only lookup. Use BEFORE answering recall questions like "did I do X already?" Don't guess.
  - log_completion — record an off-app finish ("went for a run"). Do NOT use this to mark an existing task complete.

DECISION FATIGUE: If Sam signals they are frozen / overwhelmed / in analysis paralysis, redirect gently ("It sounds like your brain is full. Want to switch to decision fatigue mode?") then stop. Don't try to solve it from inside the current session.

[SYNAPSE_ACTIONS] FORMAT (only for batches): emit as raw JSON wrapped in [SYNAPSE_ACTIONS] {...} — see app for full spec.`;
}

// ── Anthropic call ───────────────────────────────────────────────────────────

async function callClaude(userMessage) {
  const body = {
    model: MODEL,
    max_tokens: 1200,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'user', content: userMessage },
    ],
    tools: TOOL_DEFINITIONS,
    temperature: 0.7,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2024-06-01',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { status: res.status, data };
}

function summariseResponse({ status, data }) {
  if (status !== 200) {
    return {
      status,
      error: data?.error?.message ?? 'unknown error',
    };
  }
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const toolUses = blocks
    .filter(b => b?.type === 'tool_use')
    .map(b => ({ name: b.name, input: b.input }));
  const text = blocks
    .filter(b => b?.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
  return {
    status,
    stop_reason: data?.stop_reason,
    text,
    tool_uses: toolUses,
    usage: data?.usage ?? null,
  };
}

// ── Diff helper ──────────────────────────────────────────────────────────────

async function diffRuns(pathA, pathB) {
  const [a, b] = await Promise.all([
    fs.readFile(pathA, 'utf8').then(JSON.parse),
    fs.readFile(pathB, 'utf8').then(JSON.parse),
  ]);

  const byId = (run) => Object.fromEntries(run.results.map(r => [r.id, r]));
  const A = byId(a);
  const B = byId(b);

  const ids = new Set([...Object.keys(A), ...Object.keys(B)].map(Number)).values();
  const lines = [];
  lines.push(`A: ${pathA}`);
  lines.push(`B: ${pathB}`);
  lines.push('');

  for (const id of [...ids].sort((x, y) => x - y)) {
    const ra = A[id]; const rb = B[id];
    const label = ra?.label ?? rb?.label ?? `prompt-${id}`;
    const aTools = (ra?.response?.tool_uses ?? []).map(t => t.name).sort().join(',') || '-';
    const bTools = (rb?.response?.tool_uses ?? []).map(t => t.name).sort().join(',') || '-';
    const aText  = (ra?.response?.text ?? '').slice(0, 80).replace(/\s+/g, ' ');
    const bText  = (rb?.response?.text ?? '').slice(0, 80).replace(/\s+/g, ' ');
    const same =
      aTools === bTools &&
      (ra?.response?.stop_reason ?? '') === (rb?.response?.stop_reason ?? '') &&
      aText === bText;
    lines.push(`#${id} ${label}  ${same ? '· unchanged' : '· DIFF'}`);
    if (!same) {
      lines.push(`   tools  A: ${aTools}`);
      lines.push(`   tools  B: ${bTools}`);
      lines.push(`   text   A: ${aText}`);
      lines.push(`   text   B: ${bText}`);
    }
  }

  console.log(lines.join('\n'));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runEval() {
  if (!ANTHROPIC_KEY) {
    console.error('ANTHROPIC_KEY env var is required.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const labelArgIdx = args.indexOf('--label');
  const label = labelArgIdx >= 0 ? args[labelArgIdx + 1] : 'run';

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');

  const results = [];
  for (const p of PROMPTS) {
    process.stdout.write(`#${p.id} ${p.label}… `);
    try {
      const raw = await callClaude(p.user);
      const summary = summariseResponse(raw);
      results.push({ id: p.id, label: p.label, user: p.user, notes: p.notes, response: summary });
      const tag = summary.tool_uses?.length
        ? `tools=${summary.tool_uses.map(t => t.name).join(',')}`
        : 'text-only';
      console.log(`ok (${tag})`);
    } catch (e) {
      results.push({ id: p.id, label: p.label, user: p.user, notes: p.notes, error: String(e?.message ?? e) });
      console.log(`ERROR: ${String(e?.message ?? e)}`);
    }
  }

  const out = {
    label,
    model: MODEL,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results,
  };

  const outPath = path.join(OUTPUT_DIR, `${stamp}__${label}.json`);
  await fs.writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath}`);
}

// Entry point
const args = process.argv.slice(2);
if (args[0] === '--diff') {
  const [, a, b] = args;
  if (!a || !b) {
    console.error('Usage: node scripts/eval-brain.mjs --diff <a.json> <b.json>');
    process.exit(1);
  }
  diffRuns(a, b).catch(e => { console.error(e); process.exit(1); });
} else {
  runEval().catch(e => { console.error(e); process.exit(1); });
}
