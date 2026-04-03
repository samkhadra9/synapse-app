# Synapse — Build Status
_Last updated: March 2026_

---

## What this app is

A personal operating system for people with ADHD who want to build a life with intention, not just manage a schedule. Philosophy: **Structured Becoming** — you don't react to life, you construct it.

Three-layer model:
- **Execution layer** — tasks, calendar, habits (what you do today)
- **Projects layer** — things you're actively building (what you're working toward)
- **Identity layer** — symbolic, motivational; who you're becoming (not enforced in UI)

---

## Architecture overview

```
iOS (Expo Go / TestFlight)
  └── React Native / Expo SDK 54
        ├── Navigation       react-navigation (stack + bottom tabs)
        ├── State            Zustand + AsyncStorage (local, persisted)
        ├── Auth + Cloud     Supabase (Postgres + Auth + RLS)
        ├── AI chat          OpenAI GPT-4o (user's own API key)
        ├── Calendar         expo-calendar (iOS Calendar sync)
        └── Deep work timer  expo-keep-awake + AppState

Data flow:
  Local store (Zustand/AsyncStorage)  ←→  Supabase (cloud)
  - Reads: pull on login, hydrate store
  - Writes: push after onboarding; incremental pushes (next sprint)
  - Offline: app works fully offline; sync on next login
```

---

## Screens built

| Screen | Status | Notes |
|--------|--------|-------|
| LoginScreen | ✅ Done | Email/password, sign up, forgot password |
| WelcomeScreen | ✅ Done | Entry point, skip option |
| OnboardingChatScreen | ✅ Done | AI-powered setup, extracts profile + projects + goals, pushes to Supabase on complete |
| DashboardScreen | ✅ Done | Stats strip, MITs, routines, deep work CTA, weekly review card, projects with calendar sync badge |
| ProjectsScreen | ✅ Done | List view with domain filter |
| ProjectDetailScreen | ✅ Done | Tasks, milestones, AI decompose button |
| GoalsScreen | ✅ Done | 1yr/5yr/10yr goals by domain |
| SettingsScreen | ✅ Done | API key (masked), phase selector, sign out, wipe data |
| ChatScreen | ✅ Done | Modes: dump, morning, project, evening, weeklyReview |
| DeepWorkScreen | ✅ Done | Full-screen immersive timer, interruption tracking, artifact capture |

---

## Features built

### Auth & cloud
- Supabase email/password auth
- expo-secure-store for token persistence (Keychain on iOS)
- Row Level Security — users only ever see their own data
- Pull all data on login, push all on onboarding complete
- Sign out clears session; wipe all data resets everything

### Onboarding
- AI-guided chat that feels like a conversation, not a form
- Extracts: name, identity/aspirations, projects, goals, life domains, schedule, deep work preferences, routines
- Skip option at every step
- Pushes structured data to Supabase on complete

### Dashboard
- Today's MITs (Most Important Tasks)
- Stats: MITs done / deep work sessions this week / habits
- Routines section (morning / post-work / evening) with per-item checkboxes
- Deep work CTA button → DeepWorkScreen
- Weekly review card (highlighted on Sundays)
- Projects with calendar sync badge

### Deep Work (Opal-like)
- Three phases: Set goal → Active timer → Capture artifact
- Count-up timer with progress bar
- Interruption detection via AppState (counts times user backgrounds app)
- iOS Focus mode deep link
- Screen stays awake (expo-keep-awake)
- Saves DeepWorkSession to store + Supabase

### AI Chat modes
- Brain dump — capture and structure loose thoughts
- Morning planning — build today's MIT list
- Project decomposition — break any project into tasks
- Evening review — reflect and close the day
- Weekly review — 6-step guided retrospective

### Calendar integration
- expo-calendar: creates a "Synapse" calendar on iOS
- Syncs project deadlines as calendar events (1-day + 1-hour alerts)
- Sync button on dashboard projects section
- Badge shows "📅 in calendar" when synced

### Settings
- API key: enter once, displayed masked (sk-...xxxx), never shown in plaintext
- Phase system (1/2/3): progressive feature unlock
  - Phase 1: routines only
  - Phase 2: + deep work sessions
  - Phase 3: full system (weekly review, all features)
