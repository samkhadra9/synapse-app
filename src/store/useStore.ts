/**
 * Solas V2 — Global State (Zustand + AsyncStorage)
 *
 * Every mutation that writes local state also fires a Supabase push
 * (fire-and-forget, only when a session is active).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, addDays, addMonths, isWeekend } from 'date-fns';
import type { Session } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DomainKey =
  | 'work' | 'health' | 'relationships' | 'personal'
  | 'finances' | 'learning' | 'creativity' | 'community';

export const ALL_DOMAINS: DomainKey[] = [
  'work', 'health', 'relationships', 'personal',
  'finances', 'learning', 'creativity', 'community',
];

export type LifeDomain = DomainKey;

/**
 * How an entity came into the store.
 *
 *   'user_created' — the user explicitly added it (existing behavior)
 *   'inferred'    — the background entity extractor picked it out of chat and
 *                   is *proposing* it. Not yet shown as first-class until the
 *                   emergence-moment UI asks the user to confirm.
 *   'confirmed'   — user has seen an 'inferred' entity and said "yes, this is
 *                   a real thing for me". Treated the same as 'user_created'
 *                   for display but we keep the provenance for analytics.
 *
 * See docs/AITEALL_BRAINSTORM_BRIEF.md — this is the spine that lets us do
 * zero-config onboarding: the app watches you talk, proposes structure at
 * day 3-7, and you confirm (or correct) rather than set up upfront.
 */
export type EntityOrigin = 'inferred' | 'confirmed' | 'user_created';

/** Fields every AI-sourced entity carries so we can reason about trust */
export interface EntityProvenance {
  origin: EntityOrigin;
  /** 0..1 from the extractor — only meaningful when origin === 'inferred' */
  confidence?: number;
  /** ISO timestamp of the last user confirmation; unset if never confirmed */
  lastConfirmedAt?: string;
}

export interface Area extends EntityProvenance {
  id: string;
  name: string;
  domain: DomainKey;
  description: string;
  isActive: boolean;
  isArchived?: boolean;
}

export interface Milestone {
  id: string;
  text: string;
  dueDate?: string;
  completed: boolean;
}

export interface ProjectTask {
  id: string;
  text: string;
  completed: boolean;
  estimatedMinutes?: number;
  dueDate?: string;
}

export interface Project extends EntityProvenance {
  id: string;
  areaId?: string;
  domain: DomainKey;
  title: string;
  description: string;
  deadline?: string;
  milestones: Milestone[];
  tasks: ProjectTask[];
  status: 'active' | 'completed' | 'paused' | 'archived';
  isDecomposed: boolean;
  createdAt: string;
  calendarEventId?: string;
}

export interface Task extends EntityProvenance {
  id: string;
  projectId?: string;
  areaId?: string;
  domain?: DomainKey;
  text: string;
  completed: boolean;
  date: string;           // '' = inbox (no date assigned yet)
  isToday: boolean;
  isMIT: boolean;
  isInbox?: boolean;      // true = captured but not yet scheduled
  estimatedMinutes?: number;
  reason?: string;        // AI-generated one-liner: why this task, why now
  priority: 'high' | 'medium' | 'low';
  createdAt?: string;     // ISO timestamp — preserved through Supabase round-trips
  reminderId?: string;    // iOS Reminder ID — links task to its paired Reminder
  recurrence?: 'daily' | 'weekly' | 'weekdays' | 'monthly';
  recurrenceGroupId?: string;
  /** Source chat message id — if this task was extracted from a chat mention */
  sourceMessageId?: string;
}

export type Todo = Task;

export interface Habit {
  id: string;
  name: string;
  icon: string;
  domain: DomainKey;
  completedDates: string[];
  frequency: 'daily' | 'weekdays' | 'weekends';
  notificationTime?: string;
}

export type TimeHorizon = '1year' | '5year' | '10year';

export interface LifeGoal extends EntityProvenance {
  id: string;
  domain: DomainKey;
  horizon: TimeHorizon;
  text: string;
  milestones: string[];
  createdAt: string;
}

export type Goal = LifeGoal;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type TimeBlockType =
  | 'deep_work'
  | 'area_work'
  | 'social'
  | 'admin'
  | 'protected'
  | 'personal';

export interface TimeBlock {
  id: string;
  label: string;
  type: TimeBlockType;
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number[];
  /** "HH:MM" 24-hour */
  startTime: string;
  durationMinutes: number;
  areaId?: string;
  calendarEventId?: string;
  isProtected: boolean;
}

export interface DeepWorkSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
  goal: string;
  artifact?: string;
  nextAction?: string;
  interruptions: number;
  completed: boolean;
}

export interface DailyLog {
  date: string;
  rawMorningText?: string;
  topPriorities: string[];
  focusScore?: number;
  energyLevel?: number;   // 1–5, captured during morning planning
  eveningNote?: string;
  morningCompleted: boolean;
  eveningCompleted: boolean;
}

