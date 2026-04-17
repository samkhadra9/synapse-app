/**
 * calendar.ts — Solas calendar integration
 *
 * Pushes project deadlines and routines to the user's iOS Calendar
 * using a dedicated "Solas" calendar so they don't clutter other calendars.
 */

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Project, TimeBlock, TimeBlockType } from '../store/useStore';

const CALENDAR_NAME = 'Aiteall';
const CALENDAR_COLOR = '#1A5C4A'; // matches Colors.primary

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// ── Find or create the Aiteall calendar ─────────────────────────────────────

export async function findOrCreateSolasCalendar(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing  = calendars.find(c => c.title === CALENDAR_NAME && c.allowsModifications);
  if (existing) return existing.id;

  // Pick the best calendar source for creating a new calendar.
  // On iOS we try getDefaultCalendarAsync first (returns the user's primary calendar
  // which always has a valid sourceId), then fall back to scanning the list.
  let calSource: { id: string; isLocalAccount?: boolean; name?: string } | null = null;

  if (Platform.OS === 'ios') {
    try {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (defaultCal?.source?.id) {
        calSource = defaultCal.source as any;
      }
    } catch {
      // getDefaultCalendarAsync may not be available in all Expo SDK versions
    }
  }

  if (!calSource) {
    // Prefer local-account sources; fall back to any source that has an id
    const sourceFromCal =
      calendars.find(c => c.source?.isLocalAccount && (c.source as any)?.id)?.source ??
      calendars.find(c => (c.source as any)?.id)?.source;
    calSource = sourceFromCal as any ?? null;
  }

  if (!calSource?.id) {
    // Last resort: on iOS CalDAV / Exchange setups there may be no local source;
    // use an empty-string source id (works for iCloud-only devices).
    calSource = { id: '', isLocalAccount: false, name: 'iCloud' };
  }

  const newId = await Calendar.createCalendarAsync({
    title:          CALENDAR_NAME,
    color:          CALENDAR_COLOR,
    entityType:     Calendar.EntityTypes.EVENT,
    sourceId:       calSource.id,
    source:         calSource as any,
    name:           CALENDAR_NAME,
    ownerAccount:   'personal',
    accessLevel:    Calendar.CalendarAccessLevel.OWNER,
  });

  return newId;
}

// ── Sync a project deadline to Calendar ───────────────────────────────────────

export async function syncProjectDeadline(
  project: Project,
  calendarId: string,
): Promise<string> {
  if (!project.deadline) throw new Error('Project has no deadline');

  const startDate = new Date(project.deadline + 'T09:00:00');
  const endDate   = new Date(project.deadline + 'T09:30:00');

  const details: Partial<Calendar.Event> = {
    title:    `📁 ${project.title}`,
    notes:    project.description || '',
    startDate,
    endDate,
    allDay:   false,
    alarms:   [
      { relativeOffset: -1440 }, // 1 day before
      { relativeOffset: -60 },   // 1 hour before
    ],
  };

  // Update existing event if already synced
  if (project.calendarEventId) {
    try {
      await Calendar.updateEventAsync(project.calendarEventId, details);
      return project.calendarEventId;
    } catch {
      // Event may have been deleted externally — create a new one
    }
  }

  return await Calendar.createEventAsync(calendarId, details);
}

// ── Sync all projects with deadlines ─────────────────────────────────────────

export interface SyncResult {
  synced: number;
  failed: number;
  calendarId: string;
  projectResults: { projectId: string; eventId: string }[];
}

export async function syncAllProjects(
  projects: Project[],
  existingCalendarId?: string,
): Promise<SyncResult> {
  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) throw new Error('Calendar permission denied');

  const calendarId = existingCalendarId || await findOrCreateSolasCalendar();
  const withDeadlines = projects.filter(p => p.deadline && p.status === 'active');

  let synced = 0;
  let failed = 0;
  const projectResults: { projectId: string; eventId: string }[] = [];

  for (const project of withDeadlines) {
    try {
      const eventId = await syncProjectDeadline(project, calendarId);
      projectResults.push({ projectId: project.id, eventId });
      synced++;
    } catch (e) {
      console.warn(`Failed to sync project "${project.title}":`, e);
      failed++;
    }
  }

  return { synced, failed, calendarId, projectResults };
}

