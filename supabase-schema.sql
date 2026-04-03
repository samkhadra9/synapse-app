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
