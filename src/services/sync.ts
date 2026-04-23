/**
 * Solas — Supabase sync service
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

/** Returns true only for RFC-4122 UUID strings — what Supabase uuid columns require */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Returns the string if it looks like a yyyy-MM-dd date, otherwise null */
function sanitiseDate(d?: string): string | null {
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Inferred entities (proposed by the background extractor but not yet
 * confirmed) are LOCAL-ONLY until the user accepts them. We don't want
 * the server filling up with every noun the extractor hallucinates out
 * of a chat, so skip sync for origin === 'inferred'. Once confirmed,
 * the entity's origin flips to 'confirmed' and the next pushX() call
 * writes it up normally.
 */
function isLocalOnly(entity: { origin?: string }): boolean {
  return entity.origin === 'inferred';
}

// ── Profile ───────────────────────────────────────────────────────────────────

/** Push local profile to Supabase profiles table */
export async function pushProfile(profile: UserProfile): Promise<void> {
  const uid = await getUserId();
  // Portrait is a structured object locally — serialise to JSON for the
  // existing text/jsonb column. Keep the legacy onboarding_* columns fed
  // with safe defaults so older rows don't break (server schema change
  // can come later).
  const { error } = await supabase.from('profiles').upsert({
    id:                        uid,
    name:                      profile.name,
    morning_time:              profile.morningTime,
    evening_time:              profile.eveningTime,
    selected_domains:          profile.selectedDomains,
    onboarding_completed:      true,        // legacy column — always true post-rebuild
    onboarding_step:           'done',      // legacy column — hard-coded
    deep_work_block_length:    profile.deepWorkBlockLength,
    deep_work_blocks_per_week: profile.deepWorkBlocksPerWeek,
    system_phase:              3,           // legacy column — peg to last phase
    routines:                  profile.routines ?? null,
    synapse_calendar_id:       profile.synapseCalendarId ?? null,
    selected_calendar_name:    profile.selectedCalendarName ?? null,
    week_template:             profile.weekTemplate ?? [],
    skeleton_built:            profile.skeletonBuilt,
    portrait:                  profile.portrait ? JSON.stringify(profile.portrait) : null,
    last_active_date:          profile.lastActiveDate ?? null,
    updated_at:                new Date().toISOString(),
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

  // Portrait may be stored as JSON string (post-rebuild) or as legacy plain
  // text (pre-rebuild). We try to parse; if it fails, drop the legacy string
  // and let the store's makeEmptyPortrait() take over.
  let portrait: UserProfile['portrait'] | undefined;
  if (data.portrait && typeof data.portrait === 'string') {
    try {
      const parsed = JSON.parse(data.portrait);
      if (parsed && typeof parsed === 'object') portrait = parsed;
    } catch {
      // legacy string — ignore; merge() in useStore will fall back to empty
      portrait = undefined;
    }
  } else if (data.portrait && typeof data.portrait === 'object') {
    portrait = data.portrait;
  }

  return {
    name:                   data.name           ?? '',
    morningTime:            data.morning_time   ?? '07:30',
    eveningTime:            data.evening_time   ?? '21:00',
    selectedDomains:        data.selected_domains ?? [],
    deepWorkBlockLength:    data.deep_work_block_length ?? 60,
    deepWorkBlocksPerWeek:  data.deep_work_blocks_per_week ?? 2,
    routines:               data.routines       ?? undefined,
    synapseCalendarId:      data.synapse_calendar_id    ?? undefined,
    selectedCalendarName:   data.selected_calendar_name ?? undefined,
    weekTemplate:           data.week_template  ?? [],
    skeletonBuilt:          data.skeleton_built ?? false,
    portrait:               portrait,
    lastActiveDate:         data.last_active_date ?? undefined,
  };
}

// ── Areas ─────────────────────────────────────────────────────────────────────

export async function pushArea(area: Area): Promise<void> {
  if (isLocalOnly(area)) return;
  if (!isValidUUID(area.id)) { console.warn('[sync] skipping area with non-UUID id:', area.id); return; }
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
    // Anything that round-tripped through the server is treated as a real,
    // user-owned record — no server column for origin yet.
    origin:      'user_created' as const,
  }));
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function pushProject(project: Project): Promise<void> {
  if (isLocalOnly(project)) return;
  if (!isValidUUID(project.id)) { console.warn('[sync] skipping project with non-UUID id:', project.id); return; }
  const uid = await getUserId();
  const { error } = await supabase.from('projects').upsert({
    id:               project.id,
    user_id:          uid,
    area_id:          project.areaId ?? null,
    domain:           project.domain,
    title:            project.title,
    description:      project.description,
    deadline:         sanitiseDate(project.deadline),
    tasks:            project.tasks,
    milestones:       project.milestones,
    status:           project.status,
    is_decomposed:    project.isDecomposed,
    calendar_event_id: project.calendarEventId ?? null,
    created_at:       project.createdAt ?? new Date().toISOString(),
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
    origin:          'user_created' as const,
  }));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function pushTask(task: Task): Promise<void> {
  if (isLocalOnly(task)) return;
  if (!isValidUUID(task.id)) { console.warn('[sync] skipping task with non-UUID id:', task.id); return; }
  const uid = await getUserId();
  const { error } = await supabase.from('tasks').upsert({
    id:                 task.id,
    user_id:            uid,
    project_id:         task.projectId ?? null,
    area_id:            task.areaId    ?? null,
    domain:             task.domain    ?? null,
    text:               task.text,
    completed:          task.completed,
    date:               task.date,
    is_today:           task.isToday,
    is_mit:             task.isMIT,
    is_inbox:           task.isInbox   ?? false,
    estimated_minutes:  task.estimatedMinutes ?? null,
    priority:           task.priority,
    reason:             task.reason    ?? null,
    created_at:         task.createdAt ?? new Date().toISOString(),
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
    projectId:         r.project_id        ?? undefined,
    areaId:            r.area_id           ?? undefined,
    domain:            r.domain            ?? undefined,
    text:              r.text,
    completed:         r.completed,
    date:              r.date,
    isToday:           r.is_today,
    isMIT:             r.is_mit,
    isInbox:           r.is_inbox          ?? false,
    estimatedMinutes:  r.estimated_minutes  ?? undefined,
    priority:          r.priority           ?? 'medium',
    reason:            r.reason             ?? undefined,
    createdAt:         r.created_at         ?? undefined,
    origin:            'user_created' as const,
  }));
}

