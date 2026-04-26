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

### Checkpoint 4 — Widget + Siri + Share Sheet + Quick Actions + Live Activity

First native spike. Punches out of pure-JS into Swift/SwiftUI/ActivityKit/
AppIntents. All Swift source written in sandbox against canonical Apple
patterns; compile-verify happens on Sam's Mac after `expo prebuild`.
See WIDGET_SETUP.md for the Mac-side command sequence.

**CP4.1a — Deep-link scheme + navigation linking.** Added
`scheme: "aiteall"` to app.json. New `src/navigation/linking.ts` houses
the URL parser + dispatcher; an inline parser handles `aiteall://chat/
dump?seed=...`, `aiteall://the-one/done`, `aiteall://deep-work`, and
`aiteall://projects/<id>`. Bypasses react-navigation's built-in
`LinkingOptions` config because our Chat screen lives in a modal stack
with param aliasing (`?seed → initialMessage`) that the built-in parser
makes awkward. `installDeepLinkListeners()` wires
`Linking.getInitialURL()` for cold-start consumption + `addEventListener`
for warm URLs. A `navigationRef` is threaded through
`NavigationContainer` so deep links can dispatch navigate actions without
a hook context. Small retry loop if nav container isn't mounted yet
(cold-start race). `PendingIntentHandler` mounted in
`AppNavigator` consumes the one-shot `theOneDone` intent from store.

**CP4.1b — App Group + shared-state bridge.** Added
`group.com.synapseadhd.app` App Group entitlement to `ios.entitlements`
in app.json. Created `src/services/sharedState.ts` that writes a
snapshot of `{ theOne, fifteen, lastSyncedAt }` to the App Group's
shared UserDefaults via `react-native-shared-group-preferences`.
`installSharedStateSync()` subscribes to the zustand store and re-syncs
on any tasks mutation. Writes call
`AiteallNative.reloadWidget()` so WidgetKit picks up the change
immediately rather than waiting for the 30-min timeline cadence.

**CP4.1c — Widget target.** `targets/widget/AiteallWidget.swift` — a
SwiftUI `TimelineProvider` reading from the App Group UserDefaults
suite, with small + medium layouts. Small shows the-one in serif on a
warm cream gradient. Medium adds two tappable pills (Dump, Done) whose
`Link` destinations are the same deep-link URLs. `widgetURL` on the
small widget routes taps into `aiteall://chat/dump`. Registered via
`@bacons/apple-targets` config plugin — `expo-target.config.js`
declares `type: 'widget'`, bundle ID, App Group membership,
deployment target 16.4. `@main` bundle declaration includes the
FifteenLiveActivity widget so they ship in one extension target.

**CP4.1d — Quick Actions.** `UIApplicationShortcutItems` declared
statically in app.json's `ios.infoPlist` (three items: Dump, Mark the
one done, I'm stuck). `expo-quick-actions` config plugin added to
app.json's plugins array. `src/services/quickActions.ts` registers
dynamic items (same list, with icons) and listens for taps,
cold-start-consuming the initial item if the app was launched by a
long-press shortcut. Each action maps to a deep-link URL and flows
through `applyDeepLinkAction` so widget/quick-action/share/Siri use
one dispatcher.

**CP4.2a — Share Extension.** `targets/share/ShareViewController.swift`
extends `SLComposeServiceViewController`. Reads URL or plain-text
attachments from the share sheet, combines with any user-typed note,
stores in App Group as `pendingShareSeed`, then opens the main app
via a scheme URL by walking the responder chain. `@bacons/apple-targets`
config declares `type: 'share'` with extension activation rules for
text/URL/web page. Linking.ts's chat-route fallback reads
`pendingShareSeed` from App Group if no `?seed=` on the URL (iOS can
truncate long URLs in extensions).

