# Aiteall — Privacy

_Last updated: 27 April 2026_

Aiteall is an ADHD-friendly thinking companion. We've designed it so that the
*minimum amount of your private data* leaves your device, and so that you can
take it all with you (or delete it all) at any time.

This doc has two parts:

1. **What data we collect, why, and where it goes** — the substance.
2. **App Store Privacy Nutrition Label** — the values we declare to Apple.

If anything in here is unclear or feels wrong, email
**aiteall.app+privacy@gmail.com** and we'll fix the doc, the product, or both.

---

## 1. What data we collect

### 1.1 What lives on your device only

By default, the following is stored **only on your iPhone** in the app's
sandboxed local storage (`AsyncStorage`):

- The text you write in chat (your "dumps", weekly reviews, project chats).
- Your tasks, projects, areas, life goals, and habits.
- Your structured **Portrait** (the second-person profile of how you work
  best, what gets in the way, what you're building).
- Your daily logs, completion log, and session memory.
- App preferences (morning/evening times, selected domains, theme).

If you are signed out and have not enabled Cloud Sync, *none* of the above
ever leaves your phone.

### 1.2 What we send to AI providers (when you chat)

When you tap into a chat session, we call the **Anthropic API** (Claude) to
generate the assistant's reply. To do that we send:

- The current chat session's messages (the cap is the last 30 turns).
- A *system prompt* that includes your Portrait, recent session continuity,
  and a small set of cross-session themes — all derived from data on your
  phone.
- Any attachments you explicitly add to a message (PDF, image).

We do *not* send: your stored tasks, projects, goals, calendar events, or
completion log unless they appear inline in the system prompt context above
or in your own chat messages.

If you've enabled voice input, the recording of your voice is sent to
**OpenAI Whisper** for transcription only. Audio is not retained on our side.

Both providers' privacy policies apply to the content we send them:

- Anthropic: <https://www.anthropic.com/legal/privacy>
- OpenAI: <https://openai.com/policies/privacy-policy>

### 1.3 What we sync to our backend (only if you sign in)

Sign-in is **optional**. It exists for two reasons: (a) so you can reinstall
the app and get your data back, (b) so a future multi-device version can keep
your iPhone and iPad in sync.

When you sign in (Supabase Auth, magic link), we sync to a Supabase database
that we operate:

- Tasks, projects, areas, life goals, habits.
- Your Portrait and daily logs.
- The completion log and session memories used for AI continuity.
- Chat messages (so a reinstall restores your conversations).

We do *not* sync: your Anthropic or OpenAI API keys (those stay on-device in
secure storage), iOS Calendar events, iOS Reminders, on-device clipboard
contents, or anything you've marked **off-record** in chat.

### 1.4 What we never collect

- Advertising identifiers.
- Location.
- Contacts, photos library content, or microphone audio outside of a voice
  message you've explicitly recorded.
- Health or fitness data.
- Browsing history.
- Third-party analytics or session-replay tracking.

### 1.5 Crash diagnostics

If you opt in (Settings → Diagnostics), we use Apple's TestFlight crash
reporting to receive *anonymised* crash stack traces. No message contents,
task contents, or user identifiers are attached. You can disable this at any
time. Outside of TestFlight, no third-party crash SDK runs by default.

---

## 2. Your controls

### 2.1 Going off-record

Inside any chat, tap the eye icon to **go off-record** for 3 hours. While
off-record, we do not extract entities (tasks, projects, completions), do
not update your Portrait, and do not write to the cross-session theme
extractor. The conversation stays on your phone.

### 2.2 Pause mode

Tap "I'm cooked" on the home screen to pause all proactive notifications and
background AI activity for a chosen window. We schedule a single, gentle
re-entry notification when the window ends; nothing else fires.

### 2.3 Export your data

Settings → Export → "Download my data" produces a single JSON file with
everything stored on your device, including chat history. Save it anywhere
you like.

### 2.4 Delete your data

Two paths, both irreversible:

- **Delete app from iPhone**: removes all on-device data immediately. If you
  have not enabled Cloud Sync, nothing of yours remains anywhere.
- **Settings → Delete account**: removes your Supabase account and all rows
  associated with it from our backend. We use Supabase's
  `auth.admin.deleteUser()` server-side; the deletion cascades to your data
  rows. We do not retain backups of your account data beyond 14 days.

If you contact us at the email above, we will manually delete your account
and confirm deletion within 7 days.

### 2.5 Children

Aiteall is intended for users **17 and over**. We do not knowingly collect
data from children under 13. If you are a parent or guardian and believe a
child has used Aiteall, contact us and we will delete the account.

---

## 3. App Store Privacy Nutrition Label

The values below are what we declare in App Store Connect for the App
Privacy section.

### Data Used to Track You

**None.** Aiteall does not track users across apps or websites owned by
other companies.

### Data Linked to You

The following are linked to your account *only when you sign in for Cloud
Sync*. None are used for advertising or tracking.

| Data Type           | Purpose                | Linked? |
| ------------------- | ---------------------- | ------- |
| Email address       | Account auth (sign-in) | Yes     |
| User ID             | Account auth           | Yes     |
| User content (text) | App functionality      | Yes     |

### Data Not Linked to You

Crash data (TestFlight) — App functionality / diagnostics. Not linked to
identity.

### Third-party SDKs that may receive data

- **Anthropic** (Claude API): user content (chat messages + portrait
  context). Required for AI replies.
- **OpenAI** (Whisper API): voice recordings. Only if voice input is used.
- **Supabase**: email, user ID, user content. Only if signed in.

---

## 4. Changes to this policy

We'll bump the date at the top and write a one-line note in the app's
"What's new" notes when this changes. Material changes (new SDKs, new data
types collected) will be flagged in-app before they take effect.

---

## 5. Contact

- **Privacy questions / deletion requests**: aiteall.app+privacy@gmail.com
- **Bug reports / general support**: aiteall.app@gmail.com
- **In-app**: Settings → "Send feedback"

---

*This document doubles as the source for the Privacy Policy URL we link from
the App Store listing. The Markdown is rendered to HTML at
`https://aiteall.app/privacy`.*
