/**
 * undo.ts — global undo queue.
 *
 * CP3.4 (Motion & forgiveness): the app refuses to block the user with
 * "are you sure?" confirms for destructive actions. Instead, the action
 * happens immediately, and a small bottom-of-screen snackbar offers
 * 10 seconds to undo.
 *
 * Philosophy: "are you sure?" is executive-function tax. The decision
 * was already made. A confirm dialog adds a second cognitive checkpoint
 * that ADHD brains often fail — they tap Cancel not because they
 * changed their mind, but because the dialog broke their flow.
 *
 * Single-slot queue: only one undo banner is visible at a time. If a
 * new action enqueues while another is live, the new one replaces it
 * (and the previous action is *kept* — the prior undo just becomes
 * unreachable, same as dismissing the snackbar manually).
 *
 * Usage:
 *   const tasksBefore = useStore.getState().tasks;
 *   useStore.getState().deleteTask(id);
 *   enqueueUndo({
 *     label: 'Deleted "Ring the dentist"',
 *     undo: () => useStore.setState({ tasks: tasksBefore }),
 *   });
 */

import { create } from 'zustand';

export interface UndoEntry {
  /** Short label shown in the snackbar. Keep it informative, non-scolding. */
  label: string;
  /** Function to reverse the destructive action. Called if user taps Undo. */
  undo: () => void;
  /** Milliseconds before the snackbar auto-dismisses. Default 10 000. */
  ttl?: number;
}

interface UndoState {
  /** Active entry, or null. Snackbar mirrors this. */
  entry: (UndoEntry & { id: number; expiresAt: number }) | null;
  enqueue: (e: UndoEntry) => void;
  /** Call the stored undo fn and dismiss. */
  run: () => void;
  /** Dismiss without calling undo. */
  dismiss: () => void;
}

let autoClearTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

function clearTimer() {
  if (autoClearTimer) { clearTimeout(autoClearTimer); autoClearTimer = null; }
}

export const useUndo = create<UndoState>((set, get) => ({
  entry: null,

  enqueue: (e) => {
    clearTimer();
    const ttl = e.ttl ?? 10_000;
    const id = nextId++;
    const expiresAt = Date.now() + ttl;
    set({ entry: { ...e, id, expiresAt } });
    autoClearTimer = setTimeout(() => {
      // Only clear if this same entry is still the active one. A newer
      // enqueue will have bumped the id and set its own timer.
      const current = get().entry;
      if (current && current.id === id) set({ entry: null });
    }, ttl);
  },

  run: () => {
    const current = get().entry;
    if (!current) return;
    clearTimer();
    try { current.undo(); } catch { /* ignore */ }
    set({ entry: null });
  },

  dismiss: () => {
    clearTimer();
    set({ entry: null });
  },
}));

/** Convenience function — same as useUndo.getState().enqueue(e). */
export function enqueueUndo(e: UndoEntry): void {
  useUndo.getState().enqueue(e);
}
