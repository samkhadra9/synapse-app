/**
 * ProjectDetailScreen — Synapse V2
 *
 * - Optional free-text context box before AI decomposition
 * - Weekly hours input → schedules tasks across the timeline after decompose
 * - Inline task editing
 * - "Add to today" per task
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { format, addDays, isWeekend } from 'date-fns';
import { RootStackParams } from '../navigation';
import { Colors, Spacing, Radius, Shadow, DomainColors } from '../theme';
import { useStore, ProjectTask } from '../store/useStore';
import { decomposeProject } from '../services/openai';

// RFC-4122 v4 UUID — matches the guard in useStore sync
const uid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

type RouteParams = RouteProp<RootStackParams, 'ProjectDetail'>;

// ── Scheduling helper ─────────────────────────────────────────────────────────
// Given tasks + hours per week, assigns a dueDate to each task.
// First task → today. Rest spread across weeks proportionally.
// Skips weekends.

function nextWorkday(date: Date): Date {
  let d = new Date(date);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function scheduleTasks(
  tasks: ProjectTask[],
  hoursPerWeek: number,
): ProjectTask[] {
  const minutesPerWeek = hoursPerWeek * 60;
  const today = nextWorkday(new Date());
  let accumulated = 0;
  let weekOffset = 0;

  return tasks.map((task, idx) => {
    if (idx === 0) {
      // First task always today
      return { ...task, dueDate: format(today, 'yyyy-MM-dd') };
    }

    accumulated += task.estimatedMinutes ?? 30;
    if (accumulated > minutesPerWeek) {
      weekOffset += 1;
      accumulated = task.estimatedMinutes ?? 30;
    }

    const rawDate = addDays(today, weekOffset * 7);
    const workDate = nextWorkday(rawDate);
    return { ...task, dueDate: format(workDate, 'yyyy-MM-dd') };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const navigation       = useNavigation();
  const { params }       = useRoute<RouteParams>();
  const { projectId }    = params;

  const project          = useStore(s => s.projects.find(p => p.id === projectId));
  const updateProject    = useStore(s => s.updateProject);
  const setProjectTasks  = useStore(s => s.setProjectTasks);
  const toggleProjectTask = useStore(s => s.toggleProjectTask);
  const addTodo          = useStore(s => s.addTodo);
  const profile          = useStore(s => s.profile);

  // Decompose flow
  const [decomposing,    setDecomposing]    = useState(false);
  const [contextText,    setContextText]    = useState('');
  const [showContext,    setShowContext]    = useState(false);

  // After decompose — scheduling
  const [showScheduler,  setShowScheduler]  = useState(false);
  const [hoursPerWeek,   setHoursPerWeek]   = useState('3');
  const [pendingTasks,   setPendingTasks]   = useState<ProjectTask[]>([]);
  const [nextAction,     setNextAction]     = useState<string | null>(null);
  const [estimatedHours, setEstimatedHours] = useState<number | null>(null);

  // Manual add + inline edit
  const [addingTask,     setAddingTask]     = useState(false);
  const [newTaskText,    setNewTaskText]    = useState('');
  const [editingTaskId,  setEditingTaskId]  = useState<string | null>(null);
  const [editingText,    setEditingText]    = useState('');

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.notFound}>Project not found.</Text>
      </SafeAreaView>
    );
  }

  const dc             = DomainColors[project.domain] ?? DomainColors.work;
  const completedTasks = project.tasks.filter(t => t.completed).length;
  const pct            = project.tasks.length > 0 ? completedTasks / project.tasks.length : 0;
  const apiKey         = profile.openAiKey || (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

  // ── Decompose ───────────────────────────────────────────────────────────────

  const runDecomposition = async () => {
    if (!apiKey) {
      Alert.alert('OpenAI key needed', 'Add your OpenAI API key in Settings to use AI project decomposition.');
      return;
    }
    setDecomposing(true);
    try {
      const result = await decomposeProject(
        project.title,
        project.description,
        project.deadline,
        apiKey,
        contextText,
      );
      const mapped = result.tasks.map(t => ({ ...t, completed: false }));
      setPendingTasks(mapped);
      setNextAction(result.nextAction);
      setEstimatedHours(result.estimatedTotalHours);
      // Show the scheduling modal
      setShowScheduler(true);
    } catch (e: any) {
      Alert.alert('AI error', e.message ?? 'Could not decompose. Check your API key.');
    } finally {
      setDecomposing(false);
    }
  };

  // ── Confirm schedule ────────────────────────────────────────────────────────

  const confirmSchedule = () => {
    const hours = parseFloat(hoursPerWeek);
    const scheduled = scheduleTasks(pendingTasks, isNaN(hours) || hours <= 0 ? 3 : hours);
    setProjectTasks(project.id, scheduled);
    updateProject(project.id, { isDecomposed: true, status: 'active' });
    setShowScheduler(false);
    setPendingTasks([]);
  };

  const skipSchedule = () => {
    // Just save without dates — first task only goes to today
    const withFirst = pendingTasks.map((t, i) => ({
      ...t,
      dueDate: i === 0 ? format(new Date(), 'yyyy-MM-dd') : undefined,
    }));
    setProjectTasks(project.id, withFirst);
    updateProject(project.id, { isDecomposed: true, status: 'active' });
    setShowScheduler(false);
    setPendingTasks([]);
  };

  // ── Today / edit helpers ────────────────────────────────────────────────────

  const addToToday = (taskText: string, minutes?: number) => {
    addTodo({
      text:             taskText,
      date:             format(new Date(), 'yyyy-MM-dd'),
      projectId:        project.id,
      estimatedMinutes: minutes,
      completed:        false,
      isToday:          true,
      isMIT:            false,
      priority:         'medium',
    });
    Alert.alert('Added to today', `"${taskText}" is now on your today list.`);
  };

  const saveManualTask = () => {
    if (!newTaskText.trim()) return;
    setProjectTasks(project.id, [
      ...project.tasks,
      { id: uid(), text: newTaskText.trim(), completed: false },
    ]);
    setNewTaskText('');
    setAddingTask(false);
  };

  const startEdit = (task: ProjectTask) => {
    setEditingTaskId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = () => {
    if (!editingTaskId) return;
    const updated = project.tasks.map(t =>
      t.id === editingTaskId ? { ...t, text: editingText.trim() || t.text } : t
    );
    setProjectTasks(project.id, updated);
    setEditingTaskId(null);
    setEditingText('');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >

        {/* Domain badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.domainBadge, { backgroundColor: dc.bg, borderColor: dc.border }]}>
            <Text style={[styles.domainBadgeText, { color: dc.text }]}>
              {project.domain.charAt(0).toUpperCase() + project.domain.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{project.title}</Text>
        {project.description ? (
          <Text style={styles.description}>{project.description}</Text>
        ) : null}
        {project.deadline && /^\d{4}-\d{2}-\d{2}$/.test(project.deadline) && (
          <Text style={styles.deadline}>Due {format(new Date(project.deadline + 'T00:00:00'), 'MMMM d, yyyy')}</Text>
        )}

        {/* Progress */}
        {project.tasks.length > 0 && (
          <View style={[styles.progressCard, Shadow.sm]}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Progress</Text>
              <Text style={styles.progressPct}>{Math.round(pct * 100)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressSub}>{completedTasks} of {project.tasks.length} tasks complete</Text>
            {estimatedHours ? (
              <Text style={styles.progressSub}>~{estimatedHours}h estimated total</Text>
            ) : null}
          </View>
        )}

        {/* Next action highlight */}
        {nextAction && (
          <View style={[styles.nextActionCard, Shadow.sm]}>
            <Text style={styles.nextActionLabel}>NEXT ACTION</Text>
            <Text style={styles.nextActionText}>{nextAction}</Text>
            <TouchableOpacity style={styles.addTodayBtn} onPress={() => addToToday(nextAction, 30)}>
              <Text style={styles.addTodayBtnText}>Add to today →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AI Decompose CTA */}
        {(!project.isDecomposed || project.tasks.length === 0) && (
          <View style={[styles.decomposeCard, Shadow.sm]}>
            {decomposing ? (
              <>
                <ActivityIndicator color={Colors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.decomposeTitle}>Breaking it down…</Text>
                <Text style={styles.decomposeSub}>This takes about 10 seconds</Text>
              </>
            ) : (
              <>
                <Text style={styles.decomposeTitle}>Break this down with AI</Text>
                <Text style={styles.decomposeSub}>
                  Synapse will create a step-by-step plan with time estimates, then help you schedule it across your week.
                </Text>

                {/* Optional context input */}
                {showContext ? (
                  <View style={styles.contextInputWrap}>
                    <TextInput
                      style={styles.contextInput}
                      placeholder="Tell Synapse anything about this project — what's involved, what you've already done, any constraints…"
                      placeholderTextColor={Colors.textTertiary}
                      value={contextText}
                      onChangeText={setContextText}
                      multiline
                      numberOfLines={4}
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => { setShowContext(false); setContextText(''); }} style={styles.contextClear}>
                      <Text style={styles.contextClearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowContext(true)} style={styles.contextToggle}>
                    <Text style={styles.contextToggleText}>+ Add context for the AI (optional)</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.decomposeBtn} onPress={runDecomposition} activeOpacity={0.85}>
                  <Text style={styles.decomposeBtnText}>Plan with Synapse →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Re-decompose option */}
        {project.isDecomposed && project.tasks.length > 0 && (
          <TouchableOpacity
            style={styles.redecomposeRow}
            onPress={runDecomposition}
            disabled={decomposing}
          >
            <Text style={styles.redecomposeText}>
              {decomposing ? 'Replanning…' : 'Re-plan with AI →'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Task list */}
        {project.tasks.length > 0 && (
          <View style={styles.tasksSection}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            {project.tasks.map(task => (
              <View key={task.id} style={[styles.taskRow, Shadow.sm]}>
                {/* Checkbox */}
                <TouchableOpacity
                  style={[styles.taskCheck, task.completed && styles.taskCheckDone]}
                  onPress={() => toggleProjectTask(project.id, task.id)}
                >
                  {task.completed && <Text style={styles.taskCheckMark}>✓</Text>}
                </TouchableOpacity>

                {/* Task body — tap to edit */}
                <TouchableOpacity style={{ flex: 1 }} onPress={() => !task.completed && startEdit(task)} activeOpacity={0.7}>
                  {editingTaskId === task.id ? (
                    <TextInput
                      style={styles.taskEditInput}
                      value={editingText}
                      onChangeText={setEditingText}
                      onBlur={saveEdit}
                      onSubmitEditing={saveEdit}
                      autoFocus
                      returnKeyType="done"
                    />
                  ) : (
                    <>
                      <Text style={[styles.taskText, task.completed && styles.taskTextDone]}>
                        {task.text}
                      </Text>
                      <View style={styles.taskMetaRow}>
                        {task.estimatedMinutes && !task.completed ? (
                          <Text style={styles.taskMeta}>~{task.estimatedMinutes} min</Text>
                        ) : null}
                        {task.dueDate && !task.completed ? (
                          <Text style={styles.taskDue}>{format(new Date(task.dueDate + 'T00:00:00'), 'MMM d')}</Text>
                        ) : null}
                      </View>
                    </>
                  )}
                </TouchableOpacity>

                {/* Right-side actions */}
                <View style={styles.taskActions}>
                  {!task.completed && editingTaskId !== task.id && (
                    <TouchableOpacity
                      style={styles.addTodaySmall}
                      onPress={() => addToToday(task.text, task.estimatedMinutes)}
                    >
                      <Text style={styles.addTodaySmallText}>+ Today</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      setEditingTaskId(null);
                      setProjectTasks(project.id, project.tasks.filter(t => t.id !== task.id));
                    }}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Manual add task */}
        <View style={styles.addTaskSection}>
          {addingTask ? (
            <View style={styles.addTaskInputCard}>
              <TextInput
                style={styles.taskInput}
                placeholder="Task description…"
                placeholderTextColor={Colors.textTertiary}
                value={newTaskText}
                onChangeText={setNewTaskText}
                autoFocus
              />
              <View style={styles.addTaskActions}>
                <TouchableOpacity style={styles.addTaskCancel} onPress={() => { setAddingTask(false); setNewTaskText(''); }}>
                  <Text style={styles.addTaskCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addTaskSave} onPress={saveManualTask}>
                  <Text style={styles.addTaskSaveText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addTaskBtn} onPress={() => setAddingTask(true)}>
              <Text style={styles.addTaskBtnText}>+ Add task manually</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
    </KeyboardAvoidingView>

      {/* ── Scheduling Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showScheduler}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowScheduler(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <ScrollView contentContainerStyle={styles.schedulerScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

            <Text style={styles.schedulerTitle}>Plan the timeline</Text>
            <Text style={styles.schedulerSub}>
              Synapse broke "{project.title}" into {pendingTasks.length} tasks
              {estimatedHours ? ` (~${estimatedHours}h total)` : ''}.
              Tell it how much time you can give each week and it'll spread them out.
            </Text>

            {/* Hours per week picker */}
            <Text style={styles.schedulerLabel}>Hours per week on this project</Text>
            <View style={styles.hoursRow}>
              {['1', '2', '3', '5', '8', '10'].map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourChip, hoursPerWeek === h && styles.hourChipActive]}
                  onPress={() => setHoursPerWeek(h)}
                >
                  <Text style={[styles.hourChipText, hoursPerWeek === h && styles.hourChipTextActive]}>
                    {h}h
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.hoursInput}
              value={hoursPerWeek}
              onChangeText={setHoursPerWeek}
              keyboardType="decimal-pad"
              placeholder="Custom hours…"
              placeholderTextColor={Colors.textTertiary}
            />

            {/* Preview */}
            <Text style={styles.schedulerLabel}>Preview</Text>
            <View style={styles.previewList}>
              {scheduleTasks(
                pendingTasks,
                parseFloat(hoursPerWeek) > 0 ? parseFloat(hoursPerWeek) : 3
              ).map((t, i) => (
                <View key={t.id} style={styles.previewRow}>
                  <View style={styles.previewNum}>
                    <Text style={styles.previewNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewTask} numberOfLines={2}>{t.text}</Text>
                    {t.estimatedMinutes ? (
                      <Text style={styles.previewMeta}>~{t.estimatedMinutes} min</Text>
                    ) : null}
                  </View>
                  {t.dueDate ? (
                    <Text style={styles.previewDate}>
                      {i === 0 ? 'Today' : format(new Date(t.dueDate + 'T00:00:00'), 'MMM d')}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* Actions */}
            <TouchableOpacity style={styles.scheduleConfirmBtn} onPress={confirmSchedule} activeOpacity={0.85}>
              <Text style={styles.scheduleConfirmText}>Schedule it</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scheduleSkipBtn} onPress={skipSchedule}>
              <Text style={styles.scheduleSkipText}>Skip — just add tasks without dates</Text>
            </TouchableOpacity>

          </ScrollView>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  scroll:     { padding: Spacing.base, paddingBottom: 40 },
  notFound:   { padding: Spacing.xl, color: Colors.textSecondary },

  badgeRow:        { flexDirection: 'row', marginBottom: Spacing.sm },
  domainBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  domainBadgeText: { fontSize: 11, fontWeight: '600' },

  title:       { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, letterSpacing: -0.4 },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 8 },
  deadline:    { fontSize: 13, color: Colors.textTertiary, marginBottom: Spacing.base },

  progressCard:   { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressTitle:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  progressPct:    { fontSize: 15, fontWeight: '700', color: Colors.primary },
  progressTrack:  { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  progressSub:    { fontSize: 12, color: Colors.textSecondary },

  nextActionCard:  { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  nextActionLabel: { fontSize: 11, color: Colors.primary, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  nextActionText:  { fontSize: 15, color: Colors.textPrimary, lineHeight: 22, marginBottom: 12 },
  addTodayBtn:     { alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6 },
  addTodayBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  // Decompose card
  decomposeCard:    { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.xl, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.border },
  decomposeTitle:   { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  decomposeSub:     { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.base },
  decomposeBtn:     { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', marginTop: Spacing.sm },
  decomposeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Context input
  contextToggle:     { marginBottom: Spacing.base },
  contextToggleText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  contextInputWrap:  { marginBottom: Spacing.base },
  contextInput:      {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, fontSize: 14, color: Colors.textPrimary,
    minHeight: 90, textAlignVertical: 'top', lineHeight: 20,
    backgroundColor: Colors.background,
  },
  contextClear:     { alignSelf: 'flex-end', marginTop: 6 },
  contextClearText: { fontSize: 12, color: Colors.textTertiary },

  redecomposeRow:  { alignItems: 'flex-start', marginBottom: Spacing.base },
  redecomposeText: { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },

  // Task list
  tasksSection: { marginBottom: Spacing.base },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },

  taskRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 6 },
  taskCheck:    { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.primary, marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center' },
  taskCheckDone:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  taskCheckMark:  { color: '#FFF', fontSize: 12, fontWeight: '700' },
  taskText:       { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  taskTextDone:   { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskMetaRow:    { flexDirection: 'row', gap: 10, marginTop: 2 },
  taskMeta:       { fontSize: 11, color: Colors.textTertiary },
  taskDue:        { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  taskEditInput:  { fontSize: 14, color: Colors.textPrimary, borderBottomWidth: 1.5, borderBottomColor: Colors.primary, paddingVertical: 2 },

  taskActions:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 },
  addTodaySmall:     { backgroundColor: Colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  addTodaySmallText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  deleteBtn:         { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:     { fontSize: 13, color: '#DC2626', fontWeight: '700' },

  // Manual add
  addTaskSection:   { marginBottom: Spacing.base },
  addTaskBtn:       { borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: Radius.sm, padding: Spacing.base, alignItems: 'center' },
  addTaskBtnText:   { color: Colors.textSecondary, fontSize: 14 },
  addTaskInputCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.base },
  taskInput:        { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.sm },
  addTaskActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignItems: 'center' },
  addTaskCancel:    { paddingHorizontal: 16, paddingVertical: 8 },
  addTaskCancelText:{ color: Colors.textSecondary, fontSize: 14 },
  addTaskSave:      { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  addTaskSaveText:  { color: '#FFF', fontWeight: '600', fontSize: 13 },

  // ── Scheduler modal ─────────────────────────────────────────────────────────
  schedulerScroll:  { padding: Spacing.base, paddingBottom: 60 },
  schedulerTitle:   { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1, marginBottom: 10 },
  schedulerSub:     { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.xl },
  schedulerLabel:   { fontSize: 11, fontWeight: '700', color: Colors.textTertiary, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 },

  hoursRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  hourChip:         { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  hourChipActive:   { backgroundColor: Colors.ink, borderColor: Colors.ink },
  hourChipText:     { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  hourChipTextActive: { color: '#FFF' },
  hoursInput:       { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.xl },

  previewList:      { backgroundColor: Colors.surface, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xl },
  previewRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  previewNum:       { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  previewNumText:   { fontSize: 12, fontWeight: '700', color: Colors.primary },
  previewTask:      { fontSize: 14, color: Colors.textPrimary, lineHeight: 19 },
  previewMeta:      { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  previewDate:      { fontSize: 12, fontWeight: '700', color: Colors.primary, minWidth: 44, textAlign: 'right' },

  scheduleConfirmBtn:  { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  scheduleConfirmText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  scheduleSkipBtn:     { alignItems: 'center', paddingVertical: 12 },
  scheduleSkipText:    { fontSize: 14, color: Colors.textTertiary },
});
