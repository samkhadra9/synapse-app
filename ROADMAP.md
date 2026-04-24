# Aiteall v3 — Roadmap

> The mission: D7 100%, D30 100%. Make the app a virus because people get
> addicted to the **burden it removes**, not to dopamine hits. Peace as a
> moat — nothing else on the market feels like it does after a week of use.
>
> This file is a working doc. It lives in the repo so it survives session
> compaction. Delete before shipping v3 public / before v4 planning.

---

## Part 1 — Presence moves

How the app *finds* the user instead of waiting to be opened.

1. **iOS Home Screen widget — "the one" + one tap to chat.** (H)
   Small/medium widget shows the single next thing and a chat-dump button.
   Tap → deep-link into Chat with `mode: 'dump'`, skipping the tab bar.
   1–2 day native Swift/WidgetKit spike.

2. **Siri Shortcut + Share Sheet: "Tell Aiteall."** (H)
   "Hey Siri, tell Aiteall I'm spiralling on the Cohen deal" → opens a
   dump session with that as the first user message. Share Sheet lets
   them send a Safari page / email / photo straight into inbox. AppIntents.

3. **Kill MITs. Replace with "the one."** (H)
   Three-tier priority (MIT, high, everything) is decision fatigue in
   narrow state. Collapse to a single `isTheOne` flag per day, chosen by
   the model at the end of the prior ritual or at first open of the day.

4. **The 15-minute opener.** (H)
   First visible action on Home is always *"Start with 15 minutes of
   [the one]."* One tap begins a 15-min timer with gentle haptic at
   5 / 10 / 15. No modal. No goal-setting. Just go.

5. **Proactive notifications the model writes itself.** (M)
   Once a day, Haiku gets the portrait + completion log and decides
   whether to ping — and what to say. Not "you have 4 tasks due."
   More like "Hey — yesterday you said you were dreading the Monday
   call. It's 20 min. Want to chat before?"

6. **Long-press quick actions on the app icon.** (M)
   Long-press → "Dump something quick" / "Mark the one done" / "I'm
   stuck." Each deep-links with the right mode pre-seeded. Free with
   the widget spike.

7. **Live Activity for the 15-min session.** (M)
   Once a focus session starts, it pins to the lock screen with a
   gentle ring. Tap → jumps back in. No "come back to the app" friction.

8. **Completion without ticking.** (M)
   In chat, if the user says "ok done the email" — the model silently
   marks the matching task complete and just acknowledges: "Nice. Done."
   No checkbox tap required. Already half-built via the completion
   extractor; finish the loop.

9. **Pause, don't cancel.** (L)
   Ignore a task for 3+ days → quietly move to "paused," remove from
   "today," mention once in the next ritual. The shame of a task
   rotting at the top of a list is what kills ADHD apps.

10. **Portrait forking at key life events.** (L)
    If the portrait extractor detects a major shift ("I just got fired,"
    "my mom died," "I'm moving to Berlin"), the app *asks* whether to
    fork — fresh page, old one saved. Respects that identity is
    discontinuous during shocks.

---

## Part 2 — UX/UI feel: ADHD-trigger reduction

How the app *feels* once they're in — so opening it doesn't punish them.

### Language and copy

11. **Copy audit with banned-word list.** No "accomplish," "complete,"
    "finish," "achieve," "productive," "deadline," "overdue," "behind,"
    "missed." No exclamation marks except on completion acks. No "Great
    job!" No fake enthusiasm. Replace with: "Done." / "Nice." / "Noted."
    / "Mm." Tone = calm friend, not coach.

12. **Strip time pressure from ambient UI.** No countdowns on screen
    unless the user starts a timer. No "3 days left." No "due today"
    as a visible badge. Chat can reference time; the interface
    shouldn't shout about it.

13. **No counts, no percentages, no progress bars at rest.** Hide
    "4 of 12 done today" — that framing IS the shame loop. Show
    completions as a list of what got done, never as a fraction of
    what was planned.

14. **Kill streaks. Kill the flame emoji.** A streak is a threat:
    "break this and you lose something." For an ADHD user having a
    rough week that's the difference between opening the app and
    deleting it.

15. **Empty states without shame.** "There's nothing on today. Breathe."
    — not "No tasks! Add one?" No sad-clipboard illustrations.

