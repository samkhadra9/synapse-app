/**
 * Synapse — Supabase sync service
 *
 * Strategy: "last write wins" on user-owned data.
 * All tables have RLS so users only ever read their own rows.
 *
 * Each entity is upserted as a whole row (JSONB fields included).
 * Pull replaces local state wholesale — Supabase is the source of truth
 * once the user is authenticated.
 *
 * Call order on app start:
 *   1. pullAll()     — hydrate local store from Supabase
 *   2. After any mutation: pushXxx(entity)
 *
 * On first signup the DB is empty so pullAll() is a no-op and the
 * onboarding output is pushed on completion.
 */

import { supabase } from '../lib/supabase';
import type {
  Area,
  Project,
  Task,
  Habit,
  LifeGoal,
  UserProfile,
  DeepWorkSession,
} from '../store/useStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ── Profile ───────────────────────────────────────────────────────────────────

/** Push local profile to Supabase profiles table */
export async function pushProfile(profile: UserProfile): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('profiles').upsert({
    id:                      uid,
    name:                    profile.name,
    morning_time:            profile.morningTime,
    evening_time:            profile.eveningTime,
    selected_domains:        profile.selectedDomains,
    onboarding_completed:    profile.onboardingCompleted,
    onboarding_step:         profile.onboardingStep,
    deep_work_block_length:  profile.deepWorkBlockLength,
    deep_work_blocks_per_week: profile.deepWorkBlocksPerWeek,
    system_phase:            profile.systemPhase,
    routines:                profile.routines ?? null,
    synapse_calendar_id:     profile.synapseCalendarId ?? null,
    updated_at:              new Date().toISOString(),
  });
  if (error) console.error('[sync] pushProfile:', error.message);
}

/** Pull profile from Supabase and return patch for local store */
export async function pullProfile(): Promise<Partial<UserProfile> | null> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();

  if (error || !data) return null;

  return {
    name:                   data.name          ?? '',
    morningTime:            data.morning_time  ?? '07:30',
    eveningTime:            data.evening_time  ?? '21:00',
    selectedDomains:        data.selected_domains ?? [],
    onboardingCompleted:    data.onboarding_completed ?? false,
    onboardingStep:         data.onboarding_step ?? 'welcome',
    deepWorkBlockLength:    data.deep_work_block_length ?? 60,
    deepWorkBlocksPerWeek:  data.deep_work_blocks_per_week ?? 2,
    systemPhase:            data.system_phase  ?? 1,
    routines:               data.routines      ?? undefined,
    synapseCalendarId:      data.synapse_calendar_id ?? undefined,
  };
}

// ── Areas ─────────────────────────────────────────────────────────────────────

export async function pushArea(area: Area): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('areas').upsert({
    id:          area.id,
    user_id:     uid,
    domain:      area.domain,
    name:        area.name,
    description: area.description,
    is_active:   area.isActive,
  });
  if (error) console.error('[sync] pushArea:', error.message);
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase.from('areas').delete().eq('id', id);
  if (error) console.error('[sync] deleteArea:', error.message);
}

export async function pullAreas(): Promise<Area[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('user_id', uid);
  if (error || !data) return [];
  return data.map(r => ({
    id:          r.id,
    domain:      r.domain,
    name:        r.name,
    description: r.description ?? '',
    isActive:    r.is_active ?? true,
  }));
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function pushProject(project: Project): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('projects').upsert({
    id:               project.id,
    user_id:          uid,
    area_id:          project.areaId ?? null,
    domain:           project.domain,
    title:            project.title,
    description:      project.description,
    deadline:         project.deadline ?? null,
    tasks:            project.tasks,
    milestones:       project.milestones,
    status:           project.status,
    is_decomposed:    project.isDecomposed,
    calendar_event_id: project.calendarEventId ?? null,
  });
  if (error) console.error('[sync] pushProject:', error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) console.error('[sync] deleteProject:', error.message);
}

export async function pullProjects(): Promise<Project[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', uid);
  if (error || !data) return [];
  return data.map(r => ({
    id:              r.id,
    areaId:          r.area_id ?? undefined,
    domain:          r.domain,
    title:           r.title,
    description:     r.description ?? '',
    deadline:        r.deadline ?? undefined,
    tasks:           r.tasks ?? [],
    milestones:      r.milestones ?? [],
    status:          r.status ?? 'active',
    isDecomposed:    r.is_decomposed ?? false,
    createdAt:       r.created_at,
    calendarEventId: r.calendar_event_id ?? undefined,
  }));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function pushTask(task: Task): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('tasks').upsert({
    id:                 task.id,
    user_id:            uid,
    project_id:         task.projectId ?? null,
    domain:             task.domain ?? null,
    text:               task.text,
    completed:          task.completed,
    date:               task.date,
    is_today:           task.isToday,
    is_mit:             task.isMIT,
    estimated_minutes:  task.estimatedMinutes ?? null,
    priority:           task.priority,
  });
  if (error) console.error('[sync] pushTask:', error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) console.error('[sync] deleteTask:', error.message);
}

