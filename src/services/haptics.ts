/**
 * haptics.ts — Aiteall's haptic vocabulary.
 *
 * CP3.0 (Motion & forgiveness): the whole app speaks the SAME tiny haptic
 * language. Three words, nothing more:
 *
 *   soft()    — the universal "noted." One ultra-light tick on a field save,
 *               task toggle, tap confirmation. Should be barely noticeable.
 *   done()    — the "session complete" / "task toggled complete" moment.
 *               Slightly more present than soft, but still a tick — never
 *               a pulse pattern.
 *   gentle()  — midpoint, for 5-/10-min interval ticks during fifteen
 *               sessions. "Still with you" without becoming an alarm.
 *
 * All three are swallowed on web / unsupported platforms.
 *
 * Deliberately absent: any vibration *pattern* ([0, 400, 200, 400] etc).
 * A pattern is an alarm, not a tick. The old DeepWork + fifteen.ts
 * vibrations have been migrated to `done()`.
 *
 * No sound API. No confetti. The brief was explicit: celebration UI IS
 * pressure. A quiet "noted" is more respectful.
 */

import * as Haptics from 'expo-haptics';

/** Ultra-light tick — field save, tap confirmation, completion ack. */
export function soft(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** Session or task done — a notch more present than soft. */
export function done(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Mid-session pulse — "still with you" during fifteen-min openers. */
export function gentle(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
