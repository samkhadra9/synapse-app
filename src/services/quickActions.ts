/**
 * CP4.1d — Quick Actions (long-press app icon)
 *
 * iOS long-press on the app icon shows up to four shortcut items.
 * We surface three:
 *
 *   Dump something quick   → aiteall://chat/dump
 *   Mark the one done      → aiteall://the-one/done
 *   I'm stuck              → aiteall://chat/dump?seed=I'm%20stuck
 *
 * UIApplicationShortcutItems in Info.plist declares these *statically*
 * — they're present even if the app has never launched. But we still
 * wire a JS-side listener because:
 *
 *   1. We want to deep-link the tap through our own linking.ts so the
 *      widget / share sheet / Siri all use the same code path.
 *   2. We can't put ?seed=... into Info.plist reliably.
 *
 * `expo-quick-actions` handles both sides: it reads the static
 * Info.plist items AND lets us set dynamic items at runtime + listen
 * for taps.
 */
import { Platform } from 'react-native';
import { applyDeepLinkAction, parseAiteallUrl } from '../navigation/linking';

type QuickActionModule = {
  setItems: (items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    params?: Record<string, string>;
  }>) => Promise<void>;
  addListener: (listener: (action: {
    id: string;
    params?: Record<string, string>;
  }) => void) => { remove: () => void };
  initial?: {
    id: string;
    params?: Record<string, string>;
  } | null;
};

let qa: QuickActionModule | null | undefined;

function getModule(): QuickActionModule | null {
  if (qa !== undefined) return qa;
  if (Platform.OS !== 'ios') {
    qa = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-quick-actions');
    qa = (m?.default ?? m) as QuickActionModule;
  } catch {
    qa = null;
  }
  return qa;
}

/** Map a quick-action id to the URL we want the app to deep-link into. */
function urlForAction(id: string): string | null {
  switch (id) {
    case 'dump':           return 'aiteall://chat/dump';
    case 'the-one-done':   return 'aiteall://the-one/done';
    case 'stuck':          return `aiteall://chat/dump?seed=${encodeURIComponent("I'm stuck")}`;
    default:               return null;
  }
}

/**
 * Register the dynamic items (idempotent — safe to call on every mount)
 * and install the tap listener. Also consumes the cold-start action if
 * the app was launched by a long-press tap.
 */
export function installQuickActions(): () => void {
  const mod = getModule();
  if (!mod) return () => {};

  // Keep the dynamic list aligned with the Info.plist static list.
  // Setting them here too lets the titles be localised later without
  // a new TestFlight build.
  mod.setItems([
    { id: 'dump',         title: 'Dump something quick', icon: 'compose' },
    { id: 'the-one-done', title: 'Mark the one done',    icon: 'accept' },
    { id: 'stuck',        title: "I'm stuck",            icon: 'message' },
  ]).catch(() => { /* ignore — Info.plist list is still active */ });

  // Cold-start consumption: if the app was opened by tapping a shortcut,
  // expo-quick-actions exposes the initial action.
  if (mod.initial) {
    const url = urlForAction(mod.initial.id);
    if (url) applyDeepLinkAction(parseAiteallUrl(url));
  }

  const sub = mod.addListener(evt => {
    const url = urlForAction(evt.id);
    if (url) applyDeepLinkAction(parseAiteallUrl(url));
  });

  return () => sub.remove();
}
