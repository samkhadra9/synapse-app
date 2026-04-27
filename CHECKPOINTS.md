# Aiteall — Forward checkpoints

> **Working protocol (Sam, 2026-04-26):** Analyse → structure into 5–6 item checkpoints → execute one at a time → build → TestFlight test. Each chunk is shippable on its own. Re-read this file at the start of every step so working memory doesn't drift.

---

## ✅ Shipped (do not re-do)
- **CP1** Presence — chat, ambient strip, today's-focus voice
- **CP2** Peace-at-rest dashboard
- **CP3** Motion & forgiveness (snooze, defer, voice softening)
- **CP4** Capture surfaces — widget, Siri, share sheet, Quick Actions, Live Activity
- **CP5** Proactive push + completion-without-ticking (5.1 + 5.2 + 5.3)
- **CP6** Capture completeness — PDF/paste/image inputs + onboarding tour + Settings status panel
- **CP7** Brain upgrade — agentic tools, session-continuity memory, themes, token cap, eval harness
- **CP8** Data layer (Supabase) — schema + sync for chat / completions / themes / memories, reinstall restore, account deletion
- **#57** Quick Actions duplicate fix
- **#55** Terminology pass — "today's focus"
- **#61, #62** misc polish

---

## ✅ CP6 — Capture completeness (shipped, build pending Sam's hands)

- [x] **6.1** PDF picker via `expo-document-picker` → Chat as attachment
- [x] **6.2** Paste-from-clipboard one-tap on Dump (`expo-clipboard`)
- [x] **6.3** Image capture from camera roll → Chat
- [x] **6.4** Onboarding tour (5 cards) for widget / share / Siri / Quick Actions / paperclip
- [x] **6.5** Settings → "Capture surfaces" status panel (deep-links to tour cards + re-trigger)
- [~] **6.6** TestFlight build #1 — code committed (`3049a88`), iOS buildNumber 3, tsc clean. **Sam: run `git push` then `eas build --profile production --platform ios --auto-submit` from Mac to fire the actual TestFlight build.**

---

## ✅ CP7 — Brain upgrade *(Sam's spec: tools, session memory, themes, Sonnet, cost guardrail)*

- [x] **7.1** Tool-use scaffold — `edit_task`, `schedule_push`, `search_history`, `log_completion` in `src/services/chatTools.ts`; agentic loop in ChatScreen.sendToLLM (max 5 rounds, plain-text reply still flows through `[SYNAPSE_ACTIONS]`).
- [x] **7.2** Session-continuity memory — running per-session summaries written by Haiku on chat unmount; aged out at 7d (`pruneSessionMemories`); rendered into the system prompt via `renderRunningMemoryBlock`.
- [x] **7.3** Background themes extractor — `maybeRefreshThemes()` distills avoidance / wins / snags + a paragraph from the completion log + recent session summaries; throttled to once per 24h.
- [x] **7.4** Token-cap guardrail — `dailyUsage` rolling counter on the store + 600k/day soft cap; ChatScreen falls back to Haiku once exceeded (only on the proxy path; personal-key users uncapped).
- [x] **7.5** System prompt teaches the four tools — `TOOLS (CP7.1)` block in `getSystemPrompt`; tools-first guidance for surgical changes, `[SYNAPSE_ACTIONS]` for batch proposes.
- [x] **7.6** Eval harness — `scripts/eval-brain.mjs` runs 10 fixed prompts via Anthropic API directly, writes JSON to `eval-output/`, with `--diff a.json b.json` to compare runs.

---

## ✅ CP8 — Data layer (Supabase) *(shipped, build pending Sam's hands)*

D30 retention foundation. Reinstall = no data loss.

