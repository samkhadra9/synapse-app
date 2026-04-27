/**
 * CP10.1 — On-device diagnostics buffer.
 *
 * A bounded, in-memory buffer of the most recent runtime errors so we can:
 *   - Render a "last few hiccups" panel in Settings if needed.
 *   - Attach a small anonymised log when the user uses Send Feedback.
 *
 * No network calls. Buffer is reset on app restart — by design — so we
 * never accumulate a long-running log of the user's activity. If the user
 * never opts in to feedback, nothing here ever leaves the device.
 *
 * Replacing this with Sentry later: swap `recordRuntimeError` to also call
 * `Sentry.captureException` with `Sentry.setUser(null)` (anonymous) and a
 * scope that strips chat content from extras. We've designed the API surface
 * to be a clean single-callsite migration.
 */

const BUFFER_MAX = 25;

export interface RuntimeError {
  /** Unix ms */
  at: number;
  /** Where the boundary lives, e.g. 'root', 'chat', 'portrait'. */
  label: string;
  /** Short error message — never user content, just exception text. */
  message: string;
  /** React component stack from componentDidCatch — file/line frames only. */
  componentStack?: string;
}

const buffer: RuntimeError[] = [];

/**
 * Record an error in the diagnostics buffer. Safe to call from anywhere;
 * silently no-ops if the input is malformed. Never throws.
 */
export function recordRuntimeError(input: Omit<RuntimeError, 'at'>): void {
  try {
    const entry: RuntimeError = {
      at: Date.now(),
      label: input.label || 'unlabeled',
      // Cap the message — long stack-tossed messages can include path-like
      // values. Anything longer than this is almost certainly noise.
      message: (input.message || 'Unknown error').slice(0, 240),
      componentStack: input.componentStack
        ? input.componentStack.slice(0, 1500)
        : undefined,
    };
    buffer.push(entry);
    if (buffer.length > BUFFER_MAX) {
      buffer.splice(0, buffer.length - BUFFER_MAX);
    }
    // In dev, surface to Metro for visibility. In prod, this is a no-op
    // (console.warn becomes a yellow box on iOS only when LogBox is on).
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[diagnostics] ${entry.label}: ${entry.message}`);
    }
  } catch {
    /* never throw from the recorder */
  }
}

/** Snapshot — useful for the feedback flow. Returns a copy. */
export function getRuntimeErrors(): RuntimeError[] {
  return buffer.slice();
}

/** Clear — used after a successful feedback submit. */
export function clearRuntimeErrors(): void {
  buffer.length = 0;
}

/**
 * Format the buffer as a short text block, suitable for prefixing a
 * feedback email. Capped at ~3KB to avoid mail clients truncating.
 */
export function formatRuntimeErrorsForFeedback(): string {
  if (buffer.length === 0) return '(no recent errors)';
  const lines: string[] = [];
  for (const e of buffer) {
    const ts = new Date(e.at).toISOString();
    lines.push(`[${ts}] (${e.label}) ${e.message}`);
  }
  const out = lines.join('\n');
  return out.length > 3000 ? out.slice(out.length - 3000) : out;
}

/**
 * Install a global JS error handler so unhandled promise rejections and
 * uncaught errors from native callbacks land in the buffer too. Idempotent.
 */
let installed = false;
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;
  try {
    // ErrorUtils is exposed on the React Native global. Wrap it so the RN
    // default handler still runs (red box in dev / native crash in prod).
    const eu: any = (globalThis as any).ErrorUtils;
    if (eu && typeof eu.setGlobalHandler === 'function') {
      const prev = eu.getGlobalHandler ? eu.getGlobalHandler() : null;
      eu.setGlobalHandler((err: any, isFatal?: boolean) => {
        recordRuntimeError({
          label: isFatal ? 'global-fatal' : 'global',
          message: err?.message ?? String(err),
          componentStack: err?.stack,
        });
        if (typeof prev === 'function') {
          try { prev(err, isFatal); } catch { /* defensive */ }
        }
      });
    }
  } catch {
    /* never throw from installer */
  }
}
