/**
 * DashboardScreen — Synapse V2
 *
 * Layout:
 *   Greeting
 *   Top actions — Deep Work + Plan/Review (always visible at top)
 *   Today's Sequence — time-blocked MITs
 *   Habits — domain-coloured dots, no emoji
 *   Projects — standalone card section
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Colors, Spacing, Radius, DomainColors } from '../theme';
import { useStore, DomainKey, Task } from '../store/useStore';
import { syncAllProjects } from '../services/calendar';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    <View style={styles.greetingWrap}>
      <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMMM d')}</Text>
      <Text style={styles.greetingText}>
        {first ? `${greeting},\n${first}.` : `${greeting}.`}
      </Text>
    </View>
  );
}

// Top action cards — Deep Work + Plan Day/Weekly Review
function TopActions({ onDeepWork, onPlan, isSunday }: {
  onDeepWork: () => void;
  onPlan:     () => void;
  isSunday:   boolean;
}) {
  return (
    <View style={styles.topActions}>
      <TouchableOpacity style={styles.topCard} onPress={onDeepWork} activeOpacity={0.82}>
        <Text style={styles.topCardLabel}>FOCUS</Text>
        <Text style={styles.topCardTitle}>Deep work</Text>
        <Text style={styles.topCardArrow}>→</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.topCard, isSunday && styles.topCardHighlight]}
        onPress={onPlan}
        activeOpacity={0.82}
      >
        <Text style={[styles.topCardLabel, isSunday && styles.topCardLabelHighlight]}>
          {isSunday ? 'WEEKLY' : 'MORNING'}
        </Text>
        <Text style={[styles.topCardTitle, isSunday && styles.topCardTitleHighlight]}>
          {isSunday ? 'Weekly review' : 'Plan my day'}
        </Text>
        <Text style={[styles.topCardArrow, isSunday && styles.topCardTitleHighlight]}>→</Text>
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
          <Text style={[styles.seqLabel, task.completed && styles.seqLabelDone]} numberOfLines={2}>
            {task.text}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Habit chip — domain-coloured dot instead of emoji
function HabitChip({ habit, onToggle }: { habit: any; onToggle: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const done  = habit.completedDates.includes(today);
  const dc    = DomainColors[habit.domain as DomainKey] ?? DomainColors.work;

  return (
    <TouchableOpacity
      style={[styles.habitChip, done && styles.habitChipDone]}
      onPress={onToggle}
      activeOpacity={0.78}
    >
      {/* Coloured domain dot — replaces emoji */}
      <View style={[
        styles.habitDot,
        { backgroundColor: done ? 'rgba(255,255,255,0.6)' : dc.text },
      ]} />
      <Text style={[styles.habitName, done && styles.habitNameDone]}>
        {habit.name}
      </Text>
      {done && <Text style={styles.habitTick}>✓</Text>}
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

