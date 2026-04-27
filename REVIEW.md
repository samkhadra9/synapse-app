# Aiteall — Project Review (v2, end of CP10)

_Date: 27 April 2026. Built across CP1–CP10 over the rebuild from v1._

---

## Why we're rebuilding

v1 of Synapse was a competent-looking ADHD productivity app. It had one
real user. They used it for three days and stopped.

Sam read those three days hard. The pattern that emerged:

- The app was loud at rest. Counts, progress bars, streaks, alarm colours,
  badge dots, "Pro" pitches. The app vibrated even when you were just
  glancing at it.
- It demanded productivity hygiene — fields, categories, dates, priorities —
  before you'd given it anything. Capture had friction. Friction is a tax
  on people whose entire problem is friction.
- It punished gaps. A missed day showed up as a broken streak, an unread
  badge count, a lecture. ADHD users live in gaps. The app's posture toward
  gaps was the whole product.
- It had no "you" in it. It was a generic to-do app dressed in ADHD-friendly
  copy. Nothing about the user's actual life ever materialised inside it.

v2 is the same code base, redesigned from those four observations. The
working name for the design discipline is **"calm at rest, present in motion"**.
Everything else falls out of that.

---

## What v2 is

**Aiteall** (`com.synapseadhd.app`, scheme `aiteall://`) is an iOS-first
React Native / Expo SDK 54 app. It runs on the user's phone, stores everything
locally by default, and uses an LLM (Anthropic) as a planning + reflection
companion rather than as a feature bolted on.

The shape:

