/**
 * emergence.ts — the "emergence moment" logic (Phase 5)
 *
 * Aiteall's bet: structure should surface itself. The user talks, the
 * extractor notices Areas / Projects / Tasks / Goals, they're written
 * as origin:'inferred' and stay local. Then — at the right moment —
 * the app offers them back, one at a time, for Keep / Edit / Kill.
 *
 * The "right moment" is deliberately not the first session. We wait
 * until the user has actually USED the app a bit, so:
 *   (a) the inferred set reflects their real shape, not a cold-start
 *       conversation, and
 *   (b) they've had enough context to recognise what we found as
 *       "oh yeah, that's the thing I was talking about".
 *
 * Triggers:
 *   - firstOpenDate is >= 3 days old AND < 14 days old (the sweet
 *     spot — long enough to accumulate real material, short enough
 *     that it's still a welcome surprise, not nagging)
 *   - At least one 'inferred' entity exists across any category
 *   - User hasn't already resolved the emergence this week
 *
 * Dismiss / seen bookkeeping lives in AsyncStorage as a local flag,
 * not the store — this is purely UX state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Area, Project, Task, LifeGoal } from '../store/useStore';

// ── Storage keys ─────────────────────────────────────────────────────────────

const EMERGENCE_DISMISSED_UNTIL_KEY = '@aiteall/emergence/dismissedUntil';
const EMERGENCE_RESOLVED_AT_KEY     = '@aiteall/emergence/lastResolvedAt';

// ── Thresholds ───────────────────────────────────────────────────────────────

const MIN_DAYS_SINCE_FIRST_OPEN = 3;
const MAX_DAYS_SINCE_FIRST_OPEN = 14;
/** Don't re-offer emergence within this many days of the last resolve. */
const REOFFER_COOLDOWN_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmergenceCandidates {
  areas:    Area[];
  projects: Project[];
  tasks:    Task[];
  goals:    LifeGoal[];
  /** Total count across all categories — easier for callers. */
  total: number;
}

export interface EmergenceReadiness {
  ready: boolean;
  reason: string;
  candidates: EmergenceCandidates;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetweenYmd(ymdA: string, nowIso = new Date().toISOString()): number {
  const a = new Date(`${ymdA}T00:00:00Z`).getTime();
  const b = new Date(nowIso).getTime();
  return (b - a) / (1000 * 60 * 60 * 24);
}

function collectInferred(
  areas: Area[], projects: Project[], tasks: Task[], goals: LifeGoal[],
): EmergenceCandidates {
  const inf = <T extends { origin?: string }>(xs: T[]) => xs.filter(x => x.origin === 'inferred');
  const a = inf(areas);
  const p = inf(projects);
  const t = inf(tasks);
  const g = inf(goals);
  return { areas: a, projects: p, tasks: t, goals: g, total: a.length + p.length + t.length + g.length };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether the emergence moment should show right now, and the
 * candidates that would be offered. Caller (HomeAdaptive / Dashboard)
 * decides how to surface it.
 */
export async function getEmergenceReadiness(params: {
  firstOpenDate?: string;
  areas:    Area[];
  projects: Project[];
  tasks:    Task[];
  goals:    LifeGoal[];
}): Promise<EmergenceReadiness> {
  const candidates = collectInferred(params.areas, params.projects, params.tasks, params.goals);

  if (candidates.total === 0) {
    return { ready: false, reason: 'no inferred entities', candidates };
  }

  if (!params.firstOpenDate) {
    return { ready: false, reason: 'no firstOpenDate — treat as brand new', candidates };
  }

  const days = daysBetweenYmd(params.firstOpenDate);
  if (days < MIN_DAYS_SINCE_FIRST_OPEN) {
    return {
      ready: false,
      reason: `${days.toFixed(1)} days since first open (<${MIN_DAYS_SINCE_FIRST_OPEN})`,
      candidates,
    };
  }

  // If user's been around for weeks, don't pretend this is a first-week
  // surprise — the extractor will keep running, and entities will just
  // accumulate naturally. We can re-offer later but not here.
  if (days > MAX_DAYS_SINCE_FIRST_OPEN) {
    // Still allow re-offer if cooldown has passed (treat post-first-fortnight
    // as periodic check-ins).
    const resolvedAt = await AsyncStorage.getItem(EMERGENCE_RESOLVED_AT_KEY);
    if (resolvedAt) {
      const daysSinceResolve = (Date.now() - new Date(resolvedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceResolve < REOFFER_COOLDOWN_DAYS) {
        return { ready: false, reason: `cooldown: resolved ${daysSinceResolve.toFixed(1)}d ago`, candidates };
      }
    }
  }

  // Dismiss-until flag — user swiped away recently.
  const dismissedUntil = await AsyncStorage.getItem(EMERGENCE_DISMISSED_UNTIL_KEY);
  if (dismissedUntil) {
    const until = new Date(dismissedUntil).getTime();
    if (until > Date.now()) {
      return { ready: false, reason: 'dismissed', candidates };
    }
  }

  return { ready: true, reason: `${candidates.total} inferred waiting`, candidates };
}

/** Mark the emergence as resolved — user walked through all candidates. */
export async function markEmergenceResolved(): Promise<void> {
  await AsyncStorage.setItem(EMERGENCE_RESOLVED_AT_KEY, new Date().toISOString());
  await AsyncStorage.removeItem(EMERGENCE_DISMISSED_UNTIL_KEY);
}

/** Dismiss for N days (user swiped away or tapped "not now"). */
export async function dismissEmergence(days = 2): Promise<void> {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await AsyncStorage.setItem(EMERGENCE_DISMISSED_UNTIL_KEY, until);
}