- [x] **8.1** Auth — email + password via `supabase.auth.signInWithPassword`; `getSession()` on boot + `onAuthStateChange` listener trigger `backgroundSync()` on `INITIAL_SESSION` / `SIGNED_IN`. Sessions persisted via `ExpoSecureStoreAdapter` (chunked).
- [x] **8.2** Schema additions in `supabase-schema.sql` — added missing profile/task columns + 5 new tables: `completions`, `chat_sessions` (jsonb messages array per session_key), `session_memories`, `themes` (singleton per user), `push_log`. All idempotent via `add column if not exists` / `create table if not exists`.
- [x] **8.3** Sync engine for new entities in `src/services/sync.ts` — `pushCompletion/pullCompletions`, `pushChatSession/deleteChatSession/pullChatSessions`, `pushSessionMemory/pullSessionMemories`, `pushThemes/pullThemes`. Wired through `pullAll()` and `pushAll()`. Store actions (`logCompletion`, `setChatSession`, `appendChatSessionMessage`, `clearChatSession`, `setSessionMemory`, `setThemes`) call `syncIfAuthed` so every mutation pushes up.
- [x] **8.4** Reinstall restore flow — `backgroundSync()` in `src/navigation/index.tsx` now merges the 4 new entity types into the store after pull (with `dedupeById` for completions). Reinstall = sign in → all chat history, completion log, session memories, themes hydrated.
- [x] **8.5** Sign-out + delete-account flows. Sign out already shipped. Delete-account now uses `requestAccountDeletion()` in sync.ts → wipes user-owned rows, invokes new `delete-account` edge function (admin-deletes the auth.users row using service-role key), signs out. Settings UI relabelled "Delete account". Edge function in `supabase/functions/delete-account/index.ts` — Sam: deploy with `supabase functions deploy delete-account` and `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`.
- [~] **8.6** TestFlight build #2 — code written, iOS buildNumber 4 / android versionCode 4, tsc clean. Sandbox couldn't `git add` due to a stale `.git/index.lock` + `HEAD.lock` on your Mac side of the FUSE mount. **Sam, from your Mac:**
  1. `cd ~/Documents/Personal/Projects/ADHDToolkit/SynapseApp && rm -f .git/index.lock .git/HEAD.lock`
  2. `git add -A && git commit -m "CP8 — Supabase data layer (D30 retention, account deletion)"`
  3. `git push origin main`
  4. In Supabase SQL Editor: paste full `supabase-schema.sql` (idempotent — safe to re-run; only the new ALTER/CREATE statements at the bottom apply)
  5. `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key>` (one-time; needed by `delete-account`)
  6. `supabase functions deploy delete-account`
  7. `eas build --profile production --platform ios --auto-submit`

---

## CP9 — Original CP6 carryover (deferred presence moves)

- [x] **9.1** Pause mode — "I'm cooked" → 2h all-quiet + soft re-entry
- [x] **9.2** Portrait forking — Work-self / Life-self portraits, switchable
- [x] **9.3** Read-aloud for chat replies (TTS, mute per session)
- [x] **9.4** Streak-without-counting (gentle line, not number)
- [x] **9.5** Re-entry script after Pause expires

---

## CP10 — TestFlight ready (final polish)

- [x] **10.1** Crash-free session audit (lightweight error boundary + diagnostics buffer; Sentry deferred)
- [x] **10.2** Cold-start latency budget (<2s to interactive) — defer side-effect installers via InteractionManager
- [x] **10.3** Empty-state copy pass (every screen with zero data)
- [x] **10.4** Accessibility pass (Dynamic Type, VoiceOver labels) — must-fix touch targets + TextInput labels
- [x] **10.5** Privacy nutrition + data-deletion docs for App Store (PRIVACY.md)
- [x] **10.6** TestFlight build #3 — invite the wave (iOS buildNumber=5, Android versionCode=5)

---

## CP11 — The Anticipator Pass (the temporal-holding thesis)

> Aiteall is a temporal holding system for humans who cannot reliably hold
> time in their head. CP1–10 made the app calm. CP11 makes the app *hold*
> the day, the week, and consequences across time — expressed through
> language, never imposed through interface.

Split into two waves so the temporal model gets calibrated before
proactive surfaces ride on it.

### ✅ CP11a — Wave A: passive temporal intelligence (shipped, build pending Sam's hands)

- [x] **11a.1** Build `buildWeekAheadContext()` — pure data service in
       `src/services/calendar.ts`. Pulls 7 days of calendar events,
       overlays per-day skeleton blocks, computes committed + habitual
       minutes per day, lists deadline tasks within the window, and
       highlights what's left today. Output is plain prompt text with
       three confidence tiers (committed/habitual/claimed) and a notes
       block teaching the model how to talk about each.
- [x] **11a.2** Wired week-ahead context into the dump-mode useEffect in
       `ChatScreen.tsx` (Promise.all alongside `buildTodayCalendarContext`)
       and added a TEMPORAL POSTURE section to the system prompt. The
       prompt teaches when to reach for it (when-questions, deadline
       carry-overs, heavy-day/light-day spotting, re-entry) and when not
       (no calendar dumps, no scolding).
- [x] **11a.3** Evening flow: step 4 now reads the WEEK AHEAD → TOMORROW
       section and surfaces the *shape* of tomorrow in one natural
       sentence ("tomorrow's a 7am run, then meetings 10–12, open after")
       before asking "what's the one thing tomorrow?". Skipped silently
       when both Committed and Habitual are empty.
- [x] **11a.4** Re-entry temporal context. Added a "back after 4h+ gap
       today" branch to HOW TO OPEN (uses CONTINUITY CONTEXT for the gap
       signal, WEEK AHEAD → TODAY for the next-event-or-open-afternoon
       cue) and updated the 3+ days branch to mention the shape of today
       when it's worth saying.