- **Three home views** — Narrow (fully cooked, paused, or bedtime),
  Held (you're in a 15-min session), Dashboard (the standard view).
  A single classifier picks the right one each time you open the app.
- **The One** — at most one task is foregrounded at a time. There's no
  priority system, no MIT-of-the-day badge fight. The thing you said
  matters today is the thing the home screen shows.
- **Chat as the main verb** — capture, planning, reflection, off-record
  venting, weekly review, all happen in conversation. Not as a side panel.
- **Portrait** — a quietly maintained model of who the user is, forked
  into Work-self and Life-self. Built passively from chat. Surfaces only
  when it's earned.
- **15-min opener** — the only "session" primitive. Soft haptic at start,
  one at the end, no countdown anxiety mid-session.
- **Pause** — "I'm cooked" puts the app into 2 hours of all-quiet and
  surfaces a soft re-entry when it lifts.
- **Capture surfaces** — share sheet, widget, quick actions, Siri Shortcut,
  paste-from-clipboard, photo, PDF. Every front door drops you in chat.
- **Off-record + day-end reflection + weekly review** — the companionship
  layer. The app remembers what you did, gently.

---

## Use case (one paragraph)

A person with ADHD opens their phone in the morning. They see one line —
the thing they decided last night was the one. They tap it, the 15-min
timer starts, the home screen goes quiet. They finish, or they don't. If
they didn't, nothing yells. They might tap the chat to say "I'm stuck" and
the app helps them either start small or rest. Through the day they
capture stray thoughts via the share sheet or widget — those land in chat,
not in a triage queue. At night the app gently shows them what they did
do today, in their own words. That's the loop. No streaks. No catch-up.
No "you're behind."

---

## What's been built (CP1 → CP10)

### CP1 — Peace pass

The first wave. Take everything urgent out of the resting state.

- **1.1–1.2** Replaced `isMIT` (most-important-task, plural, competitive)
  with `isTheOne` (singular, foregrounded). Wired through HomeNarrow,
  HomeHeld, Dashboard.
- **1.3** Built the 15-min opener — start haptic, end haptic, no chrome
  in between.
- **1.4** Copy audit. Banned: "crush", "smash", "boss", "killer", "achieve",
  emoji rocket, emoji fire, "✨ amazing ✨". Replaced with verbs the user
  would actually say to themselves.
- **1.5** Stripped ambient time pressure. No countdown timers in the
  resting state. No "23h 14m left in your day".
- **1.6** Removed counts, percentages, progress bars from anywhere the
  user might land while at rest. Numbers earn their place; resting
  screens have none.
- **1.7** Rewrote every empty state without shame ("you have 0 tasks"
  → "nothing here yet — and that's fine").
- **1.8** Updated the system prompts so the model uses "the one"
  vocabulary, not MIT/priority/urgent.

### CP2 — Visible peace

The visual layer of the same idea.

- **2.0** Killed the splash logo. Aiteall has no logo screen — bundle
  loads, app appears.
- **2.1** Killed streaks and the flame emoji entirely.
- **2.2** Colour discipline. No alarm reds. No "you're failing" oranges.
- **2.3** Time-of-day adaptive theme — dawn-pink at morning, deeper at
  night. The phone reflects the day, doesn't impose its own.
- **2.4** Stripped chrome in narrow/held — no tab bars, no nav, no
  badges. Just the line.
- **2.5** Whitespace pass on every screen.
- **2.6** No badge dots on the app icon. The app does not nag from the
  home screen.
- **CP2 hotfix** Restored tab menu in narrow/held when the user
  explicitly navigates (chrome recedes, doesn't disappear).

### CP3 — Motion and forgiveness

How the app behaves when you do things to it.

- **3.0** Haptics, sound, confetti discipline. Default to off. Enable
  only where the absence would be confusing.
- **3.1** Animation discipline. No bounce. Ease-out 200–300ms. Movement
  serves orientation, not delight.
- **3.4** Global undo snackbar. 10-second window on every destructive
  action. No "are you sure?" dialogs.
- **3.5** No required fields anywhere. Sensible defaults everywhere.
- **3.6** Skip is louder than Continue in any walkthrough.
- **3.7** No retrospective catch-up. If you missed yesterday, yesterday
  is gone. The app does not chase.
- **3.8** No re-auth walls. If the session is alive, you're in.
- **3.9** Verify pass.

### CP4 — Capture infrastructure

Bringing thoughts into the app from anywhere.

- **4.1a–4.1e** Deep link scheme (`aiteall://`), App Group entitlement,
  shared state bridge, SwiftUI home-screen widget, long-press Quick
  Actions on the app icon, WIDGET_SETUP.md.
- **4.2a–4.2b** Share Extension target so any "Share to Aiteall" lands
  in chat. Siri Shortcut via AppIntents.
- **4.3** Live Activity for the 15-min session — visible on the lock
  screen and Dynamic Island, dismissable.

### CP5 — Proactive layer (light touch)

The app speaking first, but rarely.

- **5.0** Read existing completion extractor and notification setup.
- **5.1** Completion-without-ticking — the chat extracts "I did X"
  out of natural conversation and logs it. The user does not have
  to find a checkbox.
- **5.2** Daily push, authored by Haiku off the user's actual context.
  Not a generic "Good morning!".
- **5.3** Verify pass.

### CP6 — Capture completeness

Filling the remaining capture gaps.

- **6.1** PDF picker → chat attachment.
- **6.2** Paste-from-clipboard, one tap on the Dump screen.
- **6.3** Image capture from camera roll → chat.
- **6.4** Onboarding tour for capture surfaces.
- **6.5** Settings → Capture surfaces status panel.
- **6.6** TestFlight build #1.

### CP7 — Companionship layer

The thing that makes Aiteall not a to-do list.

- **7.1** Tool-use scaffold — the model can call structured tools
  (create-task, log-completion, set-the-one).
- **7.2** Session-continuity memory. Three-tier: continuity block →
  running memory → themes. The app remembers across days without
  re-introducing itself.
- **7.3** Background themes extractor. Quietly notes patterns —
  "you mention sleep on Sundays", "Tuesdays are heavy".
- **7.4** Daily token-cap guardrail. The app can't accidentally
  burn the user's quota.
- **7.5** Teach the prompt about the tools it has.
- **7.6** Eval harness for prompt regressions.

### CP8 — Supabase data layer

Optional sync, with care.

- **8.1** Auth confirm + session restore.
- **8.2** Schema additions for new entities.
- **8.3** Sync engine — per-mutation `syncIfAuthed`.
- **8.4** Reinstall restore flow.
- **8.5** Sign-out + delete-account flows. Account deletion is real
  and complete (Supabase function `delete-account`, 30-day retention
  on backups, then gone).
- **8.6** TestFlight build #2.

### CP9 — Presence carryover (this session)

The five moves I'd promised earlier and parked.

- **9.1** Pause mode. Tap "I'm cooked" → 2 hours of all-quiet.
  Notifications suspended. Soft re-entry when it lifts.
- **9.2** Portrait forking. The same person has a Work-self and a
  Life-self. The active one is switchable. The other keeps running
  in the background, accumulating its own observations.
- **9.3** Read-aloud TTS for chat replies. Off by default. Speaker
  toggle in chat header. Mute persists per session.
- **9.4** Streak-without-counting. The app surfaces a gentle line
  ("you've shown up two days running", "30-day stretch. Quietly
  stacking.") instead of a number. Anchored on showing-up days, not
  task completions, so a quiet day still counts.
- **9.5** Re-entry script after Pause expires. The app comes back
  with "Welcome back. No catch-up." not "you missed 4 hours".

### CP10 — TestFlight polish (this session)

- **10.1** Crash-free session audit. Lightweight error boundary
  catches render-time errors anywhere in the tree, surfaces a calm
  "something stumbled" fallback, records to an in-memory diagnostics
  buffer (capped at 25 entries, never network). Sentry deferred —
  the bundle and privacy cost don't pay back yet, and the migration
  is one callsite.
- **10.2** Cold-start latency. Side-effect installers
  (`installSharedStateSync`, `installQuickActions`) deferred past the
  first interaction frame via `InteractionManager.runAfterInteractions`.
  Shaves a measurable slice off time-to-interactive.
- **10.3** Empty-state copy pass. AreasScreen now reads "Nothing here
  yet — and that's fine. Areas are optional. Name one if it helps."
  instead of "No areas yet. Add your first area."
- **10.4** Accessibility pass. `accessibilityLabel` and
  `accessibilityRole="button"` on every must-tap surface I touched —
  Undo snackbar dismiss + undo, day-end reflection close, 15-min
  banner Done, ambient chat strip edit pencil, ambient input,
  floating add button capture input, chat composer, inline task
  edit input, area-detail back buttons. Hit-slop standardised at
  12pt around small targets to clear Apple's 44pt rule.
- **10.5** PRIVACY.md — comprehensive. On-device default, AI
  provider boundaries (Anthropic for chat, OpenAI Whisper for
  transcription, neither retains), opt-in Supabase sync, what we
  don't collect, off-record/pause controls, export/delete, App
  Store Privacy Nutrition Label section.
- **10.6** Build bump. iOS buildNumber → 5, Android versionCode → 5.
  Ready for TestFlight build #3.

---

## Architecture in one diagram

```
[ Capture surfaces ]            [ The app ]                  [ Reflection ]
 share sheet,           →   chat (Anthropic Claude) ←   day-end "what I did"
 widget,                     │                          weekly review (5 steps)
 quick actions,              ├─ tool calls:             passive completion log
 Siri shortcut,              │   create_task            portrait builder (forked)
 PDF / image picker,         │   log_completion         themes extractor
 paste,                      │   set_the_one            
 voice (Whisper)             │   start_15min           
                             │
                             └─ presence layer:
                                 pause / re-entry
                                 streak-without-counting
                                 proactive daily push (Haiku)

   Storage:    AsyncStorage (Zustand) — local, source of truth
               SecureStore — auth tokens
               Supabase — opt-in mirror, fully deletable
               Diagnostics buffer — in-memory, never network

   Three home views, picked by UIStateClassifier:
     Narrow (cooked / paused / bedtime)
     Held (15-min in flight)
     Dashboard (standard)
```

---

## What's strong

- **The "calm at rest" discipline holds across every screen.** This is
  the thing v1 didn't have. It's not a coat of paint; it's wired into
  the choice of which view shows, which copy renders, which animation
  plays.
- **Capture is everywhere and friction-free.** Share sheet, widget,
  quick actions, Siri, paste, PDF, image, voice. Anything can be a
  thought, every thought lands in the same place.
- **The companionship layer is real, not a chatbot bolt-on.** Memory
  has three tiers, the model has tools, themes accrete, the portrait
  forks per self. Conversation is the primary surface, not an
  afterthought.
- **The off-record + pause + soft re-entry triangle.** v1 had no
  graceful place to be tired. v2 has three.
- **Privacy posture is genuinely on-device.** Default install never
  syncs. Sync is opt-in. Diagnostics never leave the device unless
  the user chooses to attach them to feedback. The PRIVACY.md is
  the rare one that matches reality.

---

## What's still thin

- **The portrait surface earns its place by accreting evidence over
  weeks.** Day-1 portraits will be sparse. We need to think about
  what week 1 vs week 4 vs month 3 of Aiteall actually look like.
- **Weekly review is encoded in the system prompt but not
  ritualised in the UI.** Sam's 5-step ritual is in the model's head,
  but there's no Sunday-evening surface that says "want to walk it?"
- **Multi-device.** Sync exists; conflict resolution is "last write
  wins". For one user with one phone, fine. For someone who installs
  on iPad later, edges show.
- **Android.** Most of CP4 is iOS-first (widgets, Siri, Live Activity,
  share extension). Android has the core but not the capture surface
  parity.
- **No notification budget.** Daily push is once. Re-entry pings are
  bounded. But there's no global "you've heard from us 3 times today,
  shut up" guard. Worth adding before the wave.
- **Sentry-shaped hole.** CP10.1 ships a lightweight buffer rather
  than full crash reporting. If the wave finds a real crash we won't
  see it unless they email us. Acceptable for a closed wave; not
  forever.

---

## What we'd want to see from the next wave

Three signals, in order of importance:

1. **Day 4 retention.** v1 broke at day 3. If a meaningful share of the
   wave is still opening it on day 4 — even just opening, even just
   reading the line — that's the thing.
2. **Capture diversity.** What surfaces do they use? If it's only
   in-app chat, the share sheet / widget work was decoration. If
   it's distributed, the front-door theory was right.
3. **Portrait emergence.** Do they get the "is this you?" moment
   between day 7 and day 14? If yes, the companionship layer is
   working. If no, the model is too cautious about asserting
   patterns.

We don't need to instrument any of these heavily. A "do you still
use it?" email at day 7 and day 21, plus the in-app feedback path,
will tell us what we need.

---

## TestFlight build #3 — what's in it

- All of CP9 (presence carryover)
- All of CP10 (polish)
- iOS buildNumber 5 / Android versionCode 5
- `tsc --noEmit` clean

Build command (Sam):
```bash
git push origin main
eas build --profile production --platform ios --auto-submit
```

Then the wave invitation goes out.

---

## After TestFlight #3

Sit. Watch. Don't ship CP11 until the wave has had a week.

The thing v1 taught us is that the app is not the test of the app.
The user is. CP1–10 was us putting the design where we thought it
needed to be. The next checkpoint is the wave telling us where it
actually is.
