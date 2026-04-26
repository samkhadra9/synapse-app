# Aiteall — Forward checkpoints

> **Working protocol (Sam, 2026-04-26):** Analyse → structure into 5–6 item checkpoints → execute one at a time → build → TestFlight test. Each chunk is shippable on its own. Re-read this file at the start of every step so working memory doesn't drift.

---

## ✅ Shipped (do not re-do)
- **CP1** Presence — chat, ambient strip, today's-focus voice
- **CP2** Peace-at-rest dashboard
- **CP3** Motion & forgiveness (snooze, defer, voice softening)
- **CP4** Capture surfaces — widget, Siri, share sheet, Quick Actions, Live Activity
- **CP5** Proactive push + completion-without-ticking (5.1 + 5.2 + 5.3)
- **#57** Quick Actions duplicate fix
- **#55** Terminology pass — "today's focus"
- **#61, #62** misc polish

---

## 🟢 In flight: CP6 — Capture completeness

Close the input-surface gap before brain work. Every fast-capture path must work and be discoverable.

- [x] **6.1** PDF picker via `expo-document-picker` → Chat as attachment
- [x] **6.2** Paste-from-clipboard one-tap on Dump (`expo-clipboard`)
- [x] **6.3** Image capture from camera roll → Chat
- [x] **6.4** Onboarding tour (5 cards) for widget / share / Siri / Quick Actions / paperclip
- [x] **6.5** Settings → "Capture surfaces" status panel (deep-links to tour cards + re-trigger)
- [ ] **6.6** TestFlight build #1 — user-test capture coverage

---

## CP7 — Brain upgrade *(confirmed by Sam)*

> Sam's spec: **Tool use yes. Memory: session continuity for a period of time + background "themes" running. Needs context. Model: Sonnet — best AI interface we can have, strong early.**

- [ ] **7.1** Tool-use scaffold in Edge Function — tools: `edit_task`, `schedule_push`, `search_history`, `log_completion`
- [ ] **7.2** Session-continuity memory: running summary per session, persists for N days (e.g. 7) then ages out
- [ ] **7.3** Background "themes" extractor — async pass that distills recurring patterns (avoidance topics, win patterns, snags) into a small themes file the model reads each turn
- [ ] **7.4** Model switch to Sonnet for chat; cost guardrail (daily token cap per user, fallback to Haiku for ambient strip only)
- [ ] **7.5** Extend `[SYNAPSE_ACTIONS]` JSON protocol to expose new tools to the model
- [ ] **7.6** Eval harness — 10 fixed prompts × pre/post diff before TestFlight

---

## CP8 — Data layer (Supabase)

D30 retention foundation. Reinstall = no data loss.

- [ ] **8.1** Auth: confirm magic-link state, finish wiring
- [ ] **8.2** Schema: profiles, tasks, completions, chat_sessions, push_log, themes
- [ ] **8.3** RLS policies + sync engine (last-write-wins, conflict log)
- [ ] **8.4** Reinstall restore flow — sign in → pull state → seed local store
- [ ] **8.5** Sign-out + delete-account flows (App Store requirement)
- [ ] **8.6** TestFlight build #2 — verify reinstall = no data loss

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
