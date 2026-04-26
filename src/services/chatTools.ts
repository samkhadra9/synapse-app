/**
 * chatTools.ts — CP7.1 Tool-use scaffold for Aiteall's chat brain.
 *
 * Anthropic-native tool-use definitions + a single `executeTool` dispatcher.
 * The Edge Function proxy is transparent (forwards body verbatim), so all
 * tool execution happens client-side: model emits `tool_use` block →
 * we run the tool against the local Zustand store → we send `tool_result`
 * back in the next round of the agentic loop.
 *
 * Four tools (the minimum that earn their keep on day one):
 *
 *   1. edit_task
 *      Surgical mutations on existing tasks. Replaces the chunk of
 *      [SYNAPSE_ACTIONS] that used to be expressed as `complete` / passive
 *      edits. Operations: complete | snooze | defer_to_tomorrow | delete |
 *      rename. The model gets task IDs in the system prompt context, so
 *      it can target precisely instead of fuzzy-matching text.
 *
 *   2. schedule_push
 *      Schedule a one-off local notification at a specific ISO time. Uses
 *      the same banned-word + length audit as proactivePush.ts so a bad
 *      line never reaches the user. Hard cap of 18 words (~140 chars).
 *
 *   3. search_history
 *      Read-only window into the user's past — the completion log, the
 *      session log, or the active chat session. Lets Claude answer "did
 *      I ever finish that brief?" without the whole history needing to
 *      live in the system prompt.
 *
 *   4. log_completion
 *      Append a "what I did" entry. Used when the user mentions a finish
 *      in passing ("oh I sent that already") that isn't tied to an existing
 *      task. Mirrors the completion-without-ticking path from CP5.1.
 *
 * The agentic loop in ChatScreen.sendToLLM caps at 5 rounds — well above
 * what any single user turn should need, low enough to fail fast on a
 * runaway loop. Plain-text replies (no tool_use stop_reason) flow through
 * the existing [SYNAPSE_ACTIONS] parser unchanged, so the legacy bulk-
 * propose path keeps working until CP7.5 fully migrates it.
 */

import * as Notifications from 'expo-notifications';
import { format } from 'date-fns';

import { useStore } from '../store/useStore';
import type { ChatMessage } from '../store/useStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Anthropic tool definition shape (subset we use). */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ── Tool definitions (sent to Anthropic in `tools`) ───────────────────────────

export const TOOL_DEFINITIONS: AnthropicToolDef[] = [
  {
    name: 'edit_task',
    description:
      'Modify a single existing task. Use this when the user wants to mark a task done, push it to tomorrow, snooze it for a few hours, delete it, or rename its text. Prefer this over re-emitting [SYNAPSE_ACTIONS] for surgical changes. Always use the taskId from the user\'s task list — never invent one.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The id of the existing task. Must match a task currently in the user\'s list.',
        },
        operation: {
          type: 'string',
          enum: ['complete', 'snooze', 'defer_to_tomorrow', 'delete', 'rename'],
          description:
            'complete = mark done; snooze = reschedule by snoozeMinutes (default 60) within today; defer_to_tomorrow = move date to tomorrow; delete = remove from the list; rename = replace task text with the new value.',
        },
        rename: {
          type: 'string',
          description: 'New task text. REQUIRED only when operation === "rename".',
        },
        snoozeMinutes: {
          type: 'number',
          description: 'How long to snooze (only used when operation === "snooze"). Defaults to 60 if omitted.',
        },
      },
      required: ['taskId', 'operation'],
    },
  },
  {
    name: 'schedule_push',
    description:
      'Schedule a one-off local push notification at a specific time. Use sparingly — only for genuinely useful nudges the user has effectively asked for ("remind me at 6 to text mum"). Never for nagging or generic encouragement. Voice rules: max 18 words, no exclaim marks, no "remember to", no "great job", no fake urgency.',
    input_schema: {
      type: 'object',
      properties: {
        whenIso: {
          type: 'string',
          description: 'ISO 8601 timestamp for when the push should fire. Must be in the future.',
        },
        message: {
          type: 'string',
          description: 'The single line shown to the user. Max 18 words. Lower-case casual is fine.',
        },
      },
      required: ['whenIso', 'message'],
    },
  },
  {
    name: 'search_history',
    description:
      'Read-only lookup over the user\'s past. Use when you need to verify whether something was done, when a topic last came up, or pull a few recent items as context for a reply. Returns at most `limit` entries (default 10).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Substring to match against text (case-insensitive). Pass an empty string to get the most recent entries.',
        },
        scope: {
          type: 'string',
          enum: ['completion_log', 'session_log', 'chat'],
          description:
            'completion_log = "what I did" entries; session_log = app-open / mode-entry events; chat = the current session\'s message history.',
        },
        limit: {
          type: 'number',
          description: 'Max entries to return. Defaults to 10. Hard cap of 30.',
        },
      },
      required: ['query', 'scope'],
    },
  },
  {
    name: 'log_completion',
    description:
      'Record a "what I did" entry that isn\'t tied to an existing task. Use this when the user mentions in passing that they finished something the app didn\'t track (e.g. "oh I already sent the email"). Do NOT use this to mark an existing task complete — use edit_task with operation="complete" for that.',
    input_schema: {
      type: 'object',
      properties: {
        taskText: {
          type: 'string',
          description: 'Short human-readable description of what was done. E.g. "sent the deck to Sarah".',
        },
        whenIso: {
          type: 'string',
          description: 'Optional ISO timestamp of when it was done. Defaults to now.',
        },
      },
      required: ['taskText'],
    },
  },
];