**CP4.2b — Siri via AppIntents.** `modules/aiteall-native/ios/
TellAiteallIntent.swift` implements `AppIntent` (iOS 16+) with a
free-form `message` parameter. `parameterSummary` phrase "Tell
Aiteall <message>". `perform()` returns `.result(opensIntent:
OpenURLIntent(url))` where the URL is
`aiteall://chat/dump?seed=<message>`. `AiteallAppShortcuts`
conforms to `AppShortcutsProvider` so iOS auto-discovers and
donates the phrase. Lives in a local Expo module (`modules/
aiteall-native/`) so the Swift file links into the main app
target, not an extension — AppIntents don't need an extension
when the intent's whole job is to open the app.

**CP4.3 — Live Activity.** `targets/widget/LiveActivity.swift`
declares `FifteenAttributes: ActivityAttributes` + a `FifteenLiveActivity`
widget with `ActivityConfiguration`. Lock-screen view shows a soft
progress ring + the-one label + monospaced timerInterval countdown.
Dynamic Island compact/expanded/minimal presentations all wired.
`modules/aiteall-native/ios/FifteenAttributes.swift` duplicates the
struct (byte-identical comment-tagged) so it's available in the main
app module too — ActivityKit routes activities to widgets by
attribute type name, so a shared definition isn't strictly needed.
`AiteallNativeModule.swift` exposes `startFifteen / updateFifteen /
endFifteen / reloadWidget` to JS via ExpoModulesCore. `fifteen.ts`
calls `startFifteen(label, durationSeconds)` on session start and
`endFifteen()` on completion or user-tap-to-stop. Also writes the
session window to the App Group so the widget can render a
countdown on home screen even when no Live Activity is pinned.

