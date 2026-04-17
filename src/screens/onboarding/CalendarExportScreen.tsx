/**
 * CalendarExportScreen — Solas V2 Onboarding Step 3
 *
 * Lighter warm background. Plain-English explanation of what calendar
 * write access means. One big "Sync" button and a skip option.
 *
 * Creates recurring calendar events for each TimeBlock in the weekTemplate.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Calendar from 'expo-calendar';
import { useStore, TimeBlock, TimeBlockType } from '../../store/useStore';

// ── Design tokens — warm off-white ────────────────────────────────────────────

const WARM = {
  bg:         '#FDFAF6',
  surface:    '#FFFFFF',
  border:     '#EDE8E1',
  text:       '#1A1A1A',
  textDim:    '#6B6355',
  textFaint:  '#A89F94',
  amber:      '#C85D10',
  amberLight: '#FEF3E8',
  amberMid:   '#F5D5B0',
  green:      '#1A7F4B',
  greenLight: '#E6F7EE',
  greenMid:   '#A7DFC1',
};

const BLOCK_LABELS: Record<TimeBlockType, string> = {
  deep_work: 'Deep work',
  area_work: 'Area work',
  social:    'Social',
  admin:     'Admin',
  protected: 'Protected',
  personal:  'Personal',
};

const BLOCK_COLORS: Record<TimeBlockType, string> = {
  deep_work: '#2EC4A9',
  area_work: '#D4821A',
  social:    '#8B5CF6',
  admin:     '#64748B',
  protected: '#EF4444',
  personal:  '#3B82F6',
};

// ── Calendar helpers ───────────────────────────────────────────────────────────

/** JS 0-6 (Sun-Sat) → expo-calendar recurrence dayOfWeek 1-7 (Sun-Sat) */
function jsDayToExpoDow(d: number): number {
  return d + 1; // JS 0→expo 1, JS 6→expo 7
}

/** "HH:MM" → { hour, minute } */
function parseHHMM(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h, minute: m };
}