// ── Banned-word audit (shared with proactivePush) ─────────────────────────────

const BANNED_FRAGMENTS = [
  '!',
  'great job',
  'you got this',
  'remember to',
  "don't forget",
  'crushing it',
  'congrats',
  'amazing',
  'you should',
  'you need to',
  'you must',
  'critical',
  'urgent',
  'asap',
  'deadline',
];

function passesBannedWordAudit(message: string): boolean {
  const lower = message.toLowerCase();
  return !BANNED_FRAGMENTS.some(b => lower.includes(b));
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Execute a tool_use block. Returns the string content for a tool_result
 * block. Always returns a string (Anthropic tool_result content is text).
 *
 * Errors are returned as `{ ok: false, error: '...' }` JSON strings with
 * is_error=true on the tool_result so the model can recover gracefully
 * instead of throwing the whole turn.
 *
 * @param chatHistory  the current chat session's messages (for scope='chat')
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  chatHistory: ChatMessage[] = [],
): Promise<{ content: string; is_error: boolean }> {
  try {
    switch (name) {
      case 'edit_task':
        return ok(await runEditTask(input));
      case 'schedule_push':
        return ok(await runSchedulePush(input));
      case 'search_history':
        return ok(runSearchHistory(input, chatHistory));
      case 'log_completion':
        return ok(runLogCompletion(input));
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e: any) {
    return err(`Tool execution failed: ${String(e?.message ?? e)}`);
  }
}

function ok(payload: unknown): { content: string; is_error: boolean } {
  return { content: JSON.stringify({ ok: true, ...((payload as object) ?? {}) }), is_error: false };
}

function err(message: string): { content: string; is_error: boolean } {
  return { content: JSON.stringify({ ok: false, error: message }), is_error: true };
}

// ── edit_task ────────────────────────────────────────────────────────────────

async function runEditTask(input: Record<string, unknown>) {
  const taskId    = String(input.taskId ?? '');
  const operation = String(input.operation ?? '');
  if (!taskId)    throw new Error('taskId is required');
  if (!operation) throw new Error('operation is required');

  const state = useStore.getState();
  const task  = state.tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error(`No task found with id "${taskId}"`);
  }

  switch (operation) {
    case 'complete': {
      if (task.completed) {
        return { taskId, operation, note: 'task was already completed' };
      }
      state.toggleTask(taskId);
      return { taskId, operation, text: task.text };
    }
    case 'delete': {
      state.deleteTask(taskId);
      return { taskId, operation, text: task.text };
    }
    case 'rename': {
      const rename = String(input.rename ?? '').trim();
      if (!rename) throw new Error('rename requires a non-empty `rename` string');
      state.updateTask(taskId, { text: rename });
      return { taskId, operation, oldText: task.text, newText: rename };
    }
    case 'defer_to_tomorrow': {
      const tomorrow = format(new Date(Date.now() + 86_400_000), 'yyyy-MM-dd');
      state.updateTask(taskId, { date: tomorrow, isToday: false });
      return { taskId, operation, newDate: tomorrow };
    }
    case 'snooze': {
      // We don't have a deeply-modelled snooze concept yet; treat snooze
      // as "remove from today, leave undated for now". The task lands in
      // the inbox instead of cluttering today's list. The model can then
      // schedule a push to surface it again if it wants.
      const minsRaw = Number(input.snoozeMinutes ?? 60);
      const mins    = Number.isFinite(minsRaw) && minsRaw > 0 ? Math.min(minsRaw, 24 * 60) : 60;
      state.updateTask(taskId, { isToday: false });
      return { taskId, operation, snoozeMinutes: mins };
    }
    default:
      throw new Error(`Unknown operation "${operation}"`);
  }
}