export async function pullTasks(): Promise<Task[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map(r => ({
    id:                r.id,
    projectId:         r.project_id ?? undefined,
    domain:            r.domain ?? undefined,
    text:              r.text,
    completed:         r.completed,
    date:              r.date,
    isToday:           r.is_today,
    isMIT:             r.is_mit,
    estimatedMinutes:  r.estimated_minutes ?? undefined,
    priority:          r.priority ?? 'medium',
  }));
}

// ── Habits ────────────────────────────────────────────────────────────────────

export async function pushHabit(habit: Habit): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('habits').upsert({
    id:                habit.id,
    user_id:           uid,
    name:              habit.name,
    icon:              habit.icon,
    domain:            habit.domain,
    completed_dates:   habit.completedDates,
    frequency:         habit.frequency,
    notification_time: habit.notificationTime ?? null,
  });
  if (error) console.error('[sync] pushHabit:', error.message);
}

export async function deleteHabit(id: string): Promise<void> {
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) console.error('[sync] deleteHabit:', error.message);
}

export async function pullHabits(): Promise<Habit[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', uid);
  if (error || !data) return [];
  return data.map(r => ({
    id:               r.id,
    name:             r.name,
    icon:             r.icon ?? '⚡',
    domain:           r.domain,
    completedDates:   r.completed_dates ?? [],
    frequency:        r.frequency ?? 'daily',
    notificationTime: r.notification_time ?? undefined,
  }));
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function pushGoal(goal: LifeGoal): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('goals').upsert({
    id:         goal.id,
    user_id:    uid,
    domain:     goal.domain,
    horizon:    goal.horizon,
    text:       goal.text,
    milestones: goal.milestones,
  });
  if (error) console.error('[sync] pushGoal:', error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) console.error('[sync] deleteGoal:', error.message);
}

export async function pullGoals(): Promise<LifeGoal[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', uid);
  if (error || !data) return [];
  return data.map(r => ({
    id:         r.id,
    domain:     r.domain,
    horizon:    r.horizon,
    text:       r.text,
    milestones: r.milestones ?? [],
    createdAt:  r.created_at,
  }));
}

// ── Deep Work Sessions ────────────────────────────────────────────────────────

export async function pushDeepWorkSession(session: DeepWorkSession): Promise<void> {
  const uid = await getUserId();
  const { error } = await supabase.from('deep_work_sessions').upsert({
    id:               session.id,
    user_id:          uid,
    started_at:       session.startedAt,
    ended_at:         session.endedAt ?? null,
    duration_minutes: session.durationMinutes,
    goal:             session.goal,
    artifact:         session.artifact ?? null,
    next_action:      session.nextAction ?? null,
    interruptions:    session.interruptions,
    completed:        session.completed,
  });
  if (error) console.error('[sync] pushDeepWorkSession:', error.message);
}

export async function pullDeepWorkSessions(): Promise<DeepWorkSession[]> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from('deep_work_sessions')
    .select('*')
    .eq('user_id', uid)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data.map(r => ({
    id:              r.id,
    startedAt:       r.started_at,
    endedAt:         r.ended_at ?? undefined,
    durationMinutes: r.duration_minutes,
    goal:            r.goal,
    artifact:        r.artifact ?? undefined,
    nextAction:      r.next_action ?? undefined,
    interruptions:   r.interruptions,
    completed:       r.completed,
  }));
}

// ── Pull All (hydrate on login) ───────────────────────────────────────────────

export interface PullResult {
  profile:          Partial<UserProfile> | null;
  areas:            Area[];
  projects:         Project[];
  tasks:            Task[];
  habits:           Habit[];
  goals:            LifeGoal[];
  deepWorkSessions: DeepWorkSession[];
}

/**
 * Pull all user data from Supabase in parallel.
 * Returns empty arrays if no data exists yet (new user).
 */
export async function pullAll(): Promise<PullResult> {
  const [profile, areas, projects, tasks, habits, goals, deepWorkSessions] =
    await Promise.all([
      pullProfile(),
      pullAreas(),
      pullProjects(),
      pullTasks(),
      pullHabits(),
      pullGoals(),
      pullDeepWorkSessions(),
    ]);

  return { profile, areas, projects, tasks, habits, goals, deepWorkSessions };
}

// ── Push All (full upload — use sparingly, e.g. after onboarding) ─────────────

export async function pushAll(store: {
  profile:          UserProfile;
  areas:            Area[];
  projects:         Project[];
  tasks:            Task[];
  habits:           Habit[];
  goals:            LifeGoal[];
  deepWorkSessions: DeepWorkSession[];
}): Promise<void> {
  await pushProfile(store.profile);
  await Promise.all([
    ...store.areas.map(pushArea),
    ...store.projects.map(pushProject),
    ...store.tasks.map(pushTask),
    ...store.habits.map(pushHabit),
    ...store.goals.map(pushGoal),
    ...store.deepWorkSessions.map(pushDeepWorkSession),
  ]);
}
