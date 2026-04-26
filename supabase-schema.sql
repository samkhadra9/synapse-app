-- ============================================================
-- Synapse — Supabase schema  (safe to re-run)
-- Run this in: Supabase dashboard → SQL Editor → New query
-- Uses IF NOT EXISTS + OR REPLACE throughout so it is idempotent.
-- ============================================================

-- PROFILES (extends auth.users — one row per user)
create table if not exists public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  name            text default '',
  morning_time    text default '07:30',
  evening_time    text default '21:00',
  selected_domains jsonb default '["work","health","relationships","personal","learning"]',
  onboarding_completed boolean default false,
  onboarding_step text default 'welcome',
  deep_work_block_length  int default 60,
  deep_work_blocks_per_week int default 2,
  system_phase    int default 1,
  routines        jsonb,
  synapse_calendar_id text,
  updated_at      timestamptz default now()
);

-- AREAS
create table if not exists public.areas (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  domain      text not null,
  name        text not null,
  description text default '',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- PROJECTS (tasks + milestones stored as jsonb — simple, fast to migrate)
create table if not exists public.projects (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users on delete cascade not null,
  area_id          uuid references public.areas on delete set null,
  domain           text not null,
  title            text not null,
  description      text default '',
  deadline         date,
  tasks            jsonb default '[]',
  milestones       jsonb default '[]',
  status           text default 'active',
  is_decomposed    boolean default false,
  calendar_event_id text,
  created_at       timestamptz default now()
);

-- TASKS (today's MITs / todos)
create table if not exists public.tasks (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references auth.users on delete cascade not null,
  project_id         uuid references public.projects on delete set null,
  domain             text,
  text               text not null,
  completed          boolean default false,
  date               text not null,   -- 'yyyy-MM-dd'
  is_today           boolean default false,
  is_mit             boolean default false,
  estimated_minutes  int,
  priority           text default 'medium',
  created_at         timestamptz default now()
);

-- HABITS
create table if not exists public.habits (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users on delete cascade not null,
  name              text not null,
  icon              text default '⚡',
  domain            text not null,
  completed_dates   jsonb default '[]',
  frequency         text default 'daily',
  notification_time text
);

-- GOALS
create table if not exists public.goals (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  domain     text not null,
  horizon    text not null,
  text       text not null,
  milestones jsonb default '[]',
  created_at timestamptz default now()
);

-- DEEP WORK SESSIONS
create table if not exists public.deep_work_sessions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users on delete cascade not null,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_minutes int default 0,
  goal             text not null,
  artifact         text,
  next_action      text,
  interruptions    int default 0,
  completed        boolean default false
);

-- ============================================================
-- ROW LEVEL SECURITY — users only ever see their own data
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.areas             enable row level security;
alter table public.projects          enable row level security;
alter table public.tasks             enable row level security;
alter table public.habits            enable row level security;
alter table public.goals             enable row level security;
alter table public.deep_work_sessions enable row level security;

-- Policies (drop first so re-runs don't error on duplicates)
do $$ begin
  drop policy if exists "own profile"   on public.profiles;
  drop policy if exists "own areas"     on public.areas;
  drop policy if exists "own projects"  on public.projects;
  drop policy if exists "own tasks"     on public.tasks;
  drop policy if exists "own habits"    on public.habits;
  drop policy if exists "own goals"     on public.goals;
  drop policy if exists "own sessions"  on public.deep_work_sessions;
end $$;

create policy "own profile"   on public.profiles           for all using (auth.uid() = id);
create policy "own areas"     on public.areas              for all using (auth.uid() = user_id);
create policy "own projects"  on public.projects           for all using (auth.uid() = user_id);
create policy "own tasks"     on public.tasks              for all using (auth.uid() = user_id);
create policy "own habits"    on public.habits             for all using (auth.uid() = user_id);
create policy "own goals"     on public.goals              for all using (auth.uid() = user_id);
create policy "own sessions"  on public.deep_work_sessions for all using (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile row when a user signs up
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CP8.2 — Migration additions (D30 retention foundation)
-- ============================================================
-- Reinstall = no data loss. Adds missing profile columns + new
-- tables for the parts of the experience that were previously
-- local-only (chat history, completion log, session memories,
-- themes). All idempotent.
-- ============================================================

-- Profile additions — columns sync.ts already pushes that weren't
-- in the original schema. add column if not exists is Postgres 9.6+.
alter table public.profiles add column if not exists portrait                 jsonb;
alter table public.profiles add column if not exists last_active_date         date;
alter table public.profiles add column if not exists selected_calendar_name   text;
alter table public.profiles add column if not exists week_template            jsonb default '[]';
alter table public.profiles add column if not exists skeleton_built           boolean default false;
alter table public.profiles add column if not exists weekly_review_day        int;
alter table public.profiles add column if not exists weekly_review_time       text;
alter table public.profiles add column if not exists proactive_push_enabled   boolean default true;
alter table public.profiles add column if not exists capture_tour_seen_at     timestamptz;
alter table public.profiles add column if not exists first_open_date          date;

-- Task additions — sync.ts already pushes these
alter table public.tasks    add column if not exists area_id                  uuid references public.areas on delete set null;
alter table public.tasks    add column if not exists is_inbox                 boolean default false;
alter table public.tasks    add column if not exists reason                   text;

-- COMPLETIONS — the "what I did" log (Phase 6 + CP5.1)
-- One row per completion entry. Used by DayEndReflection and the
-- portrait/themes extractor. Survives reinstall.
create table if not exists public.completions (
  id        uuid primary key,
  user_id   uuid references auth.users on delete cascade not null,
  at        timestamptz not null,
  source    text not null,                 -- 'task' | 'chat' | 'deepwork'
  text      text not null,
  task_id   uuid                            -- soft ref; tasks may be deleted/recreated
);
create index if not exists completions_user_at_idx on public.completions (user_id, at desc);

-- CHAT SESSIONS — keyed by '${mode}:${windowKey}', e.g. 'dump:2026-04-26'
-- The whole message array lives as jsonb on a single row per session.
-- Cheap to read/write whole, simple to merge (last-write-wins on
-- updated_at), no need for per-message rows.
create table if not exists public.chat_sessions (
  user_id     uuid references auth.users on delete cascade not null,
  session_key text not null,
  messages    jsonb not null default '[]',
  updated_at  timestamptz not null default now(),
  primary key (user_id, session_key)
);
create index if not exists chat_sessions_updated_idx on public.chat_sessions (user_id, updated_at desc);

-- SESSION MEMORIES — CP7.2 per-session running summaries.
-- Aged out at 7d locally (pruneSessionMemories); keep server copy
-- for the same window so reinstall in <7d retrieves them.
create table if not exists public.session_memories (
  user_id     uuid references auth.users on delete cascade not null,
  session_key text not null,
  mode        text not null,
  summary     text not null,
  user_turns  int  not null default 0,
  updated_at  timestamptz not null,
  primary key (user_id, session_key)
);
create index if not exists session_memories_updated_idx on public.session_memories (user_id, updated_at desc);

-- THEMES — CP7.3 single-row-per-user background themes. We keep
-- only the latest snapshot; the extractor overwrites on each refresh.
create table if not exists public.themes (
  user_id    uuid references auth.users on delete cascade primary key,
  avoidance  jsonb not null default '[]',
  wins       jsonb not null default '[]',
  snags      jsonb not null default '[]',
  summary    text  not null default '',
  updated_at timestamptz not null
);

-- PUSH LOG — proactive-push history. Local notification scheduling
-- uses iOS-side dedup; this table is for cross-device "did we send
-- one today" + future analytics. One row per attempted decision.
create table if not exists public.push_log (
  id          uuid primary key,
  user_id     uuid references auth.users on delete cascade not null,
  decided_at  timestamptz not null,
  should_ping boolean not null,
  message     text,
  delivered   boolean default false
);
create index if not exists push_log_user_decided_idx on public.push_log (user_id, decided_at desc);

-- RLS — same "own X" policy shape as the rest of the schema
alter table public.completions       enable row level security;
alter table public.chat_sessions     enable row level security;
alter table public.session_memories  enable row level security;
alter table public.themes            enable row level security;
alter table public.push_log          enable row level security;

do $$ begin
  drop policy if exists "own completions"      on public.completions;
  drop policy if exists "own chat_sessions"    on public.chat_sessions;
  drop policy if exists "own session_memories" on public.session_memories;
  drop policy if exists "own themes"           on public.themes;
  drop policy if exists "own push_log"         on public.push_log;
end $$;

create policy "own completions"      on public.completions      for all using (auth.uid() = user_id);
create policy "own chat_sessions"    on public.chat_sessions    for all using (auth.uid() = user_id);
create policy "own session_memories" on public.session_memories for all using (auth.uid() = user_id);
create policy "own themes"           on public.themes           for all using (auth.uid() = user_id);
create policy "own push_log"         on public.push_log         for all using (auth.uid() = user_id);
