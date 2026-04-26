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

- [ ] **9.1** Pause mode — "I'm cooked" → 2h all-quiet + soft re-entry
- [ ] **9.2** Portrait forking — Work-self / Life-self portraits, switchable
- [ ] **9.3** Read-aloud for chat replies (TTS, mute per session)
- [ ] **9.4** Streak-without-counting (gentle line, not number)
- [ ] **9.5** Re-entry script after Pause expires

---

## CP10 — TestFlight ready (final polish)

- [ ] **10.1** Crash-free session audit (Sentry)
- [ ] **10.2** Cold-start latency budget (<2s to interactive)
- [ ] **10.3** Empty-state copy pass (every screen with zero data)
- [ ] **10.4** Accessibility pass (Dynamic Type, VoiceOver labels)
- [ ] **10.5** Privacy nutrition + data-deletion docs for App Store
- [ ] **10.6** TestFlight build #3 — invite the wave

---

## How I work this file
1. Before each step, re-read this file.
2. After finishing a step, tick the box and continue.
3. After finishing a chunk, write a short completion note in `ROADMAP.md` under that chunk's heading.
4. Don't skip ahead — order is intentional.