// ── List all writable calendars on device (Apple + Google + iCloud etc.) ──────

export interface DeviceCalendar {
  id:    string;
  title: string;
  color: string;
  type:  string;   // 'local' | 'caldav' | 'exchange' | etc.
}

export async function listWritableCalendars(): Promise<DeviceCalendar[]> {
  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) throw new Error('Calendar permission denied');

  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return all
    .filter(c => c.allowsModifications)
    .map(c => ({
      id:    c.id,
      title: c.title,
      color: c.color ?? '#1A5C4A',
      type:  c.type ?? 'local',
    }));
}

// ── Remove a project event from Calendar ─────────────────────────────────────

export async function removeCalendarEvent(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    // Already deleted — ignore
  }
}

// ── Read today's calendar events + reminders for morning context ──────────────

export interface TodayEvent {
  title:    string;
  start:    string;   // "HH:MM" or "all-day"
  end?:     string;
  allDay:   boolean;
  calendar: string;
}

export interface TodayReminder {
  title:    string;
  dueDate?: string;   // ISO string if set, undefined if no time
  calendar: string;
}

export async function getTodayCalendarEvents(): Promise<TodayEvent[]> {
  try {
  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calIds    = calendars.map(c => c.id);
  if (calIds.length === 0) return [];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await Calendar.getEventsAsync(calIds, startOfDay, endOfDay);

  // Filter out Aiteall's own time-block events — they're already surfaced via
  // buildSkeletonContext, so including them here would double-count committed time.
  return events.filter(e => !e.title?.startsWith('[Aiteall]')).map(e => {
    const formatTime = (d: Date | string): string => {
      const date = typeof d === 'string' ? new Date(d) : d;
      const h = date.getHours();
      const m = date.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    };
    const start = e.allDay ? 'all-day' : formatTime(e.startDate);
    const end = e.allDay ? undefined : formatTime(e.endDate);

    return {
      title:    e.title ?? '(no title)',
      start,
      end,
      allDay:   !!e.allDay,
      calendar: calendars.find(c => c.id === e.calendarId)?.title ?? '',
    };
  }).sort((a, b) => {
    if (a.allDay && !b.allDay) return 1;
    if (!a.allDay && b.allDay) return -1;
    return a.start.localeCompare(b.start);
  });
  } catch (e) {
    console.warn('[calendar] getTodayCalendarEvents failed:', e);
    return [];
  }
}

export async function getTodayReminders(): Promise<TodayReminder[]> {
  try {
    const { status } = await Calendar.requestRemindersPermissionsAsync();
    if (status !== 'granted') return [];

    const reminderCals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
    const calIds       = reminderCals.map(c => c.id);
    if (!calIds.length) return [];

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch incomplete reminders due on or before end of today
    const reminders = await Calendar.getRemindersAsync(
      calIds,
      Calendar.ReminderStatus.INCOMPLETE,
      undefined as any,
      endOfDay,
    );

    const formatTime = (d: Date | string): string => {
      const date = typeof d === 'string' ? new Date(d) : d;
      const h = date.getHours();
      const m = date.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    };
    return reminders.map(r => ({
      title:    r.title ?? '(no title)',
      dueDate:  r.dueDate ? formatTime(r.dueDate) : undefined,
      calendar: reminderCals.find(c => c.id === r.calendarId)?.title ?? 'Reminders',
    }));
  } catch {
    // Reminders may not be available on all devices/simulators
    return [];
  }
}

// ── Format today's time skeleton blocks into AI context ───────────────────────

const BLOCK_TYPE_LABELS: Record<TimeBlockType, string> = {
  deep_work: 'Deep work',
  area_work: 'Area work',
  social:    'Social',
  admin:     'Admin',
  protected: 'Protected',
  personal:  'Personal',
};

