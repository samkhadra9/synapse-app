/**
 * calendar.ts — Synapse calendar integration
 *
 * Pushes project deadlines and routines to the user's iOS Calendar
 * using a dedicated "Synapse" calendar so they don't clutter other calendars.
 */

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Project } from '../store/useStore';

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