/** One time-slot in a planned day — tasks nested under a calendar/skeleton block */
export interface PlannedSlot {
  /** "08:00" 24-hour — matches a calendar event start or skeleton block */
  time: string;
  /** Display label — the event name (e.g. "NCVH", "Arvo work") */
  eventLabel: string;
  /** Task texts in order — stored as text so they survive task edits */
  tasks: Array<{ id: string; text: string; done: boolean }>;
  /** iOS Calendar event this slot was written out to (Option C: tasks are source
   *  of truth, calendar is a projection). Set by writeDayPlanToCalendar and used
   *  by reconcileCalendarToDayPlan to pull time/deletion changes back in. */
  calendarEventId?: string;
  /** Duration in minutes — defaults to 90 if not specified */
  durationMinutes?: number;
}

/** AI-generated schedule for a specific day */
export interface DayPlan {
  date: string;          // "YYYY-MM-DD"
  slots: PlannedSlot[];
  summary?: string;      // one-sentence overview
}

/**
 * Structured portrait — the hero feature.
 *
 * The portrait is written in *second-person voice* ("You work best when…")
 * and is editable section-by-section. Each section tracks its own lastUpdated
 * and source so we can show "What changed this week" and so the user can tell
 * AI-written text from their own edits at a glance.
 *
 * Sections are intentionally small and human. We don't try to capture
 * everything — the meta section `whatIDontKnowYet` is where the AI admits
 * its blind spots and invites the user to fill them in.
 */
export interface PortraitSection {
  text: string;
  /** ISO timestamp — when this section was last written */
  lastUpdated?: string;
  /** Was the last write from the user editing, or AI summarising? */
  source: 'ai' | 'user';
}

export interface Portrait {
  /** Rhythms, focus patterns, when-you're-at-your-best */
  howYouWork: PortraitSection;
  /** Active projects + the quiet commitments behind them */
  whatYoureBuilding: PortraitSection;
  /** Friction, sticky loops, the shapes of stuckness */
  whatGetsInTheWay: PortraitSection;
  /** The horizon — what the last year of choices suggests you're aiming at */
  whereYoureGoing: PortraitSection;
  /** AI's admitted blind spots; prompts the user to teach it */
  whatIDontKnowYet: PortraitSection;
  /** ISO — last time *any* section changed (for the "weekly diff" card) */
  lastAnyUpdate?: string;
}

/**
 * A lightweight session record — every time the app opens we stamp one of
 * these. UIStateClassifier (Phase 4) reads the last N events to decide
 * whether the user is in an 'open' / 'narrow' / 'held' state.
 */
export interface SessionEvent {
  /** ISO timestamp */
  at: string;
  /** What surface they landed on — helps classify intent */
  kind: 'open' | 'chat' | 'dump' | 'dashboard' | 'portrait' | 'deepwork';
  /** Optional freeform tag, e.g. the chat mode */
  note?: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  morningTime: string;
  eveningTime: string;
  selectedDomains: DomainKey[];
  anthropicKey: string;    // Main AI (Claude) — chat + planning
  openAiKey: string;       // Optional — only needed for voice transcription (Whisper)
  backendUrl: string;
  personality?: {
    bigFive?: Record<string, number>;
    adhdType?: string;
    notes?: string;
  };
  deepWorkBlockLength: number;
  deepWorkBlocksPerWeek: number;
  routines?: {
    morning: string[];
    postWork: string[];
    evening: string[];
  };
  synapseCalendarId?:    string;
  selectedCalendarName?: string;
  weekTemplate: TimeBlock[];
  skeletonBuilt: boolean;
  /** Structured portrait — the "You" tab. See Portrait type above. */
  portrait: Portrait;
  lastActiveDate?: string; // YYYY-MM-DD — used for lapse detection
  /** When the user first opened the app — drives the day-3-to-7 emergence moment */
  firstOpenDate?: string;  // YYYY-MM-DD
  // Weekly review nudge — fires a local notification on the chosen day + time,
  // deep-linking straight into Chat mode 'weekly'. Local-only for now; add
  // `weekly_review_day` + `weekly_review_time` columns in Supabase to enable
  // multi-device round-trip later.
  weeklyReviewDay?: number;    // 0 = Sunday ... 6 = Saturday (matches JS Date.getDay())
  weeklyReviewTime?: string;   // 'HH:MM' 24h
  /** User said "off record" — pause entity extraction until next app open */
  offRecordUntil?: string;     // ISO timestamp
}

/** Empty-state portrait — used for new accounts and after wipe */
export function makeEmptyPortrait(): Portrait {
  const empty: PortraitSection = { text: '', source: 'ai' };
  return {
    howYouWork:        { ...empty },
    whatYoureBuilding: { ...empty },
    whatGetsInTheWay:  { ...empty },
    whereYoureGoing:   { ...empty },
    whatIDontKnowYet:  {
      text: "I don't know you yet. We've only just started talking. Give it a few days — I'll pay attention.",
      source: 'ai',
    },
  };
}

