/**
 * DashboardScreen — Synapse V2
 *
 * Layout:
 *   Horizontal pager (pagingEnabled):
 *     Page 0 (left):  Today — Greeting / Deep Work / Plan / Tasks / Habits / Projects
 *     Page 1 (right): Goals — 1yr / 5yr / 10yr aspirational goals (aesthetic panel)
 *   Dot page indicator between header and content
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
  Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Colors, Spacing, Radius, DomainColors } from '../theme';
import { useStore, DomainKey, Task, LifeGoal, TimeHorizon } from '../store/useStore';
import { syncAllProjects } from '../services/calendar';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect natural-language date hints in captured task text.
 *  Returns { date: 'YYYY-MM-DD', label: 'Friday 11 Apr' } or null. */
function parseNaturalDate(text: string): { date: string; label: string } | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const now   = new Date();

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now.getTime() + 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM') };
  }

  // "next week" / "this week"
  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now.getTime() + 7 * 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: `Week of ${format(d, 'EEE d MMM')}` };
  }

  // "by/on/next <day>" e.g. "by friday", "on monday", "next wednesday"
  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayMatch = lower.match(/\b(?:by|on|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const target   = DAY_NAMES.indexOf(dayMatch[1]);
    const current  = now.getDay();
    let   daysAway = target - current;
    if (daysAway <= 0) daysAway += 7;
    // "next <day>" adds another week
    if (/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)) {
      daysAway += 7;
    }
    const d = new Date(now.getTime() + daysAway * 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM') };
  }

  return null;
}

function formatMinutes(total: number): string {
  const h    = Math.floor(total / 60);
  const m    = total % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function roundUpToHalfHour(date: Date): number {
  const total = date.getHours() * 60 + date.getMinutes();
  return Math.ceil(total / 30) * 30;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Greeting({ name }: { name: string }) {
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first    = name ? name.split(' ')[0] : null;
  return (
    <View style={[styles.greetingWrap, { flex: 1 }]}>
      <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMMM d')}</Text>
      <Text style={styles.greetingText}>
        {first ? `${greeting},\n${first}.` : `${greeting}.`}
      </Text>
    </View>
  );
}

// Top action cards — Deep Work + time-aware Plan/Wind-down
function TopActions({ onDeepWork, onPlan, mode }: {
  onDeepWork: () => void;
  onPlan:     () => void;
  mode:       'morning' | 'evening' | 'weekly';
}) {
  const label = mode === 'weekly' ? 'WEEKLY' : mode === 'evening' ? 'EVENING' : 'MORNING';
  const title = mode === 'weekly' ? 'Weekly review' : mode === 'evening' ? 'Wind down' : 'Plan my day';
  const highlighted = mode === 'weekly' || mode === 'evening';
  return (
    <View style={styles.topActions}>
      <TouchableOpacity style={styles.topCard} onPress={onDeepWork} activeOpacity={0.82}>
        <Text style={styles.topCardLabel}>FOCUS</Text>
        <Text style={styles.topCardTitle}>Deep work</Text>
        <Text style={styles.topCardArrow}>→</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.topCard, highlighted && styles.topCardHighlight]}
        onPress={onPlan}
        activeOpacity={0.82}
      >
        <Text style={[styles.topCardLabel, highlighted && styles.topCardLabelHighlight]}>{label}</Text>
        <Text style={[styles.topCardTitle, highlighted && styles.topCardTitleHighlight]}>{title}</Text>
        <Text style={[styles.topCardArrow, highlighted && styles.topCardTitleHighlight]}>→</Text>
      </TouchableOpacity>
    </View>
  );
}