**CP4 Mac-side action list.** Build artifacts require a Mac. See
WIDGET_SETUP.md for:
  - `npm install` (new deps: @bacons/apple-targets, expo-quick-actions,
    react-native-shared-group-preferences)
  - `npx expo prebuild --clean`
  - `cd ios && pod install`
  - Open Xcode workspace, set signing team on all 3 targets
  - Verify App Group capability on each target
  - Run on physical iPhone (widgets/Live Activities don't work in sim)

**CP4 deferred / future:**
  - Android parity for widget + quick actions (Glance + App Shortcuts) —
    Android audience secondary; revisit post-v3 launch.
  - iPad widget layouts — currently `supportsTablet: false` anyway.
  - Rich Share Extension UI (preview of what will be dumped) — current
    is zero-UI pass-through for <1s capture; can layer preview later.
  - Live Activity push updates via APNs so the countdown stays fresh
    when the app is fully backgrounded for >8hrs — not needed for 15min
    sessions.

### Checkpoint 5 — Proactive push + completion without ticking

Items 5 and 8 from the original list. Two threads — both close the
"the model is doing real work in the background" loop.

**CP5.1 — Completion-without-ticking.** Extended the existing
`[SYNAPSE_ACTIONS]` chat protocol with a new `complete` action type
rather than building a parallel post-message extractor. Six surgical
edits to `src/screens/ChatScreen.tsx`:
  1. Added `{"type":"complete","taskText":"..."}` to the `outputFormat`
     schema the model sees.
  2. Added a COMPLETION-WITHOUT-TICKING block to `sharedRules`: when the
     user mentions in passing that they've already done something
     ("nailed that call", "sent it", "ok done the email") and it
     matches one of today's open tasks, emit a `complete` action and
     keep the conversational reply minimal ("Done." / "Noted."). Don't
     lecture, don't ask "how did it go", don't celebrate. Skip if the
     match is ambiguous and ask a clarifying question instead.
  3. New branch in `applyActions`: case-insensitive exact-match, then
     fuzzy-match (substring both directions, len ≥ 3), then
     today-only-or-any-open fallback. Calls existing
     `useStore.toggleTask(target.id)` so all the cascading work
     (completion log, recurrence clone, paired iOS Reminder, sync) is
     reused. Logs and skips silently on no-match.
  4. `applyResult` state shape gained a `completed?: number` field so
     the bottom-sheet summary can show "✓ N marked done".
  5. `handleReviewApply` derives `completedCount` and feeds the summary.
  6. Summary card renders the count.
  7. Action-dispatch path: if all parsed actions are `complete` /
     `focus` (passive types), skip the review sheet entirely and
     apply silently — completion-without-ticking should be invisible,
     not a confirm-dialog detour.

**CP5.2 — Proactive Haiku-authored push.** New
`src/services/proactivePush.ts` runs at most one decision per ~6h of
JS lifetime + at most one scheduled notification per local day
(stable identifier `synapse-proactive-<YYYY-MM-DD>`). The decision
call hands Haiku: portrait (4 sections), last 3 days of completion
log, today's the-one, and the next 4 open tasks. The system prompt
is strict on voice — banned words, no exclaim marks, no "Great job",
no fake urgency, max 18 words, lower-case casual fine. Output is a
JSON object `{shouldPing, message}`; defensive parse + a banned-word
audit drop messages that snuck through. If passing, schedules a
local notification (date trigger) for today's 9-11am window if
we're inside it (90s delay), otherwise tomorrow 9:30. Tap path:
the notification handler in `src/navigation/index.tsx` reads the
seed off the notification's `data.proactiveSeed`, computes today's
dump-mode `chatSessionKey`, and `appendChatSessionMessage`s a
fresh `assistant` turn (id `proactive:<YYYY-MM-DD>` for
de-dupability) BEFORE navigating to `Chat`. ChatScreen mounts,
loads the session, and renders the assistant message in its
left-aligned bubble — the user lands inside a conversation
already in flight, framed correctly, rather than seeing the
seed as their own pending input.

  - `requestPermissions` post-grant effect now calls
    `runProactiveDecision()` once on first permission grant.
  - `AppState 'active'` handler in `RootNavigator` calls it on every
    foreground; cheap when already-decided-today.
  - Settings → "PROACTIVE NOTES" section with an opt-out switch.
    Default = enabled. Toggling off cancels today's pending push
    immediately via `cancelProactivePush()`.
  - New profile field `proactivePushEnabled?: boolean` (optional, no
    migration needed — default treated as enabled).
  - New helper `extractProactiveSeed(data)` so the
    `NotificationHandler` in `src/navigation/index.tsx` can identify
    proactive-push taps and pull the seed line out of the
    notification's `data` payload.

**CP5.3 — Verify.** `npx tsc --noEmit` clean after CP5.1 and after
CP5.2. Both the chat-action `complete` path and the proactive push
service compile against the existing `Task`, `Portrait`,
`CompletionEntry`, and `RootStackParams` types with no surface
changes to the public store API. Manual walk-through pending on
Sam's device.

**CP5 deferred / future:**
  - Background-fetch trigger so the decision can run without the
    user opening the app — current implementation needs a foreground.
    `app.json` already declares `fetch` + `remote-notification`
    UIBackgroundModes, so adding `expo-background-fetch` later is a
    small follow-up.
  - Per-portrait push frequency tuning — some users will want once
    every other day, not daily. Extend `proactivePushEnabled` to a
    cadence enum (`'off' | 'daily' | 'rare'`).
  - Telemetry on which proactive pushes get tapped vs ignored —
    drives a feedback loop on the model's decision quality. Wait
    until D7 retention shape is clear before instrumenting.
  - User-authored "send a test ping now" button in Settings — the
    `runProactiveDecision({force:true})` plumbing supports it but
    UI is deferred until first real-user friction shows up.

### Checkpoint 6 — Capture completeness

The premise: the app already had five fast-capture paths (widget, share
sheet, Siri, app-icon long-press, paperclip), but discoverability and
coverage were uneven — and PDFs / images / clipboard text could not
actually land *inside* the app. CP6 closes that input-surface gap before
we move on to the brain upgrade. Six surgical edits across attachments,
clipboard, picker, tour, and Settings.

**CP6.1 — PDF picker → Chat as attachment.** New
`src/services/attachments.ts` encapsulates the three-step flow:
`expo-document-picker` selection → SDK 54 class-based
`new File(uri).base64()` read → Anthropic `document` content-block
builder. The `MAX_BYTES = 7 * 1024 * 1024` cap is set by the Supabase
Edge Function proxy's ~10MB body limit, not the Anthropic 32MB ceiling
— a 7MB raw file becomes ~9.5MB after base64 inflation, leaving
headroom for the JSON envelope. `pickPdfAttachment()` returns a
discriminated union (`ok | cancelled | too_large | error`) so
`ChatScreen` can map every branch to the right user-facing message
without `try/catch` plumbing.

**CP6.2 — Paste-from-clipboard one-tap on Dump.** `expo-clipboard`'s
`hasStringAsync()` peeks silently (no iOS pasteboard banner — that's
the gotcha; `getStringAsync()` triggers the banner every time).
ChatScreen runs the peek on `mode === 'dump'` mount and on each
AppState `'active'` transition. If clipboard has text and the user
hasn't dismissed the prompt, a small "Paste" pill appears above the
composer; tapping it calls `getStringAsync()` (the banner here is
expected — the user explicitly asked) and appends to the existing
input with `\n\n`. Dismissed pills don't reappear until clipboard
content actually changes.

**CP6.3 — Image capture from camera roll → Chat.**
`expo-image-picker` with `launchImageLibraryAsync({base64: true})`,
permission gate via `requestMediaLibraryPermissionsAsync`. Reuses the
same `ChatAttachment` schema and Supabase 7MB ceiling. iOS
`ActionSheetIOS.showActionSheetWithOptions` provides the native
"PDF / Photo / Cancel" picker triggered by the paperclip;
`Alert.alert` is the Android fallback. `Info.plist` gained
`NSPhotoLibraryUsageDescription` and `NSDocumentsFolderUsageDescription`.

The persistence design for attachments is the part most likely to bite
later if forgotten: `useStore.appendChatSessionMessage` strips the
heavy `b64` field at the persist boundary
(`{ ...msg, attachment: { ...msg.attachment, b64: undefined } }`) so
chat history stays small in AsyncStorage but the metadata (kind, name,
mediaType, sizeKB) is kept — enough for the user-bubble chip to render
correctly on cold-start. `buildAnthropicContent(msg)` returns either a
plain string or a content-block array depending on whether `b64` is
still present — meaning a re-sent historical turn falls back to a text
description gracefully rather than breaking the API call.

**CP6.4 — Onboarding tour for capture surfaces.** New
`src/screens/CaptureToursScreen.tsx` is a five-card modal —
widget → share → Siri → long-press → paperclip — with skip in the top
bar (CP3.6 "skip louder than continue"), pagination dots, and a single
"Got it / Done" CTA. Trigger lives inside `HomeAdaptive`'s existing
`useFocusEffect`: `!profile.captureTourSeenAt && state !== 'narrow' &&
hasChattedAtLeastOnce`, deferred 600ms so the modal animates after
the tab transition completes. `markSeenAndClose` writes
`profile.captureTourSeenAt = new Date().toISOString()` so it shows
once per profile. Card data lives in `src/data/captureSurfaces.ts` —
single source of truth shared with CP6.5.

**CP6.5 — Settings → "Capture surfaces" status panel.** A new
section after CALENDAR SYNC lists the same five surfaces, each row
tappable to deep-link into the tour at that specific card via the new
`CaptureTour: { initialIndex?: number } | undefined` route param, plus
a "Walk me through these again" pill at the bottom that re-launches
the tour from card 1. iOS doesn't expose whether the user has actually
added the widget / configured Siri, so the panel doesn't pretend to —
it's a discoverability + re-trigger surface, not a status checker.
Re-using `CAPTURE_SURFACES` from CP6.4's data file means the copy will
never drift between the tour and the Settings rows.

**CP6.6 — TestFlight build #1.** iOS `buildNumber` bumped, `tsc`
clean, `expo prebuild` regenerated `ios/`, `eas build --profile
production --platform ios --auto-submit` kicked. First TestFlight wave
gets to test the full capture surface (PDF + image + paste +
widget + Siri + share + paperclip) before we move on to CP7's brain
upgrade.