// Quick-add modal
function QuickAddModal({ visible, onClose, onAdd }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (text: string, isMIT: boolean) => void;
}) {
  const [text,  setText]  = useState('');
  const [isMIT, setIsMIT] = useState(true);

  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim(), isMIT);
    setText(''); setIsMIT(true); onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={qa.overlay}>
        <TouchableOpacity style={qa.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={qa.sheet}>
          <View style={qa.handle} />
          <Text style={qa.title}>Add to today</Text>
          <TextInput
            style={qa.input}
            value={text}
            onChangeText={setText}
            placeholder="What needs to happen today?"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={qa.mitRow}>
            <View>
              <Text style={qa.mitLabel}>Top priority (MIT)</Text>
              <Text style={qa.mitSub}>Max 3 per day</Text>
            </View>
            <Switch
              value={isMIT}
              onValueChange={setIsMIT}
              trackColor={{ false: Colors.borderLight, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={[qa.addBtn, !text.trim() && qa.addBtnOff]} onPress={submit} disabled={!text.trim()} activeOpacity={0.85}>
            <Text style={qa.addBtnText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={qa.cancelBtn} onPress={onClose}>
            <Text style={qa.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { profile, tasks, habits, projects, toggleTask, toggleHabitToday, updateProject, updateProfile, addTask } = useStore();
  const [syncing,      setSyncing]      = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const today      = format(new Date(), 'yyyy-MM-dd');
  const isSunday   = new Date().getDay() === 0;

  const mits = useMemo(
    () => tasks.filter(t => t.date === today && t.isMIT),
    [tasks, today],
  );
  const otherToday = useMemo(
    () => tasks.filter(t => t.date === today && !t.isMIT && !t.completed),
    [tasks, today],
  );
  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'active').slice(0, 4),
    [projects],
  );

  const todayHabits = useMemo(() => {
    const dow = new Date().getDay();
    return habits.filter(h => {
      if (h.frequency === 'daily')    return true;
      if (h.frequency === 'weekdays') return dow >= 1 && dow <= 5;
      if (h.frequency === 'weekends') return dow === 0 || dow === 6;
      return true;
    });
  }, [habits]);

  const habitsDone = todayHabits.filter(h => h.completedDates.includes(today)).length;

  function handleQuickAdd(text: string, isMIT: boolean) {
    const mitCount = tasks.filter(t => t.date === today && t.isMIT).length;
    addTask({
      text,
      isMIT:     isMIT && mitCount < 3,
      completed: false,
      date:      today,
      isToday:   true,
      priority:  isMIT ? 'high' : 'medium',
      domain:    (profile.selectedDomains?.[0] as DomainKey) ?? 'work',
    });
  }

  async function handleCalendarSync() {
    const withDeadlines = projects.filter(p => p.deadline && p.status === 'active');
    if (!withDeadlines.length) {
      Alert.alert('Nothing to sync', 'Add deadlines to your active projects first.');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncAllProjects(projects, profile.synapseCalendarId);
      updateProfile({ synapseCalendarId: result.calendarId });
      result.projectResults.forEach(({ projectId, eventId }: any) =>
        updateProject(projectId, { calendarEventId: eventId }),
      );
      Alert.alert('Calendar synced', `${result.synced} deadline${result.synced !== 1 ? 's' : ''} added.`);
    } catch (e: any) {
      Alert.alert('Sync failed', e.message ?? 'Check calendar permissions in Settings.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Greeting ─────────────────────────────────────────────────── */}
          <Greeting name={profile.name} />

          {/* ── Top action cards ─────────────────────────────────────────── */}
          <TopActions
            onDeepWork={() => navigation.navigate('DeepWork')}
            onPlan={() => navigation.navigate('Chat', { mode: isSunday ? 'weekly' : 'morning' })}
            isSunday={isSunday}
          />

          {/* ── Today's sequence ─────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today</Text>
            <TouchableOpacity onPress={() => setShowQuickAdd(true)}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionBody}>
            {mits.length > 0 ? (
              <TodaySequence tasks={mits} onToggle={id => toggleTask(id)} />
            ) : (
              <TouchableOpacity
                style={styles.planCTA}
                onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
                activeOpacity={0.82}
              >
                <Text style={styles.planCTAText}>Plan my day with Synapse →</Text>
              </TouchableOpacity>
            )}

            {otherToday.length > 0 && (
              <View style={styles.otherTasks}>
                {otherToday.slice(0, 4).map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.otherRow}
                    onPress={() => toggleTask(t.id)}
                    activeOpacity={0.65}
                  >
                    <View style={styles.otherDot} />
                    <Text style={styles.otherText} numberOfLines={1}>{t.text}</Text>
                  </TouchableOpacity>
                ))}
                {otherToday.length > 4 && (
                  <Text style={styles.moreText}>+{otherToday.length - 4} more</Text>
                )}
              </View>
            )}
          </View>

          {/* ── Habits ───────────────────────────────────────────────────── */}
          {todayHabits.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Habits</Text>
                <Text style={styles.habitCount}>{habitsDone}/{todayHabits.length}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.habitScroll}
              >
                {todayHabits.map(h => (
                  <HabitChip key={h.id} habit={h} onToggle={() => toggleHabitToday(h.id)} />
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Projects ─────────────────────────────────────────────────── */}
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
              {activeProjects.map((p, i) => (
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

  // Greeting
  greetingWrap:  { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
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

  // Section headers — bold editorial
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
  seqLabel:      { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.textPrimary, lineHeight: 20 },
  seqLabelDone:  { textDecorationLine: 'line-through', color: Colors.textTertiary },

  planCTA: {
    paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryMid,
    marginTop: 4,
  },
  planCTAText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },

  otherTasks: { paddingTop: 10, gap: 8 },
  otherRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  otherDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.border, flexShrink: 0 },
  otherText:  { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  moreText:   { fontSize: 13, color: Colors.textTertiary, paddingTop: 2 },

  // Habits — no emoji, coloured domain dot
  habitCount: { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },
  habitScroll:{ paddingLeft: Spacing.lg, paddingRight: Spacing.lg, paddingVertical: 4, gap: 8 },
  habitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  habitChipDone:  { backgroundColor: Colors.ink, borderColor: Colors.ink },
  habitDot:       { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  habitName:      { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  habitNameDone:  { color: '#fff' },
  habitTick:      { fontSize: 11, color: '#fff', fontWeight: '700' },

  // Projects — standalone card
  projectsCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