// Time-blocked MIT sequence
function TodaySequence({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  const startMinute = Math.max(roundUpToHalfHour(new Date()), 9 * 60);
  let cursor = startMinute;

  const slots = tasks.map(task => {
    const start    = cursor;
    const duration = task.estimatedMinutes ?? 45;
    cursor += duration + 15;
    return { task, start, end: start + duration };
  });

  return (
    <View>
      {slots.map(({ task, start, end }) => (
        <TouchableOpacity
          key={task.id}
          style={[styles.seqRow, task.completed && styles.seqRowDone]}
          onPress={() => onToggle(task.id)}
          activeOpacity={0.72}
        >
          <View style={styles.seqTimeCol}>
            <Text style={[styles.seqTimeStart, task.completed && styles.seqTimeDone]}>
              {formatMinutes(start)}
            </Text>
            <View style={styles.seqTimeDash} />
            <Text style={[styles.seqTimeEnd, task.completed && styles.seqTimeDone]}>
              {formatMinutes(end)}
            </Text>
          </View>
          <View style={[styles.seqCheck, task.completed && styles.seqCheckDone]}>
            {task.completed && <Text style={styles.seqCheckMark}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.seqLabel, task.completed && styles.seqLabelDone]} numberOfLines={2}>
              {task.text}
            </Text>
            {task.reason && !task.completed ? (
              <Text style={styles.seqReason} numberOfLines={1}>{task.reason}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Inbox task row
function InboxRow({ task, onSchedule }: { task: Task; onSchedule: () => void }) {
  return (
    <TouchableOpacity style={styles.inboxRow} onPress={onSchedule} activeOpacity={0.75}>
      <View style={styles.inboxDot} />
      <Text style={styles.inboxText} numberOfLines={1}>{task.text}</Text>
      {task.estimatedMinutes ? (
        <Text style={styles.inboxMeta}>~{task.estimatedMinutes}m</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// Overdue banner — shown above Today if tasks are overdue
function OverdueBanner({ tasks, onPress }: { tasks: Task[]; onPress: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (!tasks.length) return null;
  const aged = tasks.filter(t => {
    try { return differenceInDays(new Date(today), parseISO(t.date)) >= 7; }
    catch { return false; }
  });
  return (
    <TouchableOpacity style={styles.overdueBanner} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.overdueLeft}>
        <Text style={styles.overdueTitle}>
          {tasks.length} overdue{aged.length > 0 ? ` · ${aged.length} stale 7d+` : ''}
        </Text>
        <Text style={styles.overdueSub} numberOfLines={1}>
          {tasks.slice(0, 2).map(t => t.text).join(' · ')}
          {tasks.length > 2 ? ` +${tasks.length - 2} more` : ''}
        </Text>
      </View>
      <Text style={styles.overdueAction}>Review →</Text>
    </TouchableOpacity>
  );
}

// Compact project row
function ProjectRow({ project, onPress }: { project: any; onPress: () => void }) {
  const dc       = DomainColors[project.domain as DomainKey] ?? DomainColors.work;
  const total    = project.tasks?.length ?? 0;
  const done     = project.tasks?.filter((t: any) => t.completed).length ?? 0;
  const pct      = total > 0 ? done / total : 0;
  const daysLeft = (() => {
    if (!project.deadline) return null;
    try {
      const d = parseISO(project.deadline);
      return isNaN(d.getTime()) ? null : differenceInDays(d, new Date());
    } catch { return null; }
  })();

  return (
    <TouchableOpacity style={styles.projectRow} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.projectAccent, { backgroundColor: dc.text }]} />
      <View style={styles.projectBody}>
        <Text style={styles.projectTitle} numberOfLines={1}>{project.title}</Text>
        {total > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${Math.round(pct * 100)}%` as any,
                backgroundColor: dc.text,
              }]} />
            </View>
            <Text style={styles.progressLabel}>{done}/{total}</Text>
          </View>
        )}
      </View>
      {daysLeft !== null && (
        <Text style={[styles.daysLeft, daysLeft < 7 && { color: Colors.error }]}>
          {daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : `${daysLeft}d`}
        </Text>
      )}
      <Text style={styles.projectChevron}>›</Text>
    </TouchableOpacity>
  );
}

// Quick-add modal (inbox-first: task goes to inbox unless user flips to today)
function QuickAddModal({ visible, onClose, onAdd }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (text: string, addToToday: boolean, detectedDate?: string) => void;
}) {
  const [text,         setText]         = useState('');
  const [addToToday,   setAddToToday]   = useState(false);
  const [ignoredDate,  setIgnoredDate]  = useState(false);

  const detectedDate = ignoredDate ? null : parseNaturalDate(text);

  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim(), addToToday, detectedDate?.date);
    setText(''); setAddToToday(false); setIgnoredDate(false); onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={qa.overlay}>
        <TouchableOpacity style={qa.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={qa.sheet}>
          <View style={qa.handle} />
          <Text style={qa.title}>Capture task</Text>
          <TextInput
            style={qa.input}
            value={text}
            onChangeText={t => { setText(t); setIgnoredDate(false); }}
            placeholder="What's on your mind?"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          {/* Natural-language date chip */}
          {detectedDate && (
            <View style={qa.dateChipRow}>
              <View style={qa.dateChip}>
                <Text style={qa.dateChipText}>📅 {detectedDate.label}</Text>
              </View>
              <TouchableOpacity onPress={() => setIgnoredDate(true)} style={qa.dateChipRemove}>
                <Text style={qa.dateChipRemoveText}>×</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={qa.mitRow}>
            <View>
              <Text style={qa.mitLabel}>Add to today</Text>
              <Text style={qa.mitSub}>Off = goes to Inbox to schedule later</Text>
            </View>
            <Switch
              value={addToToday}
              onValueChange={setAddToToday}
              trackColor={{ false: Colors.borderLight, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={[qa.addBtn, !text.trim() && qa.addBtnOff]} onPress={submit} disabled={!text.trim()} activeOpacity={0.85}>
            <Text style={qa.addBtnText}>{addToToday ? 'Add to today' : 'Add to inbox'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={qa.cancelBtn} onPress={onClose}>
            <Text style={qa.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Goals Panel ───────────────────────────────────────────────────────────────

const HORIZONS: { key: TimeHorizon; label: string; emoji: string }[] = [
  { key: '1year',  label: '1 year',   emoji: '🌱' },
  { key: '5year',  label: '5 years',  emoji: '🌳' },
  { key: '10year', label: '10 years', emoji: '🏔' },
];

function GoalsPanelPage({ navigation }: { navigation: any }) {
  const goals   = useStore(s => s.goals);
  const profile = useStore(s => s.profile);

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={gp.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={gp.header}>
        <Text style={gp.title}>Your vision</Text>
        <Text style={gp.subtitle}>Where you're going</Text>
      </View>

      {/* Horizon blocks */}
      {HORIZONS.map(h => {
        const horizonGoals = goals.filter(g => g.horizon === h.key);
        return (
          <View key={h.key} style={gp.horizonBlock}>
            <View style={gp.horizonHeader}>
              <Text style={gp.horizonEmoji}>{h.emoji}</Text>
              <Text style={gp.horizonLabel}>{h.label}</Text>
            </View>

            {horizonGoals.length === 0 ? (
              <Text style={gp.empty}>Not set yet</Text>
            ) : (
              horizonGoals.map(goal => {
                const dc = DomainColors[goal.domain] ?? DomainColors.work;
                return (
                  <View key={goal.id} style={gp.goalRow}>
                    <View style={[gp.goalDot, { backgroundColor: dc.text }]} />
                    <Text style={gp.goalText}>{goal.text}</Text>
                  </View>
                );
              })
            )}
          </View>
        );
      })}

      {/* CTA */}
      <TouchableOpacity
        style={gp.cta}
        onPress={() => navigation?.navigate('Chat', { mode: 'yearly' })}
        activeOpacity={0.82}
      >
        <Text style={gp.ctaText}>Set goals with Synapse →</Text>
      </TouchableOpacity>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const gp = StyleSheet.create({
  scroll:   { paddingBottom: 40 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title:    { fontSize: 38, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
  subtitle: { fontSize: 14, color: Colors.textTertiary, marginTop: 4, fontWeight: '500', fontStyle: 'italic' },

  horizonBlock: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 10,
  },
  horizonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  horizonEmoji:  { fontSize: 20 },
  horizonLabel:  { fontSize: 13, fontWeight: '700', color: Colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' },

  goalRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  goalDot:  { width: 7, height: 7, borderRadius: 3.5, marginTop: 7, flexShrink: 0 },
  goalText: { flex: 1, fontSize: 16, color: Colors.textPrimary, lineHeight: 24, fontWeight: '400' },

  empty: { fontSize: 14, color: Colors.textTertiary, fontStyle: 'italic' },

  cta: {
    marginHorizontal: Spacing.lg,
    marginTop: 8,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primaryMid,
    backgroundColor: Colors.primaryLight,
  },
  ctaText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
});

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { profile, tasks, projects, toggleTask, updateProject, updateProfile, addTask } = useStore();
  const [syncing,      setSyncing]      = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activePage,   setActivePage]   = useState(0);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Time-aware plan mode
  const planMode: 'morning' | 'evening' | 'weekly' = (() => {
    const h   = new Date().getHours();
    const dow = new Date().getDay();
    if (dow === 0) return 'weekly';
    if (h >= 17)  return 'evening';
    return 'morning';
  })();

  const mits = useMemo(
    () => tasks.filter(t => t.date === today && t.isMIT && !t.completed),
    [tasks, today],
  );
  const otherToday = useMemo(
    () => tasks.filter(t => t.date === today && !t.isMIT),
    [tasks, today],
  );
  const inboxTasks = useMemo(
    () => tasks.filter(t => (t.isInbox || !t.date || t.date === '') && !t.completed),
    [tasks],
  );
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.date && t.date < today && !t.completed),
    [tasks, today],
  );
  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'active').slice(0, 4),
    [projects],
  );

  function handlePageChange(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActivePage(page);
  }

  function handleQuickAdd(text: string, addToToday: boolean, detectedDate?: string) {
    // If a natural-language date was detected, use it as the due date (and skip inbox)
    const resolvedDate = detectedDate ?? (addToToday ? today : '');
    const isScheduled  = resolvedDate !== '';
    addTask({
      text,
      isMIT:     false,
      completed: false,
      date:      resolvedDate,
      isInbox:   !isScheduled,
      isToday:   resolvedDate === today,
      priority:  'medium',
      domain:    (profile.selectedDomains?.[0] as DomainKey) ?? 'work',
    });
  }

  async function handleCalendarSync() {
    const withDeadlines = projects.filter(p => p.deadline && p.status === 'active');
    if (!withDeadlines.length) {
      Alert.alert('Nothing to sync', 'Add deadlines to your active projects first.\n\nOpen a project and set a deadline to get started.');
      return;
    }
    if (!profile.synapseCalendarId) {
      Alert.alert(
        'No calendar selected',
        'Go to Settings → Calendar Sync and pick which calendar to use.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSyncing(true);
    try {
      const result = await syncAllProjects(projects, profile.synapseCalendarId);
      if (result.calendarId && result.calendarId !== profile.synapseCalendarId) {
        updateProfile({ synapseCalendarId: result.calendarId });
      }
      result.projectResults.forEach(({ projectId, eventId }: any) =>
        updateProject(projectId, { calendarEventId: eventId }),
      );
      if (result.synced === 0) {
        Alert.alert('Nothing new to sync', `All ${withDeadlines.length} project deadline${withDeadlines.length !== 1 ? 's' : ''} are already in your calendar.`);
      } else {
        Alert.alert('Calendar synced ✓', `${result.synced} project deadline${result.synced !== 1 ? 's' : ''} added to "${profile.selectedCalendarName ?? 'your calendar'}".${result.failed > 0 ? `\n\n${result.failed} failed — check the project has a valid date.` : ''}`);
      }
    } catch (e: any) {
      Alert.alert('Sync failed', `${e.message ?? 'Unknown error'}\n\nCheck that Synapse has calendar access in iPhone Settings → Privacy → Calendars.`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── Page dots ──────────────────────────────────────────────────── */}
        <View style={styles.dotRow}>
          <View style={[styles.dot, activePage === 0 && styles.dotActive]} />
          <View style={[styles.dot, activePage === 1 && styles.dotActive]} />
        </View>

        {/* ── Horizontal pager ───────────────────────────────────────────── */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePageChange}
          style={{ flex: 1 }}
          scrollEventThrottle={16}
          decelerationRate="fast"
        >

          {/* ── Page 0: Dashboard ─────────────────────────────────────────── */}
          <ScrollView
            style={{ width: SCREEN_W }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting + quick capture */}
            <View style={styles.greetingRow}>
              <Greeting name={profile.name} />
              <TouchableOpacity
                style={styles.plusBtn}
                onPress={() => setShowQuickAdd(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.plusBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Top action cards */}
            <TopActions
              onDeepWork={() => navigation.navigate('DeepWork')}
              onPlan={() => navigation.navigate('Chat', { mode: planMode === 'weekly' ? 'weekly' : planMode === 'evening' ? 'evening' : 'morning' })}
              mode={planMode}
            />

            {/* Overdue banner */}
            <OverdueBanner
              tasks={overdueTasks}
              onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
            />

            {/* Today section */}
            {(() => {
              const totalToday     = mits.length + otherToday.length;
              const completedToday = tasks.filter(t => t.date === today && t.completed).length;
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Today</Text>
                  <View style={styles.sectionHeaderRight}>
                    {totalToday > 0 && (
                      <Text style={styles.todayCount}>{completedToday}/{totalToday}</Text>
                    )}
                  </View>
                </View>
              );
            })()}

            <View style={styles.sectionBody}>
              {mits.length === 0 && otherToday.length === 0 ? (
                <TouchableOpacity
                  style={styles.planCTA}
                  onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
                  activeOpacity={0.82}
                >
                  <Text style={styles.planCTAText}>Plan my day with Synapse →</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {mits.length > 0 && (
                    <>
                      <Text style={styles.taskGroupLabel}>TOP PRIORITIES</Text>
                      <TodaySequence tasks={mits} onToggle={id => toggleTask(id)} />
                    </>
                  )}
                  {otherToday.length > 0 && (
                    <>
                      <Text style={[styles.taskGroupLabel, mits.length > 0 && { marginTop: Spacing.base }]}>
                        ALL TASKS TODAY
                      </Text>
                      {otherToday.map(t => (
                        <TouchableOpacity
                          key={t.id}
                          style={styles.taskRow}
                          onPress={() => toggleTask(t.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.taskCheck, t.completed && styles.taskCheckDone]}>
                            {t.completed && <Text style={styles.taskCheckMark}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.taskText, t.completed && styles.taskTextDone]} numberOfLines={2}>
                              {t.text}
                            </Text>
                            {t.estimatedMinutes ? (
                              <Text style={styles.taskMeta}>~{t.estimatedMinutes} min</Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </>
              )}
            </View>

            {/* Inbox */}
            {inboxTasks.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Inbox</Text>
                  <Text style={styles.habitCount}>{inboxTasks.length} captured</Text>
                </View>
                <View style={styles.inboxCard}>
                  {inboxTasks.slice(0, 5).map(t => (
                    <InboxRow
                      key={t.id}
                      task={t}
                      onSchedule={() => navigation.navigate('Chat', { mode: 'morning' })}
                    />
                  ))}
                  {inboxTasks.length > 5 && (
                    <TouchableOpacity
                      style={styles.inboxMore}
                      onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.inboxMoreText}>+{inboxTasks.length - 5} more — plan with Synapse →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* Projects */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Projects</Text>
              <TouchableOpacity
                style={[styles.calBtn, syncing && { opacity: 0.5 }]}
                onPress={handleCalendarSync}
                disabled={syncing}
                activeOpacity={0.8}
              >
                <Text style={styles.calBtnText}>{syncing ? 'Syncing…' : 'Sync cal'}</Text>
              </TouchableOpacity>
            </View>

            {activeProjects.length > 0 ? (
              <View style={styles.projectsCard}>
                {activeProjects.map(p => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id })}
                  />
                ))}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.emptyCard}
                onPress={() => navigation.navigate('Chat', { mode: 'project' })}
                activeOpacity={0.82}
              >
                <Text style={styles.emptyCardText}>Plan a project with Synapse →</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── Page 1: Goals panel ───────────────────────────────────────── */}
          <GoalsPanelPage navigation={navigation} />

        </ScrollView>
      </SafeAreaView>

      <QuickAddModal
        visible={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={handleQuickAdd}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const AMBER = '#D4621A';

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.background },
  safe:  { flex: 1 },
  scroll:{ paddingBottom: 40 },

  // Page dots
  dotRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6,
    paddingVertical: 8,
  },
  dot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: Colors.borderLight,
  },
  dotActive: {
    backgroundColor: Colors.textTertiary,
    width: 14, borderRadius: 2.5,
  },

  // Greeting
  greetingWrap:  { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  dateText:      { fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  greetingText:  { fontSize: 38, fontWeight: '800', color: Colors.textPrimary, lineHeight: 44, letterSpacing: -1.5 },

  // Top action cards
  topActions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
  },
  topCard: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: 16, gap: 6,
    backgroundColor: Colors.surface,
  },
  topCardHighlight: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentMid,
  },
  topCardLabel:          { fontSize: 10, fontWeight: '700', color: Colors.textTertiary, letterSpacing: 1.2 },
  topCardLabelHighlight: { color: AMBER },
  topCardTitle:          { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3 },
  topCardTitleHighlight: { color: AMBER },
  topCardArrow:          { fontSize: 16, color: Colors.textTertiary, marginTop: 4 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle:  { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.5 },
  sectionAction: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  sectionBody:   { paddingHorizontal: Spacing.lg },

  // Today sequence
  seqRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  seqRowDone:    { opacity: 0.4 },
  seqTimeCol:    { width: 62, alignItems: 'flex-end', gap: 1 },
  seqTimeStart:  { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  seqTimeEnd:    { fontSize: 10, color: Colors.textTertiary },
  seqTimeDash:   { width: 1, height: 5, backgroundColor: Colors.borderLight, alignSelf: 'center' },
  seqTimeDone:   { color: Colors.textTertiary },
  seqCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seqCheckDone:  { backgroundColor: Colors.ink, borderColor: Colors.ink },
  seqCheckMark:  { fontSize: 11, color: '#fff', fontWeight: '700' },
  seqLabel:      { fontSize: 15, fontWeight: '500', color: Colors.textPrimary, lineHeight: 20 },
  seqLabelDone:  { textDecorationLine: 'line-through', color: Colors.textTertiary },
  seqReason:     { fontSize: 12, color: Colors.textTertiary, marginTop: 2, fontStyle: 'italic', lineHeight: 16 },

  planCTA: {
    paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryMid,
    marginTop: 4,
  },
  planCTAText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },

  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayCount:  { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },

  taskGroupLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textTertiary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  taskCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCheckDone:  { backgroundColor: Colors.ink, borderColor: Colors.ink },
  taskCheckMark:  { fontSize: 11, color: '#fff', fontWeight: '700' },
  taskText:       { fontSize: 15, fontWeight: '500', color: Colors.textPrimary, lineHeight: 20 },
  taskTextDone:   { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskMeta:       { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },

  // Greeting row (greeting + plus button)
  greetingRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingRight: Spacing.lg,
  },
  plusBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28, flexShrink: 0,
  },
  plusBtnText: { fontSize: 22, color: '#fff', lineHeight: 26, fontWeight: '300' },

  // Inbox count badge (reused habitCount style)
  habitCount: { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },
  habitScroll:{ paddingLeft: Spacing.lg, paddingRight: Spacing.lg, paddingVertical: 4, gap: 8 },

  // Inbox
  inboxCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  inboxRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  inboxDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.textTertiary, flexShrink: 0,
  },
  inboxText: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '400' },
  inboxMeta: { fontSize: 12, color: Colors.textTertiary, fontWeight: '400' },
  inboxMore: {
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
  },
  inboxMoreText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  // Overdue banner
  overdueBanner: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#E8C4A0',
    backgroundColor: '#FDF3E8',
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  overdueLeft:   { flex: 1, gap: 2 },
  overdueTitle:  { fontSize: 14, fontWeight: '700', color: '#9B4F0F' },
  overdueSub:    { fontSize: 12, color: '#B5733A' },
  overdueAction: { fontSize: 13, fontWeight: '600', color: '#9B4F0F' },

  // Projects
  projectsCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  projectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  projectAccent: { width: 3, height: 32, borderRadius: 2, flexShrink: 0 },
  projectBody:   { flex: 1, gap: 5 },
  projectTitle:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 3, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2 },
  progressLabel: { fontSize: 11, color: Colors.textTertiary, width: 28, textAlign: 'right' },
  daysLeft:      { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },
  projectChevron:{ fontSize: 18, color: Colors.textTertiary },

  emptyCard: {
    marginHorizontal: Spacing.lg, marginTop: 4,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  emptyCardText: { fontSize: 14, color: Colors.textTertiary },

  // Calendar sync
  calBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  calBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
});

const qa = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
  },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20 },
  title:    { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: Colors.textPrimary, marginBottom: 16,
  },
  dateChipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  dateChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.primaryMid,
  },
  dateChipText:       { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  dateChipRemove:     { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dateChipRemoveText: { fontSize: 18, color: Colors.textTertiary, lineHeight: 22 },

  mitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: Radius.md,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20,
  },
  mitLabel:   { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  mitSub:     { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  addBtn:     { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  addBtnOff:  { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:  { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: Colors.textSecondary, fontSize: 15 },
});