export type PortraitSectionKey = keyof Omit<Portrait, 'lastAnyUpdate'>;

// ── State Interface ───────────────────────────────────────────────────────────

interface SolasState {
  session:    Session | null;
  setSession: (s: Session | null) => void;
  signOut:    () => Promise<void>;

  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;

  // NOTE: add* actions accept Omit<…, 'id' | 'origin'>-style inputs. When
  // `origin` is not provided we default to 'user_created' — the right answer
  // 99% of the time. The background entity extractor (Phase 2) passes
  // `origin: 'inferred'` explicitly to tag proposals.

  areas: Area[];
  addArea: (area: Omit<Area, 'id' | 'origin'> & { origin?: EntityOrigin; confidence?: number }) => string;
  updateArea: (id: string, patch: Partial<Area>) => void;
  deleteArea: (id: string) => void;
  archiveArea: (id: string) => void;
  /** Promote an 'inferred' entity to 'confirmed' — used by the emergence UI */
  confirmArea: (id: string) => void;

  projects: Project[];
  addProject: (
    project: Omit<Project, 'id' | 'createdAt' | 'isDecomposed' | 'tasks' | 'milestones' | 'origin'>
      & { origin?: EntityOrigin; confidence?: number }
  ) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleProjectTask: (projectId: string, taskId: string) => void;
  setProjectTasks: (projectId: string, tasks: ProjectTask[]) => void;
  confirmProject: (id: string) => void;

  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'origin'> & { origin?: EntityOrigin; confidence?: number }) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  setMIT: (id: string, isMIT: boolean) => void;
  dedupeTasks: () => number;
  todaysTasks: () => Task[];
  todaysMITs: () => Task[];
  updateTask: (id: string, patch: Partial<Task>) => void;
  scheduleTaskToDate: (id: string, date: string) => void;
  setPriority: (id: string, priority: 'high' | 'medium' | 'low') => void;
  confirmTask: (id: string) => void;

  todos: Task[];
  addTodo: (todo: Omit<Task, 'id' | 'origin'> & { origin?: EntityOrigin; confidence?: number }) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setTopPriority: (id: string, isTop: boolean) => void;
  todaysTodos: () => Task[];

  habits: Habit[];
  addHabit: (habit: Omit<Habit, 'id' | 'completedDates'>) => void;
  toggleHabitToday: (id: string) => void;
  deleteHabit: (id: string) => void;

  goals: LifeGoal[];
  addGoal: (
    goal: Omit<LifeGoal, 'id' | 'createdAt' | 'origin'>
      & { origin?: EntityOrigin; confidence?: number }
  ) => void;
  updateGoal: (id: string, patch: Partial<LifeGoal>) => void;
  deleteGoal: (id: string) => void;
  confirmGoal: (id: string) => void;

  dailyLogs: DailyLog[];
  todayLog: () => DailyLog;
  updateTodayLog: (patch: Partial<DailyLog>) => void;

  /**
   * Chat sessions keyed by `${mode}:${windowKey}` — one conversation per
   * (mode, time-window). Lets users resume a mid-chat after an interruption
   * instead of starting over. See src/lib/chatSessionKey.ts.
   */
  chatSessions: Record<string, ChatMessage[]>;
  getChatSession: (key: string) => ChatMessage[];
  setChatSession: (key: string, messages: ChatMessage[]) => void;
  appendChatSessionMessage: (key: string, msg: ChatMessage) => void;
  clearChatSession: (key: string) => void;

  /**
   * Lightweight session history — every app-open/surface-switch appends one
   * record. UIStateClassifier (Phase 4) reads the last ~20 events to infer
   * whether the user is exploring, narrowing, or in a held state. We keep
   * this bounded at 200 events; older events are trimmed silently.
   */
  sessionLog: SessionEvent[];
  logSession: (evt: Omit<SessionEvent, 'at'> & { at?: string }) => void;
  recentSessions: (limit?: number) => SessionEvent[];

  deepWorkSessions: DeepWorkSession[];
  addDeepWorkSession: (s: Omit<DeepWorkSession, 'id'>) => void;
  updateDeepWorkSession: (id: string, patch: Partial<DeepWorkSession>) => void;

  setWeekTemplate: (blocks: TimeBlock[]) => void;
  /** Replace the entire structured portrait (e.g. after an AI refresh) */
  setPortrait: (portrait: Portrait) => void;
  /** Patch a single section — used by inline edit on the You screen */
  updatePortraitSection: (
    key: PortraitSectionKey,
    patch: Partial<PortraitSection>,
  ) => void;
  touchLastActive: () => void;
  /** Mark "off record" window — extractor pauses until then */
  setOffRecord: (minutes: number) => void;

  /** Today's AI-generated day plan (reactive calendar) */
  dayPlan?: DayPlan;
  saveDayPlan: (plan: DayPlan) => void;
  togglePlannedTask: (slotTime: string, taskId: string) => void;

  /** Last time we reconciled/wrote the day plan to the iOS calendar (epoch ms) */
  lastCalendarSync?: number;
  markCalendarSynced: () => void;

  /** Single-task focus mode — when set, dashboard locks onto this task only */
  focusTaskId?: string | null;
  setFocusTask: (taskId: string | null) => void;

  appTheme: import('../theme/themes').ThemeName;
  setTheme: (theme: import('../theme/themes').ThemeName) => void;

  wipeAllData: () => Promise<void>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultProfile: UserProfile = {
  name: '',
  phone: '',
  morningTime: '07:30',
  eveningTime: '21:00',
  selectedDomains: ['work', 'health', 'relationships', 'personal', 'learning'],
  anthropicKey: '',
  openAiKey: '',
  backendUrl: '',
  deepWorkBlockLength: 60,
  deepWorkBlocksPerWeek: 2,
  weekTemplate: [],
  skeletonBuilt: false,
  portrait: makeEmptyPortrait(),
};