/** Build a Date for the next occurrence of a given day of week */
function nextDateForDay(jsDay: number): Date {
  const now = new Date();
  const curr = now.getDay();
  const diff = ((jsDay - curr) + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

async function createRecurringEvent(
  calendarId: string,
  block: TimeBlock,
  dayOfWeek: number,
): Promise<string | null> {
  try {
    const { hour, minute } = parseHHMM(block.startTime);
    const start = nextDateForDay(dayOfWeek);
    start.setHours(hour, minute, 0, 0);

    const end = new Date(start.getTime() + block.durationMinutes * 60 * 1000);

    const id = await Calendar.createEventAsync(calendarId, {
      title:    `[Aiteall] ${block.label}`,
      startDate: start,
      endDate:   end,
      recurrenceRule: {
        frequency: Calendar.Frequency.WEEKLY,
        daysOfWeek: [jsDayToExpoDow(dayOfWeek)],
        interval: 1,
      },
      notes: `Aiteall time block — ${BLOCK_LABELS[block.type]}`,
    } as any);

    return id;
  } catch {
    return null;
  }
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}${m > 0 ? `:${m.toString().padStart(2, '0')}` : ''} ${ampm}`;
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function CalendarExportScreen({ navigation }: any) {
  const { profile, updateProfile } = useStore();
  const blocks = profile.weekTemplate ?? [];

  const [syncing, setSyncing] = useState(false);
  const [synced,  setSynced]  = useState(false);
  const [error,   setError]   = useState('');

  function finishOnboarding() {
    updateProfile({ onboardingCompleted: true, onboardingStep: 'done', skeletonBuilt: true });
    // Schedule daily notifications now that morning/evening times are set.
    // Fire-and-forget — don't block navigation if permission is denied.
    import('../../services/notifications')
      .then(async (n) => {
        const granted = await n.requestPermissions();
        if (granted) {
          await n.scheduleDailyNotifications(
            profile.morningTime || '07:30',
            profile.eveningTime || '21:00',
          );
        }
      })
      .catch(() => {});
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  async function handleSync() {
    setError('');
    setSyncing(true);

    try {
      // Request calendar permission
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        setError("Calendar access was denied. You can enable it in iPhone Settings → Privacy → Calendars → Aiteall.");
        setSyncing(false);
        return;
      }

      // Get or use existing calendar
      let calId = profile.synapseCalendarId;

      if (!calId) {
        // Try to use default writable calendar
        const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const writable = cals.filter(c => c.allowsModifications && (c.type as string) !== 'birthday');

        if (writable.length === 0) {
          setError("No writable calendar found on your device. Try adding a calendar in the Apple Calendar app first.");
          setSyncing(false);
          return;
        }

        // Prefer iCloud or default calendar
        const best = writable.find(c => c.source?.name?.toLowerCase().includes('icloud'))
          ?? writable.find(c => (c as any).isDefault)
          ?? writable[0];

        calId = best.id;
        updateProfile({ synapseCalendarId: calId, selectedCalendarName: best.title });
      }

      // Create recurring events for each block × each day.
      // Deep-copy so we don't mutate store objects directly; also clears any
      // stale calendarEventId from a previous failed sync attempt so we don't
      // create duplicates on retry.
      let created = 0;
      const updatedBlocks: typeof blocks = blocks.map(b => ({ ...b, calendarEventId: undefined }));

      // Delete any pre-existing Solas calendar events before re-creating them
      for (const original of blocks) {
        if (original.calendarEventId) {
          await Calendar.deleteEventAsync(original.calendarEventId, { futureEvents: true }).catch(() => {});
        }
      }

      for (const block of updatedBlocks) {
        for (const day of block.dayOfWeek) {
          const id = await createRecurringEvent(calId, block, day);
          if (id) {
            block.calendarEventId = id;
            created++;
          }
        }
      }

      // Save updated blocks (with calendarEventIds)
      updateProfile({ weekTemplate: updatedBlocks, skeletonBuilt: true });

      if (created > 0) {
        setSynced(true);
      } else {
        setError("Events couldn't be created. Make sure Aiteall has calendar access in your iPhone Settings.");
      }
    } catch (e: any) {
      setError(`Something went wrong: ${e.message ?? 'Unknown error'}. Try again or skip for now.`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step badge */}
          <View style={s.stepBadge}>
            <Text style={s.stepText}>STEP 3 OF 3</Text>
          </View>

          {/* Hero */}
          <Text style={s.title}>Sync to your calendar</Text>
          <Text style={s.subtitle}>
            One tap and your weekly skeleton becomes recurring events in Apple Calendar — visible alongside your existing commitments.
          </Text>

          {/* Plain-English explanation card */}
          <View style={s.explainCard}>
            <Text style={s.explainHeading}>What "calendar access" means</Text>
            <Text style={s.explainBody}>
              Aiteall will create recurring events in your Apple Calendar — one for each block in your skeleton. They'll show up every week automatically, labelled "[Aiteall]" so you can tell them apart.
            </Text>
            <Text style={[s.explainBody, { marginTop: 12 }]}>
              Aiteall will NOT read your personal events or share anything with anyone. It only writes the blocks you just built.
            </Text>
            <Text style={[s.explainBody, { marginTop: 12 }]}>
              You can delete individual events from Apple Calendar any time, and Aiteall won't recreate them.
            </Text>
          </View>

          {/* Block summary */}
          {blocks.length > 0 && (
            <View style={s.blockSummary}>
              <Text style={s.blockSummaryLabel}>BLOCKS TO SYNC ({blocks.reduce((n, b) => n + b.dayOfWeek.length, 0)} events/week)</Text>
              {blocks.map(b => (
                <View key={b.id} style={s.blockRow}>
                  <View style={[s.blockDot, { backgroundColor: BLOCK_COLORS[b.type] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.blockName}>{b.label}</Text>
                    <Text style={s.blockMeta}>
                      {formatTime(b.startTime)} · {b.durationMinutes} min ·{' '}
                      {b.dayOfWeek.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Success state */}
          {synced && (
            <View style={s.successCard}>
              <Text style={s.successIcon}>✓</Text>
              <Text style={s.successTitle}>Synced!</Text>
              <Text style={s.successBody}>
                Your skeleton is now in Apple Calendar as recurring weekly events. Open the Calendar app to see them.
              </Text>
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={s.errorCard}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Sync button */}
          {!synced && (
            <TouchableOpacity
              style={[s.syncBtn, (syncing || blocks.length === 0) && s.syncBtnOff]}
              onPress={handleSync}
              disabled={syncing || blocks.length === 0}
              activeOpacity={0.85}
            >
              {syncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.syncBtnText}>
                  {blocks.length === 0 ? 'No blocks to sync' : 'Sync to my calendar →'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* CTA button */}
          <TouchableOpacity
            style={[s.enterBtn, synced && s.enterBtnHighlight]}
            onPress={finishOnboarding}
            activeOpacity={0.85}
          >
            <Text style={[s.enterBtnText, synced && s.enterBtnTextHighlight]}>
              {synced ? 'Get started →' : 'Skip for now'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: WARM.bg },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },

  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: WARM.amberLight, borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 24,
  },
  stepText: { fontSize: 11, fontWeight: '700', color: WARM.amber, letterSpacing: 1 },

  title:    { fontSize: 34, fontWeight: '800', color: WARM.text, letterSpacing: -1.2, lineHeight: 40, marginBottom: 12 },
  subtitle: { fontSize: 16, color: WARM.textDim, lineHeight: 26, marginBottom: 28 },

  explainCard: {
    backgroundColor: WARM.surface, borderRadius: 16,
    borderWidth: 1, borderColor: WARM.border,
    padding: 20, marginBottom: 24,
  },
  explainHeading: { fontSize: 15, fontWeight: '700', color: WARM.text, marginBottom: 10 },
  explainBody:    { fontSize: 14, color: WARM.textDim, lineHeight: 23 },

  blockSummary: {
    backgroundColor: WARM.surface, borderRadius: 16,
    borderWidth: 1, borderColor: WARM.border,
    padding: 16, marginBottom: 24, gap: 0,
  },
  blockSummaryLabel: {
    fontSize: 10, fontWeight: '700', color: WARM.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WARM.border,
  },
  blockDot:  { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  blockName: { fontSize: 15, fontWeight: '600', color: WARM.text },
  blockMeta: { fontSize: 12, color: WARM.textFaint, marginTop: 2 },

  successCard: {
    backgroundColor: WARM.greenLight, borderRadius: 16,
    borderWidth: 1, borderColor: WARM.greenMid,
    padding: 20, marginBottom: 20, alignItems: 'center', gap: 6,
  },
  successIcon:  { fontSize: 36 },
  successTitle: { fontSize: 22, fontWeight: '800', color: WARM.green },
  successBody:  { fontSize: 14, color: '#2D5940', lineHeight: 22, textAlign: 'center' },

  errorCard: {
    backgroundColor: '#FFF0EE', borderRadius: 12,
    borderWidth: 1, borderColor: '#FFD0C8',
    padding: 16, marginBottom: 16,
  },
  errorText: { fontSize: 14, color: '#B42318', lineHeight: 22 },

  syncBtn: {
    backgroundColor: WARM.amber, borderRadius: 100,
    paddingVertical: 18, alignItems: 'center', marginBottom: 12,
  },
  syncBtnOff:  { opacity: 0.4 },
  syncBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  enterBtn: {
    borderWidth: 1.5, borderColor: WARM.border,
    borderRadius: 100, paddingVertical: 16, alignItems: 'center',
  },
  enterBtnHighlight:     { backgroundColor: WARM.text, borderColor: WARM.text },
  enterBtnText:          { fontSize: 16, color: WARM.textDim, fontWeight: '500' },
  enterBtnTextHighlight: { color: '#fff', fontWeight: '700' },
});
