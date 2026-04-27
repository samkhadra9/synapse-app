/**
 * ChatScreen — Aiteall V2 (zero-config)
 *
 * Three modes, auto-selected. The AI reads the clock + context and
 * adapts its posture. No more picking between "morning" and "evening"
 * before you can start talking — just open the chat and go.
 *
 *   dump     — anytime conversation. The prompt senses time-of-day
 *              and state (brain-dump, morning planning, evening wind-
 *              down, decision fatigue, re-entry after a gap) and
 *              picks its opener accordingly.
 *   ritual   — the weekly reset (monthly/yearly rollovers detected
 *              inline and handled in the same session).
 *   project  — plan / break down a specific project.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated, Modal, ScrollView, Switch, Alert,
  AppState, ActionSheetIOS,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
// CP9.3 — Read-aloud TTS for chat replies (per-session mute toggle).
// expo-speech ships native AVSpeech / Android TTS; no permissions needed.
import * as Speech from 'expo-speech';
import { format, addDays } from 'date-fns';
import { Colors, Spacing, Radius, useColors } from '../theme';
import { useStore, ChatMessage, DomainKey, Task, Project, LifeGoal, UserProfile, Area, DayPlan, PlannedSlot } from '../store/useStore';
import { buildTodayCalendarContext, buildSkeletonContext, buildWeekAheadContext, writeDayPlanToCalendar, requestCalendarPermissions, findOrCreateSolasCalendar } from '../services/calendar';
import { portraitToString } from '../services/portrait';
import { fetchAnthropic } from '../lib/anthropic';
// CP6.1 — PDF picker, CP6.3 — Image picker → Claude document/image content blocks
import { pickPdfAttachment, pickImageAttachment, buildAnthropicContent } from '../services/attachments';
// CP7.1 — agentic tool-use loop
import { TOOL_DEFINITIONS, executeTool, type ToolUseBlock } from '../services/chatTools';
import { supabase } from '../lib/supabase';
import { chatSessionKey, CHAT_CONTEXT_CAP } from '../lib/chatSessionKey';
import { computeContinuity, renderContinuityBlock } from '../services/continuity';
// CP7.2 + CP7.3 — running per-session memory + cross-session themes
import {
  renderRunningMemoryBlock,
  renderThemesBlock,
  summariseSession,
  maybeRefreshThemes,
} from '../services/sessionMemory';
import { Ionicons } from '@expo/vector-icons';
import type { ChatModeV2 } from '../navigation';

// ── Types ──────────────────────────────────────────────────────────────────────

// Re-export the canonical mode type so existing imports elsewhere in the
// tree keep working (many screens pass `mode: ...` into navigate params).
export type ChatMode = ChatModeV2;

const MODE_META: Record<ChatModeV2, { title: string; subtitle: string }> = {
  dump:    { title: 'Aiteall',        subtitle: "What's in your head right now?" },
  ritual:  { title: 'Weekly reset',   subtitle: 'Recalibrate. Realign.' },
  project: { title: 'Project',        subtitle: "Tell me what you're working on" },
};

/** Clock → phase. Used to keep the AI oriented without a user-picked mode. */
function dayPhaseNow(d: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const ENV_OPENAI_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim(); // voice only (Whisper)

/** RFC-4122 v4 UUID */
const uid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── Context Builder ────────────────────────────────────────────────────────────
// Injects the user's full life structure into every system prompt.
// This is what makes Solas feel like it knows you.

function buildContextBlock(store: {
  profile: UserProfile;
  tasks: Task[];
  projects: Project[];
  goals: LifeGoal[];
  areas: Area[];
}): string {
  const now         = new Date();
  const today       = format(now, 'yyyy-MM-dd');
  const currentHour = now.getHours();
  const currentMin  = now.getMinutes();
  const timeStr     = format(now, 'h:mm a');

  // Working day awareness — assume 9am–6pm working window
  const WORK_END_HOUR = 18;
  const hoursLeft = Math.max(0, WORK_END_HOUR - currentHour - (currentMin > 0 ? 1 : 0));
  const minutesLeft = Math.max(0, (WORK_END_HOUR * 60) - (currentHour * 60 + currentMin));
  const dayPhase = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening';

  const todayTasks  = store.tasks.filter(t => t.date === today);
  const overdue     = store.tasks.filter(t => !t.completed && t.date < today);
  const active      = store.projects.filter(p => p.status === 'active');
  const goals1yr    = store.goals.filter(g => g.horizon === '1year');
  const goals5yr    = store.goals.filter(g => g.horizon === '5year');
  const goals10yr   = store.goals.filter(g => g.horizon === '10year');
  const inboxTasks  = store.tasks.filter(t => (t.isInbox || !t.date || t.date === '') && !t.completed);
  const activeAreas = store.areas.filter(a => a.isActive && !a.isArchived);

  // Realistic time budget: how many minutes of tasks are already planned vs. available
  const plannedMinutes = todayTasks
    .filter(t => !t.completed)
    .reduce((sum, t) => sum + (t.estimatedMinutes ?? 60), 0);
  const bufferMinutes = Math.max(0, minutesLeft - plannedMinutes);
  const overbooked = plannedMinutes > minutesLeft;

  const projectList = active.length
    ? active.map(p =>
        `  • [id:${p.id}] "${p.title}"${p.deadline ? ` | due ${p.deadline}` : ''} | ${p.tasks.filter(t => !t.completed).length} open subtasks`
      ).join('\n')
    : '  • none yet';

  // CP1.8 / CP-Polish #55: task rendering surfaces today's focus marker
  // for the model's context. Internal label updated to "(today's focus)"
  // so the model isn't tempted to echo "the one" back at the user.
  const todayList = todayTasks.length
    ? todayTasks.map(t => `  • [${t.completed ? '✓' : ' '}] "${t.text}"${t.isTheOne ? ' ◉ (today\'s focus)' : t.isMIT ? ' ★' : ''}`).join('\n')
    : '  • nothing planned yet';

  const overdueList = overdue.length
    ? overdue.slice(0, 8).map(t => `  • "${t.text}" (from ${t.date})`).join('\n')
    : '  • none — clean slate';

  const inboxList = inboxTasks.length
    ? inboxTasks.slice(0, 10).map(t => `  • "${t.text}"${t.priority !== 'low' ? ` [${t.priority}]` : ''}`).join('\n')
    : '  • empty';

  const areasList = activeAreas.length
    ? activeAreas.map(a => `  • "${a.name}" (${a.domain})${a.description ? ': ' + a.description : ''}`).join('\n')
    : '  • none set yet';

  return `
╔══ ${store.profile.name || 'User'}'s Life Context ══╗
Today: ${format(now, 'EEEE, MMMM d yyyy')}
Current time: ${timeStr} (${dayPhase})
Working day remaining: ~${hoursLeft}h ${minutesLeft % 60}min until 6pm${overbooked ? ` ⚠️ OVERBOOKED — ${plannedMinutes}min planned vs ${minutesLeft}min available` : bufferMinutes > 0 ? ` · ${bufferMinutes}min unplanned buffer` : ''}

ACTIVE PROJECTS (use these IDs when linking tasks):
${projectList}

TODAY'S TASKS:
${todayList}

FROM EARLIER (${overdue.length} tasks past their date — surface only the important ones, without shame):
${overdueList}

INBOX (unscheduled captured tasks — ${inboxTasks.length}):
${inboxList}

LIFE AREAS (ongoing domains — never "done"):
${areasList}

1-YEAR GOALS:
${goals1yr.length ? goals1yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}

5-YEAR GOALS:
${goals5yr.length ? goals5yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}

10-YEAR GOALS:
${goals10yr.length ? goals10yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}
╚══ End Context ══╝`;
}

// ── System Prompts ─────────────────────────────────────────────────────────────

function getSystemPrompt(
  mode: ChatModeV2,
  contextBlock: string,
  name: string,
  calendarContext = '',
  portrait = '',
  continuityBlock = '',
  // CP7.2 — running per-session summaries (live + recent), already rendered.
  runningMemoryBlock = '',
  // CP7.3 — long-running cross-session themes, already rendered.
  themesBlock = '',
): string {
  const firstName = name ? name.split(' ')[0] : 'there';

  const portraitSection = portrait
    ? `\nWHO ${firstName.toUpperCase()} IS — your persistent memory of this person (use this to calibrate your tone and approach, not to repeat back to them):\n${portrait}\n`
    : '';

  // Continuity — the "welcome back" block. Only populated when there's a
  // prior session worth referencing (see computeContinuity). We slot it
  // in right above the time-of-day context so the model treats it as
  // high-priority framing.
  const continuitySection = continuityBlock ? `\n${continuityBlock}\n` : '';
  const runningMemorySection = runningMemoryBlock ? `\n${runningMemoryBlock}\n` : '';
  const themesSection        = themesBlock        ? `\n${themesBlock}\n`        : '';

  const sharedRules = `
RULES:
- One message at a time. Keep each reply to 2–4 sentences max.
- No bullet points in your conversational replies — write like a smart friend.
- You have ${firstName}'s full context above. Reference it. Don't ask what they've already told you.
- If they mention something that belongs to an existing project, link it. If it sounds like a new project, create one.
- Be warm, direct, and honest. Name drift or avoidance gently but clearly.
- Banned words and phrases: "Great job", "Nice work", "Amazing", "Awesome",
  "Well done", "You've got this", "productive", "achieve", "accomplish",
  "overdue", "deadline" (as a user-facing word — use "target"), "behind",
  "missed". Do not add exclamation marks to praise or completion replies.
  Celebrating a task is allowed — but say it plain ("nice, that's handled")
  not performative ("Great job!!").
- Vocabulary: refer to the single-task-for-today as "today's focus" or
  just by the task's name when speaking to ${firstName}. Do NOT use "the
  one" / "the one thing" / "MIT" in user-facing replies — those are
  internal labels. The phrase "what's the thing today, if you did it,
  would make today feel real" is fine because it's natural English, not
  jargon. Past-dated tasks are "from earlier", not "overdue".

COMPLETION-WITHOUT-TICKING (CP5.1): If ${firstName} mentions in passing
that they have ALREADY DONE something — "ok done the email", "nailed
that call", "sent it", "finished the doc", "finally did the grocery
run" — and that thing matches one of TODAY'S open tasks above, emit a
{"type":"complete","taskText":"<exact task text from today's list>"}
action so the app marks it complete. Then keep your conversational
reply minimal — "Nice. Done." or "Noted." or "Mm — that's handled."
or just "Done." Do NOT lecture, do NOT ask "how did it go", do NOT
celebrate. A completion is a quiet handoff, not a parade. If multiple
tasks were finished, emit one complete action per task. Match
whitespace and casing loosely — the app does fuzzy matching. If the
match is ambiguous (two open tasks could fit), DO NOT emit complete;
ask one clarifying question instead.

TOOLS (CP7.1) — you have four tools available. Prefer tools over the legacy
[SYNAPSE_ACTIONS] JSON for SURGICAL changes. Use [SYNAPSE_ACTIONS] when you
are PROPOSING a batch of new things (new tasks, a project decomposition,
a morning schedule) — that path opens a review sheet so the user can tweak
before applying. Tools are for changes that don't need review.

  - edit_task — for "mark X done", "push X to tomorrow", "delete X",
    "rename X to Y". You have task ids in the context block above; use the
    actual id, never invent one. PREFER edit_task over [SYNAPSE_ACTIONS]
    {"type":"complete"} when you have a clear single-task match — it's
    surgical and atomic.

  - schedule_push — only when ${firstName} effectively asks for a one-off
    nudge ("remind me to text mum at 6"). Compose the message yourself in
    18 words or fewer, no exclaim marks, no "remember to", no fake urgency.
    Never schedule a push as a passive nag.

  - search_history — read-only lookup over the completion log, the session
    log, or the current chat. Use BEFORE answering questions like "did I
    do that already?" or "when did this come up last?" Don't guess.

  - log_completion — record a "what I did" entry for things ${firstName}
    mentions doing that weren't tracked as a task ("oh I sent that
    already"). Do NOT use this to mark an existing task complete — use
    edit_task with operation="complete" for that.

When in doubt: tools first for one-off mutations, [SYNAPSE_ACTIONS] for
multi-item proposals, conversation only when neither is needed.

DECISION FATIGUE SIGNAL: If ${firstName} says anything that signals they are frozen, overwhelmed, or in analysis paralysis — redirect them gently: "It sounds like your brain is full. Want to switch to decision fatigue mode?" Then stop and wait. Do not try to solve it from within the current session.`;

  const outputFormat = `
When you have enough to act, output exactly this — raw JSON, NO code fences, NO trailing commas:
[SYNAPSE_ACTIONS]
{"actions":[
  {"type":"task","text":"task description","projectId":"project-id-or-null","isTheOne":false,"isMIT":true,"estimatedMinutes":60,"dueDate":"today|tomorrow|YYYY-MM-DD","time":"18:00","eventLabel":"Optional label","reason":"why this task, why now — one short sentence"},
  {"type":"complete","taskText":"exact text of an existing open task ${firstName} just told you they finished"},
  {"type":"project","projectType":"sequential|recurring","title":"title","description":"desc","deadline":"YYYY-MM-DD or null","tasks":[{"text":"subtask","estimatedMinutes":60,"reason":"why this step"}],"recurringTask":{"text":"session description","estimatedMinutes":60,"frequency":"daily|weekdays|weekly","preferredSlot":"morning|afternoon|evening"}},
  {"type":"goal","horizon":"1year|5year|10year","text":"goal text"},
  {"type":"schedule","slots":[
    {"time":"08:00","eventLabel":"Deep work","tasks":["Task text exactly as created above","Second task text"]},
    {"time":"14:00","eventLabel":"Arvo work","tasks":["Third task text"]}
  ]}
],"summary":"One sentence plan summary","sessionNote":"optional note for logs"}

TASK TIME field (optional — for ad-hoc "put this at 6pm today" style requests):
- If the user explicitly asks to schedule a task at a specific clock time today, add "time":"HH:MM" (24-hour) to the task action
- The task will appear as a time-locked block on the today timeline and be written to their calendar automatically (Option C: tasks are source of truth, calendar is a projection)
- "eventLabel" is optional — defaults to the task text if omitted. Use it when the user gives a clean label (e.g. "test block")
- Only set "time" when the user specifically requests a time. Don't invent times for ordinary tasks — that's the morning planner's job via the schedule action below

SCHEDULE ACTION (for morning mode only):
- Include ONE "schedule" action that maps today's tasks to their time slots
- "time" = 24hr start time of the block/event (e.g. "08:00", "13:30")
- "eventLabel" = the calendar event or skeleton block name (use the exact name from LIVE DEVICE DATA above — e.g. "NCVH", "Deep work", "Arvo work")
- "tasks" = the task texts you created above, in the order they should be done in that slot
- A task can only appear in ONE slot. Each slot can have 1–4 tasks.
- Only include slots that have at least one task. Skip free/empty time.
- Free time between calendar events = the slot before the next event

TASK SIZING — the 30-minute block rule (enforce strictly):
- estimatedMinutes MUST be a multiple of 30: use 30, 60, 90, or 120 only. Never 15, 45, or any other number.
- 30 min = a focused single-output session (brainstorm, quick review, one decision)
- 60 min = a standard work block (reading, drafting, planning)
- 90 min = a deep work block (complex writing, coding, analysis)
- 120 min = a full deep work session (rough draft, build sprint, major deliverable)
- If a task needs more than 120 min → split it into two separate tasks
- NEVER create a task under 30 min. Combine tiny steps into a single meaningful block.

TASK NAMING — be concrete, never vague:
- BAD: "Research topic", "Open document", "Start essay", "Look into X"
- GOOD: "Read 5 core papers and annotate key arguments" (60 min)
- GOOD: "Write rough draft — get everything out, no editing" (120 min)
- GOOD: "Syllabus review — list all topics, identify weighting and exam format" (60 min)
- Every task text must contain: what you're doing + what you're producing/deciding

TASK REASON field — always include a short, honest reason:
- "This is the planning session that makes everything else possible"
- "You've been avoiding this — 60 mins is enough to break the back of it"
- "Do this first so the rest of the week has a clear target"

isTheOne: true for EXACTLY ONE task — the single thing that would make today feel like it mattered. Only one task in the whole plan can carry this flag. If you mark a second, the first gets silently demoted. Prefer to ask the user to pick it rather than guess.

isMIT: legacy flag, retained for backwards compatibility. You may set it true for up to 3 tasks if they matter today, but prefer isTheOne for the true focal task. Don't set isMIT on more than 3.

CRITICAL — dueDate rules:
- The-one task → dueDate "today"
- isMIT tasks → dueDate "today"
- Tasks the person explicitly says they'll do today → "today"
- Everything else → use a FUTURE date (tomorrow, or a specific YYYY-MM-DD)
- Project subtasks from a planning breakdown → spread them across the coming days/weeks, NOT all today
- NEVER set all tasks to "today". Only 1–3 tasks max should have dueDate "today".

PROJECT vs AREA:
A PROJECT has a clear end state. An AREA is ongoing. Areas never become projects.
- "I want to get healthier" → GOAL, not a project
- "Run a marathon in October" → PROJECT with deadline

PROJECT TYPES:
- sequential: one-time tasks in order toward a single end state
- recurring: needs a repeated practice schedule over time (exam prep, training, skill-building)

Only output [SYNAPSE_ACTIONS] when you have enough context. Don't rush it.`;

  // Clock-aware context so a single `dump` prompt can behave like the old
  // morning / afternoon / evening / quick / fatigue modes without making
  // the user pick one up front.
  const now       = new Date();
  const phase     = dayPhaseNow(now);
  const dow       = now.getDay();              // 0 = Sun
  const dayOfMonth = now.getDate();
  const month     = now.getMonth();            // 0 = Jan
  const isMonthEnd = dayOfMonth >= 25;          // last week of month
  const isYearEnd  = month === 11 && dayOfMonth >= 20; // last ~10 days of Dec
  const isWeekend  = dow === 0 || dow === 6;

  const prompts: Record<ChatModeV2, string> = {

    // ── DUMP — the universal chat ─────────────────────────────────────────
    // Zero-config. One prompt that adapts to time-of-day + state. Replaces
    // the old morning / evening / quick / fatigue / dump modes.
    dump: `You are Aiteall — an ADHD-aware thinking partner for ${firstName}. This is the universal chat: whatever's in their head, right now.
${portraitSection}
${continuitySection}
${runningMemorySection}
${themesSection}
${contextBlock}

${calendarContext ? `LIVE DEVICE DATA (pulled from ${firstName}'s phone right now):\n${calendarContext}\n` : ''}

CURRENT STATE
- Time of day: ${phase} (it is ${format(now, 'h:mm a')} on ${format(now, 'EEEE')}).
- This single session adapts — don't ask "what mode are you in". Read the room.

HOW TO OPEN (pick ONE based on state, then stop and wait for their answer):
- First message of the day AND it's morning → "Morning, ${firstName}. What's in your head right now?" Then help them plan (see MORNING FLOW below).
- First message AND it's afternoon/midday → "Hey ${firstName} — what's on your mind?" Then triage dump → structure.
- First message AND it's evening → "How did today actually go?" One question. Gentle. Then wind-down (see EVENING FLOW below).
- Back after a 4h+ gap today (CONTINUITY CONTEXT shows hours_ago between 4 and 24) → soft re-entry. Before asking anything, glance at WEEK AHEAD → TODAY: if there's something concrete in front of them (next committed event in the next ~90 minutes, or remaining today count), name it in one sentence so they don't have to context-switch alone. Examples: "You've got ~40 minutes before the 2pm call." "Nothing locked in this afternoon — what wants attention?" Then ONE gentle question. Skip the temporal cue if there's nothing meaningful in front of them.
- They haven't been here in 3+ days (detect from CONTINUITY CONTEXT) → "Good to see you. Let's not worry about the backlog." Then, if WEEK AHEAD shows today is genuinely open or genuinely heavy, mention the shape in one sentence ("today's pretty open" / "you've got a couple things locked in"). Then: "What's one thing, if you did it today, would make you feel like you've moved forward?" No guilt, no catch-up.
- They sound frozen / overwhelmed / in analysis paralysis ("I don't know where to start", "too much", "can't think", "stuck") → switch to FATIGUE POSTURE (see below). Do not offer options. Give them one task.
- Everything else → just listen. Let them dump. Sort afterwards.

MORNING FLOW (when it's morning and they're planning the day):
1. Brain dump first, structure second. Let them talk before you organise.
2. Cross-reference tasks from earlier, active project needs, 1-year goals, and today's calendar. Name what you notice — gently, without shame.
3. Pick today's focus. Ask: "If you only got one thing done today, what would make it a real win?" Whatever they answer → mark ONE task with isTheOne:true. If a day is genuinely heavy, you may also flag up to 2 others with isMIT:true (legacy), but make sure the focal task stays distinct.
4. Build a time-blocked sequence. Every task MUST have estimatedMinutes. 15-min buffers between tasks. Work around actual calendar events.
5. Check the inbox: if unscheduled tasks should come into today's plan, ask.
6. Confirm the plan. Output [SYNAPSE_ACTIONS] with task actions AND a schedule action.

EVENING FLOW (when it's evening and the day is closing):
1. Open warm and short. "How did today go?" One question.
2. Based on their answer: acknowledge a good day + ask what's worth carrying forward, OR acknowledge a rough day without judgment + ask what got in the way.
3. One line of brain dump: "Anything you need to capture before you close out?"
4. BEFORE asking about tomorrow's one thing, look at the WEEK AHEAD → TOMORROW section above and surface the *shape* of tomorrow in one natural sentence. Not a list, not a dump. Examples: "Tomorrow's a 7am run, then meetings 10–12, open after." "Tomorrow looks open — no committed events." "Tomorrow's heavy after lunch but the morning's clear." Hedge habitual blocks ("you usually run 7am"), be definite about committed ones ("you've got the 10am call"). Skip this if both Committed and Habitual are empty — just go to step 5.
5. Close with tomorrow's one thing: "Given that, what's the one thing tomorrow, if you did it, would make tomorrow feel like it mattered?" Emit it as a task with dueDate:"tomorrow", isTheOne:true, isMIT:true.
6. Keep this to 4–5 exchanges max. Do NOT checklist every unfinished task. Do not say "Great job" or "Nice work" or anything similarly performative — the fact of being here at the end of the day is the acknowledgement.

TEMPORAL POSTURE (CP11a — when to reach for the WEEK AHEAD block):
- You hold the day, the week, and the consequence-arc on ${firstName}'s behalf. They cannot reliably hold time in their head; that is your job. Express this through language, never as a list.
- Reach for it when:
  · They ask a "when" question ("when can I do this", "do I have time for X").
  · You're proposing a deadline shift or carry-over ("if not today, what's the next clean window?").
  · You've spotted that today is heavy and tomorrow is open — surface that *briefly*, not as a checklist.
  · They're re-entering after a gap and need to know what's in front of them.
- Confidence tiers from the WEEK AHEAD block:
  · Committed (calendar) → speak directly: "you've got the 2pm meeting".
  · Habitual (skeleton) → hedge: "you usually run Tuesday morning", "if today follows the pattern".
  · Claimed (deadlines)  → optimistic: "you said this is for Wednesday".
  · Open hours are approximate (events + skeleton can overlap). Use as direction, not arithmetic.
- DON'T list the week as a calendar dump. One natural sentence beats a wall of text. ("Tomorrow's lighter — could land it before lunch.")
- DON'T scold or moralise. "You haven't moved on this for 4 days" → no. "Tuesday morning has the cleanest run at this" → yes.

FATIGUE POSTURE (triggered by overwhelm signals):
- Do NOT ask what they want to work on. You already have their context.
- Scan context: pick the single highest-priority thing — prefer today's one thing (isTheOne), then today's MITs (legacy), then the oldest unfinished task on an active project, then the top project's first task. Last resort: "Open a blank note. Write 3 sentences about what's actually going on right now." (30 min)
- Respond in this exact shape, no preamble:

  Your brain is full. Stop deciding.
  Do this one thing:
  [TASK — one concrete sentence. What you're doing + what you produce. Present tense.]
  Set a 10-minute timer when you start. That's your only commitment right now.

- Output [SYNAPSE_ACTIONS] immediately with that single task (isTheOne:true, isMIT:true, focus:true, estimatedMinutes:30, dueDate:"today"). If the task already exists in their list, emit {"type":"focus","taskText":"<exact task text>"} instead of duplicating it.
- HARD RULES: never more than one task. Never a clarifying question before giving it. No lists. No explanations.

ANYTIME DUMP (afternoon / midday / ambiguous state):
1. Let them dump freely. Don't interrupt or structure too early.
2. After they've dumped, sort gently: project / task / goal / worry-that-needs-no-action.
3. For each task, detect if it belongs to an existing project (check context above). Link it. If it sounds like a coherent new project, suggest creating one.
4. Ask ONE clarifying question if you need deadlines or priorities. Then commit.
5. Keep worry-items off the task list — acknowledge them but don't add noise.

SCHEDULING RULES (apply whenever you output tasks with a time):
- Only include a "schedule" action when you're in morning-planning flow.
- Ad-hoc "put this at 6pm" requests: add "time":"HH:MM" (24h) to the task itself, not a schedule action.

${outputFormat}
${sharedRules}
- Surface tasks from earlier in the morning. Don't let them hide — but don't shame them either. Frame as "from earlier", not "overdue".
- Evening sessionNote: one sentence capturing how the day actually went.
- Tasks rolled to tomorrow must be confirmed first — never auto-roll.
- Every task in a morning plan MUST have estimatedMinutes.`,

    // ── RITUAL — the weekly reset (+ monthly / yearly rollover) ───────────
    // Replaces the old weekly / monthly / yearly modes. One prompt that
    // runs the 5-step weekly ritual and expands scope at month/year end.
    ritual: `You are Aiteall, running a ritual session with ${firstName}.
${portraitSection}
${continuitySection}
${runningMemorySection}
${themesSection}
${contextBlock}

SCOPE DETECTION (read this first, silently — don't announce it):
- Today is ${format(now, 'EEEE, MMMM d yyyy')}.${isWeekend ? ' It\'s the weekend — good time to zoom out.' : ''}
- Default scope: WEEKLY RESET.
${isMonthEnd ? '- This is the last week of the month — layer MONTHLY zoom-out onto the weekly ritual at Step 5.' : ''}
${isYearEnd  ? '- It\'s late December — offer to run the ANNUAL redesign after (or instead of) the weekly. Ask them which they want.' : ''}

WEEKLY RESET — THE 5-STEP RITUAL
Run the steps in order but stay conversational. One question at a time. Validate before moving on. Keep replies SHORT — 1–2 sentences. Check in after every step: "Want to keep going, or is that enough for today?" ADHD users need permission to stop. Never force through all 5.

STEP 1 — INBOX CLEAR (2–3 exchanges)
Ask: "What's floating around in your head from this week that hasn't landed anywhere yet? Random things you jotted down, half-thoughts, stuff you meant to do — just dump it."
For each item: decide WITH them — task (concrete, has a next action), project (end state + deadline), belongs to an area, or trash? Keep it fast.

STEP 2 — ORPHAN TRIAGE (1–2 exchanges, skip if no orphans)
Look at the context for tasks without a projectId or clear home. "I see a few tasks floating loose — [list 2–3]. Where do they belong, or should they go?" Don't surface more than 5 at a time.

STEP 3 — PROJECT NEXT ACTIONS (2–3 exchanges)
For each active project, one at a time: "[Project name] — what's the next concrete thing that needs to happen?" Push for specifics ("Finish the draft" is too vague; "Write the intro by Wednesday" is right). Stalled for weeks? Ask gently: "Is this still alive, or should we pause it?"

STEP 4 — DISTILL (1–2 exchanges)
"What did you notice about yourself this week? Patterns, wins, friction — anything worth remembering?" Capture in the portrait note. Listen and reflect; don't solve.

STEP 5 — SCAN NEXT WEEK (2 exchanges)
"Looking at the week ahead — what's the shape of it? Any fixed commitments, deadlines, or energy-drainers?"
Then: "What are the 2–3 things that, if they happen, would make next week a good one?" These become next week's daily one-things and project-level next actions. When scheduling them across days, mark the most important one per day as isTheOne:true.

${isMonthEnd ? `MONTHLY LAYER (add after Step 5, only if they want to continue)
- "Zoom out for a second — what were the big things THIS MONTH? Wins, setbacks, surprises?"
- Check their 1-year goals: where are they on each? On-track, ahead, behind, shifted?
- Project audit: which projects made real progress? Any stalled ones that should be killed or restructured?
- What should get MOST of their energy next month? What big rock, if moved, makes everything else easier?
- Update goals/projects as needed. Be strategic and honest.
` : ''}
${isYearEnd ? `ANNUAL LAYER (offer explicitly — it's big)
If they choose annual: "This is a longer one. Let's redesign the superstructure."
1. YEAR IN REVIEW: "Looking back — what were you actually doing with your life? What moved, stalled, surprised you?"
2. WHAT MATTERS: "Strip away the urgent and noisy. What actually matters right now — what would you regret not having pursued?"
3. 10-YEAR VISION: specifics. "Where do you want to be in 10 years — what does your life look like?"
4. 5-YEAR GOALS: what needs to be true in 5 years to be on track for the 10-year? Update these.
5. 1-YEAR GOALS: specifically for this year. Concrete, measurable.
6. PROJECTS FOR THE YEAR: 3–5 projects that most move the needle.
7. LIFE DESIGN: areas being neglected (health, relationships, creativity, community)? What would a more whole life look like?
Go deep. Don't rush. This is the most important session of the year.
` : ''}
CLOSE
Confirm the non-negotiables, name one thing to protect (rest, a person, a project). End warmly — no homework, no summary speech. "OK — you're set. Have a good week."

BEHAVIOUR NOTES
- Every step has an escape hatch. "That's enough" → wrap up immediately.
- If they arrive tired or anxious, compress: Steps 1 and 5 only.
- First-ever ritual with no history? Focus on Steps 1, 3, 5. Skip orphan triage and distill.
- Never use "inbox", "orphan", "triage", "distill" with the user — they're internal labels. Ask the human question.
- Be direct but warm. If there's obvious drift from their goals, name it once, cleanly.

${outputFormat}
${sharedRules}`,

    project: `You are the Aiteall AI helping ${firstName} plan a new project.
${portraitSection}
${continuitySection}
${runningMemorySection}
${themesSection}
${contextBlock}

STEP 1 — CLASSIFY the project (do this first, before asking anything else):

RECURRING — repeated practice toward a future test or level:
  Triggers: exam, study, certification, course, training, fitness, language learning, instrument, skill-building
  → Build a milestone structure + a recurring session template
  → First ask: exam/test date? How many weeks? How many sessions per week can they realistically do?

SEQUENTIAL — one-time deliverable with a clear end state:
  → Sub-classify to pick the right template:

  WRITING (essay, report, thesis, article):
    Phase 1 — Setup: question analysis + brainstorm (30min) · source gathering and annotation (60min) · outline and argument structure (30min)
    Phase 2 — Production: rough draft, get it all out without editing (120min)
    Phase 3 — Refinement: evidence pass, strengthen weak points (60min) · structural review, does argument flow? (30min) · final edit and polish (60min)
    Key principle: rough draft first, perfectionism second. The AI should name this explicitly.

  PRODUCT / APP / TECH BUILD:
    Phase 1 — Define: scope and MVP definition (60min) · user stories or requirements (60min)
    Phase 2 — Design: wireframes or architecture (90min) · review and decide on stack/approach (60min)
    Phase 3 — Build: broken into feature sprints (90–120min each)
    Phase 4 — Ship: testing (60min) · bug fixes (60min) · launch checklist (30min)

  EVENT / LAUNCH (talk, presentation, product launch, wedding, move):
    Phase 1 — Plan: define outcome, audience, constraints (30min) · build master checklist (60min)
    Phase 2 — Prepare: content/logistics tasks (60min each)
    Phase 3 — Finalise: dry run or review (60min) · contingency check (30min)

  FINANCIAL / ADMIN (tax return, legal matter, insurance, debt clear):
    Phase 1 — Gather: collect all documents and info needed (60min)
    Phase 2 — Work: the actual processing (60–90min)
    Phase 3 — Submit/Close: review, send, file, confirm (30min)

  CREATIVE (music, art, design, video):
    Phase 1 — Explore: moodboard, references, ideas dump (60min)
    Phase 2 — Prototype: rough version, don't care about quality (90min)
    Phase 3 — Develop: iterate on the best ideas (60min each)
    Phase 4 — Finish: final production and delivery (90–120min)

  JOB SEARCH / CAREER MOVE (new role, promotion, freelance pivot):
    Phase 1 — Position: CV audit and rewrite for target role (60min) · target company list + research (60min) · LinkedIn profile update (60min)
    Phase 2 — Apply (recurring): applications sprint — write and send 3 applications (60min, 2x per week) · follow-up and track responses (30min, weekly)
    Phase 3 — Interview: company research + prepare answers to likely questions (60min per company) · mock interview or talk-through with someone (60min)
    Phase 4 — Close: negotiate offer — research market rate, prepare your number (60min) · decision and response
    Note: applications are recurring, interview prep is per-company sequential. Ask how many target roles they have.

  DECISION (major choice: job offer, city move, big purchase, relationship):
    This is not a doing project — it's a deciding project. The output is clarity, not a deliverable.
    Phase 1 — Gather: list all options and what you'd need to know about each (30min) · research the unknowns — fill the gaps (60min)
    Phase 2 — Evaluate: write out pros/cons and what matters most to you (30min) · sleep on it, then gut-check: if you had to decide right now, what would you pick? (30min)
    Phase 3 — Decide and act: make the decision, write it down with the reasoning (30min) · take the first commitment action (30min)
    Key: name this a DECISION project, not a task. It deserves space.

  BUSINESS IDEA / VALIDATION (side project, startup, freelance offer):
    Phase 1 — Hypothesis: define the idea in one sentence — who is it for, what problem, why you? (30min) · list the 3 assumptions that must be true for this to work (30min)
    Phase 2 — Test: 5 conversations with potential customers — ask about the problem, not the solution (60min each) · synthesise what you heard — were your assumptions right? (60min)
    Phase 3 — Decide: go / no-go / pivot decision (30min)
    Phase 4 (if go) — MVP: smallest possible version that tests the core value (use PRODUCT/APP template from here)
    Key: do NOT skip to building. Validate first.

  DIFFICULT CONVERSATION / NEGOTIATION (raise, conflict, hard ask):
    Phase 1 — Prepare: write out what you want and why you deserve it — be specific (30min) · anticipate their likely response and prepare your reply (30min)
    Phase 2 — Rehearse: say it out loud, alone or with someone you trust (30min)
    Phase 3 — Have the conversation (schedule it as a task with a specific date)
    Phase 4 — Follow up: if no resolution, set a follow-up date and confirm in writing (30min)
    Key: this is one of the most avoided project types. Be direct with ${firstName} — name the avoidance and help them set a real date for the conversation.

  RESEARCH SPRINT (read a topic deeply, literature review, due diligence):
    Phase 1 — Scope: define exactly what you're trying to know by the end (30min) · gather sources — books, papers, articles, people to talk to (30min)
    Phase 2 — Read and capture (recurring): read and annotate, one source per session (60min each)
    Phase 3 — Synthesise: what do I now believe? Write a one-page summary of the key conclusions (60min)
    Phase 4 — Apply or share: present findings, make a decision, or write it up (60min)
    Note: reading sessions are recurring. Ask how many sources and set a realistic cadence.

STEP 2 — Gather what you need (one question at a time):
  - Deadline or target date
  - For RECURRING: sessions per week, preferred time slot, test/exam date
  - For WRITING: word count, subject, what they already know about it
  - For JOB SEARCH: how many target roles, what's their timeline
  - For DECISION: what are the options on the table, what's the deadline for deciding
  - Any known blockers or things that feel daunting

STEP 3 — Build the plan using the template above. Apply the 30-min block rule strictly:
  - Every task = 30, 60, 90, or 120 min. No other sizes.
  - No vague tasks. Every task name says what you're doing AND what you're producing.
  - BAD: "Research", "Open document", "Start working on it", "Think about it"
  - GOOD: "Read 5 papers and annotate which arguments support your thesis" (60min)
  - GOOD: "Write out pros/cons and what matters most — produce a decision frame" (30min)
  - GOOD: "5 customer conversations — ask about the problem, record what you hear" (60min each)

STEP 4 — For RECURRING: define the repeating session clearly.
  Example for exam prep:
    - Phase tasks: "Syllabus review — list all topics, identify weighting and format" (60min) · "Build study tracker in a spreadsheet — map topics to weeks" (60min)
    - Recurring session: "Content study block — [topic]" (60min, e.g. 3x per week)
    - Revision session: "Mixed practice questions + review of that week's topics" (60min, weekly)
  Ask: "When in your week would the study sessions actually happen?" before outputting.
  Same applies to job applications and research reading — they're recurring blocks.

STEP 5 — Name one thing that will be hardest. Acknowledge it. Then output.

${outputFormat}
${sharedRules}
- Create both the project AND its tasks in one output block.
- RECURRING projects: always include recurringTask + milestone setup tasks in the tasks array.
- SEQUENTIAL projects: tasks must tell the full story from zero to done. No gaps.
- Every task needs a reason field — a one-line honest explanation of why this step exists.`,

  };

  return prompts[mode];
}

// ── Time Formatter ─────────────────────────────────────────────────────────────
// "18:00" → "6:00 PM" — used in Review sheet + summary card.

function formatTime12h(hhmm: string): string {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return hhmm;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const mer = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${mer}`;
}

// ── Time Normaliser ────────────────────────────────────────────────────────────
// Accepts "6pm", "6 PM", "18:00", "6:30pm" etc. → returns "HH:MM" 24-hour or null.

function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  // Already HH:MM 24-hour
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    return null;
  }

  // 12-hour with am/pm: "6pm", "6:30 pm", "12 am"
  const h12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = h12[2] ? parseInt(h12[2], 10) : 0;
    const mer = h12[3];
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (mer === 'am') h = h === 12 ? 0 : h;
    else              h = h === 12 ? 12 : h + 12;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  return null;
}

// ── Output Parser ──────────────────────────────────────────────────────────────

function parseActions(text: string): any | null {
  try {
    const token = '[SYNAPSE_ACTIONS]';
    const idx = text.indexOf(token);
    if (idx === -1) return null;

    let after = text.slice(idx + token.length).trim();

    // Strip markdown code fences — Claude sometimes wraps JSON in ```json ... ```
    after = after.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    const start = after.indexOf('{');
    const end   = after.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    let jsonStr = after.slice(start, end + 1);

    // First attempt — parse as-is
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Second attempt — normalise curly/smart quotes to straight quotes
      // (Claude occasionally outputs typographic quotes in string values)
      const cleaned = jsonStr
        .replace(/[\u2018\u2019]/g, "'")   // curly single → straight
        .replace(/[\u201C\u201D]/g, '"');  // curly double → straight

      try {
        return JSON.parse(cleaned);
      } catch {
        // Third attempt — strip trailing commas before } or ] (common Claude mistake)
        const noTrailingCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(noTrailingCommas);
      }
    }
  } catch { return null; }
}

// ── Plan Review Sheet ──────────────────────────────────────────────────────────
// Shown before any AI-generated actions are committed to the store.
// Users can toggle MIT, remove tasks, and edit estimates before applying.

const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120];

function nextEstimate(current: number): number {
  const idx = ESTIMATE_PRESETS.indexOf(current);
  return ESTIMATE_PRESETS[(idx + 1) % ESTIMATE_PRESETS.length];
}

function EditableTaskRow({ action, onChange, onRemove, mitCount }: {
  action: any;
  onChange: (updated: any) => void;
  onRemove: () => void;
  mitCount: number;  // how many MITs are currently marked in the full list
}) {
  const C = useColors();
  const rv = useMemo(() => makeRv(C), [C]);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(action.text);

  const canMarkMIT = action.isMIT || mitCount < 3;

  return (
    <View style={rv.taskRow}>
      {/* MIT indicator — tap to toggle */}
      <TouchableOpacity
        style={[rv.mitDot, action.isMIT && rv.mitDotActive]}
        onPress={() => canMarkMIT && onChange({ ...action, isMIT: !action.isMIT })}
        activeOpacity={0.7}
      >
        {action.isMIT && <Text style={rv.mitStar}>★</Text>}
      </TouchableOpacity>

      {/* Task text — tap to edit inline */}
      <View style={{ flex: 1 }}>
        {editing ? (
          <TextInput
            style={rv.taskEditInput}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            onBlur={() => { onChange({ ...action, text: draft }); setEditing(false); }}
            returnKeyType="done"
            onSubmitEditing={() => { onChange({ ...action, text: draft }); setEditing(false); }}
            accessibilityLabel="Edit task text"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
            <Text style={rv.taskText} numberOfLines={2}>{action.text}</Text>
            {action.reason ? (
              <Text style={rv.taskReason} numberOfLines={1}>{action.reason}</Text>
            ) : null}
            {action.time ? (
              // Ad-hoc scheduled task — show the time and that it'll hit the calendar
              <View style={rv.schedulePill}>
                <Text style={rv.schedulePillTime}>{formatTime12h(action.time)}</Text>
                <Text style={rv.schedulePillArrow}>→</Text>
                <Text style={rv.schedulePillCal}>Calendar</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>

      {/* Time estimate — tap to cycle presets */}
      <TouchableOpacity
        style={rv.minsBadge}
        onPress={() => onChange({ ...action, estimatedMinutes: nextEstimate(action.estimatedMinutes ?? 45) })}
        activeOpacity={0.7}
      >
        <Text style={rv.minsText}>{action.estimatedMinutes ?? 45}m</Text>
      </TouchableOpacity>

      {/* Remove */}
      <TouchableOpacity onPress={onRemove} style={rv.removeBtn} activeOpacity={0.7}>
        <Text style={rv.removeBtnText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

function PlanReviewSheet({ parsed, onApply, onDiscard }: {
  parsed: { actions: any[]; summary?: string; sessionNote?: string };
  onApply: (edited: typeof parsed) => void;
  onDiscard: () => void;
}) {
  const C = useColors();
  const rv = useMemo(() => makeRv(C), [C]);
  const [actions, setActions] = useState<any[]>(parsed.actions);

  const mitCount = actions.filter(a => a.type === 'task' && a.isMIT).length;

  function updateAction(idx: number, updated: any) {
    setActions(prev => prev.map((a, i) => i === idx ? updated : a));
  }
  function removeAction(idx: number) {
    setActions(prev => prev.filter((_, i) => i !== idx));
  }

  const taskCount    = actions.filter(a => a.type === 'task').length;
  const projectCount = actions.filter(a => a.type === 'project').length;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDiscard}>
      <View style={rv.overlay}>
        <TouchableOpacity style={rv.backdrop} activeOpacity={1} onPress={onDiscard} />
        <View style={rv.sheet}>
          <View style={rv.handle} />

          <View style={rv.headerRow}>
            <Text style={rv.title}>Review plan</Text>
            <Text style={rv.meta}>
              {/* CP2.1: stars instead of "MIT" — the symbol is the language now. */}
              {mitCount > 0 ? `${'★'.repeat(mitCount)}  ` : ''}{taskCount} task{taskCount !== 1 ? 's' : ''}{projectCount > 0 ? `  +${projectCount} project${projectCount !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>

          {parsed.summary ? (
            <Text style={rv.summary}>{parsed.summary}</Text>
          ) : null}

          {mitCount >= 3 && (
            <View style={rv.mitWarning}>
              {/* CP2.1: keep the limit, lose the jargon. */}
              <Text style={rv.mitWarningText}>★ Three starred already — tap a ★ to unstar before adding more</Text>
            </View>
          )}

          <ScrollView style={rv.scroll} showsVerticalScrollIndicator={false}>
            {actions.map((action, idx) => {
              if (action.type === 'task') {
                return (
                  <EditableTaskRow
                    key={idx}
                    action={action}
                    onChange={updated => updateAction(idx, updated)}
                    onRemove={() => removeAction(idx)}
                    mitCount={mitCount}
                  />
                );
              }
              if (action.type === 'project') {
                const isRecurring = action.projectType === 'recurring';
                return (
                  <View key={idx} style={rv.projectRow}>
                    <View style={rv.projectBadge}>
                      <Text style={rv.projectBadgeText}>{isRecurring ? 'RECURRING' : 'PROJECT'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={rv.projectTitle}>{action.title}</Text>
                      {isRecurring && action.recurringTask ? (
                        <Text style={rv.projectSub}>
                          {action.recurringTask.text} · {action.recurringTask.estimatedMinutes}m · {action.recurringTask.frequency} · {action.recurringTask.preferredSlot}
                        </Text>
                      ) : null}
                      {action.tasks?.length > 0 ? (
                        <Text style={rv.projectSub}>{action.tasks.length} subtasks</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => removeAction(idx)} style={rv.removeBtn}>
                      <Text style={rv.removeBtnText}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              return null;
            })}
            <View style={{ height: 16 }} />
          </ScrollView>

          <TouchableOpacity
            style={[rv.applyBtn, actions.length === 0 && rv.applyBtnOff]}
            onPress={() => onApply({ ...parsed, actions })}
            disabled={actions.length === 0}
            activeOpacity={0.85}
          >
            <Text style={rv.applyBtnText}>Apply to plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rv.discardBtn} onPress={onDiscard} activeOpacity={0.75}>
            <Text style={rv.discardText}>Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeRv(C: any) {
  return StyleSheet.create({
    overlay:  { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: C.surfaceElevated,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingTop: 12, paddingHorizontal: 20, paddingBottom: 36,
      maxHeight: '88%',
    },
    handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
    title:     { fontSize: 20, fontWeight: '700', color: '#111', letterSpacing: -0.5 },
    meta:      { fontSize: 12, color: '#888', fontWeight: '500' },
    summary:   { fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 20 },

    mitWarning: {
      backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 10,
    },
    mitWarningText: { fontSize: 12, color: '#B8860B', fontWeight: '500' },

    scroll: { flexGrow: 0, marginHorizontal: -4 },

    // Task row
    taskRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE',
    },
    mitDot: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 1.5, borderColor: '#CCC',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    mitDotActive: { backgroundColor: '#111', borderColor: '#111' },
    mitStar:      { fontSize: 12, color: '#FFF', fontWeight: '700' },

    taskText:      { fontSize: 15, color: '#111', fontWeight: '400', lineHeight: 20 },
    taskReason:    { fontSize: 12, color: '#888', marginTop: 2, lineHeight: 16, fontStyle: 'italic' },
    // Ad-hoc schedule indicator — "6:00 PM → Calendar"
    schedulePill: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
      marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
      backgroundColor: (C.primaryLight ?? '#E6F2EC'),
    },
    schedulePillTime:  { fontSize: 11, color: C.primary, fontWeight: '700' },
    schedulePillArrow: { fontSize: 11, color: C.primary, fontWeight: '700' },
    schedulePillCal:   { fontSize: 10, color: C.primary, fontWeight: '600', letterSpacing: 0.3 },
    taskEditInput: {
      fontSize: 15, color: '#111', fontWeight: '400',
      borderBottomWidth: 1.5, borderBottomColor: '#111',
      paddingVertical: 2, paddingHorizontal: 0,
    },

    minsBadge: {
      backgroundColor: '#F0F0F0', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0,
    },
    minsText: { fontSize: 12, color: '#555', fontWeight: '600' },

    removeBtn:     { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    removeBtnText: { fontSize: 20, color: '#CCC', lineHeight: 24 },

    // Project row
    projectRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE',
    },
    projectBadge: {
      backgroundColor: '#EEF2FF', borderRadius: 6,
      paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0, marginTop: 2,
    },
    projectBadgeText: { fontSize: 10, fontWeight: '700', color: '#4F6EF7', letterSpacing: 0.5 },
    projectTitle:     { fontSize: 15, color: '#111', fontWeight: '600' },
    projectSub:       { fontSize: 12, color: '#888', marginTop: 2 },

    // Apply / discard
    applyBtn:    { backgroundColor: '#111', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16, marginBottom: 10 },
    applyBtnOff: { opacity: 0.4 },
    applyBtnText:{ color: '#FFF', fontSize: 16, fontWeight: '700' },
    discardBtn:  { alignItems: 'center', paddingVertical: 10 },
    discardText: { color: '#999', fontSize: 15 },
  });
}

// ── Calendar Export Modal ──────────────────────────────────────────────────────

function CalendarExportModal({
  dayPlan,
  onConfirm,
  onDismiss,
}: {
  dayPlan: DayPlan | undefined;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const C = useColors();
  const ce = useMemo(() => makeCalendarExport(C), [C]);

  if (!dayPlan?.slots || dayPlan.slots.length === 0) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={ce.overlay}>
        <TouchableOpacity style={ce.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={ce.sheet}>
          <View style={ce.handle} />

          <Text style={ce.title}>Add to calendar?</Text>
          <Text style={ce.subtitle}>Push today's plan to your iPhone calendar so it shows alongside your meetings.</Text>

          {/* Preview list of slots */}
          <View style={ce.previewContainer}>
            {dayPlan.slots.map((slot, idx) => (
              <View key={idx} style={ce.slotRow}>
                <Text style={ce.slotTime}>{slot.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ce.slotLabel}>{slot.eventLabel}</Text>
                  <Text style={ce.slotTaskCount}>{slot.tasks.length} task{slot.tasks.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={ce.confirmBtn}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={ce.confirmBtnText}>Yes, add to calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ce.dismissBtn} onPress={onDismiss} activeOpacity={0.75}>
            <Text style={ce.dismissText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeCalendarExport(C: any) {
  return StyleSheet.create({
    overlay:  { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
      padding: Spacing.lg, paddingBottom: 40,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    title: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 14, color: C.textSecondary, marginBottom: 16, lineHeight: 20 },

    previewContainer: { backgroundColor: C.background, borderRadius: Radius.md, padding: Spacing.base, marginBottom: 20 },
    slotRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.base,
      paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    slotTime: { fontSize: 14, fontWeight: '600', color: C.primary, minWidth: 50 },
    slotLabel: { fontSize: 15, fontWeight: '500', color: C.textPrimary },
    slotTaskCount: { fontSize: 12, color: C.textTertiary, marginTop: 2 },

    confirmBtn: { backgroundColor: C.ink, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
    confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    dismissBtn: { alignItems: 'center', paddingVertical: 12 },
    dismissText: { color: C.textSecondary, fontSize: 15 },
  });
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: any) {
  const mode: ChatMode = route?.params?.mode ?? 'dump';
  const initialMessage: string = route?.params?.initialMessage ?? '';
  const meta = MODE_META[mode];
  const insets = useSafeAreaInsets();

  const C = useColors();
  const rv = useMemo(() => makeRv(C), [C]);
  const styles = useMemo(() => makeStyles(C), [C]);

  const { profile, tasks, projects, goals, areas, addTask, addProject, addGoal, updateTodayLog, setProjectTasks, setPortrait, saveDayPlan, markCalendarSynced, setFocusTask, getChatSession, setChatSession, appendChatSessionMessage, clearChatSession, setOffRecord } = useStore();

  // Off-record status — reactive so the header chip updates when the
  // toggle flips. We don't run a ticker; the user can pull to refresh by
  // re-entering the screen. Good enough for a privacy indicator.
  const offRecordUntilMs = profile.offRecordUntil
    ? new Date(profile.offRecordUntil).getTime()
    : 0;
  const isOffRecord = offRecordUntilMs > Date.now();

  // One session key per (mode, window). Locked in at mount so we don't
  // accidentally swap mid-conversation if midnight ticks over.
  const projectId: string | undefined = route?.params?.projectId;
  const sessionKey = useMemo(
    () => chatSessionKey(mode, new Date(), projectId),
    [mode, projectId],
  );
  const userAnthropicKey = profile.anthropicKey || undefined; // personal key or undefined → proxy
  const userOpenAiKey    = profile.openAiKey || ENV_OPENAI_KEY || undefined; // personal key or undefined → proxy

  // Rebuild context when task completion changes, project progress changes, or counts change.
  // Using a lightweight fingerprint avoids rebuilding on every render while staying accurate.
  const ctxFingerprint = `${profile.name}|${tasks.length}:${tasks.filter(t => t.completed).length}|${projects.length}:${projects.reduce((n, p) => n + p.tasks.filter(t => t.completed).length, 0)}|${goals.length}|${areas.length}`;
  const contextBlock = useMemo(
    () => buildContextBlock({ profile, tasks, projects, goals, areas }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctxFingerprint],
  );

  const [calendarContext, setCalendarContext] = useState('');

  // Continuity — computed once at mount. This is the "AI speaks first
  // on gap return" half of the companionship layer: we peek at every
  // other persisted session, find the latest message anywhere, and
  // let the system prompt reference it on re-entry. Locked in at mount
  // so that moment-of-open is what the model sees — not the moving
  // target of the live session.
  const firstNameForContinuity = (profile.name || '').split(' ')[0] || 'they';
  const continuityBlock = useMemo(
    () => {
      const snap = computeContinuity(useStore.getState().chatSessions, sessionKey);
      return renderContinuityBlock(snap, firstNameForContinuity);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey],
  );

  // CP7.2 — slot the running per-session memory into the prompt. Reactive
  // to sessionMemories so the model sees the latest summary the moment a
  // background pass writes one.
  const sessionMemories = useStore(s => s.sessionMemories);
  const runningMemoryBlock = useMemo(
    () => renderRunningMemoryBlock(sessionMemories, sessionKey),
    [sessionMemories, sessionKey],
  );

  // CP7.3 — long-running themes block. Same reactive pattern — themes is
  // a single object, so the prompt picks up a refresh next render.
  const themes = useStore(s => s.themes);
  const themesBlock = useMemo(() => renderThemesBlock(themes), [themes]);

  const systemPrompt = useMemo(
    () => getSystemPrompt(
      mode,
      contextBlock,
      profile.name,
      calendarContext,
      portraitToString(profile.portrait),
      continuityBlock,
      runningMemoryBlock,
      themesBlock,
    ),
    [mode, contextBlock, profile.name, calendarContext, profile.portrait, continuityBlock, runningMemoryBlock, themesBlock],
  );

  // Fetch today's calendar + reminders + skeleton blocks + the 7-day temporal
  // shape for the universal dump mode (the prompt decides internally whether
  // it's morning-planning vs. evening wind-down vs. a midday drop-in — it
  // needs the live device data regardless of phase so it can reference actual
  // events by name).
  //
  // CP11a.2 — also includes the week-ahead context with confidence tiers
  // (committed/habitual/claimed) so the model can hold *forward time*, not
  // just today. Lets the assistant say "next clean window for that is
  // Tuesday morning" instead of "I don't know your week".
  useEffect(() => {
    if (mode === 'dump') {
      const skeletonCtx = buildSkeletonContext(profile.weekTemplate ?? []);
      Promise.all([
        buildTodayCalendarContext().catch(() => ''),
        buildWeekAheadContext(profile.weekTemplate ?? [], tasks).catch(() => ''),
      ])
        .then(([todayCtx, weekAheadCtx]) => {
          const combined = [skeletonCtx, todayCtx, weekAheadCtx].filter(Boolean).join('\n\n');
          setCalendarContext(combined);
        })
        .catch(() => {
          // Fall back to skeleton only if everything fails
          if (skeletonCtx) setCalendarContext(skeletonCtx);
        });
    }
  }, [mode, profile.weekTemplate, tasks]);

  // Seed messages from the persisted session (if any). Empty → fresh session.
  const [messages,        setMessages]        = useState<ChatMessage[]>(() => getChatSession(sessionKey));
  const [input,           setInput]           = useState(initialMessage);
  const [loading,         setLoading]         = useState(false);
  const [actionTaken,     setActionTaken]     = useState(false);
  const [applyResult,     setApplyResult]     = useState<{
    tasks: number;
    projects: number;
    goals: number;
    scheduledSlots: number;
    /** CP5.1 — number of open tasks the model just auto-completed via "done the email"-style mentions. */
    completed?: number;
    calendarCreated?: number;
    calendarUpdated?: number;
    calendarFailed?: number;
    calendarPermissionDenied?: boolean;
    syncing?: boolean;
  } | null>(null);
  const [pendingActions,  setPendingActions]  = useState<any | null>(null);
  const [recording,       setRecording]       = useState<Audio.Recording | null>(null);
  const [isRecording,     setIsRecording]     = useState(false);
  const [transcribing,    setTranscribing]    = useState(false);
  // CP9.3 — Read-aloud TTS for assistant replies. Per-session mute toggle in
  // header (default: muted — speech is opt-in, ADHD users hate surprise audio).
  // We start muted and persist the choice for the lifetime of this screen
  // instance only; new chat sessions start muted again.
  const [isSpeechMuted, setIsSpeechMuted] = useState(true);
  // CP6.1 — file the user has attached but not yet sent. Sits in a chip
  // above the composer until they hit send (then it rides the next user
  // turn as a Claude `document` content block).
  const [pendingAttachment, setPendingAttachment] = useState<import('../store/useStore').ChatAttachment | null>(null);
  const [attaching,         setAttaching]         = useState(false);
  // CP6.2 — clipboard peek (silent — uses hasStringAsync so we don't
  // trigger the "X pasted from Y" iOS banner unprompted). The actual
  // contents only get pulled when the user taps the Paste pill.
  const [hasClipboardText,  setHasClipboardText]  = useState(false);
  const [clipboardDismissed, setClipboardDismissed] = useState(false);
  const [showCalendarExport, setShowCalendarExport] = useState(false);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const listRef      = useRef<FlatList>(null);
  const messagesRef  = useRef<ChatMessage[]>([]);  // always up-to-date for unmount closure

  // Keep messagesRef in sync so the unmount effect can read latest messages
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Background entity extraction + portrait refresh on unmount ───────────
  //
  // After any real conversation (2+ user turns, not off-record), fire two
  // silent Haiku passes:
  //   1. entityExtractor — spots net-new Areas/Projects/Tasks/Goals.
  //     Anything found is written with origin:'inferred' and stays
  //     local-only until the emergence moment (Phase 5) confirms it.
  //   2. portraitV2     — rewrites any portrait sections that actually
  //     moved this session. User-edited sections are preserved unless
  //     the AI has substantially new material.
  //
  // Both are fire-and-forget — never block navigation.
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      const userTurns = msgs.filter(m => m.role === 'user').length;
      if (userTurns < 2) return;

      const s = useStore.getState();

      // Respect "off record" — user explicitly paused background learning.
      const offUntil = s.profile.offRecordUntil
        ? new Date(s.profile.offRecordUntil).getTime()
        : 0;
      if (offUntil > Date.now()) return;

      // 1) Entity extraction
      import('../services/entityExtractor')
        .then(({ runBackgroundExtraction }) =>
          runBackgroundExtraction(
            msgs,
            {
              areas:    s.areas,
              projects: s.projects,
              tasks:    s.tasks,
              goals:    s.goals,
              addArea:    s.addArea,
              addProject: s.addProject,
              addTask:    s.addTask,
              addGoal:    s.addGoal,
            },
            userAnthropicKey,
          ),
        )
        .catch(() => { /* silent — background work */ });

      // 2) Portrait refresh
      import('../services/portraitV2')
        .then(({ refreshPortrait }) =>
          refreshPortrait(
            msgs,
            {
              portrait:              s.profile.portrait,
              updatePortraitSection: s.updatePortraitSection,
            },
            userAnthropicKey,
          ),
        )
        .catch(() => { /* silent — background work */ });

      // 3) Completion extraction — "what I did" log
      import('../services/completionExtractor')
        .then(({ runCompletionExtraction }) =>
          runCompletionExtraction(
            msgs,
            {
              completions:   s.completions,
              logCompletion: s.logCompletion,
            },
            userAnthropicKey,
          ),
        )
        .catch(() => { /* silent — background work */ });

      // 4) CP7.2 — refresh the running summary for THIS session.
      //    Cheap pass: only re-runs Haiku if the new turn count exceeds
      //    what the prior summary covered (so we don't burn tokens on no-op
      //    summaries when the user just opens and closes chat).
      const prior = s.sessionMemories[sessionKey];
      if (!prior || userTurns > prior.userTurns) {
        summariseSession(sessionKey, msgs, prior?.summary ?? null, userAnthropicKey)
          .then(updated => {
            if (updated) {
              useStore.getState().setSessionMemory(sessionKey, updated);
            }
          })
          .catch(() => { /* silent */ });
      }

      // 5) CP7.3 — refresh long-running themes if the throttle window has
      //    passed (24h) and the session was substantial (≥4 user turns
      //    means there's likely new signal worth re-extracting from). The
      //    pruner runs first so stale memories don't bias the extractor.
      if (userTurns >= 4) {
        useStore.getState().pruneSessionMemoriesAction();
        const fresh = useStore.getState();
        maybeRefreshThemes({
          completions:      fresh.completions,
          sessionMemories:  fresh.sessionMemories,
          prior:            fresh.themes,
          userAnthropicKey,
        })
          .then(themes => {
            if (themes) useStore.getState().setThemes(themes);
          })
          .catch(() => { /* silent */ });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Resume if there's already a conversation in this session window.
    // Start fresh only if it's empty (new day / first open / after clear).
    if (messages.length === 0) {
      startConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset done-state when the chat mode changes mid-session. Prevents the
  // previous session's summary card from leaking into a new conversation
  // (e.g. navigate from 'morning' → 'evening' without unmounting).
  useEffect(() => {
    setActionTaken(false);
    setApplyResult(null);
    setPendingActions(null);
  }, [mode]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // CP6.2 — silent clipboard peek. Only runs on dump mode (other modes
  // shouldn't be paste-targets — weekly reflection isn't where you dump
  // a paragraph from somewhere else).
  //
  // We use `hasStringAsync` not `getStringAsync` so iOS doesn't show the
  // pasteboard-access banner — that one only fires when content is
  // actually read. The body of the clipboard is only fetched when the
  // user taps the pill.
  useEffect(() => {
    if (mode !== 'dump') return;
    let cancelled = false;
    const peek = async () => {
      try {
        const Clipboard = await import('expo-clipboard');
        const has = await Clipboard.hasStringAsync();
        if (!cancelled) setHasClipboardText(has);
      } catch {
        if (!cancelled) setHasClipboardText(false);
      }
    };
    peek();
    // Re-peek when the app comes back to foreground (user copied
    // something else in another app and switched back).
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') peek();
    });
    return () => { cancelled = true; sub.remove(); };
  }, [mode]);

  // CP9.3 — Stop any in-flight TTS when leaving the chat screen so users
  // aren't followed by voice into the next screen.
  useEffect(() => {
    return () => { try { Speech.stop(); } catch {} };
  }, []);

  async function startConversation() {
    await sendToLLM([]);
  }

  function appendMessage(
    role: 'user' | 'assistant',
    content: string,
    attachment?: import('../store/useStore').ChatAttachment,
  ): ChatMessage {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date().toISOString(),
      ...(attachment ? { attachment } : {}),
    };
    setMessages(prev => [...prev, msg]);
    // Persist every turn so mid-conversation interruptions (phone call,
    // app backgrounded, crash) don't lose context.
    // (For CP6.1: store strips heavy `attachment.b64` before persistence.)
    appendChatSessionMessage(sessionKey, msg);
    // CP9.3 — Read aloud assistant replies if user has unmuted this session.
    // Stops any in-flight utterance so back-to-back replies don't pile up.
    if (role === 'assistant' && !isSpeechMuted && content.trim()) {
      try {
        Speech.stop();
        Speech.speak(content, { language: 'en', rate: 1.0, pitch: 1.0 });
      } catch { /* TTS is non-critical — never block chat on speech errors */ }
    }
    return msg;
  }

  async function sendToLLM(history: ChatMessage[]) {
    setLoading(true);
    try {
      // Cap context at the last CHAT_CONTEXT_CAP messages to prevent token
      // bloat when a user returns to a long-running session (e.g. a weekly
      // conversation accumulated over a week).
      const capped = history.length > CHAT_CONTEXT_CAP
        ? history.slice(-CHAT_CONTEXT_CAP)
        : history;

      // Anthropic requires: (a) non-empty array, (b) first message must be
      // user role. We prepend a silent kickoff so the AI opens the
      // conversation as the system prompt instructs. CP6.1 — turns with
      // attachments expand into content-block arrays via buildAnthropicContent.
      const baseMessages: Array<{ role: string; content: any }> = [
        { role: 'user', content: 'Hello' },
        ...capped.map(m => ({
          role: m.role,
          content: buildAnthropicContent(m),
        })),
      ];

      // ── CP7.1 — Agentic tool-use loop ─────────────────────────────────
      // Up to MAX_ROUNDS round-trips. The model emits `tool_use` blocks →
      // we run them locally → we send `tool_result` blocks back as a new
      // user turn → the model either calls more tools or replies in text.
      // A plain-text reply (stop_reason !== 'tool_use') breaks the loop
      // and falls into the legacy [SYNAPSE_ACTIONS] parser path so existing
      // bulk-propose UX keeps working.
      const MAX_ROUNDS = 5;
      let convo: Array<{ role: string; content: any }> = baseMessages;
      let reply: string = "Something went wrong. Try again?";
      let toolUseRounds = 0;

      // CP7.4 — daily token-cap guardrail. Once today's combined tokens
      // (input + output) exceed the cap, fall back to Haiku for the rest of
      // the day. Personal-key users never hit this — they're paying their
      // own bill, so we let them spend it. Pulled fresh each round so a
      // long agentic session can degrade mid-flight if the cap is crossed.
      const pickModel = (): string => {
        if (userAnthropicKey) return 'claude-sonnet-4-5-20250929';
        return useStore.getState().isOverDailyCap()
          ? 'claude-haiku-4-5-20251001'
          : 'claude-sonnet-4-5-20250929';
      };

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetchAnthropic({
          model: pickModel(),
          max_tokens: 1800,
          system: systemPrompt,
          messages: convo,
          tools: TOOL_DEFINITIONS,
          temperature: 0.7,
        }, userAnthropicKey);
        const data = await res.json();
        // Record usage for today's running counter (proxy users only — when
        // the user supplies their own key the bill is theirs and we don't
        // need to police it).
        if (!userAnthropicKey && data?.usage) {
          useStore.getState().recordTokenUsage(
            Number(data.usage.input_tokens),
            Number(data.usage.output_tokens),
          );
        }
        if (!res.ok) {
          if (res.status === 401) {
            appendMessage('assistant', userAnthropicKey
              ? "Your API key was rejected. Double-check it in Settings → API Key."
              : "Session expired. Go to Settings and sign in again.");
          } else if (res.status === 429) {
            appendMessage('assistant', "Rate limit reached — wait a moment and try again.");
          } else if (res.status >= 500) {
            appendMessage('assistant', "The AI service is having issues right now. Try again in a minute.");
          } else {
            const errMsg = data?.error?.message ?? `Error ${res.status}`;
            appendMessage('assistant', `Something went wrong: ${errMsg}`);
          }
          return;
        }

        const assistantBlocks: any[] = Array.isArray(data?.content) ? data.content : [];
        const stopReason: string = data?.stop_reason ?? 'end_turn';
        const toolUses: ToolUseBlock[] = assistantBlocks.filter(
          (b: any) => b?.type === 'tool_use'
        ) as ToolUseBlock[];

        if (stopReason === 'tool_use' && toolUses.length > 0) {
          // Execute every tool_use block locally and assemble the
          // matching tool_result blocks for the next user turn.
          toolUseRounds++;
          const toolResultBlocks: any[] = [];
          for (const tu of toolUses) {
            const result = await executeTool(tu.name, tu.input ?? {}, history);
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: result.content,
              ...(result.is_error ? { is_error: true } : {}),
            });
          }
          // Append the assistant's full content array verbatim — Anthropic
          // requires the tool_use blocks to round-trip exactly so the
          // tool_use_id linkage stays valid.
          convo = [
            ...convo,
            { role: 'assistant', content: assistantBlocks },
            { role: 'user',      content: toolResultBlocks },
          ];
          continue; // next round
        }

        // Plain-text reply — stitch any text blocks together (usually one)
        // and break out of the loop.
        reply = assistantBlocks
          .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
          .join('')
          .trim() || "Something went wrong. Try again?";
        break;
      }

      if (toolUseRounds >= MAX_ROUNDS) {
        // Defensive — if we somehow hit the cap without a final text reply,
        // surface a graceful note rather than a stale fallback.
        appendMessage(
          'assistant',
          "I went round in circles trying to handle that — let's try again with a fresh ask.",
        );
        return;
      }

      if (reply.includes('[SYNAPSE_ACTIONS]')) {
        const parsed = parseActions(reply);
        // Strip any leading code-fence markers Claude sometimes emits ("```json" / "```")
        // — without this they render as a stray message bubble before the review sheet.
        const rawDisplay = reply.split('[SYNAPSE_ACTIONS]')[0]
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim();
        const displayText = rawDisplay || "Here's what I've put together — review and tweak before it's applied.";
        appendMessage('assistant', displayText);
        if (parsed?.actions?.length > 0) {
          // CP5.1 — if the model's actions are PURELY passes ('complete' or
          // 'focus'), don't open the review sheet. The whole point of
          // completion-without-ticking is that the user said "ok done the
          // email" in passing — bouncing them to a confirm sheet for an
          // already-done task would defeat the purpose. Apply silently and
          // let the conversational reply do the acknowledgement.
          const editableTypes = new Set(['task', 'project', 'goal', 'schedule']);
          const hasEditable   = parsed.actions.some((a: any) => editableTypes.has(a?.type));
          if (!hasEditable) {
            handleReviewApply(parsed);
          } else {
            // Show review sheet instead of immediately applying
            setPendingActions(parsed);
          }
        } else {
          // No editable actions (e.g. just a session note) — apply immediately.
          // Mode is collapsed to `dump`, so we branch on the clock instead:
          // evening sessionNote → wind-down log, morning sessionNote → plan log.
          if (parsed?.sessionNote && mode === 'dump') {
            const p = dayPhaseNow();
            if (p === 'evening') {
              updateTodayLog({ eveningCompleted: true, eveningNote: parsed.sessionNote });
            } else if (p === 'morning') {
              updateTodayLog({ morningCompleted: true });
            }
          }
          setActionTaken(true);
          // Seed a minimal applyResult so the summary card still renders — otherwise
          // the done state is invisible for sessionNote-only paths (evening reflection, etc).
          setApplyResult({
            tasks: 0, projects: 0, goals: 0, scheduledSlots: 0, syncing: false,
          });
        }
      } else {
        appendMessage('assistant', reply);
      }
    } catch (err: any) {
      if (err?.message?.includes('[anthropic] No valid session token')) {
        appendMessage('assistant', "Session expired — go to Settings and sign in again.");
      } else if (err?.message?.toLowerCase().includes('network') || err instanceof TypeError) {
        appendMessage('assistant', "No internet connection. Check your connection and try again.");
      } else {
        appendMessage('assistant', "Something went wrong. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function applyActions(parsed: { actions: any[]; summary?: string; sessionNote?: string }) {
    const today    = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');

    // First pass: create any new projects so we can link tasks to them
    const newProjectMap: Record<string, string> = {};

    parsed.actions.forEach((action: any) => {
      if (action.type === 'project') {
        const projectId = addProjectWithTasks(action);
        if (projectId) newProjectMap[action.title] = projectId;
      }
    });

    // Second pass: tasks and goals — track text→id for schedule mapping
    const textToTaskId: Record<string, string> = {};

    parsed.actions.forEach((action: any) => {
      if (action.type === 'task') {
        const dueDate = action.dueDate === 'today'
          ? today
          : action.dueDate === 'tomorrow'
          ? tomorrow
          : (action.dueDate && action.dueDate !== '')
          ? action.dueDate
          : today;

        // CP1.8: accept `isTheOne` from the model. We don't set it on
        // the addTask call — the store's `setTheOne` enforces the
        // singleton invariant (at most one task carries the flag). We
        // apply it below once the new task has an id.
        addTask({
          text:              action.text,
          domain:            (action.domain ?? 'work') as DomainKey,
          projectId:         action.projectId ?? undefined,
          isMIT:             action.isMIT ?? false,
          isToday:           dueDate === today,
          date:              dueDate,
          completed:         false,
          // The-one tasks are inherently high priority; otherwise fall
          // back to the legacy MIT mapping.
          priority:          (action.isTheOne || action.isMIT) ? 'high' : 'medium',
          estimatedMinutes:  action.estimatedMinutes ?? 60,
          reason:            action.reason ?? undefined,
        });

        // Capture the new task's ID so we can reference it in the schedule.
        // Use normalised (trim + lowercase) text match so we still find the task
        // when the store dedup'd an existing duplicate with minor whitespace/
        // case differences — otherwise we'd generate a phantom plan-* id below.
        const allTasks  = useStore.getState().tasks;
        const actionKey = String(action.text ?? '').trim().toLowerCase();
        const newTask   = allTasks.find(
          t => !t.completed && t.text.trim().toLowerCase() === actionKey,
        );
        if (newTask) textToTaskId[action.text] = newTask.id;

        // CP1.8: if the model marked this task as the-one, set it via
        // the store action so any previously-flagged task gets demoted.
        if (newTask && action.isTheOne === true) {
          useStore.getState().setTheOne(newTask.id);
        }

        // Focus mode — if the AI (typically from fatigue mode) flagged this task
        // as the one thing to focus on, lock the dashboard to it.
        if (newTask && action.focus === true) {
          setFocusTask(newTask.id);
        }

        // Ad-hoc scheduling: if the task has a `time` and is dated today, merge
        // it into today's day plan so it renders on the timeline (and via Option
        // C, will sync to the calendar). Works in any mode — not just morning.
        if (newTask && action.time && dueDate === today) {
          const time = normalizeTime(action.time);
          if (time) {
            const current = useStore.getState().dayPlan;
            const plan: import('../store/useStore').DayPlan =
              current?.date === today
                ? { ...current, slots: current.slots.map(s => ({ ...s, tasks: [...s.tasks] })) }
                : { date: today, slots: [], summary: '' };

            const slotTask = { id: newTask.id, text: action.text, done: false };
            const existingIdx = plan.slots.findIndex(s => s.time === time);

            if (existingIdx >= 0) {
              const existing = plan.slots[existingIdx];
              if (!existing.tasks.some(t => t.id === newTask.id)) {
                plan.slots[existingIdx] = {
                  ...existing,
                  tasks: [...existing.tasks, slotTask],
                };
              }
            } else {
              plan.slots.push({
                time,
                eventLabel: action.eventLabel ?? action.text,
                tasks: [slotTask],
                durationMinutes: action.estimatedMinutes ?? 30,
              });
              plan.slots.sort((a, b) => a.time.localeCompare(b.time));
            }

            saveDayPlan(plan);
          }
        }
      }

      // CP5.1 — completion-without-ticking. Model emits this when the user
      // mentions in passing that they've already done something matching an
      // open task ("done the email"). We fuzzy-match against today's open
      // tasks (then any open task as a fallback) and call toggleTask, which
      // already handles syncing, recurrence, completion log, paired iOS
      // Reminders, and haptics — so this is a one-line dispatch.
      if (action.type === 'complete') {
        const allTasks = useStore.getState().tasks;
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const rawText  = String(action.taskText ?? action.text ?? '').trim();
        const key      = rawText.toLowerCase();
        if (key.length >= 2) {
          // Prefer an exact-text match on today's open tasks. Then a loose
          // includes() match in either direction (so "email" hits "send the
          // Cohen email"). Then any open task (some users dump completions
          // for tasks not pinned to today). Skip already-completed.
          let target =
            allTasks.find(
              t => !t.completed && t.date === todayStr &&
                   t.text.trim().toLowerCase() === key,
            )
            ?? (key.length >= 3
              ? allTasks.find(t => {
                  if (t.completed || t.date !== todayStr) return false;
                  const tt = t.text.trim().toLowerCase();
                  return tt.includes(key) || key.includes(tt);
                })
              : undefined)
            ?? allTasks.find(
              t => !t.completed &&
                   t.text.trim().toLowerCase() === key,
            );
          if (target) {
            // toggleTask handles the incomplete → complete transition: store
            // mutation, completion log entry, recurrence clone, paired Reminder,
            // and Supabase sync. Re-firing on an already-completed task would
            // un-complete it — guard above already filtered.
            useStore.getState().toggleTask(target.id);
          } else {
            console.warn('[chat] complete action: no open task matched', rawText);
          }
        }
      }

      // Standalone focus action — picks an existing task by id or text.
      // Normalise with trim + lowercase to match store dedup semantics; fall
      // back to a loose "includes" match (either direction) so fatigue-mode
      // nicknames like "the doc" still lock onto "Write the doc draft".
      if (action.type === 'focus') {
        const allTasks = useStore.getState().tasks;
        let target: typeof allTasks[number] | undefined;
        if (action.taskId) target = allTasks.find(t => t.id === action.taskId);
        if (!target && action.taskText) {
          const key = String(action.taskText).trim().toLowerCase();
          target = allTasks.find(
            t => !t.completed && t.text.trim().toLowerCase() === key,
          );
          if (!target && key.length >= 3) {
            target = allTasks.find(t => {
              if (t.completed) return false;
              const tt = t.text.trim().toLowerCase();
              return tt.includes(key) || key.includes(tt);
            });
          }
        }
        if (target) {
          setFocusTask(target.id);
        } else if (action.taskText) {
          console.warn('[chat] focus action: no task matched', action.taskText);
        }
      }

      if (action.type === 'goal') {
        addGoal({
          domain:     (action.domain ?? 'personal') as DomainKey,
          horizon:    action.horizon ?? '1year',
          text:       action.text,
          milestones: [],
        });
      }
    });

    // Third pass: build and save the day plan from schedule action.
    // The universal dump prompt emits schedule actions only during
    // morning-planning flow, so we accept them whenever mode is dump
    // and let the prompt gate it.
    const scheduleAction = parsed.actions.find((a: any) => a.type === 'schedule');
    if (scheduleAction?.slots && mode === 'dump') {
      // Build a case/whitespace-insensitive lookup so "Write report" in a slot
      // resolves to the real task id even if the task text was stored as
      // "write report" after normalisation.
      const normMap: Record<string, string> = {};
      for (const [txt, id] of Object.entries(textToTaskId)) {
        normMap[txt.trim().toLowerCase()] = id;
      }
      // Also fold in the full task store so references to pre-existing tasks
      // (not created this turn) still find the right id.
      for (const t of useStore.getState().tasks) {
        if (!t.completed) normMap[t.text.trim().toLowerCase()] = normMap[t.text.trim().toLowerCase()] ?? t.id;
      }

      const slots: PlannedSlot[] = (scheduleAction.slots as any[]).map((slot: any) => ({
        time:       slot.time ?? '08:00',
        eventLabel: slot.eventLabel ?? 'Work block',
        tasks:      (slot.tasks as string[]).map((text: string) => ({
          id:   textToTaskId[text]
                  ?? normMap[text.trim().toLowerCase()]
                  ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text,
          done: false,
        })),
      })).filter((s: PlannedSlot) => s.tasks.length > 0);

      if (slots.length > 0) {
        saveDayPlan({ date: today, slots, summary: parsed.summary ?? '' });
      }
    }

    // Session log updates — branch by clock phase now that mode is unified.
    if (parsed.sessionNote && mode === 'dump') {
      const p = dayPhaseNow();
      if (p === 'evening') {
        updateTodayLog({ eveningCompleted: true, eveningNote: parsed.sessionNote });
      } else if (p === 'morning') {
        updateTodayLog({ morningCompleted: true });
      }
    }
  }

  function handleReviewApply(edited: { actions: any[]; summary?: string; sessionNote?: string }) {
    applyActions(edited);
    setPendingActions(null);
    setActionTaken(true);

    // Count what was applied for the summary card.
    // Projects can carry nested subtasks via `addProjectWithTasks` — they don't
    // land in the global tasks store, so fold them into the task count so the
    // user's summary reflects the true "things added to my life" number.
    const projectActions = (edited.actions ?? []).filter(a => a.type === 'project');
    const projectSubtaskCount = projectActions.reduce(
      (n, a: any) => n + (Array.isArray(a.tasks) ? a.tasks.length : 0),
      0,
    );
    const taskCount    = (edited.actions ?? []).filter(a => a.type === 'task').length + projectSubtaskCount;
    const projectCount = projectActions.length;
    const goalCount    = (edited.actions ?? []).filter(a => a.type === 'goal').length;
    // CP5.1 — count completion actions for the summary card. Note this is
    // an emit-count, not a match-count: applyActions skips ones that didn't
    // match an open task. Slight overcount in the rare unmatched case is
    // preferable to the engineering of a return-channel just for this read-out.
    const completedCount = (edited.actions ?? []).filter(a => a.type === 'complete').length;
    const scheduleAct  = (edited.actions ?? []).find(a => a.type === 'schedule');
    const slotCount    =
      (scheduleAct?.slots?.length ?? 0) +
      (edited.actions ?? []).filter(a => a.type === 'task' && a.time).length;

    setApplyResult({
      tasks: taskCount,
      projects: projectCount,
      goals: goalCount,
      scheduledSlots: slotCount,
      completed: completedCount,
      syncing: false,
    });

    const today = format(new Date(), 'yyyy-MM-dd');
    const dayPlan = useStore.getState().dayPlan;

    // Auto-sync day plan to calendar — with user feedback.
    // Fires whenever today's plan has at least one slot that hasn't been written
    // to calendar yet (new morning plan OR ad-hoc task scheduled via chat).
    const needsSync = (() => {
      const p = useStore.getState().dayPlan;
      if (!p || p.date !== today || !p.slots?.length) return false;
      return p.slots.some(s => !s.calendarEventId);
    })();

    if (needsSync) {
      setApplyResult(r => r ? { ...r, syncing: true } : r);
      setTimeout(async () => {
        const freshDayPlan = useStore.getState().dayPlan;
        if (!freshDayPlan || freshDayPlan.date !== today || !freshDayPlan.slots?.length) {
          setApplyResult(r => r ? { ...r, syncing: false } : r);
          return;
        }
        try {
          const hasPermission = await requestCalendarPermissions();
          if (!hasPermission) {
            setApplyResult(r => r ? { ...r, syncing: false, calendarPermissionDenied: true } : r);
            return;
          }
          const calendarId = await findOrCreateSolasCalendar();
          const result = await writeDayPlanToCalendar(freshDayPlan.slots, freshDayPlan.date, calendarId);
          // Persist event IDs onto each slot so reconcileCalendarToDayPlan can
          // round-trip user edits back into the plan later.
          const withIds = {
            ...freshDayPlan,
            slots: freshDayPlan.slots.map(s => ({
              ...s,
              calendarEventId: result.eventIdByTime[s.time] ?? s.calendarEventId,
            })),
          };
          saveDayPlan(withIds);
          if (!result.permissionDenied && ((result.createdCount ?? 0) + (result.updatedCount ?? 0)) > 0) {
            markCalendarSynced();
          }
          setApplyResult(r => r ? {
            ...r,
            syncing: false,
            calendarCreated: result.createdCount,
            calendarUpdated: result.updatedCount,
            calendarFailed: result.failedCount,
            calendarPermissionDenied: result.permissionDenied,
          } : r);
        } catch (e) {
          setApplyResult(r => r ? { ...r, syncing: false, calendarFailed: (r.calendarFailed ?? 0) + 1 } : r);
        }
      }, 400);
    }

    // Post-plan setup: ask for notification permissions + schedule reminders
    // whenever the dump chat committed a plan. Drift nudge + morning brief
    // only make sense when the plan was built during the morning phase of
    // the day — gate those by clock instead of the old `mode === 'morning'`.
    if (mode === 'dump') {
      const phaseAtApply = dayPhaseNow();
      import('../services/notifications').then(async (n) => {
        const granted = await n.requestPermissions();
        if (granted) {
          const morningTime = profile.morningTime || '08:00';
          const eveningTime = profile.eveningTime || '20:00';
          await n.scheduleDailyNotifications(morningTime, eveningTime);
          await n.cancelLapseNotification();

          // Feature 3: Schedule drift nudge for newly created MITs (morning only)
          if (phaseAtApply === 'morning') {
            const allTasks = useStore.getState().tasks;
            const todayMITs = allTasks.filter(t => t.date === today && t.isMIT && !t.completed);

            if (todayMITs.length > 0 && dayPlan?.slots && dayPlan.slots.length > 0) {
              const firstMIT = todayMITs[0];
              // Find the scheduled time from the day plan
              let scheduledTime: string | undefined;
              for (const slot of dayPlan.slots) {
                const mitInSlot = slot.tasks.find((t: any) => t.id === firstMIT.id);
                if (mitInSlot) {
                  scheduledTime = slot.time;
                  break;
                }
              }

              if (firstMIT.text) {
                await n.scheduleDriftNudge(firstMIT.text, scheduledTime, firstMIT.id);
              }
            }
          }

          // Feature 4: Schedule morning brief for tomorrow (morning plans only)
          if (phaseAtApply === 'morning') {
            const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
            const tomorrowTasks = useStore.getState().tasks.filter(t => t.date === tomorrow);
            const tomorrowMITs = tomorrowTasks.filter(t => t.isMIT && !t.completed);

            if (tomorrowMITs.length > 0 || tomorrowTasks.length > 0) {
              const morningBriefTime = profile.morningTime || '08:00';
              const firstMITText = tomorrowMITs.length > 0 ? tomorrowMITs[0].text : undefined;
              await n.scheduleMorningBrief(morningBriefTime, firstMITText, tomorrowTasks.length);
            }
          }
        }
      }).catch(() => {});
    }
  }

  function handleReviewDiscard() {
    setPendingActions(null);
    // Keep conversation going — user can revise and AI can re-output
  }

  async function writePlanToCalendar() {
    try {
      const dayPlan = useStore.getState().dayPlan;
      if (!dayPlan?.slots || dayPlan.slots.length === 0) {
        setShowCalendarExport(false);
        return;
      }

      // Request permissions and write plan to calendar
      const hasPermission = await requestCalendarPermissions();
      if (!hasPermission) {
        appendMessage('assistant', 'Calendar permission denied. Please enable it in iPhone Settings.');
        setShowCalendarExport(false);
        return;
      }

      const calendarId = await findOrCreateSolasCalendar();
      const { createdCount, eventIdByTime } = await writeDayPlanToCalendar(dayPlan.slots, dayPlan.date, calendarId);
      // Persist event IDs onto each slot so edits made externally (Mac Calendar,
      // etc.) can be pulled back in via reconcileCalendarToDayPlan.
      const withIds = {
        ...dayPlan,
        slots: dayPlan.slots.map(s => ({
          ...s,
          calendarEventId: eventIdByTime[s.time] ?? s.calendarEventId,
        })),
      };
      saveDayPlan(withIds);
      markCalendarSynced();

      setShowCalendarExport(false);

      if (createdCount > 0) {
        appendMessage('assistant', `✓ ${createdCount} time block${createdCount !== 1 ? 's' : ''} added to your calendar.`);
      } else {
        appendMessage('assistant', 'Calendar blocks already added — no duplicates created.');
      }
    } catch (e) {
      console.error('[ChatScreen] writePlanToCalendar failed:', e);
      appendMessage('assistant', 'Something went wrong. Try again later.');
      setShowCalendarExport(false);
    }
  }

  function addProjectWithTasks(data: any): string | null {
    try {
      addProject({
        domain:      (data.domain ?? 'work') as DomainKey,
        title:       data.title,
        description: data.description ?? '',
        deadline:    data.deadline ?? undefined,
        status:      'active',
      });
      // addProject appends synchronously — grab the last project's ID
      const newId = useStore.getState().projects.slice(-1)[0]?.id ?? null;

      // If the AI gave us subtasks, set them on the new project
      if (newId && Array.isArray(data.tasks) && data.tasks.length > 0) {
        setProjectTasks(newId, data.tasks.map((t: any, i: number) => ({
          id:               uid(),
          text:             t.text ?? t,
          completed:        false,
          estimatedMinutes: t.estimatedMinutes ?? undefined,
        })));
      }

      return newId;
    } catch { return null; }
  }

  async function handleSend(opts?: { overrideText?: string }) {
    // CP6.1 — when an attachment is pending, allow send even if the
    // text is empty (the file itself is the user's contribution).
    if (loading) return;
    const text = (opts?.overrideText ?? input).trim();
    if (!text && !pendingAttachment) return;

    const att = pendingAttachment ?? undefined;
    // Composer reads "fluxx-deck.pdf" if no text was typed — keeps the
    // user-side bubble informative.
    const bubbleText = text || (att ? `attached: ${att.name}` : '');
    const userMsg = appendMessage('user', bubbleText, att);
    setInput('');
    setPendingAttachment(null);
    await sendToLLM([...messages, userMsg]);
  }

  // CP6.1 / 6.3 — common attachment runner. Each picker returns the same
  // result shape, so we share error mapping and the pending-attachment
  // hand-off between PDF and image flows.
  async function runPicker(picker: () => ReturnType<typeof pickPdfAttachment>) {
    if (attaching || loading) return;
    setAttaching(true);
    try {
      const res = await picker();
      if (res.kind === 'ok') {
        setPendingAttachment(res.attachment);
      } else if (res.kind === 'too_large') {
        appendMessage(
          'assistant',
          `That file is ${(res.sizeKB / 1024).toFixed(1)} MB — a bit much for one go. Try a smaller one.`,
        );
      } else if (res.kind === 'error') {
        const m = (res as { message: string }).message ?? '';
        if (/permission/i.test(m)) {
          appendMessage('assistant', "I need photo access for that. Enable it in iPhone Settings → Aiteall.");
        } else {
          appendMessage('assistant', "Couldn't open that file. Try again?");
        }
      }
      // 'cancelled' → silent, user changed their mind
    } finally {
      setAttaching(false);
    }
  }

  // CP6.3 — present an action sheet so the user picks between PDF and
  // photo. Single attach button keeps the composer slim; the sheet adds
  // future expansion room (camera, voice memo file, etc.) without
  // re-laying out the input bar.
  function handleAttachPress() {
    if (attaching || loading) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'PDF document', 'Photo from library'],
          cancelButtonIndex: 0,
          title: 'Attach to this chat',
        },
        (idx) => {
          if (idx === 1) runPicker(pickPdfAttachment);
          else if (idx === 2) runPicker(pickImageAttachment);
        },
      );
    } else {
      // Android / dev fallback — Alert with two buttons
      Alert.alert('Attach', 'What kind of file?', [
        { text: 'PDF',    onPress: () => runPicker(pickPdfAttachment) },
        { text: 'Photo',  onPress: () => runPicker(pickImageAttachment) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function clearPendingAttachment() {
    setPendingAttachment(null);
  }

  // CP6.2 — pull the clipboard contents and drop them into the composer.
  // This is the one place we call `getStringAsync`, which IS what triggers
  // the iOS pasteboard banner — that's intentional here, the user just
  // tapped "Paste".
  async function handlePasteFromClipboard() {
    try {
      const Clipboard = await import('expo-clipboard');
      const text = await Clipboard.getStringAsync();
      if (text && text.trim()) {
        setInput(prev => (prev ? `${prev}\n\n${text}` : text));
      }
    } catch {
      // Best-effort — silent fail is fine, the user can still type.
    } finally {
      // Hide the pill regardless of whether we found text — pressing it
      // counts as "I've handled the clipboard offer."
      setHasClipboardText(false);
      setClipboardDismissed(true);
    }
  }

  // ── Voice ──────────────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        appendMessage('assistant', "Microphone permission needed. Enable it in iPhone Settings.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
    } catch { appendMessage('assistant', "Couldn't start recording. Try again."); }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) { setTranscribing(false); return; }
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');

      let res: Response;
      if (userOpenAiKey) {
        // User's own OpenAI key — call Whisper directly
        res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userOpenAiKey}` },
          body: formData,
        });
      } else {
        // No personal key — use the secure server proxy
        let { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          session = refreshed.session;
        }
        const proxyUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/openai-proxy`;
        res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: formData,
        });
      }
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message ?? `Transcription error ${res.status}`;
        appendMessage('assistant', `Voice error: ${errMsg}`);
        return;
      }
      const transcript: string = data.text ?? '';
      if (transcript.trim()) {
        setInput(transcript.trim());
      } else {
        appendMessage('assistant', "Couldn't make that out. Try again?");
      }
    } catch { appendMessage('assistant', "Transcription failed. Check your connection."); }
    finally { setTranscribing(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>✦</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {/* CP6.1 — inline attachment indicator (user bubbles only). Persists
              across cold-start since we keep the metadata even after stripping b64. */}
          {isUser && item.attachment && (
            <View style={styles.bubbleAttachment}>
              <Ionicons
                name={item.attachment.kind === 'pdf' ? 'document-text-outline' : 'image-outline'}
                size={14}
                color={C.textInverse}
              />
              <Text style={styles.bubbleAttachmentName} numberOfLines={1}>
                {item.attachment.name}
              </Text>
            </View>
          )}
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }, [styles, C]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" />

      {/* Top-edge safe area + scrollable content */}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{meta.title}</Text>
            <Text style={styles.headerSub}>{meta.subtitle}</Text>
          </View>
          <View style={styles.headerRightGroup}>
            {/* CP9.3 — Read-aloud toggle. Default muted; tapping unmutes for
                the rest of this session. Tapping again mutes + cancels any
                in-flight utterance. */}
            <TouchableOpacity
              style={styles.speakerBtn}
              onPress={() => {
                setIsSpeechMuted(prev => {
                  const next = !prev;
                  if (next) { try { Speech.stop(); } catch {} }
                  return next;
                });
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={isSpeechMuted ? 'Read replies aloud' : 'Mute read-aloud'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isSpeechMuted ? 'volume-mute-outline' : 'volume-high-outline'}
                size={20}
                color={isSpeechMuted ? C.textTertiary : C.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.offRecordBtn}
              onPress={() => {
                if (isOffRecord) {
                  // Turn it back on — "come back on record".
                  Alert.alert(
                    'Back on record?',
                    "I'll start learning from this session again. That means updating your Portrait, spotting projects, and logging what you did.",
                    [
                      { text: 'Keep off', style: 'cancel' },
                      {
                        text: 'Back on record',
                        onPress: () => setOffRecord(0),
                      },
                    ],
                  );
                } else {
                  Alert.alert(
                    'Go off record?',
                    "For 3 hours I won't update your Portrait, spot new projects, or log what you said. The words stay here, on your phone.",
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Go off record',
                        onPress: () => setOffRecord(180),
                      },
                    ],
                  );
                }
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isOffRecord ? (
                <View style={styles.offRecordChip}>
                  <Ionicons name="eye-off-outline" size={14} color={C.textSecondary} />
                  <Text style={styles.offRecordChipText}>off record</Text>
                </View>
              ) : (
                <Ionicons name="eye-outline" size={20} color={C.textTertiary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        />

        {(loading || transcribing) && (
          <View style={styles.typingRow}>
            <View style={styles.avatar}><Text style={styles.avatarInitial}>✦</Text></View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={C.primary} />
              {transcribing && <Text style={styles.transcribingText}>Listening…</Text>}
            </View>
          </View>
        )}

        {actionTaken && applyResult && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
              <Text style={styles.summaryTitle}>✓ Plan applied</Text>
              {applyResult.syncing && (
                <View style={styles.summarySyncingRow}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.summarySyncingText}>Syncing to calendar…</Text>
                </View>
              )}
            </View>

            <View style={styles.summaryRows}>
              {applyResult.tasks > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>✎</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.tasks} task{applyResult.tasks !== 1 ? 's' : ''} added
                  </Text>
                </View>
              )}
              {/* CP5.1 — surface completion-without-ticking results so the user
                  knows the chat just marked things done. Banned-word discipline:
                  "marked done" is plain, not performative. */}
              {(applyResult.completed ?? 0) > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>✓</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.completed} marked done
                  </Text>
                </View>
              )}
              {applyResult.projects > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>◩</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.projects} project{applyResult.projects !== 1 ? 's' : ''} added
                  </Text>
                </View>
              )}
              {applyResult.goals > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>◆</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.goals} goal{applyResult.goals !== 1 ? 's' : ''} added
                  </Text>
                </View>
              )}
              {applyResult.scheduledSlots > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>◷</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.scheduledSlots} time block{applyResult.scheduledSlots !== 1 ? 's' : ''} scheduled
                  </Text>
                </View>
              )}

              {/* Calendar sync outcome — only shown once sync has resolved */}
              {!applyResult.syncing && applyResult.calendarPermissionDenied && (
                <View style={[styles.summaryRow, styles.summaryWarnRow]}>
                  <Text style={styles.summaryRowIcon}>⚠︎</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryRowText}>Calendar access needed</Text>
                    <Text style={styles.summarySubtleText}>
                      Enable in Settings → Privacy → Calendars to sync blocks.
                    </Text>
                  </View>
                </View>
              )}
              {!applyResult.syncing && !applyResult.calendarPermissionDenied &&
                (applyResult.calendarCreated ?? 0) + (applyResult.calendarUpdated ?? 0) > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowIcon}>◉</Text>
                  <Text style={styles.summaryRowText}>
                    {(applyResult.calendarCreated ?? 0) > 0 &&
                      `${applyResult.calendarCreated} created in calendar`}
                    {(applyResult.calendarCreated ?? 0) > 0 && (applyResult.calendarUpdated ?? 0) > 0 && ' · '}
                    {(applyResult.calendarUpdated ?? 0) > 0 &&
                      `${applyResult.calendarUpdated} updated`}
                  </Text>
                </View>
              )}
              {!applyResult.syncing && (applyResult.calendarFailed ?? 0) > 0 && (
                <View style={[styles.summaryRow, styles.summaryWarnRow]}>
                  <Text style={styles.summaryRowIcon}>⚠︎</Text>
                  <Text style={styles.summaryRowText}>
                    {applyResult.calendarFailed} calendar write{(applyResult.calendarFailed ?? 0) !== 1 ? 's' : ''} failed
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.summaryCta}
              onPress={() => navigation.goBack()}
              activeOpacity={0.82}
            >
              <Text style={styles.summaryCtaText}>Back to dashboard →</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Plan review sheet — shown before actions commit */}
      {pendingActions && (
        <PlanReviewSheet
          parsed={pendingActions}
          onApply={handleReviewApply}
          onDiscard={handleReviewDiscard}
        />
      )}

      {/* Calendar export offer — shown after morning plan approval */}
      {showCalendarExport && (
        <CalendarExportModal
          dayPlan={useStore.getState().dayPlan}
          onConfirm={writePlanToCalendar}
          onDismiss={() => setShowCalendarExport(false)}
        />
      )}

      {/* Input bar — plain View + dynamic insets so KAV lifts it cleanly */}
      <View style={[styles.inputSafe, { paddingBottom: insets.bottom }]}>
        {/* CP6.2 — paste-from-clipboard pill. Only shows on dump mode when
            (a) clipboard reports text via the silent `hasStringAsync` peek,
            (b) the composer is empty, (c) the user hasn't already dismissed
            this pill in this session, and (d) there's no attachment in
            flight. Tap actually reads the pasteboard and fills the composer. */}
        {mode === 'dump'
          && hasClipboardText
          && !clipboardDismissed
          && !input.trim()
          && !pendingAttachment && (
          <View style={styles.pasteRow}>
            <TouchableOpacity
              style={styles.pastePill}
              onPress={handlePasteFromClipboard}
              activeOpacity={0.85}
              accessibilityLabel="Paste from clipboard"
            >
              <Ionicons name="clipboard-outline" size={14} color={C.textSecondary} />
              <Text style={styles.pastePillText}>Paste</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setHasClipboardText(false); setClipboardDismissed(true); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Dismiss paste suggestion"
            >
              <Ionicons name="close" size={14} color={C.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* CP6.1 — pending-attachment chip. Sits above the composer so the
            user can review the file (and remove it) before sending. */}
        {pendingAttachment && (
          <View style={styles.attachChipRow}>
            <View style={styles.attachChip}>
              <Ionicons name="document-attach-outline" size={16} color={C.textSecondary} />
              <Text style={styles.attachChipName} numberOfLines={1} ellipsizeMode="middle">
                {pendingAttachment.name}
              </Text>
              <Text style={styles.attachChipMeta}>
                {pendingAttachment.sizeKB > 1024
                  ? `${(pendingAttachment.sizeKB / 1024).toFixed(1)} MB`
                  : `${pendingAttachment.sizeKB} KB`}
              </Text>
              <TouchableOpacity
                onPress={clearPendingAttachment}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Remove attachment"
              >
                <Ionicons name="close" size={16} color={C.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.inputRow}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.micBtn, isRecording && styles.micBtnActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.8}
            >
              <Text style={styles.micLabel}>{isRecording ? '■' : 'mic'}</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* CP6.1 / 6.3 — paperclip → action sheet (PDF or photo) */}
          <TouchableOpacity
            style={[styles.attachBtn, (attaching || loading) && styles.attachBtnDisabled]}
            onPress={handleAttachPress}
            disabled={attaching || loading}
            accessibilityLabel="Attach a PDF or photo"
            activeOpacity={0.8}
          >
            <Ionicons
              name={attaching ? 'hourglass-outline' : 'attach-outline'}
              size={22}
              color={C.textSecondary}
            />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={(text) => {
              if (text.endsWith('\n')) {
                const trimmed = text.replace(/\n+$/, '').trim();
                // CP6.1 — route through handleSend so a pending attachment
                // rides this turn even if the user hit return on empty text.
                if ((trimmed || pendingAttachment) && !loading) {
                  setInput('');
                  handleSend({ overrideText: trimmed });
                } else {
                  setInput(trimmed);
                }
              } else {
                setInput(text);
              }
            }}
            placeholder={isRecording ? 'Recording…' : 'Message…'}
            placeholderTextColor={C.textTertiary}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            editable={!loading && !isRecording}
            accessibilityLabel="Message"
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() && !pendingAttachment) || loading
                ? styles.sendBtnDisabled
                : null,
            ]}
            onPress={() => handleSend()}
            disabled={(!input.trim() && !pendingAttachment) || loading}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

    </KeyboardAvoidingView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    safe:      { flex: 1 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.base, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: C.border,
      backgroundColor: C.surfaceSecondary,
    },
    backBtn:      { width: 60 },
    backText:     { fontSize: 15, color: C.primary, fontWeight: '600' },
    headerCenter: { alignItems: 'center' },
    headerTitle:  { fontSize: 15, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.2 },
    headerSub:    { fontSize: 12, color: C.textTertiary, marginTop: 2 },

    // CP9.3 — Right-side header group: speaker (TTS) + off-record toggle.
    // We keep the right slot ~60px wide; speaker icon adds another ~28px
    // when present, balanced against the leftside back button + headerCenter.
    headerRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    speakerBtn: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Off-record toggle — right-side header slot. Either a subtle eye
    // icon or a small chip when the user has paused background learning.
    offRecordBtn: {
      width: 60,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 4,
    },
    offRecordChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: C.surfaceSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    offRecordChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },

    messageList: { padding: Spacing.base, gap: 14, paddingBottom: Spacing.xl },

    msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
    msgRowUser:      { flexDirection: 'row-reverse' },
    msgRowAssistant: {},

    avatar:        { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.primaryMid },
    avatarInitial: { fontSize: 13, fontWeight: '700', color: C.primary },

    bubble:              { maxWidth: '78%', borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 12 },
    bubbleUser:          { backgroundColor: C.ink, borderBottomRightRadius: 6 },
    bubbleAssistant:     { backgroundColor: C.surfaceSecondary, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: C.border },
    bubbleText:          { fontSize: 16, lineHeight: 25 },
    bubbleTextUser:      { color: '#FFFFFF' },
    bubbleTextAssistant: { color: C.textPrimary },

    typingRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingBottom: 8 },
    typingBubble:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceSecondary, borderRadius: Radius.xl, padding: 12, borderWidth: 1, borderColor: C.border },
    transcribingText: { fontSize: 13, color: C.textSecondary },

    doneBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: Spacing.base, backgroundColor: C.primaryLight,
      borderTopWidth: 1, borderTopColor: C.primaryMid,
    },
    doneText:   { fontSize: 14, color: C.primary, fontWeight: '700' },
    doneAction: { fontSize: 14, color: C.primary, fontWeight: '600' },

    // ── Post-apply summary card ──────────────────────────────────────────
    summaryCard: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.base,
      backgroundColor: C.surface,
      borderRadius: Radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: Spacing.base,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 1,
    },
    summaryHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    summaryTitle: {
      fontSize: 15, fontWeight: '700', color: C.primary, letterSpacing: -0.2,
    },
    summarySyncingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    summarySyncingText: {
      fontSize: 11, color: C.textTertiary, fontStyle: 'italic',
    },
    summaryRows: { gap: 6, marginBottom: Spacing.md },
    summaryRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    },
    summaryWarnRow: {
      backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8,
    },
    summaryRowIcon: {
      fontSize: 13, color: C.primary, width: 16, textAlign: 'center',
      fontWeight: '700',
    },
    summaryRowText: {
      fontSize: 13, color: C.textPrimary, flex: 1, lineHeight: 18,
    },
    summarySubtleText: {
      fontSize: 11, color: C.textSecondary, marginTop: 2,
    },
    summaryCta: {
      alignSelf: 'flex-end',
      paddingVertical: 8, paddingHorizontal: 14,
      borderRadius: Radius.full,
      backgroundColor: C.primary,
    },
    summaryCtaText: {
      fontSize: 13, fontWeight: '700', color: C.textInverse,
    },

    inputSafe: { backgroundColor: C.background, borderTopWidth: 1, borderTopColor: C.border },
    inputRow:  { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },

    micBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    micBtnActive: { backgroundColor: '#FEE2E2', borderColor: C.error },
    micLabel:     { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.3 },

    // CP6.1 — paperclip / attach button (mirrors mic dimensions)
    attachBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    attachBtnDisabled: { opacity: 0.5 },

    // CP6.1 — inline attachment row inside a user bubble
    bubbleAttachment: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingBottom: 6, marginBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.25)',
    },
    bubbleAttachmentName: {
      flex: 1, fontSize: 12, color: C.textInverse, opacity: 0.9, fontWeight: '500',
    },

    // CP6.2 — paste-from-clipboard pill row above the composer
    pasteRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingTop: 8,
    },
    pastePill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: C.surfaceSecondary,
      borderWidth: 1, borderColor: C.border,
    },
    pastePillText: {
      fontSize: 12, color: C.textSecondary, fontWeight: '600',
    },

    // CP6.1 — pending-attachment chip row above the composer
    attachChipRow: {
      paddingHorizontal: 12, paddingTop: 8,
    },
    attachChip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: Radius.full,
      backgroundColor: C.surfaceSecondary,
      borderWidth: 1, borderColor: C.border,
    },
    attachChipName: {
      flex: 1, fontSize: 13, color: C.textPrimary, fontWeight: '500',
    },
    attachChipMeta: {
      fontSize: 11, color: C.textTertiary,
    },

    input: {
      flex: 1, backgroundColor: C.surfaceSecondary, borderRadius: Radius.xxl,
      paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: C.textPrimary,
      maxHeight: 120, lineHeight: 22, borderWidth: 1, borderColor: C.border,
    },
    sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { backgroundColor: C.border },
    sendBtnText:     { fontSize: 20, color: '#FFFFFF', fontWeight: '700', lineHeight: 24 },
  });
}
