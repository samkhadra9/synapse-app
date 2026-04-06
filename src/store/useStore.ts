/**
 * Synapse V2 — Global State (Zustand + AsyncStorage)
 *
 * Every mutation that writes local state also fires a Supabase push
 * (fire-and-forget, only when a session is active).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
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

export interface Area {
  id: string;
  name: string;
  domain: DomainKey;
  description: string;
  isActive: boolean;
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

export interface Project {
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

export interface Task {
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

export interface LifeGoal {
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
  eveningNote?: string;
  morningCompleted: boolean;
  eveningCompleted: boolean;
}

export interface UserProfile {
  name: string;
  phone: string;
  morningTime: string;
  eveningTime: string;
  selectedDomains: DomainKey[];
  onboardingCompleted: boolean;
  openAiKey: string;
  backendUrl: string;
  onboardingStep: 'welcome' | 'chat' | 'done';
  conversationHistory: ChatMessage[];
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
  systemPhase: 1 | 2 | 3;
  weekTemplate: TimeBlock[];
  skeletonBuilt: boolean;
  portrait: string;       // evolving AI-written summary of who this person is
  lastActiveDate?: string; // YYYY-MM-DD — used for lapse detection
}

// ── State Interface ───────────────────────────────────────────────────────────

interface SynapseState {
  session:    Session | null;
  setSession: (s: Session | null) => void;
  signOut:    () => Promise<void>;

  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;

  areas: Area[];
  addArea: (area: Omit<Area, 'id'>) => void;
  updateArea: (id: string, patch: Partial<Area>) => void;
  deleteArea: (id: string) => void;

  projects: Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'isDecomposed' | 'tasks' | 'milestones'>) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleProjectTask: (projectId: string, taskId: string) => void;
  setProjectTasks: (projectId: string, tasks: ProjectTask[]) => void;

  tasks: Task[];
  addTask: (task: Omit<Task, 'id'>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  setMIT: (id: string, isMIT: boolean) => void;
  todaysTasks: () => Task[];
  todaysMITs: () => Task[];

  todos: Task[];
  addTodo: (todo: Omit<Task, 'id'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setTopPriority: (id: string, isTop: boolean) => void;
  todaysTodos: () => Task[];

  habits: Habit[];
  addHabit: (habit: Omit<Habit, 'id' | 'completedDates'>) => void;
  toggleHabitToday: (id: string) => void;
  deleteHabit: (id: string) => void;

  goals: LifeGoal[];
  addGoal: (goal: Omit<LifeGoal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, patch: Partial<LifeGoal>) => void;
  deleteGoal: (id: string) => void;

  dailyLogs: DailyLog[];
  todayLog: () => DailyLog;
  updateTodayLog: (patch: Partial<DailyLog>) => void;

  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearConversation: () => void;

  deepWorkSessions: DeepWorkSession[];
  addDeepWorkSession: (s: Omit<DeepWorkSession, 'id'>) => void;
  updateDeepWorkSession: (id: string, patch: Partial<DeepWorkSession>) => void;

  setWeekTemplate: (blocks: TimeBlock[]) => void;
  setPortrait: (portrait: string) => void;
  touchLastActive: () => void;

  resetOnboarding: () => void;
  wipeAllData: () => Promise<void>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultProfile: UserProfile = {
  name: '',
  phone: '',
  morningTime: '07:30',
  eveningTime: '21:00',
  selectedDomains: ['work', 'health', 'relationships', 'personal', 'learning'],
  onboardingCompleted: false,
  openAiKey: '',
  backendUrl: '',
  onboardingStep: 'welcome',
  conversationHistory: [],
  deepWorkBlockLength: 60,
  deepWorkBlocksPerWeek: 2,
  systemPhase: 1,
  weekTemplate: [],
  skeletonBuilt: false,
  portrait: '',
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

export const useStore = create<SynapseState>()(
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
        set((s) => ({ profile: { ...s.profile, ...patch } }));
        const updated = { ...get().profile, ...patch };
        syncIfAuthed(s => s.pushProfile(updated), get().session);
      },

      // ── Areas ─────────────────────────────────────────────────────────────────
      areas: [],
      addArea: (area) => {
        const newArea = { ...area, id: uid() };
        set((s) => ({ areas: [...s.areas, newArea] }));
        syncIfAuthed(s => s.pushArea(newArea), get().session);
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

      // ── Projects ──────────────────────────────────────────────────────────────
      projects: [],
      addProject: (project) => {
        const newProject: Project = {
          ...project,
          id: uid(),
          tasks: [],
          milestones: [],
          isDecomposed: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ projects: [...s.projects, newProject] }));
        syncIfAuthed(s => s.pushProject(newProject), get().session);
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
        const newTask = { ...task, id: uid() };
        set((s) => ({ tasks: [...s.tasks, newTask] }));
        syncIfAuthed(s => s.pushTask(newTask), get().session);
      },
      toggleTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) syncIfAuthed(s => s.pushTask(updated), get().session);
      },
      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) }));
        syncIfAuthed(s => s.deleteTask(id), get().session);
      },
      setMIT: (id, isMIT) => {
        const mits = get().tasks.filter(t => t.isMIT && t.id !== id);
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
        set((s) => ({
          habits: s.habits.map(h => {
            if (h.id !== id) return h;
            const done = h.completedDates.includes(today);
            return {
              ...h,
              completedDates: done
                ? h.completedDates.filter(d => d !== today)
                : [...h.completedDates, today],
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
        const newGoal = { ...goal, id: uid(), createdAt: new Date().toISOString() };
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

      // ── Daily Logs ────────────────────────────────────────────────────────────
      dailyLogs: [],
      todayLog: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().dailyLogs.find(l => l.date === today) ?? {
          date: today, topPriorities: [], morningCompleted: false, eveningCompleted: false,
        };
      },
      updateTodayLog: (patch) => {
        const today = format(new Date(), 'yyyy-MM-dd');
        set((s) => {
          const existing = s.dailyLogs.find(l => l.date === today);
          if (existing) {
            return { dailyLogs: s.dailyLogs.map(l => l.date === today ? { ...l, ...patch } : l) };
          }
          return {
            dailyLogs: [...s.dailyLogs, {
              date: today, topPriorities: [], morningCompleted: false, eveningCompleted: false, ...patch,
            }]
          };
        });
      },

      // ── Conversation ──────────────────────────────────────────────────────────
      addChatMessage: (msg) => set((s) => ({
        profile: {
          ...s.profile,
          conversationHistory: [
            ...s.profile.conversationHistory,
            { ...msg, id: uid(), timestamp: new Date().toISOString() }
          ]
        }
      })),
      clearConversation: () => set((s) => ({
        profile: { ...s.profile, conversationHistory: [] }
      })),

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

      // ── Week Template ─────────────────────────────────────────────────────────
      setPortrait: (portrait) => {
        set((s) => ({ profile: { ...s.profile, portrait } }));
      },

      touchLastActive: () => {
        const today = new Date().toISOString().slice(0, 10);
        set((s) => ({ profile: { ...s.profile, lastActiveDate: today } }));
      },

      setWeekTemplate: (blocks) => {
        set((s) => ({
          profile: { ...s.profile, weekTemplate: blocks, skeletonBuilt: blocks.length > 0 }
        }));
      },

      // ── Dev / Reset ───────────────────────────────────────────────────────────
      resetOnboarding: () => set((s) => ({
        profile: { ...s.profile, onboardingCompleted: false, onboardingStep: 'welcome', conversationHistory: [] }
      })),

      wipeAllData: async () => {
        await AsyncStorage.removeItem('synapse-v2-storage');
        set({
          profile:           defaultProfile,
          areas:             [],
          projects:          [],
          tasks:             [],
          todos:             [],
          habits:            defaultHabits,
          goals:             [],
          dailyLogs:         [],
          deepWorkSessions:  [],
        } as any);
      },
    }),
    {
      name: 'synapse-v2-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
