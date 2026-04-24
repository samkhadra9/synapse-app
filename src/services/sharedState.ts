/**
 * CP4.1b — Shared-state bridge (JS ↔ native extensions)
 *
 * The widget, share extension, Siri intent handler, and Live Activity
 * all live in separate processes from the main app. They can't reach
 * into our zustand store directly. The OS gives us one supported way
 * to share data across the app/extension boundary: an **App Group**
 * shared container. We write a tiny snapshot there; the widget reads it.
 *
 * We deliberately push only what the widget (or a Live Activity, or a
 * future lock-screen complication) actually needs:
 *
 *   - theOne        — the current "the one" for today, or null
 *   - fifteen       — { startedAt, endsAt } when a 15-min opener is running
 *   - lastSyncedAt  — debug aid; easier to spot staleness in TestFlight
 *
 * Writes are best-effort and silent on failure. If the native module
 * isn't installed (dev build without prebuild), calls no-op so the
 * app still runs in the Expo client.
 *
 * App Group identifier matches the `com.apple.security.application-groups`
 * entitlement in app.json + every native target's entitlements file.
 */
import { Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { AiteallNative } from '../../modules/aiteall-native';

export const APP_GROUP_ID = 'group.com.synapseadhd.app';

// Storage keys the Swift side reads by name. Keep these stable — changing
// one is a breaking change for any cached widget snapshot users have.
export const KEYS = {
  theOne: 'theOne',       // JSON: { id, text, projectName? } | null
  fifteen: 'fifteen',     // JSON: { startedAt: ISO, endsAt: ISO } | null
  lastSyncedAt: 'lastSyncedAt', // ISO timestamp
} as const;

// ── Native-module wrapper ──────────────────────────────────────────────────
// react-native-shared-group-preferences exports { setItem, getItem } with
// a suite-id final argument. We wrap it to (a) silence failures and
// (b) no-op on non-iOS + Expo Go environments.

type SharedGroupPreferences = {
  setItem: (key: string, value: string, appGroupId: string) => Promise<void>;
  getItem: (key: string, appGroupId: string) => Promise<string | null>;
};

let sharedGroup: SharedGroupPreferences | null | undefined;

function getModule(): SharedGroupPreferences | null {
  if (sharedGroup !== undefined) return sharedGroup;
  if (Platform.OS !== 'ios') {
    sharedGroup = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('react-native-shared-group-preferences');
    sharedGroup = (m?.default ?? m) as SharedGroupPreferences;
  } catch {
    // Expo Go / pre-prebuild — module not linked. No-op cleanly.
    sharedGroup = null;
  }
  return sharedGroup;
}

async function writeKey(key: string, value: unknown): Promise<void> {
  const m = getModule();
  if (!m) return;
  try {
    await m.setItem(key, JSON.stringify(value), APP_GROUP_ID);
  } catch (e) {
    // We never want shared-state writes to crash the UI. Log quietly.
    if (__DEV__) console.warn('[sharedState] write failed', key, e);
  }
}

// ── Snapshot builders ──────────────────────────────────────────────────────

export type TheOneSnapshot = {
  id: string;
  text: string;
  projectName?: string;
} | null;

export type FifteenSnapshot = {
  startedAt: string;  // ISO
  endsAt: string;     // ISO
} | null;

function buildTheOneSnapshot(): TheOneSnapshot {
  const state = useStore.getState();
  const task = state.theOneForToday();
  if (!task) return null;
  const project = task.projectId
    ? state.projects.find(p => p.id === task.projectId)
    : undefined;
  return {
    id: task.id,
    text: task.text,
    ...(project?.title ? { projectName: project.title } : {}),
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Write the current theOne snapshot to the App Group. Called whenever
 * theOne changes (see `syncTheOneOnChange` below), and on app startup
 * so a fresh install / relaunch repopulates the widget cache.
 */
export async function syncTheOne(): Promise<void> {
  await writeKey(KEYS.theOne, buildTheOneSnapshot());
  await writeKey(KEYS.lastSyncedAt, new Date().toISOString());
  // Nudge WidgetKit so the new snapshot renders immediately rather than
  // waiting for the next timeline tick.
  AiteallNative.reloadWidget();
}

/**
 * Mirror the active 15-min opener window. Pass null when the session ends.
 */
export async function syncFifteen(snapshot: FifteenSnapshot): Promise<void> {
  await writeKey(KEYS.fifteen, snapshot);
  await writeKey(KEYS.lastSyncedAt, new Date().toISOString());
}

/**
 * Subscribe to zustand so theOne stays mirrored without each screen
 * having to remember to call syncTheOne(). Called once at app root.
 * Returns an unsubscribe fn.
 */
export function installSharedStateSync(): () => void {
  // Initial write on mount
  void syncTheOne();

  // Subscribe: any time tasks or theOne change, re-sync. We lean on a
  // selector so we only re-fire when the derived snapshot differs.
  const unsub = useStore.subscribe((state, prev) => {
    // Cheap equality: compare the tasks array reference. zustand's
    // immutable updates give us a new array any time a task changes,
    // which is exactly when the widget might care.
    if (state.tasks !== prev.tasks) {
      void syncTheOne();
    }
  });

  return unsub;
}