- [x] **11a.5** tsc clean. iOS buildNumber 6, Android versionCode 6.
       ROADMAP.md updated. **Sandbox couldn't `git add` due to a stale
       `.git/index.lock` (same FUSE issue as CP8.6).** Sam, from your Mac:
  1. `cd ~/Documents/Personal/Projects/ADHDToolkit/SynapseApp && rm -f .git/index.lock .git/HEAD.lock`
  2. If CP9+CP10 commit (`.commit-message.txt`) hasn't been made yet:
     `git add -A && git commit -F .commit-message.txt && rm .commit-message.txt`
     (otherwise skip — CP9+CP10 is already in)
  3. `git add -A && git commit -F .commit-message-cp11a.txt && rm .commit-message-cp11a.txt`
  4. `git push origin main`
  5. `eas build --profile production --platform ios --auto-submit` → TestFlight #4

- [~] **11a.6** Share Extension TestFlight fix. EAS build #16 succeeded
       (.ipa generated) but Apple App Store Connect rejected the submission:
       `Invalid Info.plist value. The value for the key 'NSExtensionActivationRule'
       in bundle Aiteall.app/PlugIns/AiteallShare.appex is invalid.`

       Root cause: `@bacons/apple-targets` v4.0.6 ships a default share
       Info.plist with `NSExtensionActivationRule` set to the string
       `"TRUEPREDICATE"` (build/target.js L425-432), which Apple no longer
       accepts. Our `targets/share/expo-target.config.js` declares the
       correct dict form, but the package only writes Info.plist when
       absent (build/with-widget.js L184-189) — it never merges the
       config infoPlist field into an existing file. `targets/*/Info.plist`
       was gitignored, so on Sam's Mac the locally-corrected file masked
       the bug, but EAS clones a fresh checkout and the @bacons default
       generated the bad string form.

       Fix:
       - Edited `targets/share/Info.plist` to dict form
         (`NSExtensionActivationSupportsText` true,
         `NSExtensionActivationSupportsWebURLWithMaxCount` 1,
         `NSExtensionActivationSupportsWebPageWithMaxCount` 1).
       - Un-gitignored that one file via `!targets/share/Info.plist`
         negation in `.gitignore` (with a comment explaining why), so the
         corrected plist ships to EAS. `@bacons` will see the file exists
         on EAS too and leave it alone.
       - Bumped iOS buildNumber 6→7, Android versionCode 6→7.

       **Sam, from your Mac:**
  1. `cd ~/Documents/Personal/Projects/ADHDToolkit/SynapseApp && rm -f .git/index.lock .git/HEAD.lock`
  2. `git add -A && git commit -F .commit-message-share-fix.txt && rm .commit-message-share-fix.txt`
  3. `git push origin main`
  4. `eas build --profile production --platform ios --auto-submit` → TestFlight #4 (real this time)

       Wave success metric (replaces CP10 triplet):
       - **Floor:** day-4 retention (need users opening the app to ask anything).
       - **Primary:** day-7+ felt-state question — *"Did you ever feel relieved
         that something you would have forgotten was already held by the app?"*

### CP11b — Wave B: active anticipation (system-initiated)

Held until CP11a calibrates with the wave. Sketched here so we don't
forget the destination:

- [ ] **11b.1** Per-slot Aiteall-native reminders ("your 10:30 block is
       ready when you are"). Scheduled via `expo-notifications` when a
       day plan is saved, cancelled when the slot is ticked or shifted.
       Max 2–3 per day. Circuit breaker: dismiss-without-acting 3 times
       in a row → quiet for the rest of the day.
- [ ] **11b.2** Gap awareness in chat — proactive "you have a free 30
       between meetings, want to use it?" Fired only when receptivity
       signals say the user has bandwidth.
- [ ] **11b.3** Consequence awareness — "next clean window for this is
       Tuesday" said unprompted, with confidence hedging.
- [ ] **11b.4** Continuity awareness — "you usually run here, want to
       keep that?" Pattern-shift detection: 3 consecutive corrections
       → treat the pattern as moved.
- [ ] **11b.5** Verify + ship TestFlight #5.

### Wave success metric (replaces the CP10 triplet)

Layered:
- **Floor (behavioural):** day-4 retention. You need users opening the
  app to ask them anything. Drop capture-diversity and portrait-emergence
  as wave-1 signals.
- **Primary (felt-state):** one survey question on day 7+ —
  *"Did you ever feel relieved that something you would have forgotten
  was already held by the app?"* Maps directly onto the thesis success
  condition. If retention is high but felt-state is no, we've built a
  calm-but-empty app.

---

## How I work this file
1. Before each step, re-read this file.
2. After finishing a step, tick the box and continue.
3. After finishing a chunk, write a short completion note in `ROADMAP.md` under that chunk's heading.
4. Don't skip ahead — order is intentional.