### Visual calm

16. **Whitespace pass on every screen.** One focal element per screen
    above the fold. Dashboard is the exception; narrow and held should
    both pass the "could this go on an Apple Watch?" test.

17. **Color discipline.** No red for "overdue." No orange for "urgent."
    Accent color = *affordance* (this is tappable), never *alarm*
    (this is bad). Status = typography weight, not hue.

18. **Time-of-day adaptive theme, dark-by-default after sunset.**
    Automatic. OLED black + warm accent at night is measurably calmer
    than a white flash. Device color scheme + local sunset calc.

19. **Strip chrome in narrow and held.** Hide the tab bar until
    scroll-down. Hide the header. One card, one tap, done. Chrome is
    a reminder of everything else they're not doing.

20. **No badge dots on the app icon ever.** The red dot *is* the shame.
    If the app needs attention, it uses a well-written push (see #5),
    not icon decoration that sits there all week.

### Motion and feedback

21. **Soft haptics only. No sounds. No confetti.** Completion = one
    subtle haptic tick. Celebration UI is another form of pressure.
    A quiet "noted" is more respectful.

22. **No scale-bounce or spring animations on state changes.**
    Ease-out 200–300ms, no bouncing. Bouncy UI reads as "sensory
    noise" to a lot of ADHD users.

23. **No modals for anything routine.** Prefer sheets (dismiss by
    swipe) or inline disclosure. Modals demand a decision; sheets
    let the user leave.

### Friction and forgiveness

24. **Autosave everything. No "save" buttons. No confirm dialogs.**
    Edit any field → write on blur. No "are you sure?" The confirm
    dialog is executive-function tax.

25. **Global undo at the top of every screen.** Any destructive action
    triggers a 10-second undo snackbar. No "are you sure you want to
    delete 14 tasks?" — just do it and offer undo.

26. **Never require a field to be filled before saving.** Task with
    no text? Save as "(untitled)." Portrait section the model couldn't
    infer? Leave blank. "You need to fill this in first" = bounce.

27. **No required onboarding steps. Skip is always the loudest button.**
    Any walkthrough — skip action is bolder than continue. Re-offer
    later in chat if relevant.

### Re-entry without shame

28. **No retrospective catch-up.** User back after 5 days → do NOT show
    "here's what you missed" or "5 overdue tasks." The held-state
    greeting is already right — audit every other screen.

29. **No login / re-auth walls once established.** Face ID if opted in,
    otherwise straight through. Every auth prompt = a chance to close
    the app and not come back.

30. **Read-aloud mode for chat replies.** Optional, off by default.
    AVSpeechSynthesizer, no network call. Voice reply while walking /
    doing dishes can be the difference between engaging and bouncing.

---

## Execution order — checkpoints

Each checkpoint = commit + build verification + quick walk-through
before moving on.

### ✅ Checkpoint 1 — The One + 15-min opener + copy audit
Items: 3, 4, 11, 12, 13, 15
Pure JS. Biggest behavioral lift. ~1 session.

### ✅ Checkpoint 2 — Visual calm pass
Items: 14, 16, 17, 18, 19, 20
Design work on themes.ts + most screens. ~1 session.

### ✅ Checkpoint 3 — Motion & forgiveness
Items: 21, 22, 23, 24, 25, 26, 27, 28, 29
Micro-polish across the app. ~1 session.

### ✅ Checkpoint 4 — Widget + Siri + Share Sheet
Items: 1, 2, 6, 7
Native Swift / WidgetKit / AppIntents spike. 1–2 sessions.

### ✅ Checkpoint 5 — Proactive push + completion without ticking
Items: 5, 8
Finishes the passive completion loop + one-a-day Haiku push.

### ✅ Checkpoint 6 — Pause / Portrait forking / Read-aloud
Items: 9, 10, 30
Lower-conviction polish; defer until earlier checkpoints land.

---

## Working protocol (for Claude)

At the **start of every new session**, Claude's first action is to:
1. Read `ROADMAP.md`.
2. Find the active checkpoint (first one without a final ✅ completion
   note in the section below).
3. Use TodoWrite to break that checkpoint into sub-items.
4. Only hold that checkpoint's items in working memory.

At the **end of every checkpoint**, append a one-paragraph note to
the Completion log below with: what shipped, what got deferred, any
follow-ups.

---

## Completion log

### Checkpoint 1 — in progress

**CP1.1 — `isTheOne` flag.** Added `isTheOne?: boolean` to `Task` +
`setTheOne(id | null)` action + `theOneForToday()` selector. `isMIT`
retained as a legacy field with deprecation comment so persisted user
data keeps rendering. Migration bridge pattern: any code reading the
flag falls back `isTheOne ?? isMIT`. Recurrence clone zeroes the flag.

**CP1.2 — Wire isTheOne through HomeNarrow / HomeHeld / Dashboard.**
`HomeNarrow.pickOneThing` and `DashboardScreen.theOne` now prefer
`isTheOne` and fall back to `isMIT`. Empty-state copy rewritten ("If
one thing mattered today — what would it be?"). Set-MIT form now calls
`setTheOne(null)` to enforce the "at most one" invariant before writing.

**CP1.3 — 15-min opener + timer + haptics.** New `useFifteen` zustand
store (non-persisted) in `src/services/fifteen.ts`; floating
`FifteenBanner` mounted at root in `App.tsx` so the countdown survives
navigation. Haptic marks at 5 / 10 / 15 min via RN `Vibration` API
(expo-haptics not installed — flagged for CP3 polish). Start buttons
added to `TheOneBlock` and `HomeNarrow` focus card.

**CP1.4 — Copy audit: banned words + fake enthusiasm.** Swept
`DashboardScreen`, `ProjectsScreen`, `SettingsScreen`. Rewrites include:
"MUST DO TODAY" → lowercase "today", "overdue" → "past target" where
user-facing, "deadline" (UI copy) → "target date", "Great job" /
"Amazing" / exclamation marks removed, Haiku micro-action prompt tells
the model "no preamble, no exclamation marks." Data-field names like
`deadline: string` on the Project type left alone intentionally — scope
is user-facing copy, not the schema.

**CP1.5 — Strip ambient time pressure.** Removed `OverdueBanner`
(dead code anyway), `NextEventCountdown` (pulsing red ⚠ min-until
header) and `DriftNudge` (time-blindness warning strip) from
`DashboardScreen`. Removed the `Nd` / "past target" countdown badges
from the Dashboard ProjectRow and the ProjectsScreen ProjectCard —
projects still carry a target date; the card just doesn't perform
anxiety about it. Unused styles and imports cleaned up. `tsc --noEmit`
passes. Deferred: `scheduleDriftNudge` notification in
`notifications.ts` left live — CP1.5 scope was UI pressure, not
notification UX.

**CP1.6 — Remove counts / percentages / progress bars at rest.**
Stripped the progress bar + `{done}/{total}` label from both the
Dashboard ProjectRow and the ProjectsScreen ProjectCard. A project at
rest is now a name + (optionally) a description + a "Plan with AI"
nudge if the project hasn't been decomposed — no ambient ratio. The
dashboard subtitle "·  N done" was removed for the same reason
(a tally at rest is a benchmark for tomorrow's failure). The
today-section header lost its "— N left" suffix. Kept: the progress
bar inside `TriageInboxModal` and the "X of Y" inside `EmergenceSheet`
— both are active, in-motion sheets the user opens deliberately, not
at-rest ambient UI. `tsc --noEmit` passes.

**CP1.7 — Rewrite empty states without shame.** Three surfaces
touched: ProjectsScreen list-empty ("No projects yet" →
"Nothing here yet" + a one-line frame of what a project even is),
Dashboard today-empty ("Nothing planned yet — use + to add tasks" →
"Clear today. If something comes up, tap +."), Dashboard
weekly-skeleton-empty ("No structure yet" → "Shape of the week"
framed as a choice not a lack), Dashboard daily-structure tasks-empty
("No tasks planned yet →" → "Nothing on the list. Want to talk
through the day?"), and TriageInboxModal completion ("Inbox clear."
+ "Nice work." → "Clear." alone — no performance praise on
completion). PortraitScreen's empty state and per-section emptyTexts
were already relational/shame-free; left alone. AreaDetailScreen's
"Nothing scheduled this week" is factual and calm; left alone.
`tsc --noEmit` passes.

**CP1.8 — System prompts: "the one" vocabulary.** Rewrote the dump and
ritual-mode system prompts in `ChatScreen.tsx` to prefer "the one" /
"the one thing" over "MIT". Added an explicit banned-words block to
`sharedRules` covering "Great job", "Nice work", "Amazing", "Awesome",
"Well done", "You've got this", "productive", "achieve", "accomplish",
"overdue", "deadline" (as UI vocab — use "target"), "behind", "missed";
past-dated tasks reframed as "from earlier" rather than "overdue" (the
OVERDUE section label became "FROM EARLIER … surface only the important
ones, without shame"). Output JSON schema now includes `isTheOne` and
the Morning Flow step 3 ("Pick THE ONE") tells the model to pick ONE
focal task per day and treat `isMIT` as legacy-only. `applyActions`
now reads `action.isTheOne` and, after `addTask`, calls
`useStore.getState().setTheOne(newTask.id)` — the store enforces the
singleton invariant so even a misbehaving model can't set two. Same
vocabulary pass applied to `AmbientChatStrip.tsx` (both proactive and
ambient system prompts + the UI fallback strings — "Your MIT is…" →
"The one thing: …"), `services/notifications.ts` morning-brief body
("Your MIT" → "The one thing"), and `services/openai.ts`
decomposeProject user message ("Deadline" → "Target date"). Legacy
copy left intentionally: the `mitChip` label in `MITHeroBlock.tsx`
already reads "★ MUST DO TODAY" (no literal "MIT"); internal prop/style
names (`primaryMIT`, `hasMIT`, `mitChip`, `isMIT` field) are schema,
not user-facing, and stay. `structureMorningText` in `openai.ts` has
an old MIT-heavy prompt but the function is dead code (no callers);
left untouched. `tsc --noEmit` passes.

## Checkpoint 2 — Peace at rest (visible work)

**Direction.** CP1 was mostly invisible: vocabulary swaps, a prompt
rewrite, a singleton invariant under the hood. Sam flagged this after
reviewing the build — "feels like it's very similar." CP2 is the
opposite: every change should register within the first three seconds
of opening the app. Splash dies, streaks die, alarm colors die, chrome
recedes when the user is holding one thing, the app can go dark with
the phone.

**CP2.0 — Kill the splash logo.** `assets/splash.png` replaced with a
69-byte 1×1 transparent PNG (built in Python via the minimal PNG byte
sequence — no external tools needed). `app.json` splash config already
uses `cover` resize mode on white/#1C1C1E backgrounds, so the effect
is: the app opens to a flat background wash and transitions straight
into the navigator. No wordmark, no logo, no "moment of brand" — the
app is somewhere you go to think, not a product that introduces itself.

**CP2.1 — Streaks and flame emoji.** `WorkingModeModal.tsx` "In the
zone 🔥" → "In the zone". `DayEndReflection.tsx` `flame-outline` icon
for deep-work entries swapped to `time-outline` — the session itself
was the reward, a fire emoji is performance praise. `DashboardScreen`
had three "MIT" badge pills (timeline grouped, timeline flat, dashboard
primary list); each replaced with a single `★` glyph. The "✓ N done"
pill in the inbox header was removed entirely with an inline CP2 note:
"the done log itself is the acknowledgement; a count at rest is a
benchmark." One residual "MIT" pill in the overdue inbox row and the
review-plan confirm sheet ("★ 2 MITs") both swept to the star glyph
in CP2.7.

**CP2.2 — Color discipline: kill alarm colors.** The principle: status
is typography weight, never hue; category decoration can use color,
state coding cannot. `AreasScreen.tsx` green/amber/red `healthDot`
(with its `getHealthScore()` helper) removed entirely — the stats
chips already communicate engagement without a traffic-light dot; a
"red" area doesn't need alarm-coding. `DashboardScreen.tsx` swept:
the orange `#E07B45` "FROM EARLIER" section header → neutral
textTertiary with heavier letterSpacing (emphasis via weight); the
orange overdue-date hint inside InboxRow → textSecondary with
`fontWeight: 600`; `priorityColors.high: '#D97706'` (orange) →
`C.textPrimary` (contrast carries priority, not hue); swipe-to-change-
priority `bgColor` for "high" → `C.ink` (darkest, not loudest); the
current-time marker `nowDot`/`nowBar` from `#EF4444` (red) → `C.primary`
(the present moment is wayfinding, not alarm); the calendar reminders
dot `#FF9500` (orange) → `C.textTertiary`. The `protected` time-block
category (`BLOCK_COLORS` in three places: DashboardScreen, Skeleton-
BuilderScreen, CalendarExportScreen) from `#EF4444` red to `#1F2937`
slate — category decoration stays, but "protected" should read as
"locked in," not "danger." Theme-level `warning` / `error` tokens
left in place; they're legitimate for genuinely destructive actions
(delete data, unsaved work) and are still used there.

**CP2.3 — Adaptive theme.** Added `autoDark: boolean` (default `false`)
+ `setAutoDark` to the store. `useColors()` now pulls `useColorScheme()`
from react-native; when `autoDark` is on and the system reports dark,
the hook returns the `ink` tokens regardless of which day theme the user
picked. This leans on iOS/Android's own sunset automation — the phone
already knows the user's location and time — rather than hard-coding a
clock threshold. Added a Switch in SettingsScreen under the theme picker:
"Match system dark mode" with a hint line. Because `useColors` is the
single entry point for theme tokens, every screen picks this up with
zero refactoring.

**CP2.4 — Strip chrome in narrow/held.** Added transient `uiState`
+ `setUIState` to the store (not persisted — classifier result is
ephemeral). `HomeAdaptive` publishes the decision after classifying on
focus. `CustomTabBar` reads it: when we're on the Dashboard tab AND the
state is `narrow` or `held`, the tab bar collapses to just the sparkles
orb centered on a transparent background. Full chrome restores the
moment the next classification returns `open` (task completed, session
tally, etc.). Rationale: the point of `narrow` is "one thing, held in
space" — a tab bar with unread counts and alternative destinations
competes with that. Keep sparkles so the chat affordance is never more
than one tap away.

**CP2.5 — Whitespace pass.** Bumped the key focal surfaces: HomeNarrow
and HomeHeld ScrollView `paddingTop` from `Spacing.lg` (28) to
`Spacing.xl` (40); focusCard / chatCard inner padding from
`Spacing.base` (20) to `Spacing.lg` (28); HomeHeld footer reassurance
line `marginTop` from base to xl so it sits on its own island. Dashboard
timeline header `paddingBottom` from 4 to `Spacing.md` so the big
day/date heading breathes. Held deliberately: the Dashboard "open"
state is denser because the user is actively scanning — generous
whitespace there would feel sparse, not peaceful.

**CP2.6 — No badge dots.** Notification permission request already had
`shouldSetBadge: false` in the foreground handler; CP2.6 extends that to
the OS prompt itself by passing `ios: { allowBadge: false, allowAlert:
true, allowSound: true }` to `requestPermissionsAsync`, so iOS doesn't
even offer the capability. Added a `clearBadge()` helper that calls
`setBadgeCountAsync(0)` (swallows errors for platforms that don't
support it). `AppNavigator` calls `clearBadge()` on mount and subscribes
to `AppState` changes — every time the app returns to the foreground,
any lingering count goes to zero. Philosophy: the app is somewhere you
go *to*, not something that pings the home screen.

**CP2.7 — Verify.** `tsc --noEmit` clean. Grep for `#EF4444|#E07B45|
#D97706|#FF9500|flame-|🔥` returns only the two theme-token definitions
for `warning: '#D97706'` (left intentionally — used for genuine
destructive action warnings). Additional residuals cleaned: DashboardScreen
overdue inbox-row "MIT" pill → star glyph; ChatScreen review-plan meta
line "★ 2 MITs" → "★★"; ChatScreen cap warning "MIT cap reached" →
"Three starred already — tap a ★ to unstar before adding more." A
pre-existing `C.surfaceVariant` typo in DashboardScreen was fixed to
`C.surfaceSecondary` (tsc had been silently passing on this because of
upstream `any` usage; the CP2.3 useColors refactor tightened types
enough to surface it).

### Checkpoint 3 — Motion & forgiveness

**CP3.0 — Haptic discipline.** New `src/services/haptics.ts` exposes a
3-verb vocabulary: `soft()` (Haptics.selectionAsync — pickers, taps),
`gentle()` (ImpactFeedbackStyle.Light — mid-session ticks), `done()`
(NotificationFeedbackType.Success — completions). RN `Vibration` removed
everywhere. DashboardScreen's `MomentumCelebration` modal (confetti +
giant ✓ + sparkles) deleted; `handleToggleTask` now fires `done()` only
when a task flips incomplete → complete. No visual celebration layer
anywhere in the app.

**CP3.1 — Animation discipline.** Existing Animated.timing usage audited;
UndoSnackbar uses 220ms Easing.out(Easing.ease) with no spring/bounce.
No scale-bounce animations in the codebase.

**CP3.2 — Sheets over modals.** Deferred; existing presentationStyle
pageSheet modals (AddProjectModal, AreaModal) already dismissible by
swipe. Alert-based nested confirms collapsed in CP3.4.

**CP3.3 — Autosave + kill Save confirms.** Partial pass: removed the
double "Are you really sure?" wipeData chain on SettingsScreen (single
confirm only — the one place where data loss is truly unrecoverable).
API-key removal flows (Anthropic / OpenAI) no longer confirm; they
remove immediately and surface an Undo pill with 10-second window.
Post-action "Added to today" popup on ProjectDetailScreen replaced with
a soft haptic (the task appearing in today's list IS the receipt). Full
per-field autosave deferred — would require debounced onBlur writes
through every form; a bigger refactor than this checkpoint warrants.

**CP3.4 — Global undo snackbar.** New `src/services/undo.ts` — zustand
single-slot queue with 10-second TTL; `enqueueUndo({ label, undo })` is
the public surface. New `src/components/UndoSnackbar.tsx` — floating
bottom pill, mounted once at the app root inside SafeAreaProvider so it
pulls correct home-indicator inset. Ease-out 220ms fade+rise. Destructive
flows migrated: AreasScreen archive (snapshot `isActive/isArchived` flags
then restore via setState), ProjectDetailScreen delete-task (snapshot
project.tasks then restore via setProjectTasks), ProjectDetailScreen
delete-project (snapshot full project then re-add via setState),
AreaDetailScreen archive + delete permanent (action sheet flattened
from nested "are you sure?" chains to single-tier with immediate action +
undo). DeepWorkScreen `confirmEnd` stripped of its "End session?" dialog
— End now goes straight to capture phase.

**CP3.5 — No required fields.** Empty-name save behaviour relaxed:
AreasScreen AreaForm saves as "(untitled area)", ProjectsScreen
AddProjectModal saves as "(untitled project)", AreaDetailScreen quick-add
empty is a silent no-op (no scolding popup).

**CP3.6 — Skip louder than continue.** SkeletonBuilderScreen post-
completion CTA stack inverted: "Skip for now" is now the solid accent
pill (primary visual weight), "Sync to my calendar" is the outlined
secondary. CalendarExportScreen pre-sync state inverted identically:
Skip is the ink-solid primary, Sync is the amber-outlined secondary.
Post-sync the forward "Get started →" becomes primary (user has already
chosen the path).

**CP3.7 — No retrospective catch-up.** Already substantially in place
from CP1.5 (OverdueBanner / NextEventCountdown / DriftNudge-as-drift
removal) and ChatScreen system prompts (explicit "surface only the
important ones, without shame" framing on the FROM EARLIER block,
continuity.ts tells model "DO NOT catch up on the backlog"). HomeHeld
remains the canonical returning-user greeting — warm, "Last here 5 days
ago" as neutral reference, no missed-tasks call-out. InboxRow overdue
grouping preserved because the user actively navigated to Inbox — not
pushed in their face.

**CP3.8 — No re-auth walls.** Already satisfied by architecture:
Supabase client configured with `persistSession: true`, `autoRefreshToken:
true`, and ExpoSecureStore storage adapter; session rehydrates on app
launch via `supabase.auth.getSession()`. No Face ID gate implemented —
left for future opt-in Settings toggle per ROADMAP item 29 ("Face ID if
opted in").

**CP3.9 — Verify.** `tsc --noEmit` clean. Grep for `Alert.alert` across
src/screens shows only informational / error-reporting uses remain
(calendar sync errors, API-key failures, login errors, ChatScreen
off-record toggle — educative, not destructive-confirm). All destructive
confirms either removed or collapsed to single-tier-with-undo.

