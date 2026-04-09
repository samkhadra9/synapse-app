# Synapse — Launch Plan
*Status: April 2026*

---

## Where We Are Right Now

| Thing | Status | Notes |
|---|---|---|
| App loads | ✅ Working | 6-second timeout safety net in place |
| UI redesign | ✅ Done | Teal + white + amber editorial aesthetic |
| Supabase auth code | ✅ Written | Login screen, sign up, sign out all coded |
| Cloud sync code | ✅ Written | Push/pull for all 7 tables coded |
| Supabase tables | ❌ NOT CREATED | Schema SQL has never been run — this is why it spins |
| Sign in / Sign up | ❌ Broken | Can't work until tables exist |
| Onboarding | ✅ Works locally | Untested with real auth |
| Chat / AI | ✅ Works | Needs OpenAI key |
| Deep Work timer | ✅ Works | All 3 phases working |
| Projects | ✅ Works locally | Untested with sync |
| Goals | ✅ Works locally | Untested with sync |

---

## Step 1 — Fix Right Now (30 minutes)

### 1a. Run the database schema

Go to **supabase.com** → your project → **SQL Editor** → New query

Paste the entire contents of `supabase-schema.sql` (in your SynapseApp root folder) and click **Run**.

You should see: *Success. No rows returned.*

Then check **Table Editor** in the sidebar — you should see tables: `profiles`, `tasks`, `habits`, `projects`, `goals`, `areas`, `deep_work_sessions`.

### 1b. Restart Expo with cache clear

```bash
npx expo start --clear
```

### 1c. Test the full flow yourself

1. Open Expo Go on your iPhone
2. Scan the QR code
3. You should see the **Login screen** (not a spinner)
4. Tap **Sign up** → enter your email + a password
5. Check your email — Supabase sends a confirmation link
6. Click the confirmation link
7. Go back to the app and sign in
8. Go through onboarding
9. Add a task, add a habit, start a deep work session
10. Kill the app completely, reopen — data should still be there

---

## Step 2 — How to Test It Yourself Properly (This Week)

Use it as your actual daily driver for 3-5 days before giving it to anyone else. Specifically test:

- **Morning**: open the app, use Chat → Morning planning, check MITs appear on Dashboard
- **During day**: tick off MITs, check off habits, start a Deep Work session
- **Evening**: use Chat → Evening review
- **Kill and reopen** the app every day — does data persist?
- **Sign out and sign back in** — does everything reload from cloud?

Write down every moment you feel friction or confusion. That list becomes your P1 fix list.

---

## Step 3 — Share with Test Users (Free, No App Store needed)

You don't need TestFlight or an Apple Developer account for initial testing. Use **Expo Go**.

### How to share:

1. Make sure your Mac is running `npx expo start`
2. In the Terminal, press **`p`** to publish to Expo's servers
3. You'll get a URL like `exp://u.expo.dev/...`
4. Send that URL to your tester
5. They install **Expo Go** from the App Store (free)
6. They open the URL in Expo Go

**Limitation:** They need to be on the same WiFi, OR you use `npx expo start --tunnel` so they can connect from anywhere.

**Better option for remote testers:** Create an Expo account (free at expo.dev), then run:
```bash
npx eas update --branch preview
```
This creates a shareable link that works anywhere without needing your Mac running.

---

## Step 4 — Before Giving to Anyone Else (Must Fix First)

These will definitely come up with external testers:

- [ ] **Email confirmation UX** — after sign up, user gets sent to their email with no instruction. Add a message: "Check your email to confirm your account, then come back and sign in."
- [ ] **Wrong password error** — test what happens if someone types wrong password. Make sure the error message is clear, not a cryptic Supabase error.
- [ ] **No OpenAI key** — Chat screen shows a message asking for a key. Most testers won't have one. Either add your own key to `.env` as `EXPO_PUBLIC_OPENAI_KEY` so it works for everyone, or be upfront that Chat needs a key.
- [ ] **Run the schema SQL** (see Step 1 — nothing works without this)

---

## Step 5 — TestFlight (When Ready for Wider Testing)

This is when you want more than 5 testers or want them to have a proper install.

Requires:
- Apple Developer account ($99/year at developer.apple.com)
- Run `npx eas build --platform ios` to create a build
- Upload to App Store Connect
- Add testers via TestFlight

This is a 2-3 hour process. Don't do it until the core flow works end-to-end.

---

## The Single Most Important Thing Right Now

**Run the schema SQL.** Everything else is blocked on that one step. The app is ready — the database just doesn't have any tables yet.

supabase.com → your project → SQL Editor → paste supabase-schema.sql → Run
