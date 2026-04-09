/**
 * ChatScreen — Synapse V2
 *
 * Context-aware AI assistant. Knows the user's full life structure
 * (projects, tasks, goals) and routes brain dumps into the right place.
 *
 * Session types:
 *   dump     — anytime brain dump, sorts into structure
 *   morning  — AM planning: sequence + time blocks for today
 *   evening  — PM reflection: log what happened, roll over tasks
 *   weekly   — Sunday review: realign with goals, design next week
 *   monthly  — Monthly brainstorm: goal progress, project priorities
 *   yearly   — Annual re-onboarding: redesign life structure
 *   project  — Create / plan a specific project
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated, Modal, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { format } from 'date-fns';
import { Colors, Spacing, Radius } from '../theme';
import { useStore, ChatMessage, DomainKey, Task, Project, LifeGoal, UserProfile } from '../store/useStore';
import { buildTodayCalendarContext, buildSkeletonContext } from '../services/calendar';
import { updatePortrait } from '../services/portrait';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatMode = 'dump' | 'morning' | 'evening' | 'weekly' | 'monthly' | 'yearly' | 'project' | 'quick' | 'fatigue';

const MODE_META: Record<ChatMode, { title: string; subtitle: string }> = {
  dump:    { title: 'Brain dump',      subtitle: "What's on your mind?" },
  morning: { title: 'Morning planning',subtitle: "Let's build your day" },
  evening: { title: 'Evening review',  subtitle: "Let's wind down" },
  weekly:  { title: 'Weekly review',   subtitle: 'Recalibrate. Realign.' },
  monthly: { title: 'Monthly review',  subtitle: 'Zoom out. Recalibrate.' },
  yearly:  { title: 'Annual review',   subtitle: 'Redesign your life.' },
  project: { title: 'New project',     subtitle: "Tell me what you're working on" },
  quick:   { title: 'One small win',   subtitle: 'No pressure. Just one thing.' },
  fatigue: { title: 'Decision fatigue', subtitle: 'Clear the noise. One thing.' },
};

const ENV_API_KEY    = (process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '').trim();
const ENV_OPENAI_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim(); // voice only

// ── Context Builder ────────────────────────────────────────────────────────────
// Injects the user's full life structure into every system prompt.
// This is what makes Synapse feel like it knows you.

function buildContextBlock(store: {
  profile: UserProfile;
  tasks: Task[];
  projects: Project[];
  goals: LifeGoal[];
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

  const todayList = todayTasks.length
    ? todayTasks.map(t => `  • [${t.completed ? '✓' : ' '}] "${t.text}"${t.isMIT ? ' ★' : ''}`).join('\n')
    : '  • nothing planned yet';

  const overdueList = overdue.length
    ? overdue.slice(0, 8).map(t => `  • "${t.text}" (was due ${t.date})`).join('\n')
    : '  • none — clean slate';

  return `
╔══ ${store.profile.name || 'User'}'s Life Context ══╗
Today: ${format(now, 'EEEE, MMMM d yyyy')}
Current time: ${timeStr} (${dayPhase})
Working day remaining: ~${hoursLeft}h ${minutesLeft % 60}min until 6pm${overbooked ? ` ⚠️ OVERBOOKED — ${plannedMinutes}min planned vs ${minutesLeft}min available` : bufferMinutes > 0 ? ` · ${bufferMinutes}min unplanned buffer` : ''}

ACTIVE PROJECTS (use these IDs when linking tasks):
${projectList}

TODAY'S TASKS:
${todayList}

OVERDUE (${overdue.length} tasks — surface the important ones):
${overdueList}

1-YEAR GOALS:
${goals1yr.length ? goals1yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}

5-YEAR GOALS:
${goals5yr.length ? goals5yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}

10-YEAR GOALS:
${goals10yr.length ? goals10yr.map(g => `  • ${g.text}`).join('\n') : '  • not set'}
╚══ End Context ══╝`;
}

// ── System Prompts ─────────────────────────────────────────────────────────────

function getSystemPrompt(mode: ChatMode, contextBlock: string, name: string, calendarContext = '', portrait = ''): string {
  const firstName = name ? name.split(' ')[0] : 'there';

  const portraitSection = portrait
    ? `\nWHO ${firstName.toUpperCase()} IS — your persistent memory of this person (use this to calibrate your tone and approach, not to repeat back to them):\n${portrait}\n`
    : '';

  const sharedRules = `
RULES:
- One message at a time. Keep each reply to 2–4 sentences max.
- No bullet points in your conversational replies — write like a smart friend.
- You have ${firstName}'s full context above. Reference it. Don't ask what they've already told you.
- If they mention something that belongs to an existing project, link it. If it sounds like a new project, create one.
- Be warm, direct, and honest. Name drift or avoidance gently but clearly.

DECISION FATIGUE SIGNAL: If ${firstName} says anything that signals they are frozen, overwhelmed, or in analysis paralysis — redirect them gently: "It sounds like your brain is full. Want to switch to decision fatigue mode?" Then stop and wait. Do not try to solve it from within the current session.`;

  const outputFormat = `
When you have enough to act, output exactly this — raw JSON, NO code fences, NO trailing commas:
[SYNAPSE_ACTIONS]
{"actions":[
  {"type":"task","text":"task description","projectId":"project-id-or-null","isMIT":true,"estimatedMinutes":60,"dueDate":"today|tomorrow|YYYY-MM-DD","reason":"why this task, why now — one short sentence"},
  {"type":"project","projectType":"sequential|recurring","title":"title","description":"desc","deadline":"YYYY-MM-DD or null","tasks":[{"text":"subtask","estimatedMinutes":60,"reason":"why this step"}],"recurringTask":{"text":"session description","estimatedMinutes":60,"frequency":"daily|weekdays|weekly","preferredSlot":"morning|afternoon|evening"}},
  {"type":"goal","horizon":"1year|5year|10year","text":"goal text"}
],"summary":"One sentence plan summary","sessionNote":"optional note for logs"}

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

isMIT: true for MAXIMUM 3 tasks total — the ruthless few that must happen today. Prefer 1–2.

PROJECT vs AREA:
A PROJECT has a clear end state. An AREA is ongoing. Areas never become projects.
- "I want to get healthier" → GOAL, not a project
- "Run a marathon in October" → PROJECT with deadline

PROJECT TYPES:
- sequential: one-time tasks in order toward a single end state
- recurring: needs a repeated practice schedule over time (exam prep, training, skill-building)

Only output [SYNAPSE_ACTIONS] when you have enough context. Don't rush it.`;

  const prompts: Record<ChatMode, string> = {

    dump: `You are Synapse, an intelligent ADHD productivity assistant. ${firstName} is doing a brain dump — anything on their mind, at any time.
${portraitSection}
${contextBlock}

Your job:
1. Let them dump freely. Don't interrupt or structure too early.
2. After they've dumped, gently sort what they've said: What's a project? What's a standalone task? What's a goal? What's a worry that doesn't need action?
3. For each task, detect if it belongs to an of their existing projects (check context above). If yes, link it. If it sounds like a new coherent project, suggest creating one.
4. Ask one clarifying question if you need deadlines or priorities. Then commit.
5. Keep unimportant worry-items off the task list — acknowledge them but don't add noise.

${outputFormat}
${sharedRules}`,

    morning: `You are Synapse. ${firstName} is doing their morning planning session.
${portraitSection}
${contextBlock}

${calendarContext ? `LIVE DEVICE DATA (pulled from ${firstName}'s phone right now):\n${calendarContext}\n\nUse this to plan around their actual day:\n- Don't schedule deep work during meetings or protected blocks\n- Account for travel/buffer time around appointments\n- If they have a PLANNED TIME BLOCK for deep work today, use that time slot for their MIT\n- Suggest that recurring area commitments (exercise, reading, etc.) already in the skeleton don't need to be added as tasks — they're baked in` : ''}

Your job — run this in sequence:
1. Open with: "Morning, ${firstName}." Then ask what's alive in their mind RIGHT NOW. Brain dump first, structure second.
2. After they dump, cross-reference with: their overdue tasks (surface the ones that matter), active project needs, their 1-year goals, and today's calendar events and reminders above. Name what you notice.
3. Help them pick their MITs ruthlessly. Hard cap: MAX 3 MITs, ideally 1–2. Ask: "If you only got ONE thing done today, what would make it a real win?" Only escalate to 3 if they genuinely need it.
4. Build a time-blocked sequence. Every task MUST have estimatedMinutes. Add 15-min buffer between tasks — ADHD brains need transition time. Work around calendar events. Be realistic, not aspirational.
5. Check the inbox: if they have unscheduled inbox tasks (no date), ask if any should come into today's plan.
6. Confirm the plan. Then output.

${outputFormat}
${sharedRules}
- Surface overdue work. Don't let it hide.
- If they have 10 things, help them cut to 3 MITs. That's the job.
- Every task in the output MUST have estimatedMinutes — never omit it.
- Reference specific calendar events and skeleton blocks by name when building the day plan.`,

    evening: `You are Synapse. It's evening. ${firstName} is doing their end-of-day review.
${portraitSection}
${contextBlock}

Your job:
1. Start warm: "How did today actually go?" Let them talk.
2. Help them log what got done — cross-reference with today's planned tasks.
3. For unfinished tasks: should they roll to tomorrow? Drop? Schedule for later? Help decide, don't just carry everything over automatically.
4. Ask: "What got in the way?" — capture system friction or distractions for the weekly review.
5. Ask: "What's on your mind for tomorrow?" — light capture only, not full planning.
6. Close with clarity: what's rolling, what's done, what's tomorrow's one thing.

${outputFormat}
${sharedRules}
- sessionNote should capture what actually happened for future reference.
- Roll over tasks with dueDate: "tomorrow" only if they explicitly want to.
- Be warm and closing. Help them feel done.`,

    weekly: `You are Synapse acting as a strategic weekly reviewer. It's probably Sunday. ${firstName} is recalibrating.
${portraitSection}
${contextBlock}

Run this review in sequence — one question at a time:

1. WHAT HAPPENED: "Walk me through last week. What actually happened — not the plan, what really occurred?"
2. VALUE AUDIT: "What produced real value? What moved something forward that matters to your goals?"
3. TIME LEAKS: "Where did time go that you didn't intend? What drained you without giving anything back?"
4. GOAL ALIGNMENT: Look at their 1-year goals above. "Are you building toward these, or has drift crept in?" Be honest if there's drift.
5. PROJECT HEALTH: Look at their active projects. "Which projects need attention this week? Any that should be paused or killed?"
6. NEXT WEEK DESIGN: "Where are your deep work blocks going? What are the 3 non-negotiables next week?"

Be direct. If there's drift, name it clearly. If they're aligned, confirm it.

${outputFormat}
${sharedRules}`,

    monthly: `You are Synapse running a monthly strategic review with ${firstName}.
${portraitSection}
${contextBlock}

This is a zoom-out session. Run in sequence:

1. MONTH IN REVIEW: "What were the big things this month — wins, setbacks, surprises?"
2. GOAL PROGRESS: Reference their 1-year goals above. Where are they on each? Are they on track, ahead, behind, or has a goal shifted?
3. PROJECT AUDIT: Look at their active projects. Which ones are making real progress? Any that have stalled and should be killed or restructured?
4. WHAT'S NEXT: "What should get most of your energy next month? What big rock, if moved, would make everything else easier?"
5. SYSTEM REVIEW: "What's working in how you manage your time and energy? What's not?"
6. RECALIBRATE: Update goals or projects as needed based on what you learn.

Be strategic and honest. This is a planning session, not a therapy session.

${outputFormat}
${sharedRules}`,

    yearly: `You are Synapse running an annual life design session with ${firstName}. This is like re-onboarding — a full redesign of the superstructure.
${portraitSection}
${contextBlock}

This is a big, important conversation. Take your time. Run in sequence:

1. YEAR IN REVIEW: "Looking back at the last year — what were you actually doing with your life? What moved? What stalled? What surprised you?"
2. WHAT MATTERS: "Strip away everything urgent and noisy. What actually matters to you right now — the things you'd regret not having pursued?"
3. 10-YEAR VISION: "Where do you want to be in 10 years — what does your life look like?" Push for specifics.
4. 5-YEAR GOALS: Based on the 10-year vision, what needs to be true in 5 years? Update these.
5. 1-YEAR GOALS: What specifically needs to happen this year to be on track for the 5-year? These should be concrete and measurable.
6. PROJECTS FOR THE YEAR: What 3–5 projects, if completed, would most move the needle on the 1-year goals?
7. LIFE DESIGN: Are there areas of your life (health, relationships, creativity, community) that are being neglected? What would a more whole life look like?

This is the most important session of the year. Be patient, go deep, don't rush.

${outputFormat}
${sharedRules}`,

    project: `You are Synapse helping ${firstName} plan a new project.
${portraitSection}
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

    fatigue: `You are Synapse. ${firstName} is in a state of decision fatigue — executive dysfunction has made even small choices feel impossible. Their brain is in analysis paralysis. They don't need options or conversation. They need the paralysis broken immediately.
${portraitSection}
${contextBlock}

WHAT IS HAPPENING: Decision fatigue in ADHD is a state of mental exhaustion caused by executive dysfunction. The brain's ability to filter information, use working memory, and assess risk-reward has collapsed. Too many open loops + too many choices = total shutdown. The cure is not more thinking. It is removing all choices except one.

YOUR ONLY JOB — do this immediately, do not ask anything first:

1. Scan their context above. Find the single highest-priority task:
   - First: look for isMIT tasks scheduled for today
   - Second: look for the most overdue task attached to an active project
   - Third: look for the top active project's first incomplete task
   - Last resort: use "Open a blank note. Write 3 sentences about what's actually going on right now." (30 min)

2. Respond with EXACTLY this format — no greeting, no preamble, no options:

---
Your brain is full. Stop deciding.

Do this one thing:
[TASK — one concrete sentence. What you're doing + what you produce/decide. Present tense, active voice.]

Set a 10-minute timer when you start. That's your only commitment right now — 10 minutes. Everything else waits.
---

3. Immediately output [SYNAPSE_ACTIONS] with that single task: isMIT:true, estimatedMinutes:30, dueDate:"today".

4. After they respond (whether they did it or not): stay in this mode. Ask only: "Did you start?" If yes — celebrate briefly, then ask if they want to keep going or that's enough for now. If no — no guilt, just: "What got in the way?" and help them remove that one blocker. Then try again with the same task.

TONE: A calm, firm, warm hand on the shoulder. Not urgent. Not frantic. The opposite of their internal state. Short sentences. No lists. No options. No explanations of why this works.

HARD RULES for this mode:
- NEVER give more than one task. Ever.
- NEVER ask what they want to work on — you already know from their context.
- NEVER explain the task sizing system, the project structure, or any meta-information.
- NEVER ask a clarifying question before giving them the task.
- If they push back or say "but I also need to…" — gently hold the line: "That can come after. Just this one first."

${outputFormat}`,

    quick: `You are Synapse. ${firstName} hasn't been around for a few days. This is a no-guilt re-entry.
${portraitSection}
${contextBlock}

Your job — keep this extremely short and warm:
1. Open with one sentence. Acknowledge the gap without dwelling on it. No guilt, no "where have you been". Something like: "Good to see you. Let's not worry about the backlog — just today."
2. Ask ONE question only: "What's one thing, if you did it today, would make you feel like you've moved forward?"
3. Let them answer. Don't push for more.
4. Take whatever they say — even if it's tiny — and help them commit to it as a single task with a time estimate.
5. Output. Keep the task list to 1–3 items MAX. Do not try to catch up everything. The goal is momentum, not completeness.

${outputFormat}
${sharedRules}
- Tone: warm, unhurried, zero judgment. Like a good friend who just checks in.
- Do NOT reference the overdue tasks or backlog unless they bring it up.
- If they say something big, scale it down: "Let's just do the first 60 minutes of that today."
- Max 3 tasks in the output. Usually 1 is perfect.`,

  };

  return prompts[mode];
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
      // Second attempt — Claude occasionally uses "smart quotes" or unescaped apostrophes
      // in string values (e.g. "you've been avoiding this"). Fix by escaping bare apostrophes
      // inside string values only (not structural characters).
      const cleaned = jsonStr
        // Replace smart/curly quotes with straight quotes
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        // Escape bare apostrophes inside JSON string values
        // (match apostrophe not preceded by a backslash)
        .replace(/(?<!\\)'/g, "\\'");

      try {
        return JSON.parse(cleaned);
      } catch {
        // Final attempt — strip any trailing comma before } or ] (common Claude mistake)
        const noTrailingCommas = jsonStr.replace(/,\s*([}\]])/g, '$1');
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
          />
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
            <Text style={rv.taskText} numberOfLines={2}>{action.text}</Text>
            {action.reason ? (
              <Text style={rv.taskReason} numberOfLines={1}>{action.reason}</Text>
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
              {mitCount > 0 ? `★ ${mitCount} MIT${mitCount > 1 ? 's' : ''}  ` : ''}{taskCount} task{taskCount !== 1 ? 's' : ''}{projectCount > 0 ? `  +${projectCount} project${projectCount !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>

          {parsed.summary ? (
            <Text style={rv.summary}>{parsed.summary}</Text>
          ) : null}

          {mitCount >= 3 && (
            <View style={rv.mitWarning}>
              <Text style={rv.mitWarningText}>★ MIT cap reached — tap ★ to unmark a task before adding more</Text>
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

const rv = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 20, paddingBottom: 36,
    maxHeight: '88%',
  },
  handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16 },
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: any) {
  const mode: ChatMode = route?.params?.mode ?? 'dump';
  const meta = MODE_META[mode];
  const insets = useSafeAreaInsets();

  const { profile, tasks, projects, goals, addTask, addProject, addGoal, updateTodayLog, setProjectTasks, setPortrait } = useStore();
  const apiKey      = profile.anthropicKey || ENV_API_KEY;
  const voiceApiKey = profile.openAiKey || ENV_OPENAI_KEY; // Whisper still uses OpenAI

  const contextBlock = useMemo(
    () => buildContextBlock({ profile, tasks, projects, goals }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.name, tasks.length, projects.length, goals.length],
  );

  const [calendarContext, setCalendarContext] = useState('');

  const systemPrompt = useMemo(
    () => getSystemPrompt(mode, contextBlock, profile.name, calendarContext, profile.portrait ?? ''),
    [mode, contextBlock, profile.name, calendarContext, profile.portrait],
  );

  // Fetch today's calendar + reminders + skeleton blocks for morning/evening
  useEffect(() => {
    if (mode === 'morning' || mode === 'evening') {
      buildTodayCalendarContext()
        .then(ctx => {
          // Also inject today's skeleton blocks (synchronous)
          const skeletonCtx = buildSkeletonContext(profile.weekTemplate ?? []);
          const combined = [skeletonCtx, ctx].filter(Boolean).join('\n\n');
          setCalendarContext(combined);
        })
        .catch(() => {
          // Fall back to skeleton only if calendar fails
          const skeletonCtx = buildSkeletonContext(profile.weekTemplate ?? []);
          if (skeletonCtx) setCalendarContext(skeletonCtx);
        });
    }
  }, [mode]);

  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [actionTaken,     setActionTaken]     = useState(false);
  const [pendingActions,  setPendingActions]  = useState<any | null>(null);
  const [recording,       setRecording]       = useState<Audio.Recording | null>(null);
  const [isRecording,     setIsRecording]     = useState(false);
  const [transcribing,    setTranscribing]    = useState(false);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const listRef      = useRef<FlatList>(null);
  const messagesRef  = useRef<ChatMessage[]>([]);  // always up-to-date for unmount closure

  // Keep messagesRef in sync so the unmount effect can read latest messages
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // On unmount: fire portrait update silently in background.
  // Read the key fresh from the store at cleanup time — avoids stale closure
  // if AsyncStorage hydration completed after this effect was first registered.
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      const liveKey = useStore.getState().profile.anthropicKey || ENV_API_KEY;
      if (msgs.length >= 4 && liveKey) {
        updatePortrait(msgs, useStore.getState().profile.portrait ?? '', liveKey, mode)
          .then(newPortrait => {
            if (newPortrait) useStore.getState().setPortrait(newPortrait);
          })
          .catch(() => {}); // always silent
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { startConversation(); }, []);

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

  async function startConversation() {
    await sendToLLM([]);
  }

  function appendMessage(role: 'user' | 'assistant', content: string): ChatMessage {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return [...prev, msg];
    });
    return msg;
  }

  async function sendToLLM(history: ChatMessage[]) {
    if (!apiKey) {
      appendMessage('assistant', "I need an Anthropic API key to work. Add it in Settings.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 900,
          system: systemPrompt,
          // Anthropic requires: (a) non-empty array, (b) first message must be user role.
          // We prepend a silent kickoff so the AI opens the conversation as the system prompt instructs.
          messages: [
            { role: 'user', content: 'Hello' },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message ?? `API error ${res.status}`;
        appendMessage('assistant', `Connection error: ${errMsg}`);
        return;
      }
      const reply: string = data.content?.[0]?.text ?? "Something went wrong. Try again?";

      if (reply.includes('[SYNAPSE_ACTIONS]')) {
        const parsed = parseActions(reply);
        const displayText = reply.split('[SYNAPSE_ACTIONS]')[0].trim() || "Here's what I've put together — review and tweak before it's applied.";
        appendMessage('assistant', displayText);
        if (parsed?.actions?.length > 0) {
          // Show review sheet instead of immediately applying
          setPendingActions(parsed);
        } else {
          // No editable actions (e.g. just a session note) — apply immediately
          if (parsed?.sessionNote && mode === 'evening') {
            updateTodayLog({ eveningCompleted: true, eveningNote: parsed.sessionNote });
          }
          if (parsed?.sessionNote && mode === 'morning') {
            updateTodayLog({ morningCompleted: true });
          }
          setActionTaken(true);
        }
      } else {
        appendMessage('assistant', reply);
      }
    } catch {
      appendMessage('assistant', "Connection issue. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyActions(parsed: { actions: any[]; sessionNote?: string }) {
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

    // Second pass: tasks and goals
    parsed.actions.forEach((action: any) => {
      if (action.type === 'task') {
        const dueDate = action.dueDate === 'today'
          ? today
          : action.dueDate === 'tomorrow'
          ? tomorrow
          : (action.dueDate && action.dueDate !== '')
          ? action.dueDate
          : today;

        addTask({
          text:              action.text,
          domain:            (action.domain ?? 'work') as DomainKey,
          projectId:         action.projectId ?? undefined,
          isMIT:             action.isMIT ?? false,
          isToday:           dueDate === today,
          date:              dueDate,
          completed:         false,
          priority:          action.isMIT ? 'high' : 'medium',
          estimatedMinutes:  action.estimatedMinutes ?? 60,
          reason:            action.reason ?? undefined,
        });
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

    // Session log updates
    if (parsed.sessionNote && mode === 'evening') {
      updateTodayLog({ eveningCompleted: true, eveningNote: parsed.sessionNote });
    }
    if (parsed.sessionNote && mode === 'morning') {
      updateTodayLog({ morningCompleted: true });
    }
  }

  function handleReviewApply(edited: { actions: any[]; sessionNote?: string }) {
    applyActions(edited);
    setPendingActions(null);
    setActionTaken(true);

    // After first morning/quick plan: ask for notification permissions and schedule reminders
    if (mode === 'morning' || mode === 'quick') {
      import('../services/notifications').then(async (n) => {
        const granted = await n.requestPermissions();
        if (granted) {
          const morningTime = profile.morningTime || '08:00';
          const eveningTime = profile.eveningTime || '20:00';
          await n.scheduleDailyNotifications(morningTime, eveningTime);
          await n.cancelLapseNotification();
        }
      }).catch(() => {});
    }
  }

  function handleReviewDiscard() {
    setPendingActions(null);
    // Keep conversation going — user can revise and AI can re-output
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
          id:               `ai-${Date.now()}-${i}`,
          text:             t.text ?? t,
          completed:        false,
          estimatedMinutes: t.estimatedMinutes ?? undefined,
        })));
      }

      return newId;
    } catch { return null; }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = appendMessage('user', input.trim());
    setInput('');
    await sendToLLM([...messages, userMsg]);
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
      if (!voiceApiKey) {
        appendMessage('assistant', "Voice needs an OpenAI API key for transcription. Add it in Settings → Voice API key.");
        setTranscribing(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');
      const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${voiceApiKey}` },
        body: formData,
      });
      const data = await res.json();
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>S</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

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
          <View style={{ width: 60 }} />
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
            <View style={styles.avatar}><Text style={styles.avatarInitial}>S</Text></View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={Colors.primary} />
              {transcribing && <Text style={styles.transcribingText}>Listening…</Text>}
            </View>
          </View>
        )}

        {actionTaken && (
          <View style={styles.doneBar}>
            <Text style={styles.doneText}>✓ Plan applied</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.doneAction}>Back to dashboard →</Text>
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

      {/* Input bar — plain View + dynamic insets so KAV lifts it cleanly */}
      <View style={[styles.inputSafe, { paddingBottom: insets.bottom }]}>
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

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={(text) => {
              if (text.endsWith('\n')) {
                const trimmed = text.replace(/\n+$/, '').trim();
                if (trimmed && !loading) {
                  const userMsg = appendMessage('user', trimmed);
                  setInput('');
                  sendToLLM([...messages, userMsg]);
                }
              } else {
                setInput(text);
              }
            }}
            placeholder={isRecording ? 'Recording…' : 'Message…'}
            placeholderTextColor={Colors.textTertiary}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            editable={!loading && !isRecording}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe:      { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceSecondary,
  },
  backBtn:      { width: 60 },
  backText:     { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  headerSub:    { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  messageList: { padding: Spacing.base, gap: 14, paddingBottom: Spacing.xl },

  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  msgRowUser:      { flexDirection: 'row-reverse' },
  msgRowAssistant: {},

  avatar:        { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primaryMid },
  avatarInitial: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  bubble:              { maxWidth: '78%', borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser:          { backgroundColor: Colors.ink, borderBottomRightRadius: 6 },
  bubbleAssistant:     { backgroundColor: Colors.surfaceSecondary, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.border },
  bubbleText:          { fontSize: 16, lineHeight: 25 },
  bubbleTextUser:      { color: '#FFFFFF' },
  bubbleTextAssistant: { color: Colors.textPrimary },

  typingRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingBottom: 8 },
  typingBubble:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.xl, padding: 12, borderWidth: 1, borderColor: Colors.border },
  transcribingText: { fontSize: 13, color: Colors.textSecondary },

  doneBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, backgroundColor: Colors.primaryLight,
    borderTopWidth: 1, borderTopColor: Colors.primaryMid,
  },
  doneText:   { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  doneAction: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  inputSafe: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  inputRow:  { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },

  micBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  micBtnActive: { backgroundColor: '#FEE2E2', borderColor: Colors.error },
  micLabel:     { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.3 },

  input: {
    flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.xxl,
    paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: Colors.textPrimary,
    maxHeight: 120, lineHeight: 22, borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText:     { fontSize: 20, color: '#FFFFFF', fontWeight: '700', lineHeight: 24 },
});
