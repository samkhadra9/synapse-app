# CP4 Setup — Widget + Quick Actions + Share Sheet + Siri + Live Activity

This checkpoint ships five native iOS features that can only be built on
your Mac with Xcode. Everything JS-side is already wired. This doc is
the sequence of commands + clicks to get the native pieces live on your
iPhone.

> **Important**: widgets, Live Activities, Share Extensions, and Siri
> AppIntents do **not** work reliably in the iOS Simulator. You need a
> real iPhone plugged in (or paired wirelessly) to actually test them.

---

## 1 — Install packages

```bash
cd SynapseApp
npm install
```

This pulls in:

- `@bacons/apple-targets` — config plugin that turns `targets/*/` folders
  into real Xcode extension targets at prebuild time.
- `expo-quick-actions` — long-press app-icon shortcuts.
- `react-native-shared-group-preferences` — JS wrapper around
  `UserDefaults(suiteName:)` for the App Group bridge.

## 2 — Prebuild

```bash
npx expo prebuild --clean
```

This regenerates the `ios/` folder from `app.json`. The `--clean` flag
wipes any stale native code. After it finishes you should see:

- `ios/Aiteall.xcworkspace`
- `ios/AiteallWidget/` — the widget extension target
- `ios/AiteallShare/` — the share extension target
- `ios/Pods/AiteallNative/` — the local Swift module containing Siri
  AppIntent + Live Activity bridge

If prebuild fails with "unknown plugin `@bacons/apple-targets`", run:

```bash
rm -rf node_modules package-lock.json
npm install
npx expo prebuild --clean
```

## 3 — Install Pods

```bash
cd ios
pod install
cd ..
```

## 4 — Open Xcode

```bash
open ios/Aiteall.xcworkspace
```

Open the **workspace**, not the `.xcodeproj`. CocoaPods-installed
projects only build from the workspace.

## 5 — Set signing

In Xcode's left-hand navigator, click the **Aiteall** project root. You'll
see a Targets list: `Aiteall`, `AiteallWidget`, `AiteallShare`.

For **each** target:

1. Click the target
2. Go to **Signing & Capabilities** tab
3. Check **Automatically manage signing**
4. Pick your Apple Developer **Team** from the dropdown
5. Verify the **Bundle Identifier** matches:
   - `Aiteall` → `com.synapseadhd.app`
   - `AiteallWidget` → `com.synapseadhd.app.widget`
   - `AiteallShare` → `com.synapseadhd.app.share`

Xcode will provision the Bundle IDs automatically on first build.

## 6 — Verify App Groups

Still in **Signing & Capabilities**, for each of the three targets:

1. Look for an **App Groups** capability row
2. Confirm `group.com.synapseadhd.app` is checked

If the App Groups row is missing, click **+ Capability** → **App Groups**
→ **+** → type `group.com.synapseadhd.app`.

*(This is the one step most likely to need a click. The config plugin
sets it in the entitlements file, but Xcode sometimes needs a manual
re-toggle to pick up the capability in the provisioning profile.)*

## 7 — Plug in an iPhone and run

1. Connect your iPhone via USB (or pair wirelessly via Window → Devices
   and Simulators)
2. In the Xcode toolbar, pick your iPhone as the run target
3. Press **⌘R**

First launch will take ~90 seconds while Xcode codesigns everything and
spins up the app. Subsequent launches are fast.

## 8 — Test the features

### Widget

1. Long-press the home screen → **+** in the top-left → search "Aiteall"
2. Add **The one** widget in Small or Medium size
3. If you have a the-one set in the app, you'll see it. Otherwise you'll
   see "Nothing chosen. Tap to talk it out."
4. Tap the widget → app opens in dump chat

### Quick Actions

1. On the home screen, long-press the Aiteall app icon
2. You should see three shortcuts:
   - **Dump something quick**
   - **Mark the one done**
   - **I'm stuck**
3. Tapping any of them deep-links into the right flow

### Share Sheet

1. Open Safari, navigate to any page
2. Tap the Share button
3. Scroll through the action row until you find **Send to Aiteall**
   *(first time only: tap **More** and toggle Aiteall on)*
4. Tap it. The Aiteall app opens in dump chat with the URL pre-filled as
   the first message

### Siri Shortcut

1. Hold down the side button (or say "Hey Siri" if enabled)
2. Say: **"Tell Aiteall I'm spiralling on the Cohen deal"**
3. The app opens in dump chat with that sentence pre-filled

Siri needs a few minutes after first install to index the shortcut. If
it doesn't recognise the phrase on the first try, wait a minute and
try again, or open **Settings → Siri & Search → Aiteall** to confirm
the shortcut is listed.

### Live Activity (15-min opener)

1. In the app, start a 15-minute focus session on any task
2. Swipe down to the lock screen — you'll see a pill with the task label
   and a countdown
3. On iPhone 14 Pro / 15 / 16 models, the Dynamic Island shows a
   compact countdown
4. Tap the pill → jumps back into the app's deep-work screen

If Live Activities don't appear, check
**Settings → Face ID & Passcode → Live Activities** is **on** and
**Settings → Aiteall → Live Activities** is also **on**.

---

## Troubleshooting

### "No provisioning profile matches"

Xcode probably picked the wrong Team. Go back to step 5 and make sure
every target has your team selected.

### "App Group not available"

Your Apple Developer account needs the App Group capability enabled. In
developer.apple.com → Certificates, Identifiers & Profiles → Identifiers
→ App IDs — find each of the three bundle IDs, enable **App Groups**,
and create a group called `group.com.synapseadhd.app` if it doesn't
exist.

### Widget shows stale data

The main app pushes updates to the widget on every the-one change via
`WidgetCenter.reloadAllTimelines()`. If a widget gets stuck showing old
data:
- Remove and re-add the widget
- Or: force-quit the app (swipe up from bottom, swipe the app card up)
  and relaunch

### Swift compile errors

If you see Swift errors referencing `FifteenAttributes` or
`TellAiteallIntent`, they'll usually be one-line fixes. Paste them back
to me and I'll patch.

### Simulator "can't run widget"

Correct — you need a physical iPhone. Widgets don't render in the
simulator; extensions don't install.

---

## What changed under the hood

For future-me: the pieces that make this all work.

- `app.json` — `scheme: aiteall`, `ios.entitlements` App Group,
  `UIApplicationShortcutItems`, `@bacons/apple-targets` + `expo-quick-actions`
  config plugins.
- `targets/widget/` — SwiftUI widget + Live Activity config.
- `targets/share/` — Share Extension (SLComposeServiceViewController).
- `modules/aiteall-native/` — local Expo module containing Siri AppIntent,
  Live Activity bridge, widget-reload callable.
- `src/navigation/linking.ts` — URL parser + deep-link dispatcher.
- `src/services/sharedState.ts` — writes the-one snapshot to App Group.
- `src/services/quickActions.ts` — registers + listens for shortcuts.
- `src/services/fifteen.ts` — starts/ends Live Activity on session start/end.
