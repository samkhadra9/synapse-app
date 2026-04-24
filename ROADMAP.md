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