function formatHHMM(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}${m > 0 ? `:${m.toString().padStart(2, '0')}` : ''} ${ampm}`;
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hours = Math.floor(total / 60) % 24; // wrap past midnight correctly
  const minutes = total % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** Returns a plain-text description of today's planned blocks from the week skeleton */
export function buildSkeletonContext(weekTemplate: TimeBlock[]): string {
  if (!weekTemplate || weekTemplate.length === 0) return '';

  const todayJsDay = new Date().getDay(); // 0=Sun … 6=Sat

  const todayBlocks = weekTemplate
    .filter(b => b.dayOfWeek.includes(todayJsDay))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (todayBlocks.length === 0) return '';

  const lines = ['PLANNED TIME BLOCKS FOR TODAY (from weekly skeleton):'];
  todayBlocks.forEach(b => {
    const endTime = addMinutes(b.startTime, b.durationMinutes);
    lines.push(
      `  • ${b.label} (${BLOCK_TYPE_LABELS[b.type]}) — ${formatHHMM(b.startTime)} to ${formatHHMM(endTime)}${b.isProtected ? ' 🔒' : ''}`,
    );
  });

  return lines.join('\n');
}

// ── Format calendar + reminders into a context string for the AI ──────────────

// ── Permission helper (calendar + reminders together) ─────────────────────────

export async function requestAllCalendarPermissions(): Promise<{ calendar: boolean; reminders: boolean }> {
  const [calResult, remResult] = await Promise.all([
    Calendar.requestCalendarPermissionsAsync(),
    Calendar.requestRemindersPermissionsAsync(),
  ]);
  return {
    calendar: calResult.status === 'granted',
    reminders: remResult.status === 'granted',
  };
}

// ── Reminders ↔ Tasks bidirectional sync ──────────────────────────────────────

export interface ReminderImport {
  reminderId: string;
  text:       string;
  date?:      string; // YYYY-MM-DD
}

/** Returns iOS Reminders that haven't been imported into the app yet */
export async function getUnimportedReminders(
  existingReminderIds: string[],
): Promise<ReminderImport[]> {
  try {
    const { status } = await Calendar.requestRemindersPermissionsAsync();
    if (status !== 'granted') return [];

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
    const calIds    = calendars.map(c => c.id);
    if (!calIds.length) return [];

    // Fetch incomplete reminders from a wide window (past year → end of next year)
    // getRemindersAsync requires a startDate on iOS — we use a wide range to catch
    // undated reminders (they fall back to their creation date internally).
    const startWindow = new Date();
    startWindow.setFullYear(startWindow.getFullYear() - 1);
    const endWindow = new Date();
    endWindow.setFullYear(endWindow.getFullYear() + 2);

    const reminders = await Calendar.getRemindersAsync(
      calIds,
      Calendar.ReminderStatus.INCOMPLETE,
      startWindow,
      endWindow,
    );

    return reminders
      .filter(r => {
        if (!r.id) return false;
        if (existingReminderIds.includes(r.id)) return false;
        // Skip ones we created (marked with synapse-task: in notes)
        if ((r.notes ?? '').startsWith('synapse-task:')) return false;
        return true;
      })
      .map(r => ({
        reminderId: r.id!,
        text: r.title ?? '(no title)',
        date: r.dueDate
          ? new Date(r.dueDate).toISOString().slice(0, 10)
          : undefined,
      }));
  } catch (e) {
    console.warn('[calendar] getUnimportedReminders failed:', e);
    return [];
  }
}

/** Creates an iOS Reminder linked to a Solas task */
export async function createReminderForTask(
  taskId: string,
  text:   string,
  date?:  string, // YYYY-MM-DD
): Promise<string | null> {
  try {
    const { status } = await Calendar.requestRemindersPermissionsAsync();
    if (status !== 'granted') return null;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
    const target    = calendars.find(c => c.title === 'Reminders') ?? calendars[0];
    if (!target) return null;

    const dueDate = date ? new Date(`${date}T09:00:00`) : undefined;

    const reminderId = await Calendar.createReminderAsync(target.id, {
      title:   text,
      dueDate,
      notes:   `synapse-task:${taskId}`,
    });

    return reminderId;
  } catch (e) {
    console.warn('[calendar] createReminderForTask failed:', e);
    return null;
  }
}

/** Marks an iOS Reminder complete */
export async function completeReminder(reminderId: string): Promise<void> {
  try {
    await Calendar.updateReminderAsync(reminderId, { completed: true });
  } catch (e) {
    console.warn('[calendar] completeReminder failed:', e);
  }
}

/** Creates calendar events for a planned day's slots.
 *  Prefixes every title with "[Aiteall]" and checks for existing events
 *  with the same title+date before creating to prevent duplicates.
 */
export async function writeDayPlanToCalendar(
  slots: import('../store/useStore').PlannedSlot[],
  dateStr: string,   // "YYYY-MM-DD"
  calendarId?: string,
): Promise<number> {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) return 0;

    const cid = calendarId ?? (await findOrCreateSolasCalendar());

    // Fetch existing events for the day so we can skip duplicates
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd   = new Date(`${dateStr}T23:59:59`);
    let existingTitles: Set<string> = new Set();
    try {
      const existing = await Calendar.getEventsAsync([cid], dayStart, dayEnd);
      existing.forEach(e => { if (e.title) existingTitles.add(e.title); });
    } catch {
      // If we can't check, proceed anyway — better to duplicate than skip
    }

    let createdCount = 0;

    for (const slot of slots) {
      try {
        const prefixedTitle = `[Aiteall] ${slot.eventLabel}`;

        // Skip if an event with this exact title already exists today
        if (existingTitles.has(prefixedTitle)) continue;

        // Parse slot.time ("HH:MM") to build start date
        const [hours, minutes] = slot.time.split(':').map(Number);
        const startDate = new Date(`${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);

        // End time: start + 90 minutes (default duration)
        const endDate = new Date(startDate.getTime() + 90 * 60000);

        // Build task notes list
        const taskNotes = slot.tasks
          .map(t => `• ${t.text}`)
          .join('\n');

        const eventId = await Calendar.createEventAsync(cid, {
          title: prefixedTitle,
          startDate,
          endDate,
          notes: taskNotes,
          alarms: [{ relativeOffset: -10 }], // 10-min reminder
        });

        if (eventId) createdCount++;
      } catch (e) {
        console.warn(`[calendar] Failed to create event for slot "${slot.eventLabel}":`, e);
      }
    }

    return createdCount;
  } catch (e) {
    console.warn('[calendar] writeDayPlanToCalendar failed:', e);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function buildTodayCalendarContext(): Promise<string> {
  const [events, reminders] = await Promise.all([
    getTodayCalendarEvents(),
    getTodayReminders(),
  ]);

  const lines: string[] = [];

  if (events.length) {
    lines.push('CALENDAR TODAY:');
    events.forEach(e => {
      const time = e.allDay ? 'all-day' : `${e.start}${e.end ? ` – ${e.end}` : ''}`;
      lines.push(`  • ${e.title} (${time})`);
    });
  } else {
    lines.push('CALENDAR TODAY:\n  • No events scheduled');
  }

  lines.push('');

  if (reminders.length) {
    lines.push(`REMINDERS DUE TODAY (${reminders.length}):`);
    reminders.forEach(r => {
      lines.push(`  • ${r.title}${r.dueDate ? ` @ ${r.dueDate}` : ''}`);
    });
  } else {
    lines.push('REMINDERS DUE TODAY:\n  • None');
  }

  return lines.join('\n');
}

// ── Sync a single task to Calendar (for recurring tasks) ─────────────────────

export async function createCalendarEventForTask(
  taskId: string,
  text: string,
  date: string,
  calendarId?: string,
): Promise<string | null> {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) return null;

    const cid = calendarId ?? (await findOrCreateSolasCalendar());

    const startDate = new Date(date + 'T09:00:00');
    const endDate   = new Date(date + 'T09:30:00');

    const eventId = await Calendar.createEventAsync(cid, {
      title:    text,
      startDate,
      endDate,
      notes:    `synapse-task:${taskId}`,
      alarms:   [{ relativeOffset: -15 }],
    });
    return eventId;
  } catch {
    return null;
  }
}
