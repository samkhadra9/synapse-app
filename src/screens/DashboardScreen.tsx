/**
 * DashboardScreen — Synapse V2
 *
 * The main screen. Shows the user's life at a glance:
 *   - Greeting + date
 *   - Today's MITs (top 3 priorities)
 *   - Today's routine (morning / post-work / evening)
 *   - Active projects (with calendar sync button)
 *   - Habit chips
 *   - Floating "Talk to Synapse" button
 */

import React, { useMemo, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Colors, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore, DomainKey } from '../store/useStore';
import { syncAllProjects } from '../services/calendar';

// ── Sub-components ────────────────────────────────────────────────────────────

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const firstName = name ? name.split(' ')[0] : null;
  return (
    <View style={styles.greetingRow}>
      <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMMM d')}</Text>
      <Text style={styles.greetingText}>
        {firstName ? `Good ${timeLabel},\n${firstName}.` : `Good ${timeLabel}.`}
      </Text>
    </View>
  );
}

function SectionHeader({ title, onPress, actionLabel }: { title: string; onPress?: () => void; actionLabel?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress && (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionAction}>{actionLabel ?? 'See all'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function MITCard({ task, onToggle }: { task: any; onToggle: () => void }) {
  const dc = DomainColors[task.domain ?? 'work'] ?? DomainColors.work;
  return (
    <TouchableOpacity style={[styles.mitCard, task.completed && styles.mitCardDone]} onPress={onToggle} activeOpacity={0.8}>
      <View style={[styles.mitCheck, task.completed && styles.mitCheckDone]}>
        {task.completed && <Text style={styles.mitCheckIcon}>✓</Text>}
      </View>
      <View style={styles.mitContent}>
        <Text style={[styles.mitText, task.completed && styles.mitTextDone]}>{task.text}</Text>
        {task.domain && (
          <View style={[styles.domainBadge, { backgroundColor: dc.bg }]}>
            <Text style={[styles.domainBadgeText, { color: dc.text }]}>
              {DomainIcons[task.domain]} {task.domain}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HabitChip({ habit, onToggle }: { habit: any; onToggle: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const done  = habit.completedDates.includes(today);
  return (
    <TouchableOpacity style={[styles.habitChip, done && styles.habitChipDone]} onPress={onToggle} activeOpacity={0.8}>
      <Text style={styles.habitEmoji}>{habit.icon}</Text>
      <Text style={[styles.habitName, done && styles.habitNameDone]}>{habit.name}</Text>
      {done && <Text style={styles.habitTick}>✓</Text>}
    </TouchableOpacity>
  );
}

function ProjectCard({ project, onPress }: { project: any; onPress: () => void }) {
  const dc       = DomainColors[project.domain] ?? DomainColors.work;
  const total    = project.tasks?.length ?? 0;
  const done     = project.tasks?.filter((t: any) => t.completed).length ?? 0;
  const pct      = total > 0 ? done / total : 0;
  const daysLeft = project.deadline
    ? differenceInDays(parseISO(project.deadline), new Date())
    : null;
  const isSynced = !!project.calendarEventId;

  return (
    <TouchableOpacity style={styles.projectCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.projectDot, { backgroundColor: dc.text }]} />
      <View style={styles.projectBody}>
        <Text style={styles.projectTitle} numberOfLines={1}>{project.title}</Text>
        <View style={styles.projectMeta}>
          {daysLeft !== null && (
            <Text style={[styles.projectDeadline, daysLeft < 7 && { color: Colors.error }]}>
              {daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
            </Text>
          )}
          {isSynced && <Text style={styles.calSyncedBadge}>📅 in calendar</Text>}
        </View>
        {total > 0 && (
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressBarFill, { width: `${pct * 100}%` as any, backgroundColor: dc.text }]} />
          </View>
        )}
      </View>
      <Text style={styles.projectArrow}>›</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ icon, message, cta, onPress }: { icon: string; message: string; cta: string; onPress: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.emptyCta}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Routine section — shows morning / post-work / evening items as a collapsible card
type RoutineSlot = 'morning' | 'postWork' | 'evening';
const ROUTINE_LABELS: Record<RoutineSlot, string> = {
  morning: 'Morning',
  postWork: 'After work',
  evening: 'Evening',
};

function RoutineCard({ slot, items }: { slot: RoutineSlot; items: string[] }) {
  const [open,   setOpen]   = useState(slot === 'morning');
  const [ticked, setTicked] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setTicked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <View style={styles.routineCard}>
      <TouchableOpacity style={styles.routineHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
        <Text style={styles.routineSlotLabel}>{ROUTINE_LABELS[slot]}</Text>
        <View style={styles.routineRight}>
          <Text style={styles.routineCount}>{ticked.size}/{items.length}</Text>
          <Text style={styles.routineChevron}>{open ? '▴' : '▾'}</Text>
        </View>
      </TouchableOpacity>
      {open && (
        <View style={styles.routineItems}>
          {items.map((item, i) => (
            <TouchableOpacity key={i} style={styles.routineItem} onPress={() => toggle(i)} activeOpacity={0.7}>
              <View style={[styles.routineCheck, ticked.has(i) && styles.routineCheckDone]}>
                {ticked.has(i) && <Text style={styles.routineCheckMark}>✓</Text>}
              </View>
              <Text style={[styles.routineItemText, ticked.has(i) && styles.routineItemDone]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Quick Add Modal ───────────────────────────────────────────────────────────

function QuickAddModal({ visible, onClose, onAdd }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (text: string, isMIT: boolean) => void;
}) {
  const [text,  setText]  = useState('');
  const [isMIT, setIsMIT] = useState(true);
  const inputRef = useRef<TextInput>(null);

  function handleSubmit() {
    if (!text.trim()) return;
    onAdd(text.trim(), isMIT);
    setText('');
    setIsMIT(true);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={qaStyles.overlay}
      >
        <TouchableOpacity style={qaStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={qaStyles.sheet}>
          <View style={qaStyles.handle} />
          <Text style={qaStyles.sheetTitle}>Add to today</Text>

          <TextInput
            ref={inputRef}
            style={qaStyles.input}
            value={text}
            onChangeText={setText}
            placeholder="What needs to happen today?"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <View style={qaStyles.mitRow}>
            <View>
              <Text style={qaStyles.mitLabel}>Mark as top priority (MIT)</Text>
              <Text style={qaStyles.mitSub}>Max 3 per day</Text>
            </View>
            <Switch
              value={isMIT}
              onValueChange={setIsMIT}
              trackColor={{ false: Colors.borderLight, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity
            style={[qaStyles.addBtn, !text.trim() && qaStyles.addBtnDisabled]}
            onPress={handleSubmit}
            disabled={!text.trim()}
            activeOpacity={0.85}
          >
            <Text style={qaStyles.addBtnText}>Add task</Text>
          </TouchableOpacity>

          <TouchableOpacity style={qaStyles.cancelBtn} onPress={onClose}>
            <Text style={qaStyles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const qaStyles = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
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
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText:{ color: Colors.textSecondary, fontSize: 15 },
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { profile, tasks, habits, projects, deepWorkSessions, toggleTask, toggleHabitToday, updateProject, updateProfile, addTask } = useStore();
  const [syncing,       setSyncing]       = useState(false);
  const [showQuickAdd,  setShowQuickAdd]  = useState(false);

  const today         = format(new Date(), 'yyyy-MM-dd');
  const mits          = useMemo(() => tasks.filter(t => t.date === today && t.isMIT), [tasks, today]);
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'active').slice(0, 4), [projects]);

  const todayHabits = useMemo(() => {
    const dow = new Date().getDay();
    return habits.filter(h => {
      if (h.frequency === 'daily')    return true;
      if (h.frequency === 'weekdays') return dow >= 1 && dow <= 5;
      if (h.frequency === 'weekends') return dow === 0 || dow === 6;
      return true;
    });
  }, [habits]);

  const habitsDoneToday   = todayHabits.filter(h => h.completedDates.includes(today)).length;
  const sessionsThisWeek  = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return deepWorkSessions.filter(s => new Date(s.startedAt) >= weekAgo).length;
  }, [deepWorkSessions]);
  const isSunday = new Date().getDay() === 0;

  // Routines from onboarding
  const routines = profile.routines;
  const routineSlots: RoutineSlot[] = ['morning', 'postWork', 'evening'];
  const hasRoutines = routines && (
    (routines.morning?.length ?? 0) +
    (routines.postWork?.length ?? 0) +
    (routines.evening?.length ?? 0)
  ) > 0;

  // Quick-add task
  function handleQuickAdd(text: string, isMIT: boolean) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const mitCount = tasks.filter(t => t.date === today && t.isMIT).length;
    addTask({
      text,
      isMIT: isMIT && mitCount < 3,
      completed: false,
      date: today,
      isToday: true,
      priority: isMIT ? 'high' : 'medium',
      domain: profile.selectedDomains?.[0] as DomainKey ?? 'work',
    });
  }

  // Calendar sync
  async function handleCalendarSync() {
    const projectsWithDeadlines = projects.filter(p => p.deadline && p.status === 'active');
    if (projectsWithDeadlines.length === 0) {
      Alert.alert('Nothing to sync', 'Add deadlines to your active projects first.');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncAllProjects(projects, profile.synapseCalendarId);
      // Persist the calendarId and each project's eventId
      updateProfile({ synapseCalendarId: result.calendarId });
      result.projectResults.forEach(({ projectId, eventId }) => {
        updateProject(projectId, { calendarEventId: eventId });
      });
      Alert.alert(
        'Calendar synced',
        `${result.synced} project deadline${result.synced !== 1 ? 's' : ''} added to your calendar.${result.failed > 0 ? `\n${result.failed} failed.` : ''}`
      );
    } catch (e: any) {
      Alert.alert('Sync failed', e.message ?? 'Could not access your calendar. Check permissions in Settings.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Greeting */}
          <Greeting name={profile.name} />

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{mits.filter(t => t.completed).length}/{mits.length || 3}</Text>
              <Text style={styles.statLabel}>MITs done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{sessionsThisWeek}/{profile.deepWorkBlocksPerWeek || 3}</Text>
              <Text style={styles.statLabel}>Deep work</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{habitsDoneToday}/{todayHabits.length}</Text>
              <Text style={styles.statLabel}>Habits</Text>
            </View>
          </View>

          {/* Deep Work CTA — primary action */}
          <TouchableOpacity
            style={styles.deepWorkBtn}
            onPress={() => navigation.navigate('DeepWork')}
            activeOpacity={0.88}
          >
            <View style={styles.deepWorkLeft}>
              <Text style={styles.deepWorkEmoji}>🧠</Text>
              <View>
                <Text style={styles.deepWorkTitle}>Start deep work</Text>
                <Text style={styles.deepWorkSub}>{profile.deepWorkBlockLength ?? 60} min block · produce an artifact</Text>
              </View>
            </View>
            <Text style={styles.deepWorkArrow}>→</Text>
          </TouchableOpacity>

          {/* Weekly review — show always, highlighted on Sundays */}
          {(isSunday || profile.systemPhase >= 3) && (
            <TouchableOpacity
              style={[styles.weeklyReviewBtn, isSunday && styles.weeklyReviewBtnHighlighted]}
              onPress={() => navigation.navigate('Chat', { mode: 'weeklyReview' })}
              activeOpacity={0.88}
            >
              <Text style={styles.weeklyReviewEmoji}>🔄</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.weeklyReviewTitle, isSunday && styles.weeklyReviewTitleHighlighted]}>
                  {isSunday ? "Sunday reset — time to recalibrate" : "Weekly review"}
                </Text>
                <Text style={styles.weeklyReviewSub}>Review · realign · redesign next week</Text>
              </View>
              <Text style={styles.deepWorkArrow}>→</Text>
            </TouchableOpacity>
          )}

          {/* MITs */}
          <SectionHeader
            title="Today's priorities"
            onPress={() => setShowQuickAdd(true)}
            actionLabel="+ Add"
          />
          {mits.length > 0 ? (
            <View style={styles.mitList}>
              {mits.map(t => (
                <MITCard key={t.id} task={t} onToggle={() => toggleTask(t.id)} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="—"
              message="No priorities set for today yet."
              cta="Tell Synapse what matters today →"
              onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
            />
          )}

          {/* Today's Routines */}
          {hasRoutines && (
            <>
              <SectionHeader title="Today's routine" />
              <View style={styles.routineList}>
                {routineSlots.map(slot => {
                  const items = routines![slot] ?? [];
                  if (items.length === 0) return null;
                  return <RoutineCard key={slot} slot={slot} items={items} />;
                })}
              </View>
            </>
          )}

          {/* Habits */}
          {todayHabits.length > 0 && (
            <>
              <SectionHeader title="Habits" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.habitScroll}
                contentContainerStyle={styles.habitScrollContent}
              >
                {todayHabits.map(h => (
                  <HabitChip key={h.id} habit={h} onToggle={() => toggleHabitToday(h.id)} />
                ))}
              </ScrollView>
            </>
          )}

          {/* Projects */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active projects</Text>
            <View style={styles.projectHeaderRight}>
              <TouchableOpacity
                style={[styles.calSyncBtn, syncing && styles.calSyncBtnDisabled]}
                onPress={handleCalendarSync}
                disabled={syncing}
              >
                <Text style={styles.calSyncBtnText}>{syncing ? 'Syncing…' : 'Sync cal'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                <Text style={styles.sectionAction}>See all</Text>
              </TouchableOpacity>
            </View>
          </View>
          {activeProjects.length > 0 ? (
            <View style={styles.projectList}>
              {activeProjects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id })}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="—"
              message="No active projects. Tell Synapse about something you're working on."
              cta="Add a project →"
              onPress={() => navigation.navigate('Chat', { mode: 'project' })}
            />
          )}

          {/* Bottom padding for FAB */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Quick add modal */}
        <QuickAddModal
          visible={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          onAdd={handleQuickAdd}
        />

        {/* Floating Talk button */}
        <View style={styles.fabWrap}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('Chat', { mode: 'dump' })}
            activeOpacity={0.88}
          >
            <Text style={styles.fabText}>Talk to Synapse</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe:      { flex: 1 },
  scroll:    { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: 8 },

  // Greeting — editorial, large
  greetingRow:  { marginBottom: Spacing.lg },
  dateText:     { fontSize: 13, fontWeight: '500', color: Colors.primary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  greetingText: { fontSize: 40, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1.5, lineHeight: 44 },

  // Stats strip — restrained, teal numbers
  statsStrip: {
    flexDirection: 'row', backgroundColor: Colors.surfaceSecondary,
    borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing.lg,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statNumber:  { fontSize: 24, fontWeight: '800', color: Colors.primary, letterSpacing: -1 },
  statLabel:   { fontSize: 11, color: Colors.textTertiary, marginTop: 3, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 4 },

  // Section headers
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: Spacing.lg },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionAction: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // MIT cards — clean white lift
  mitList:  { gap: 8, marginBottom: 4 },
  mitCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: 16, gap: 14, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  mitCardDone: { opacity: 0.5 },
  mitCheck: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  mitCheckDone:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  mitCheckIcon:  { color: '#FFF', fontSize: 13, fontWeight: '700' },
  mitContent:    { flex: 1, gap: 6 },
  mitText:       { fontSize: 16, fontWeight: '500', color: Colors.textPrimary, lineHeight: 23 },
  mitTextDone:   { textDecorationLine: 'line-through', color: Colors.textTertiary, fontWeight: '400' },
  domainBadge:   { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  domainBadgeText: { fontSize: 11, fontWeight: '600' },

  // Routines
  routineList: { gap: 8, marginBottom: 4 },
  routineCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.sm,
  },
  routineHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  routineSlotLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  routineRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineCount:     { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },
  routineChevron:   { fontSize: 11, color: Colors.textTertiary },
  routineItems:     { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  routineItem:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  routineCheckDone:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  routineCheckMark:  { color: '#FFF', fontSize: 12, fontWeight: '700' },
  routineItemText:   { fontSize: 15, color: Colors.textPrimary, flex: 1 },
  routineItemDone:   { color: Colors.textTertiary, textDecorationLine: 'line-through' },

  // Habits
  habitScroll:        { marginBottom: 4 },
  habitScrollContent: { gap: 8, paddingBottom: 4 },
  habitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.border,
  },
  habitChipDone:  { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryMid },
  habitEmoji:     { fontSize: 15 },
  habitName:      { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  habitNameDone:  { color: Colors.primary, fontWeight: '600' },
  habitTick:      { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  // Projects
  projectHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calSyncBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  calSyncBtnDisabled: { opacity: 0.5 },
  calSyncBtnText:     { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  projectList: { gap: 8, marginBottom: 4 },
  projectCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: 16, gap: 14,
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.sm,
  },
  projectDot:      { width: 8, height: 8, borderRadius: 4 },
  projectBody:     { flex: 1, gap: 4 },
  projectTitle:    { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  projectMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectDeadline: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  calSyncedBadge:  { fontSize: 11, color: Colors.primary, fontWeight: '500' },
  progressBarWrap: { height: 3, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  progressBarFill: { height: '100%', borderRadius: 2 },
  projectArrow:    { fontSize: 20, color: Colors.textTertiary },

  // Empty states
  emptyState: {
    backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  emptyIcon:    { fontSize: 32 },
  emptyMessage: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyCta:     { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // Deep Work CTA — keep dark for contrast
  deepWorkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.ink, borderRadius: Radius.xl,
    padding: 20, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  deepWorkLeft:  { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  deepWorkEmoji: { fontSize: 26 },
  deepWorkTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4 },
  deepWorkSub:   { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  deepWorkArrow: { fontSize: 20, color: 'rgba(255,255,255,0.3)' },

  // Weekly review
  weeklyReviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  weeklyReviewBtnHighlighted: {
    borderColor: Colors.primary, backgroundColor: Colors.primaryLight,
  },
  weeklyReviewEmoji: { fontSize: 20 },
  weeklyReviewTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  weeklyReviewTitleHighlighted: { color: Colors.primary },
  weeklyReviewSub:   { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  // FAB — pill, white with border
  fabWrap: { position: 'absolute', bottom: Spacing.lg, left: Spacing.base, right: Spacing.base, alignItems: 'center' },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.ink, paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  fabText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 },
});
