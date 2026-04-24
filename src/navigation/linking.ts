/**
 * CP4.1a — Deep link routing
 *
 * Unifies how the Widget, Quick Actions, Share Sheet, and Siri Shortcut
 * route back into the app. Every native extension taps a URL; the URL
 * routes to a screen with the right mode pre-seeded.
 *
 * Scheme: aiteall://
 *
 * Routes:
 *   aiteall://chat/dump              → Chat, mode='dump'
 *   aiteall://chat/dump?seed=<text>  → Chat, mode='dump', initialMessage=seed
 *                                      (used by Share Sheet + Siri)
 *   aiteall://chat/ritual            → Chat, mode='ritual'
 *   aiteall://deep-work              → DeepWork screen (15-min session)
 *   aiteall://the-one/done           → imperative "mark the one done" intent
 *                                      (consumed by a store subscriber)
 *
 * We deliberately do NOT use react-navigation's LinkingOptions config —
 * our Chat screen lives in a modal stack with param aliasing
 * (?seed → initialMessage) that the built-in parser makes awkward.
 * A thin URL listener + navigationRef.navigate() is simpler and honest.
 */
import { Linking } from 'react-native';
import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParams } from './index';
import { useStore } from '../store/useStore';

export const navigationRef = createNavigationContainerRef<RootStackParams>();

/**
 * Tiny URL parser for aiteall:// deep links.
 * Splits `aiteall://chat/dump?seed=foo` into `{ path: 'chat/dump', query: { seed: 'foo' } }`.
 * Not a general parser — only covers shapes we produce.
 */
function parseUrl(url: string): { path: string; query: Record<string, string> } {
  // Strip the scheme prefix. Both `aiteall://path` and
  // `exp://…/--/path` (dev-client) show up in practice; accept either.
  const cleaned = url
    .replace(/^aiteall:\/\//, '')
    .replace(/^exp:\/\/.*?\/--\//, '');
  const [rawPath, rawQuery = ''] = cleaned.split('?');
  const query: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try { query[decodeURIComponent(k)] = decodeURIComponent(v); } catch { /* ignore malformed */ }
  }
  return { path: rawPath, query };
}

/**
 * Pure URL parser. Returns an abstract action; no side effects.
 * Returned action is applied by `applyDeepLinkAction`.
 */
export type DeepLinkAction =
  | { kind: 'navigate'; screen: keyof RootStackParams; params?: Record<string, unknown> }
  | { kind: 'intent'; name: 'theOneDone' }
  | { kind: 'none' };

export function parseAiteallUrl(url: string): DeepLinkAction {
  try {
    const parsed = parseUrl(url);
    const path = parsed.path.replace(/^\/+/, ''); // strip leading slash
    const q = parsed.query;

    // chat/<mode>[/<projectId>]
    if (path.startsWith('chat/')) {
      const [, mode, projectId] = path.split('/');
      let seed = typeof q.seed === 'string' ? q.seed : undefined;
      if (mode !== 'dump' && mode !== 'ritual' && mode !== 'project') return { kind: 'none' };
      // Share-extension fallback: if no ?seed in the URL (iOS can
      // truncate), check the shared App Group for pendingShareSeed.
      // We read synchronously via the native module; failures silently
      // fall back to seed=undefined.
      if (!seed) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const sgp = require('react-native-shared-group-preferences');
          const sharedGroup = (sgp?.default ?? sgp) as {
            getItem: (k: string, g: string) => Promise<string | null>;
            setItem: (k: string, v: string, g: string) => Promise<void>;
          };
          // Can't await synchronously; return action as-is and let the
          // Chat screen read the App Group on mount. Mark with a flag
          // so ChatScreen knows to check.
          void sharedGroup.getItem('pendingShareSeed', 'group.com.synapseadhd.app')
            .then((val) => {
              if (val && navigationRef.isReady()) {
                navigationRef.dispatch(
                  CommonActions.setParams({ initialMessage: val })
                );
                // Consume: clear the key so a second chat open doesn't re-seed.
                void sharedGroup.setItem('pendingShareSeed', '', 'group.com.synapseadhd.app');
              }
            })
            .catch(() => {});
        } catch {
          // Module not linked (Expo Go) — nothing to do.
        }
      }
      return {
        kind: 'navigate',
        screen: 'Chat',
        params: {
          mode,
          ...(seed ? { initialMessage: seed } : {}),
          ...(projectId ? { projectId } : {}),
        },
      };
    }

    if (path === 'deep-work') {
      return { kind: 'navigate', screen: 'DeepWork' };
    }

    if (path === 'the-one/done') {
      return { kind: 'intent', name: 'theOneDone' };
    }

    if (path.startsWith('projects/')) {
      const [, projectId] = path.split('/');
      if (!projectId) return { kind: 'none' };
      return { kind: 'navigate', screen: 'ProjectDetail', params: { projectId } };
    }

    return { kind: 'none' };
  } catch {
    return { kind: 'none' };
  }
}

/**
 * Apply an action against the live navigation tree / store.
 * Safe to call before the navigator is ready — it will queue and retry.
 */
export function applyDeepLinkAction(action: DeepLinkAction, attempt = 0) {
  if (action.kind === 'none') return;

  if (action.kind === 'intent' && action.name === 'theOneDone') {
    // Imperative one-shot: toggle a store flag that Home will consume
    // on next render, complete the task, then clear the flag.
    useStore.setState({ pendingIntent: 'theOneDone' });
    // Navigate to Main tab explicitly so the Dashboard is on screen to
    // consume the intent (the widget might have launched us cold, with
    // Chat being the last active screen).
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.navigate({ name: 'Main' }));
    }
    return;
  }

  if (action.kind === 'navigate') {
    if (!navigationRef.isReady()) {
      // Nav container not mounted yet — usually happens on cold start
      // when deep-link URL arrives before RootNavigator renders.
      // Try again shortly. Give up after a generous ceiling.
      if (attempt > 40) return;
      setTimeout(() => applyDeepLinkAction(action, attempt + 1), 100);
      return;
    }
    navigationRef.dispatch(
      CommonActions.navigate({ name: action.screen as string, params: action.params })
    );
  }
}

/**
 * Wire up the listeners at app root. Idempotent — safe to call once in App.tsx.
 * Returns a cleanup fn (not strictly needed since we want this for the app's
 * lifetime, but returning it keeps the call-site tidy).
 */
export function installDeepLinkListeners(): () => void {
  // Cold start: if the app was launched by a deep link, consume it
  Linking.getInitialURL().then(url => {
    if (url) applyDeepLinkAction(parseAiteallUrl(url));
  });

  // Warm: subsequent links while app is running
  const sub = Linking.addEventListener('url', evt => {
    applyDeepLinkAction(parseAiteallUrl(evt.url));
  });

  return () => sub.remove();
}
