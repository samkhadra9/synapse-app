# Synapse — ADHD Executive System App

A React Native (Expo) mobile app for iOS and Android. Synapse helps people with ADHD manage their day through structured morning planning, habit tracking, AI-powered project decomposition, and SMS reminders.

---

## What's in this repo

```
SynapseApp/          ← React Native Expo app
SynapseBackend/      ← Node.js backend (Twilio SMS + OpenAI)
```

---

## Quick start — App

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode 15+ (for Simulator or physical device)
- Android: Android Studio (for Emulator)
- Expo Go app on your phone (fastest way to test)

### Install and run

```bash
cd SynapseApp
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS or Android) to run instantly on your phone, or press `i` for iOS Simulator, `a` for Android Emulator.

### Folder structure

```
SynapseApp/
├── App.tsx                          # Root entry point
├── app.json                         # Expo config (bundle ID, permissions)
├── src/
│   ├── theme/index.ts               # Design system (colours, typography, spacing)
│   ├── store/useStore.ts            # Zustand global state + AsyncStorage persistence
│   ├── navigation/index.tsx         # React Navigation (Stack + Bottom Tabs)
│   ├── services/
│   │   ├── openai.ts                # GPT-4o: morning structuring + project decomposition
│   │   └── notifications.ts         # Expo Notifications: schedule + handle deep links
│   └── screens/
│       ├── onboarding/
│       │   ├── WelcomeScreen.tsx
│       │   ├── LifeDomainsScreen.tsx
│       │   ├── GoalSettingScreen.tsx
│       │   └── SMSSetupScreen.tsx
│       ├── HomeScreen.tsx           # Today view (MITs + habits + todos + streak)
│       ├── MorningPlanningScreen.tsx# Guided 10-15 min planning session
│       ├── EveningReviewScreen.tsx  # End-of-day reflection
│       ├── ProjectsScreen.tsx       # Project list
│       ├── ProjectDetailScreen.tsx  # AI project decomposition
│       ├── GoalsScreen.tsx          # Goals by domain × time horizon
│       ├── SettingsScreen.tsx       # Profile, API keys, notification times
│       └── AddTodoScreen.tsx        # Quick-add task modal
```

---

## Quick start — Backend (for SMS features)

The backend handles Twilio SMS and is **optional** — the app works fully without it (push notifications replace SMS).

### Setup

```bash
cd SynapseBackend
npm install
cp .env.example .env
# Edit .env with your Twilio and OpenAI credentials
node server.js
```

### Environment variables

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | From console.twilio.com |
| `TWILIO_AUTH_TOKEN` | From console.twilio.com |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (e.g. +14155551234) |
| `OPENAI_API_KEY` | From platform.openai.com |
| `AUTHORISED_PHONES` | Comma-separated list of user phone numbers |
| `PORT` | Server port (default: 3000) |

### Deploy to Railway (recommended — free tier available)

1. Create a free account at [railway.app](https://railway.app)
2. New project → Deploy from GitHub repo
3. Add environment variables in the Railway dashboard
4. Copy your deployment URL (e.g. `https://synapse-backend.up.railway.app`)
5. Paste this URL into the app under Settings → Backend URL

### Configure Twilio webhook

1. Go to [console.twilio.com](https://console.twilio.com)
2. Phone Numbers → your number → Messaging
3. Set **"A message comes in"** webhook URL to:
   ```
   https://your-backend.railway.app/sms/inbound
   ```
   Method: `HTTP POST`

### How SMS flow works

```
7:30 AM — Backend cron fires
        → Sends morning SMS to registered users:
          "Good morning! Reply with everything in your head today…"

User replies with brain dump
        → Twilio forwards to /sms/inbound
        → Backend sends to OpenAI GPT-4o
        → AI returns structured plan (3 MITs + todo list)
        → Backend sends confirmation SMS with top 3 priorities
        → Plan stored, waiting for app to collect

App opens (or polls /daily-plan/:phone)
        → Detects new plan → imports tasks automatically
        → User sees their structured day in HomeScreen
```

---

## Feature overview

### Onboarding (3 steps)
1. **Welcome** — value proposition
2. **Life Domains** — pick which areas of life you want to develop (health, career, relationships, finance, learning, creativity, spirituality, community)
3. **Goal Setting** — set goals for each domain across 4 time horizons (monthly, 1 year, 5 years, 10 years)
4. **SMS Setup** — phone number + timing preferences + notification opt-in

### Today (HomeScreen)
- Shows date + energy level
- Morning planning banner (disappears once completed)
- **Top 3 priorities** (MITs) — enforced maximum of 3; tappable to complete
- **Daily habits** — horizontal scroll strip, tap to mark done; streak dots
- **Other tasks** — remaining todos for today, separated from habits and MITs
- **7-day streak tracker**
- Evening review banner appears after 5 PM

### Morning Planning (10-15 min guided session)
1. Energy check-in (1-5 scale)
2. Brain dump — free-form text
3. AI structures the text → shows task list
4. User selects their Top 3 MITs
5. Plan locked in, tasks added to today

### Projects + AI Decomposition
- Create projects with domain tagging + deadline
- "Break it down with AI" — GPT-4o analyses the project and generates:
  - Step-by-step task list with time estimates
  - Identifies the "next action" (the single most important step)
  - Estimated total hours
- "Add to today" button on any task
- Progress bar tracks completion

### Goals
- 8 life domains × 4 time horizons = 32 goal slots
- Tap any cell to set/edit a goal
- Goals are used as context in morning planning AI (keeps priorities aligned with the bigger picture)

### Evening Review
- Recap of MITs (done vs not done)
- Focus score (1-5)
- Open-loops brain dump
- One intention for tomorrow

---

## Building for App Store / Google Play

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo account
eas login

# Configure build
eas build:configure

# Build for iOS (requires Apple Developer account - $99/yr)
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

The `app.json` is already configured with:
- Bundle ID: `com.synapseadhd.app`
- iOS permissions: notifications
- Android permissions: notifications, internet

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo ~51) |
| Navigation | React Navigation v6 |
| State | Zustand + AsyncStorage |
| AI | OpenAI GPT-4o |
| Notifications | Expo Notifications |
| SMS | Twilio (via Node.js backend) |
| Backend | Express.js + node-cron |
| Language | TypeScript |

---

## Customisation

### Change brand name
Search and replace `Synapse` → your brand name across all files.

### Add more life domains
Edit `src/store/useStore.ts` → `LifeDomain` type and update `DomainColors`/`DomainIcons` in `src/theme/index.ts`.

### Connect to a real database
The backend uses in-memory storage. Replace the `users` object in `server.js` with calls to your preferred database (Postgres via Supabase, MongoDB, etc.).

### ConvertKit / email list
In the landing page (`landing_page/index.html`), replace the `FORM_ENDPOINT` constant with your ConvertKit form action URL.

---

## Costs (at scale)

| Service | Free tier | Paid |
|---|---|---|
| Railway (backend hosting) | $5/mo credit | ~$5-10/mo |
| Twilio (SMS) | $15 credit | ~$0.0079/SMS sent + $0.0079/SMS received |
| OpenAI (GPT-4o) | — | ~$0.005 per morning planning session |
| Expo (app builds) | Free | $29/mo (EAS Production) |
| Apple Developer | — | $99/yr |
| Google Play | — | $25 one-time |

---

*Synapse is a prototype. Brand name is provisional — verify trademark availability before launch.*
