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

export type ChatMode = 'dump' | 'morning' | 'evening' | 'weekly' | 'monthly' | 'yearly' | 'project';

const MODE_META: Record<ChatMode, { title: string; subtitle: string }> = {
  dump:    { title: 'Brain dump',      subtitle: "What's on your mind?" },
  morning: { title: 'Morning planning',subtitle: "Let's build your day" },
  evening: { title: 'Evening review',  subtitle: "Let's wind down" },
  weekly:  { title: 'Weekly review',   subtitle: 'Recalibrate. Realign.' },
  monthly: { title: 'Monthly review',  subtitle: 'Zoom out. Recalibrate.' },
  yearly:  { title: 'Annual review',   subtitle: 'Redesign your life.' },
  project: { title: 'New project',     subtitle: "Tell me what you're working on" },
};

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

// ── Context Builder ────────────────────────────────────────────────────────────
// Injects the user's full life structure into every system prompt.
// This is what makes Synapse feel like it knows you.

function buildContextBlock(store: {
  profile: UserProfile;
  tasks: Task[];
  projects: Project[];
  goals: LifeGoal[];
}): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTasks  = store.tasks.filter(t => t.date === today);
  const overdue     = store.tasks.filter(t => !t.completed && t.date < today);
  const active      = store.projects.filter(p => p.status === 'active');
  const goals1yr    = store.goals.filter(g => g.horizon === '1year');
  const goals5yr    = store.goals.filter(g => g.horizon === '5year');
  const goals10yr   = store.goals.filter(g => g.horizon === '10year');

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
Today: ${format(new Date(), 'EEEE, MMMM d yyyy')}

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
- Be warm, direct, and honest. Name drift or avoidance gently but clearly.`;

  const outputFormat = `
When you have enough to act, output exactly:
[SYNAPSE_ACTIONS]
{"actions":[
  {"type":"task","text":"task description","projectId":"project-id-or-null","isMIT":true,"estimatedMinutes":45,"dueDate":"today|tomorrow|YYYY-MM-DD"},
  {"type":"project","projectType":"sequential|recurring","title":"title","description":"desc","deadline":"YYYY-MM-DD or null","tasks":[{"text":"subtask","estimatedMinutes":30}],"recurringTask":{"text":"session description","estimatedMinutes":60,"frequency":"daily|weekdays|weekly","preferredSlot":"morning|afternoon|evening"}},
  {"type":"goal","horizon":"1year|5year|10year","text":"goal text"}
],"summary":"One sentence plan summary","sessionNote":"optional note for logs"}

TASK RULES — enforce strictly:
- estimatedMinutes: ALWAYS a number. Never null. Use 15/30/45/60/90/120. Default 45 if genuinely uncertain.
- isMIT: true for MAXIMUM 3 tasks total — the ruthless few that must happen today. Prefer 1–2. Never mark 4+ as MIT.
- dueDate: use "today", "tomorrow", or YYYY-MM-DD. If no clear date, use "today" for captured tasks.

PROJECT vs AREA — critical distinction:
A PROJECT has a clear end state — something that gets DONE. An AREA is an ongoing domain (health, finances). Areas never become projects.
- "I want to get healthier" → GOAL, not a project
- "I want to run a marathon in October" → PROJECT with deadline
- "I need to clear £5k of debt by December" → PROJECT with deadline

PROJECT TYPES:
- sequential: tasks happen once in order toward a single end state (app launch, dissertation, home renovation, event planning). Break into 5–10 ordered concrete tasks.
- recurring: needs a repeated practice schedule (studying for an exam, training for a race, learning a language). Create the project + a recurringTask defining the repeating session. Include milestone tasks for each phase (Week 1, Week 2, etc.).

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

Your job — run in sequence:
1. Ask what the project is — the outcome, not the tasks. "What's the end result when this is done?"
2. CLASSIFY it immediately in your head: is this SEQUENTIAL (clear end state, one-time tasks in order) or RECURRING (needs a repeated practice schedule)?
3. Get the key facts:
   - For SEQUENTIAL: deadline, what success looks like, any blockers already known.
   - For RECURRING: what does one session look like? How often should it happen? When does it need to be done by (exam date, race date)?
4. Connect it to their goals above if relevant. "This maps to your 1-year goal of X."
5. Break it down — be specific and realistic:
   - SEQUENTIAL: 5–10 ordered tasks covering the full arc from start to done (no vague tasks like "do research" — be concrete).
   - RECURRING: milestone tasks per phase (Week 1: X, Week 2: Y) + a clear recurring session definition.
6. Ask: "Anything about this that feels hard or where you might get stuck?" — surface blockers early.
7. Output when you have what you need.

${outputFormat}
${sharedRules}
- Create the project AND its tasks in one output block.
- Every task needs estimatedMinutes — be honest, most things take longer than planned.
- For recurring projects, always include a recurringTask with preferredSlot. Ask them when they'd want to schedule the sessions if it's not obvious.
- SEQUENTIAL projects should feel like a real execution roadmap — ordered, concrete, complete.`,

  };

  return prompts[mode];
}

// ── Output Parser ──────────────────────────────────────────────────────────────

function parseActions(text: string): any | null {
  try {
    const token = '[SYNAPSE_ACTIONS]';
    const idx = text.indexOf(token);
    if (idx === -1) return null;
    const after = text.slice(idx + token.length).trim();
    const start = after.indexOf('{');
    const end   = after.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(after.slice(start, end + 1));
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
  const apiKey = profile.openAiKey || ENV_API_KEY;

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

  // On unmount: fire portrait update silently in background
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      if (msgs.length >= 4 && apiKey) {
        updatePortrait(msgs, useStore.getState().profile.portrait ?? '', apiKey, mode)
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
      appendMessage('assistant', "I need an OpenAI API key to work. Add it in Settings.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          max_tokens: 600,
        }),
      });
      const data = await res.json();
      const reply: string = data.choices?.[0]?.message?.content ?? "Something went wrong. Try again?";

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
          estimatedMinutes:  action.estimatedMinutes ?? 45,
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
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');
      const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
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