const defaultHabits: Habit[] = [
  { id: 'a1b2c3d4-0001-4000-8000-000000000001', name: 'Morning light',     icon: '☀️', domain: 'health', completedDates: [], frequency: 'daily' },
  { id: 'a1b2c3d4-0002-4000-8000-000000000002', name: 'Exercise',          icon: '⚡', domain: 'health', completedDates: [], frequency: 'daily' },
  { id: 'a1b2c3d4-0003-4000-8000-000000000003', name: 'Deep work block',   icon: '🎯', domain: 'work',   completedDates: [], frequency: 'weekdays' },
  { id: 'a1b2c3d4-0004-4000-8000-000000000004', name: 'Wind-down by 10pm', icon: '🌙', domain: 'health', completedDates: [], frequency: 'daily' },
];

// ── Sync helper ───────────────────────────────────────────────────────────────
// Lazy-imports sync.ts and calls fn only when the user has a live session.
// Fire-and-forget: never blocks the UI, errors are logged not thrown.

function syncIfAuthed(fn: (sync: typeof import('../services/sync')) => Promise<unknown>, session: Session | null): void {
  if (!session) return;
  import('../services/sync').then(fn).catch(e => console.warn('[sync]', e));
}

// ── Store ─────────────────────────────────────────────────────────────────────

