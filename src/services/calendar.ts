/**
 * calendar.ts — Synapse calendar integration
 *
 * Pushes project deadlines and routines to the user's iOS Calendar
 * using a dedicated "Synapse" calendar so they don't clutter other calendars.
 */

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Project, TimeBlock, TimeBlockType } from '../store/useStore';

const CALENDAR_NAME = 'Synapse';
const CALENDAR_COLOR = '#1A5C4A'; // matches Colors.primary

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// ── Find or create the Synapse calendar ───────────────────────────────────────

export async function findOrCreateSynapseCalendar(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing  = calendars.find(c => c.title === CALENDAR_NAME && c.allowsModifications);
  if (existing) return existing.id;

  // Create a local calendar
  const defaultCalendarSource = Platform.OS === 'ios'
    ? calendars.find(c => c.source?.isLocalAccount)?.source ?? { isLocalAccount: true, name: 'Default', id: '' }
    : { isLocalAccount: true, name: 'Default', id: '' };

  const newId = await Calendar.createCalendarAsync({
    title:          CALENDAR_NAME,
    color:          CALENDAR_COLOR,
    entityType:     Calendar.EntityTypes.EVENT,
    sourceId:       (defaultCalendarSource as any).id,
    source:         defaultCalendarSource as any,
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

  const details: Calendar.Event = {
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

  const calendarId = existingCalendarId || await findOrCreateSynapseCalendar();
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
  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calIds    = calendars.map(c => c.id);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await Calendar.getEventsAsync(calIds, startOfDay, endOfDay);

  return events.map(e => {
    const start = e.allDay
      ? 'all-day'
      : new Date(e.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const end = e.allDay
      ? undefined
      : new Date(e.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

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

    return reminders.map(r => ({
      title:    r.title ?? '(no title)',
      dueDate:  r.dueDate ? new Date(r.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : undefined,
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
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
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