// ── schedule_push ────────────────────────────────────────────────────────────

async function runSchedulePush(input: Record<string, unknown>) {
  const whenIso = String(input.whenIso ?? '');
  const message = String(input.message ?? '').trim();
  if (!whenIso) throw new Error('whenIso is required');
  if (!message) throw new Error('message is required');

  const fireDate = new Date(whenIso);
  if (Number.isNaN(fireDate.getTime())) {
    throw new Error(`Invalid whenIso: "${whenIso}"`);
  }
  if (fireDate.getTime() <= Date.now() + 30_000) {
    throw new Error('whenIso must be at least 30 seconds in the future');
  }

  if (wordCount(message) > 18) {
    throw new Error('message must be 18 words or fewer');
  }
  if (message.length > 200) {
    throw new Error('message is too long');
  }
  if (!passesBannedWordAudit(message)) {
    throw new Error('message contains a banned word or phrase');
  }

  const perms = await Notifications.getPermissionsAsync();
  if (perms.status !== 'granted') {
    throw new Error('notification permission not granted');
  }

  const id = `aiteall-toolpush-${Date.now()}`;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Aiteall',
      body: message,
      sound: false,
      data: {
        screen: 'ProactivePush',
        proactiveSeed: message,
        scheduledFor: fireDate.toISOString(),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    } as Notifications.DateTriggerInput,
  });

  return { id, scheduledFor: fireDate.toISOString(), message };
}

// ── search_history ───────────────────────────────────────────────────────────

function runSearchHistory(
  input: Record<string, unknown>,
  chatHistory: ChatMessage[],
) {
  const query = String(input.query ?? '').trim().toLowerCase();
  const scope = String(input.scope ?? '');
  const limitRaw = Number(input.limit ?? 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(30, Math.floor(limitRaw)))
    : 10;

  const state = useStore.getState();

  if (scope === 'completion_log') {
    const matches = state.completions
      .slice() // newest at the end
      .reverse()
      .filter(c => !query || c.text.toLowerCase().includes(query))
      .slice(0, limit)
      .map(c => ({ at: c.at, text: c.text, source: c.source }));
    return { scope, query, count: matches.length, items: matches };
  }

  if (scope === 'session_log') {
    const matches = state.sessionLog
      .slice()
      .reverse()
      .filter(s => !query || (s.note ?? '').toLowerCase().includes(query) || s.kind.toLowerCase().includes(query))
      .slice(0, limit)
      .map(s => ({ at: s.at, kind: s.kind, note: s.note ?? null }));
    return { scope, query, count: matches.length, items: matches };
  }

  if (scope === 'chat') {
    const matches = chatHistory
      .slice()
      .reverse()
      .filter(m => !query || m.content.toLowerCase().includes(query))
      .slice(0, limit)
      .map(m => ({
        at: m.timestamp,
        role: m.role,
        // Trim long bodies — the model rarely needs the full text and we
        // don't want to round-trip kilobytes through the tool channel.
        text: m.content.length > 280 ? m.content.slice(0, 277) + '…' : m.content,
      }));
    return { scope, query, count: matches.length, items: matches };
  }

  throw new Error(`Unknown scope "${scope}"`);
}

// ── log_completion ───────────────────────────────────────────────────────────

function runLogCompletion(input: Record<string, unknown>) {
  const taskText = String(input.taskText ?? '').trim();
  if (!taskText) throw new Error('taskText is required');
  const whenIsoRaw = input.whenIso;
  const whenIso = typeof whenIsoRaw === 'string' && whenIsoRaw.trim()
    ? new Date(whenIsoRaw).toISOString()
    : new Date().toISOString();

  const state = useStore.getState();
  state.logCompletion({ source: 'chat', text: taskText, at: whenIso });

  return { text: taskText, at: whenIso };
}