- Resume setup chat link
- Sign out
- Wipe all data (with confirmation)

---

## What still needs building for launch

### P0 — Must have before any test users

- [ ] **Incremental sync** — right now data is pushed to Supabase only at onboarding. Every `addTask`, `updateProject`, `toggleHabit` etc. needs to call the corresponding `pushXxx()` from `sync.ts`. Without this, data entered after onboarding is local-only.
- [ ] **Task entry on dashboard** — users need to add MITs directly from the dashboard (currently only via chat). A simple "+" button with a quick-add sheet.
- [ ] **Project creation without AI** — a manual "New project" form as fallback for users who don't want to use the chat.
- [ ] **Run schema in Supabase** — paste `supabase-schema.sql` into Supabase SQL Editor. Tables don't exist until this is done; sync silently fails.

### P1 — Should have for a good first experience

- [ ] **Habit completion persists to Supabase** — `toggleHabitToday` needs to call `pushHabit()` after updating local state.
- [ ] **Pull-to-refresh on Dashboard** — manually trigger a Supabase sync.
- [ ] **Task completion syncs** — `toggleTask` needs to push the updated task.
- [ ] **Error states** — if Supabase is unreachable, show a subtle offline indicator rather than silently failing.
- [ ] **Push notification setup** — morning reminder, evening check-in (expo-notifications is installed, service exists, just not triggered).
- [ ] **Empty state screens** — Dashboard with no data, Projects with no projects, Goals with no goals. New users see blank screens currently.

### P2 — Polish before wider rollout

- [ ] **TestFlight build** — requires switching from Expo Go to a custom dev build via `eas build`. Unlocks: push notifications, real iOS Calendar write access, potential Face ID lock.
- [ ] **Onboarding retry** — if the AI chat fails (no API key), guide user to Settings to add one, then resume.
- [ ] **Weekly review completion** — the chat extracts a `weeklyNote` but there's no place it's saved or surfaced.
- [ ] **Deep work history** — a simple list of past sessions in Settings or a dedicated screen.
- [ ] **Project archiving** — completed projects currently just stay in the list.
- [ ] **Habit streak display** — calculate and show current streak per habit.

### P3 — Future / post-launch

- [ ] Real app blocking during deep work (requires Apple Family Controls entitlement — TestFlight custom build only)
- [ ] Face ID lock on app open
- [ ] Shared accountability partner mode
- [ ] Backend API key proxy (so OpenAI key isn't on device)
- [ ] Android support (mostly works but untested)

---

## Immediate next session checklist

The single most impactful thing to do before handing to test users:

1. **Run `supabase-schema.sql`** in Supabase SQL Editor (now idempotent — safe to re-run)
2. **Wire incremental sync** — add `push` calls after each mutation in `useStore.ts`
3. **Add quick-add task button** on Dashboard
4. **Test the full flow**: sign up → onboard → add task → close app → reopen → data still there

That's the loop that needs to work before anyone else uses it.

---

## File map (key files only)

```
SynapseApp/
├── .env                          ← Supabase credentials (gitignored)
├── .env.example                  ← Template
├── supabase-schema.sql           ← Run in Supabase SQL Editor
├── src/
│   ├── lib/
│   │   └── supabase.ts           ← Supabase client
│   ├── store/
│   │   └── useStore.ts           ← All state (Zustand)
│   ├── services/
│   │   ├── sync.ts               ← Supabase push/pull
│   │   ├── calendar.ts           ← iOS Calendar integration
│   │   └── notifications.ts      ← Push notifications (wired, not triggered)
│   ├── navigation/
│   │   └── index.tsx             ← Auth gate + all routes
│   └── screens/
│       ├── auth/LoginScreen.tsx
│       ├── onboarding/
│       │   ├── WelcomeScreen.tsx
│       │   └── OnboardingChatScreen.tsx
│       ├── DashboardScreen.tsx
│       ├── ChatScreen.tsx
│       ├── DeepWorkScreen.tsx
│       ├── ProjectsScreen.tsx
│       ├── ProjectDetailScreen.tsx
│       ├── GoalsScreen.tsx
│       └── SettingsScreen.tsx
```
