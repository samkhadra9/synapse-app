/**
 * ChatScreen — Solas V2
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

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated, Modal, ScrollView, Switch, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { format, addDays } from 'date-fns';
import { Colors, Spacing, Radius, useColors } from '../theme';
import { useStore, ChatMessage, DomainKey, Task, Project, LifeGoal, UserProfile, Area, DayPlan, PlannedSlot } from '../store/useStore';
import { buildTodayCalendarContext, buildSkeletonContext, writeDayPlanToCalendar, requestCalendarPermissions, findOrCreateSolasCalendar } from '../services/calendar';
import { updatePortrait } from '../services/portrait';
import { fetchAnthropic } from '../lib/anthropic';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatMode = 'dump' | 'morning' | 'evening' | 'weekly' | 'monthly' | 'yearly' | 'project' | 'quick' | 'fatigue';

const MODE_META: Record<ChatMode, { title: string; subtitle: string }> = {
  dump:    { title: 'Brain dump',     subtitle: "What's on your mind?" },
  morning: { title: 'Plan your day',  subtitle: "Let's build your day" },
  evening: { title: 'Wind down',      subtitle: 'Close out the day' },
  weekly:  { title: 'Weekly reset',   subtitle: 'Recalibrate. Realign.' },
  monthly: { title: 'Monthly review', subtitle: 'Zoom out. Recalibrate.' },
  yearly:  { title: 'Annual review',  subtitle: 'Redesign your life.' },
  project: { title: 'New project',    subtitle: "Tell me what you're working on" },
  quick:   { title: 'Quick check-in', subtitle: 'No pressure. Just one thing.' },
  fatigue: { title: 'Stuck?',         subtitle: 'Clear the noise. One thing.' },
};

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

  const todayList = todayTasks.length
    ? todayTasks.map(t => `  • [${t.completed ? '✓' : ' '}] "${t.text}"${t.isMIT ? ' ★' : ''}`).join('\n')
    : '  • nothing planned yet';

  const overdueList = overdue.length
    ? overdue.slice(0, 8).map(t => `  • "${t.text}" (was due ${t.date})`).join('\n')
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

OVERDUE (${overdue.length} tasks — surface the important ones):
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
  {"type":"task","text":"task description","projectId":"project-id-or-null","isMIT":true,"estimatedMinutes":60,"dueDate":"today|tomorrow|YYYY-MM-DD","time":"18:00","eventLabel":"Optional label","reason":"why this task, why now — one short sentence"},
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

isMIT: true for MAXIMUM 3 tasks total — the ruthless few that must happen today. Prefer 1–2.

CRITICAL — dueDate rules:
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

  const prompts: Record<ChatMode, string> = {

    dump: `You are the Aiteall AI, an intelligent ADHD productivity assistant. ${firstName} is doing a brain dump — anything on their mind, at any time.
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

    morning: `You are the Aiteall AI. ${firstName} is doing their morning planning session.
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

    evening: `You are the Aiteall AI. It's evening. ${firstName} is closing out the day.
${portraitSection}
${contextBlock}

Keep this short and warm — 4-5 exchanges max. Don't drag it out.

1. Open with: "How did today go?" One question. Let them respond.
2. Based on their answer, either:
   - Acknowledge a good day and ask what's worth carrying into tomorrow
   - Acknowledge a rough day without judgment — ask what got in the way (one thing)
3. Ask: "Anything you need to capture before you close out?" — brief brain dump if needed.
4. Close with tomorrow's one thing: "What's the most important thing tomorrow?" That's your MIT seed.

DO NOT go through a checklist. DO NOT ask about every unfinished task. One warm conversation, then done.

${outputFormat}
${sharedRules}
- sessionNote: one sentence capturing how the day actually went.
- If they mention tasks to roll over, set dueDate: "tomorrow". Never roll tasks over automatically without asking.
- Tasks they want to drop → delete action.
- Tomorrow's most important thing → task with isMIT: true, dueDate: "tomorrow".`,

    weekly: `You are the Aiteall AI doing a weekly reset with ${firstName}.
${portraitSection}
${contextBlock}

This is a short strategic conversation — not an interrogation. One question at a time. Aim for 6-8 exchanges total.

Run loosely in this order — but follow the conversation naturally, don't mechanically tick boxes:

1. Open: "How was the week?" Let them talk freely.
2. Pick up on what they said — reflect briefly, then ask: "What actually moved forward that matters?"
3. If there are active projects above, pick the most relevant one: "How's [project] sitting with you?"
4. "What got in the way this week? Anything to name so it doesn't repeat?"
5. "What are the 2-3 things that need to happen next week — not everything, just what actually matters?"
6. Close: confirm the non-negotiables and wish them a good week.

If they have no projects or goals set up yet, just focus on last week and next week's intentions — don't reference structure that doesn't exist.
Be direct but warm. If there's obvious drift from their goals, name it once, cleanly.

${outputFormat}
${sharedRules}`,

    monthly: `You are the Aiteall AI running a monthly strategic review with ${firstName}.
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

    yearly: `You are the Aiteall AI running an annual life design session with ${firstName}. This is like re-onboarding — a full redesign of the superstructure.
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

    project: `You are the Aiteall AI helping ${firstName} plan a new project.
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

    fatigue: `You are the Aiteall AI. ${firstName} is in a state of decision fatigue — executive dysfunction has made even small choices feel impossible. Their brain is in analysis paralysis. They don't need options or conversation. They need the paralysis broken immediately.
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

3. Immediately output [SYNAPSE_ACTIONS] with that single task: isMIT:true, focus:true, estimatedMinutes:30, dueDate:"today". The focus:true flag tells the app to lock the dashboard to this one task so every other distraction disappears. If you are pointing at an EXISTING task already in their list (don't duplicate it), instead emit {"type":"focus","taskText":"<exact task text>"} to lock the dashboard onto that existing task.

4. After they respond (whether they did it or not): stay in this mode. Ask only: "Did you start?" If yes — celebrate briefly, then ask if they want to keep going or that's enough for now. If no — no guilt, just: "What got in the way?" and help them remove that one blocker. Then try again with the same task.

TONE: A calm, firm, warm hand on the shoulder. Not urgent. Not frantic. The opposite of their internal state. Short sentences. No lists. No options. No explanations of why this works.

HARD RULES for this mode:
- NEVER give more than one task. Ever.
- NEVER ask what they want to work on — you already know from their context.
- NEVER explain the task sizing system, the project structure, or any meta-information.
- NEVER ask a clarifying question before giving them the task.
- If they push back or say "but I also need to…" — gently hold the line: "That can come after. Just this one first."

${outputFormat}`,

    quick: `You are the Aiteall AI. ${firstName} hasn't been around for a few days. This is a no-guilt re-entry.
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

  const { profile, tasks, projects, goals, areas, addTask, addProject, addGoal, updateTodayLog, setProjectTasks, setPortrait, saveDayPlan, markCalendarSynced, setFocusTask } = useStore();
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
  }, [mode, profile.weekTemplate]);

  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState(initialMessage);
  const [loading,         setLoading]         = useState(false);
  const [actionTaken,     setActionTaken]     = useState(false);
  const [applyResult,     setApplyResult]     = useState<{
    tasks: number;
    projects: number;
    goals: number;
    scheduledSlots: number;
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
  const [showCalendarExport, setShowCalendarExport] = useState(false);
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
      const liveKey = useStore.getState().profile.anthropicKey || undefined;
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

  async function startConversation() {
    await sendToLLM([]);
  }

  function appendMessage(role: 'user' | 'assistant', content: string): ChatMessage {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  }

  async function sendToLLM(history: ChatMessage[]) {
    setLoading(true);
    try {
      const res = await fetchAnthropic({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1800,
        system: systemPrompt,
        // Anthropic requires: (a) non-empty array, (b) first message must be user role.
        // We prepend a silent kickoff so the AI opens the conversation as the system prompt instructs.
        messages: [
          { role: 'user', content: 'Hello' },
          ...history.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
      }, userAnthropicKey);
      const data = await res.json();
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
      const reply: string = data.content?.[0]?.text ?? "Something went wrong. Try again?";

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

        // Capture the new task's ID so we can reference it in the schedule
        const allTasks = useStore.getState().tasks;
        const newTask  = allTasks.find(t => t.text === action.text && !t.completed);
        if (newTask) textToTaskId[action.text] = newTask.id;

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

      // Standalone focus action — picks an existing task by id or text
      if (action.type === 'focus') {
        const allTasks = useStore.getState().tasks;
        let target: typeof allTasks[number] | undefined;
        if (action.taskId) target = allTasks.find(t => t.id === action.taskId);
        if (!target && action.taskText) {
          target = allTasks.find(t => t.text.toLowerCase() === String(action.taskText).toLowerCase() && !t.completed);
        }
        if (target) setFocusTask(target.id);
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

    // Third pass: build and save the day plan from schedule action
    const scheduleAction = parsed.actions.find((a: any) => a.type === 'schedule');
    if (scheduleAction?.slots && mode === 'morning') {
      const slots: PlannedSlot[] = (scheduleAction.slots as any[]).map((slot: any) => ({
        time:       slot.time ?? '08:00',
        eventLabel: slot.eventLabel ?? 'Work block',
        tasks:      (slot.tasks as string[]).map((text: string) => ({
          id:   textToTaskId[text] ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text,
          done: false,
        })),
      })).filter((s: PlannedSlot) => s.tasks.length > 0);

      if (slots.length > 0) {
        saveDayPlan({ date: today, slots, summary: parsed.summary ?? '' });
      }
    }

    // Session log updates
    if (parsed.sessionNote && mode === 'evening') {
      updateTodayLog({ eveningCompleted: true, eveningNote: parsed.sessionNote });
    }
    if (parsed.sessionNote && mode === 'morning') {
      updateTodayLog({ morningCompleted: true });
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
    const scheduleAct  = (edited.actions ?? []).find(a => a.type === 'schedule');
    const slotCount    =
      (scheduleAct?.slots?.length ?? 0) +
      (edited.actions ?? []).filter(a => a.type === 'task' && a.time).length;

    setApplyResult({
      tasks: taskCount,
      projects: projectCount,
      goals: goalCount,
      scheduledSlots: slotCount,
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

    // After first morning/quick plan: ask for notification permissions and schedule reminders
    if (mode === 'morning' || mode === 'quick') {
      import('../services/notifications').then(async (n) => {
        const granted = await n.requestPermissions();
        if (granted) {
          const morningTime = profile.morningTime || '08:00';
          const eveningTime = profile.eveningTime || '20:00';
          await n.scheduleDailyNotifications(morningTime, eveningTime);
          await n.cancelLapseNotification();

          // Feature 3: Schedule drift nudge for any newly created MITs
          if (mode === 'morning') {
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

          // Feature 4: Schedule morning brief for tomorrow with tomorrow's task data
          if (mode === 'morning') {
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
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }, [styles]);

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
            placeholderTextColor={C.textTertiary}
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