/** Generate a RFC-4122 v4 UUID — required by Supabase uuid columns */
const uid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const useStore = create<SolasState>()(
  persist(
    (set, get) => ({

      // ── Auth ──────────────────────────────────────────────────────────────────
      session: null,
      setSession: (session) => set({ session }),
      signOut: async () => {
        const { supabase } = await import('../lib/supabase');
        await supabase.auth.signOut();
        set({ session: null });
      },

      // ── Profile ───────────────────────────────────────────────────────────────
      profile: defaultProfile,
      updateProfile: (patch) => {
        // Compute merged profile once — use the same object for both the local
        // write and the sync call, avoiding the stale-closure bug where get()
        // after set() would re-apply the patch to an already-patched profile.
        const updated = { ...get().profile, ...patch };
        set({ profile: updated });
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      // ── Areas ─────────────────────────────────────────────────────────────────
      areas: [],
      addArea: (area) => {
        const origin: EntityOrigin = area.origin ?? 'user_created';
        // Strip the optional provenance keys off the caller payload so we can
        // re-merge them canonically — avoids TS's "duplicate property" rule
        // when the callsite already passed them.
        const { origin: _o, confidence: _c, ...rest } = area;
        const newArea: Area = {
          ...rest,
          id: uid(),
          origin,
          confidence: area.confidence,
          lastConfirmedAt: origin === 'user_created' ? new Date().toISOString() : undefined,
        };
        set((s) => ({ areas: [...s.areas, newArea] }));
        syncIfAuthed(s => s.pushArea(newArea), get().session);
        return newArea.id;
      },
      confirmArea: (id) => {
        set((s) => ({
          areas: s.areas.map(a => a.id === id
            ? { ...a, origin: 'confirmed' as EntityOrigin, lastConfirmedAt: new Date().toISOString() }
            : a),
        }));
        const updated = get().areas.find(a => a.id === id);
        if (updated) syncIfAuthed(s => s.pushArea(updated), get().session);
      },
      updateArea: (id, patch) => {
        set((s) => ({ areas: s.areas.map(a => a.id === id ? { ...a, ...patch } : a) }));
        const updated = get().areas.find(a => a.id === id);
        if (updated) syncIfAuthed(s => s.pushArea(updated), get().session);
      },
      deleteArea: (id) => {
        set((s) => ({ areas: s.areas.filter(a => a.id !== id) }));
        syncIfAuthed(s => s.deleteArea(id), get().session);
      },
      archiveArea: (id) => {
        set((s) => ({ areas: s.areas.map(a => a.id === id ? { ...a, isArchived: true, isActive: false } : a) }));
        const updated = get().areas.find(a => a.id === id);
        if (updated) syncIfAuthed(s => s.pushArea(updated), get().session);
      },

      // ── Projects ──────────────────────────────────────────────────────────────
      projects: [],
      addProject: (project) => {
        const origin: EntityOrigin = project.origin ?? 'user_created';
        const newProject: Project = {
          ...project,
          id: uid(),
          tasks: [],
          milestones: [],
          isDecomposed: false,
          createdAt: new Date().toISOString(),
          origin,
          confidence: project.confidence,
          lastConfirmedAt: origin === 'user_created' ? new Date().toISOString() : undefined,
        };
        set((s) => ({ projects: [...s.projects, newProject] }));
        syncIfAuthed(s => s.pushProject(newProject), get().session);
        return newProject.id;
      },
      confirmProject: (id) => {
        set((s) => ({
          projects: s.projects.map(p => p.id === id
            ? { ...p, origin: 'confirmed' as EntityOrigin, lastConfirmedAt: new Date().toISOString() }
            : p),
        }));
        const updated = get().projects.find(p => p.id === id);
        if (updated) syncIfAuthed(s => s.pushProject(updated), get().session);
      },
      updateProject: (id, patch) => {
        set((s) => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p) }));
        const updated = get().projects.find(p => p.id === id);
        if (updated) syncIfAuthed(s => s.pushProject(updated), get().session);
      },
      deleteProject: (id) => {
        set((s) => ({ projects: s.projects.filter(p => p.id !== id) }));
        syncIfAuthed(s => s.deleteProject(id), get().session);
      },
      toggleProjectTask: (projectId, taskId) => {
        set((s) => ({
          projects: s.projects.map(p => {
            if (p.id !== projectId) return p;
            return { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) };
          })
        }));
        const updated = get().projects.find(p => p.id === projectId);
        if (updated) syncIfAuthed(s => s.pushProject(updated), get().session);
      },
      setProjectTasks: (projectId, tasks) => {
        set((s) => ({
          projects: s.projects.map(p => p.id === projectId ? { ...p, tasks, isDecomposed: true } : p)
        }));
        const updated = get().projects.find(p => p.id === projectId);
        if (updated) syncIfAuthed(s => s.pushProject(updated), get().session);
      },

      // ── Tasks ─────────────────────────────────────────────────────────────────
      tasks: [],
      addTask: (task) => {
        // Deduplicate — skip if a non-completed task with the same text already exists
        const existing = get().tasks.find(
          t => !t.completed && t.text.trim().toLowerCase() === task.text.trim().toLowerCase()
        );
        if (existing) return;
        const origin: EntityOrigin = task.origin ?? 'user_created';
        const newTask: Task = {
          ...task,
          id: uid(),
          createdAt: new Date().toISOString(),
          origin,
          confidence: task.confidence,
          lastConfirmedAt: origin === 'user_created' ? new Date().toISOString() : undefined,
        };
        set((s) => ({ tasks: [...s.tasks, newTask] }));
        syncIfAuthed(s => s.pushTask(newTask), get().session);
        // If task has no paired reminder yet, create one in iOS Reminders (fire-and-forget)
        if (!newTask.reminderId) {
          import('../services/calendar')
            .then(cal => cal.createReminderForTask(newTask.id, newTask.text, newTask.date || undefined))
            .then(reminderId => {
              if (reminderId) {
                // Patch reminderId back onto the task quietly
                set(s => ({ tasks: s.tasks.map(t => t.id === newTask.id ? { ...t, reminderId } : t) }));
              }
            })
            .catch(() => {});
        }
      },
      toggleTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) {
          syncIfAuthed(s => s.pushTask(updated), get().session);
          // If completing the task and it has a paired iOS Reminder, mark it done too
          if (updated.completed && updated.reminderId) {
            import('../services/calendar')
              .then(cal => cal.completeReminder(updated.reminderId!))
              .catch(() => {});
          }

          // Auto-create next recurrence when completing a recurring task
          if (updated.completed && updated.recurrence && updated.date) {
            const baseDate = new Date(updated.date + 'T12:00:00');
            let nextDate: Date;
            const r = updated.recurrence;
            if (r === 'daily') {
              nextDate = addDays(baseDate, 1);
            } else if (r === 'weekly') {
              nextDate = addDays(baseDate, 7);
            } else if (r === 'weekdays') {
              // Skip to next weekday
              nextDate = addDays(baseDate, 1);
              while (isWeekend(nextDate)) nextDate = addDays(nextDate, 1);
            } else { // monthly
              // Use date-fns addMonths so Jan 31 → Feb 28/29 (end-of-month clamp)
              // instead of the native Date rollover that lands on Mar 3.
              nextDate = addMonths(baseDate, 1);
            }
            const nextDateStr = format(nextDate, 'yyyy-MM-dd');
            const nextTask: Task = {
              ...updated,
              id: uid(),
              completed: false,
              date: nextDateStr,
              isToday: nextDateStr === format(new Date(), 'yyyy-MM-dd'),
              isInbox: false,
              createdAt: new Date().toISOString(),
              reminderId: undefined,
              isMIT: false,
            };
            set((s) => ({ tasks: [...s.tasks, nextTask] }));
            syncIfAuthed(s => s.pushTask(nextTask), get().session);
          }
        }
      },
      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) }));
        syncIfAuthed(s => s.deleteTask(id), get().session);
      },
      /**
       * Catch-all duplicate cleanup. Merges duplicate non-completed tasks by
       * normalised text (trim + lowercase). Prefers the task with a reminderId,
       * then the earliest createdAt, then the first occurrence. Silently
       * deletes the losers locally and (best-effort) in Supabase.
       *
       * Why: iOS Reminders can appear in multiple calendars (local + iCloud),
       * and pullAll round-trips strip reminderId (no column in Supabase).
       * Addtask's per-call dedup protects single sessions, but races between
       * pullAll and syncRemindersToTasks can still slip duplicates through.
       * Run this on app start and after any bulk import.
       */
      dedupeTasks: () => {
        const all = get().tasks;
        // Sort by preference: reminderId first, then earliest createdAt
        const sorted = [...all].sort((a, b) => {
          const aHasRem = !!a.reminderId ? 0 : 1;
          const bHasRem = !!b.reminderId ? 0 : 1;
          if (aHasRem !== bHasRem) return aHasRem - bHasRem;
          return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
        });

        const seen = new Set<string>();
        const idsToDelete: string[] = [];
        for (const t of sorted) {
          if (t.completed) continue;
          const key = t.text.trim().toLowerCase();
          if (!key) continue;
          if (seen.has(key)) {
            idsToDelete.push(t.id);
          } else {
            seen.add(key);
          }
        }

        if (!idsToDelete.length) return 0;
        const toDeleteSet = new Set(idsToDelete);
        console.log(`[store] dedupeTasks: removing ${idsToDelete.length} duplicate task(s)`);
        set((s) => ({ tasks: s.tasks.filter(t => !toDeleteSet.has(t.id)) }));
        const session = get().session;
        idsToDelete.forEach(id => {
          syncIfAuthed(s => s.deleteTask(id), session);
        });
        return idsToDelete.length;
      },
      setMIT: (id, isMIT) => {
        // Only count today's MITs — tasks from previous days shouldn't block today's limit
        const today = format(new Date(), 'yyyy-MM-dd');
        const mits = get().tasks.filter(t => t.isMIT && t.id !== id && t.date === today);
        if (isMIT && mits.length >= 3) return;
        set((s) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, isMIT } : t) }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },
      todaysTasks: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().tasks.filter(t => t.date === today);
      },
      todaysMITs: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().tasks.filter(t => t.date === today && t.isMIT);
      },
      updateTask: (id, patch) => {
        set((s) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },
      scheduleTaskToDate: (id, date) => {
        set((s) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, date, isInbox: false, isToday: date === format(new Date(), 'yyyy-MM-dd') } : t) }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },
      setPriority: (id, priority) => {
        set((s) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, priority } : t) }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },
      confirmTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map(t => t.id === id
            ? { ...t, origin: 'confirmed' as EntityOrigin, lastConfirmedAt: new Date().toISOString() }
            : t),
        }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },

      // Legacy aliases
      get todos() { return get().tasks; },
      addTodo: (todo) => get().addTask(todo),
      toggleTodo: (id) => get().toggleTask(id),
      deleteTodo: (id) => get().deleteTask(id),
      setTopPriority: (id, isTop) => get().setMIT(id, isTop),
      todaysTodos: () => get().todaysTasks(),

      // ── Habits ────────────────────────────────────────────────────────────────
      habits: defaultHabits,
      addHabit: (habit) => {
        const newHabit = { ...habit, id: uid(), completedDates: [] };
        set((s) => ({ habits: [...s.habits, newHabit] }));
        syncIfAuthed(s => s.pushHabit(newHabit), get().session);
      },
      toggleHabitToday: (id) => {
        const today = format(new Date(), 'yyyy-MM-dd');
        // Keep only the last 90 days to prevent unbounded AsyncStorage growth
        const cutoff = format(new Date(Date.now() - 90 * 86400000), 'yyyy-MM-dd');
        set((s) => ({
          habits: s.habits.map(h => {
            if (h.id !== id) return h;
            const done = h.completedDates.includes(today);
            const updated = done
              ? h.completedDates.filter(d => d !== today)
              : [...h.completedDates, today];
            return {
              ...h,
              completedDates: updated.filter(d => d >= cutoff),
            };
          })
        }));
        const updated = get().habits.find(h => h.id === id);
        if (updated) syncIfAuthed(s => s.pushHabit(updated), get().session);
      },
      deleteHabit: (id) => {
        set((s) => ({ habits: s.habits.filter(h => h.id !== id) }));
        syncIfAuthed(s => s.deleteHabit(id), get().session);
      },

      // ── Goals ─────────────────────────────────────────────────────────────────
      goals: [],
      addGoal: (goal) => {
        const origin: EntityOrigin = goal.origin ?? 'user_created';
        const newGoal: LifeGoal = {
          ...goal,
          id: uid(),
          createdAt: new Date().toISOString(),
          origin,
          confidence: goal.confidence,
          lastConfirmedAt: origin === 'user_created' ? new Date().toISOString() : undefined,
        };
        set((s) => ({ goals: [...s.goals, newGoal] }));
        syncIfAuthed(s => s.pushGoal(newGoal), get().session);
      },
      updateGoal: (id, patch) => {
        set((s) => ({ goals: s.goals.map(g => g.id === id ? { ...g, ...patch } : g) }));
        const updated = get().goals.find(g => g.id === id);
        if (updated) syncIfAuthed(s => s.pushGoal(updated), get().session);
      },
      deleteGoal: (id) => {
        set((s) => ({ goals: s.goals.filter(g => g.id !== id) }));
        syncIfAuthed(s => s.deleteGoal(id), get().session);
      },
      confirmGoal: (id) => {
        set((s) => ({
          goals: s.goals.map(g => g.id === id
            ? { ...g, origin: 'confirmed' as EntityOrigin, lastConfirmedAt: new Date().toISOString() }
            : g),
        }));
        const updated = get().goals.find(g => g.id === id);
        if (updated) syncIfAuthed(s => s.pushGoal(updated), get().session);
      },

      // ── Daily Logs ────────────────────────────────────────────────────────────
      dailyLogs: [],
      todayLog: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().dailyLogs.find(l => l.date === today) ?? {
          date: today, topPriorities: [], morningCompleted: false, eveningCompleted: false,
        };
      },
      updateTodayLog: (patch) => {
        const today  = format(new Date(), 'yyyy-MM-dd');
        // Keep only 90 days of logs — prevents unbounded AsyncStorage growth
        const cutoff = format(new Date(Date.now() - 90 * 86400000), 'yyyy-MM-dd');
        set((s) => {
          const trimmed = s.dailyLogs.filter(l => l.date >= cutoff);
          const existing = trimmed.find(l => l.date === today);
          if (existing) {
            return { dailyLogs: trimmed.map(l => l.date === today ? { ...l, ...patch } : l) };
          }
          return {
            dailyLogs: [...trimmed, {
              date: today, topPriorities: [], morningCompleted: false, eveningCompleted: false, ...patch,
            }]
          };
        });
      },

      // ── Chat Sessions (per-mode, per-window) ─────────────────────────────
      chatSessions: {},
      getChatSession: (key) => get().chatSessions[key] ?? [],
      setChatSession: (key, messages) => set((s) => ({
        chatSessions: { ...s.chatSessions, [key]: messages },
      })),
      appendChatSessionMessage: (key, msg) => set((s) => {
        const prev = s.chatSessions[key] ?? [];
        return { chatSessions: { ...s.chatSessions, [key]: [...prev, msg] } };
      }),
      clearChatSession: (key) => set((s) => {
        const next = { ...s.chatSessions };
        delete next[key];
        return { chatSessions: next };
      }),

      // ── Session Log ──────────────────────────────────────────────────────
      sessionLog: [],
      logSession: (evt) => set((s) => {
        const next: SessionEvent = {
          at: evt.at ?? new Date().toISOString(),
          kind: evt.kind,
          note: evt.note,
        };
        // Keep a rolling 200-event buffer — plenty for classifier lookback
        // without unbounded AsyncStorage growth.
        const trimmed = [...s.sessionLog, next].slice(-200);
        return { sessionLog: trimmed };
      }),
      recentSessions: (limit = 20) => {
        const log = get().sessionLog;
        return log.slice(-limit);
      },

      // ── Deep Work Sessions ────────────────────────────────────────────────────
      deepWorkSessions: [],
      addDeepWorkSession: (session) => {
        const newSession = { ...session, id: uid() };
        set((s) => ({ deepWorkSessions: [...s.deepWorkSessions, newSession] }));
        syncIfAuthed(s => s.pushDeepWorkSession(newSession), get().session);
      },
      updateDeepWorkSession: (id, patch) => {
        set((s) => ({
          deepWorkSessions: s.deepWorkSessions.map(s => s.id === id ? { ...s, ...patch } : s)
        }));
        const updated = get().deepWorkSessions.find(s => s.id === id);
        if (updated) syncIfAuthed(s => s.pushDeepWorkSession(updated), get().session);
      },

      // ── Portrait + lifecycle flags ───────────────────────────────────────
      setPortrait: (portrait) => {
        const withStamp: Portrait = {
          ...portrait,
          lastAnyUpdate: new Date().toISOString(),
        };
        const updated = { ...get().profile, portrait: withStamp };
        set({ profile: updated });
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      updatePortraitSection: (key, patch) => {
        const now = new Date().toISOString();
        const current = get().profile.portrait;
        const merged: Portrait = {
          ...current,
          [key]: {
            ...current[key],
            ...patch,
            lastUpdated: now,
          },
          lastAnyUpdate: now,
        };
        const updated = { ...get().profile, portrait: merged };
        set({ profile: updated });
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      touchLastActive: () => {
        const today   = new Date().toISOString().slice(0, 10);
        const patch: Partial<UserProfile> = { lastActiveDate: today };
        // Stamp firstOpenDate the first time we see an active day — this is
        // what the emergence-moment timer (Phase 5) will key off.
        if (!get().profile.firstOpenDate) patch.firstOpenDate = today;
        const updated = { ...get().profile, ...patch };
        set({ profile: updated });
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      setOffRecord: (minutes) => {
        const until = new Date(Date.now() + minutes * 60_000).toISOString();
        const updated = { ...get().profile, offRecordUntil: until };
        set({ profile: updated });
        // Intentionally NOT synced — "off record" is a privacy request and
        // we don't want the server tracking it either.
      },

      setWeekTemplate: (blocks) => {
        const updated = { ...get().profile, weekTemplate: blocks, skeletonBuilt: blocks.length > 0 };
        set({ profile: updated });
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      // ── Day Plan (reactive calendar) ─────────────────────────────────────────
      dayPlan: undefined,
      lastCalendarSync: undefined,

      markCalendarSynced: () => set({ lastCalendarSync: Date.now() }),

      focusTaskId: null,
      setFocusTask: (taskId: string | null) => set({ focusTaskId: taskId }),

      saveDayPlan: (plan: DayPlan) => set({ dayPlan: plan }),

      togglePlannedTask: (slotTime: string, taskId: string) =>
        set((s) => {
          if (!s.dayPlan) return s;
          return {
            dayPlan: {
              ...s.dayPlan,
              slots: s.dayPlan.slots.map(slot =>
                slot.time !== slotTime ? slot : {
                  ...slot,
                  tasks: slot.tasks.map(t =>
                    t.id !== taskId ? t : { ...t, done: !t.done }
                  ),
                }
              ),
            },
          };
        }),

      // ── App Theme ────────────────────────────────────────────────────────────
      appTheme: 'forest',
      setTheme: (theme) => set({ appTheme: theme }),

      // ── Dev / Reset ───────────────────────────────────────────────────────────
      wipeAllData: async () => {
        // Delete from Supabase first (best-effort — don't block if offline)
        try {
          const { deleteAllUserData } = await import('../services/sync');
          await deleteAllUserData();
        } catch (e) {
          console.warn('[store] Supabase delete failed (continuing with local wipe):', e);
        }
        // Then wipe local storage
        await AsyncStorage.removeItem('synapse-v2-storage');
        set({
          profile:           defaultProfile,
          areas:             [],
          projects:          [],
          tasks:             [],
          habits:            defaultHabits,
          goals:             [],
          dailyLogs:         [],
          deepWorkSessions:  [],
          chatSessions:      {},
          sessionLog:        [],
        } as any);
      },
    }),
    {
      name: 'synapse-v2-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Deep-merge profile so new fields (e.g. anthropicKey) always have their
      // default values for existing users whose stored state predates the field.
      //
      // Portrait went from `string` to `Portrait` object in Phase 1. We coerce
      // any legacy string payload into the new shape so stale persisted state
      // doesn't crash the app on first launch after the upgrade.
      merge: (persistedState: unknown, currentState: SolasState): SolasState => {
        const persisted = persistedState as Partial<SolasState>;
        const storedProfile = (persisted.profile ?? {}) as any;
        const portrait: Portrait =
          storedProfile.portrait && typeof storedProfile.portrait === 'object'
            ? { ...makeEmptyPortrait(), ...storedProfile.portrait }
            : makeEmptyPortrait();
        return {
          ...currentState,
          ...persisted,
          profile: {
            ...currentState.profile,        // defaults first (includes anthropicKey: '')
            ...storedProfile,               // stored values on top
            portrait,                       // coerced to structured shape
          },
        };
      },
    }
  )
);