// ── Habits ────────────────────────────────────────────────────────────────────

export async function pushHabit(habit: Habit): Promise<void> {
  if (!isValidUUID(habit.id)) { console.warn('[sync] skipping habit with non-UUID id:', habit.id); return; }
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
  if (isLocalOnly(goal)) return;
  if (!isValidUUID(goal.id)) { console.warn('[sync] skipping goal with non-UUID id:', goal.id); return; }
  const uid = await getUserId();
  const { error } = await supabase.from('goals').upsert({
    id:         goal.id,
    user_id:    uid,
    domain:     goal.domain,
    horizon:    goal.horizon,
    text:       goal.text,
    milestones: goal.milestones,
    created_at: goal.createdAt ?? new Date().toISOString(),
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
    origin:     'user_created' as const,
  }));
}

// ── Deep Work Sessions ────────────────────────────────────────────────────────

export async function pushDeepWorkSession(session: DeepWorkSession): Promise<void> {
  if (!isValidUUID(session.id)) { console.warn('[sync] skipping session with non-UUID id:', session.id); return; }
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
  try {
    await Promise.all([
      ...store.areas.map(pushArea),
      ...store.projects.map(pushProject),
      ...store.tasks.map(pushTask),
      ...store.habits.map(pushHabit),
      ...store.goals.map(pushGoal),
      ...store.deepWorkSessions.map(pushDeepWorkSession),
    ]);
  } catch (e: any) {
    console.error('[sync] pushAll partial failure:', e?.message ?? e);
    // Non-fatal: profile was already pushed; log and continue
  }
}

// ── Delete all user data from Supabase ───────────────────────────────────────

export async function deleteAllUserData(): Promise<void> {
  const uid = await getUserId();
  // Most tables use user_id; profiles uses id as primary key
  const userIdTables = ['areas', 'projects', 'tasks', 'habits', 'goals', 'deep_work_sessions'];
  await Promise.all([
    ...userIdTables.map(table =>
      supabase.from(table).delete().eq('user_id', uid).then(({ error }) => {
        if (error) console.warn(`[sync] deleteAllUserData failed for ${table}:`, error.message);
      })
    ),
    supabase.from('profiles').delete().eq('id', uid).then(({ error }) => {
      if (error) console.warn('[sync] deleteAllUserData failed for profiles:', error.message);
    }),
  ]);
}
