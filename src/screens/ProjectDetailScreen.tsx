/**
 * ProjectDetailScreen — Synapse V2
 *
 * - Optional free-text context box before AI decomposition
 * - Weekly hours input → schedules tasks across the timeline after decompose
 * - Inline task editing
 * - "Add to today" per task
 */
import React, { useState, useMemo } from 'react';
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
import { useColors } from '../theme';
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
  const C                = useColors();
  const styles           = useMemo(() => makeStyles(C), [C]);

  const navigation       = useNavigation();
  const { params }       = useRoute<RouteParams>();
  const { projectId }    = params;

  const project           = useStore(s => s.projects.find(p => p.id === projectId));
  const updateProject     = useStore(s => s.updateProject);
  const deleteProject     = useStore(s => s.deleteProject);
  const setProjectTasks   = useStore(s => s.setProjectTasks);
  const toggleProjectTask = useStore(s => s.toggleProjectTask);
  const addTodo           = useStore(s => s.addTodo);
  const profile           = useStore(s => s.profile);

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

  // Due-date picker
  const [datePickerTaskId, setDatePickerTaskId] = useState<string | null>(null);

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.notFound}>Project not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: Colors.primary, fontSize: 16 }}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const dc             = DomainColors[project.domain] ?? DomainColors.work;
  const completedTasks = project.tasks.filter(t => t.completed).length;
  const pct            = project.tasks.length > 0 ? completedTasks / project.tasks.length : 0;
  const apiKey         = profile.anthropicKey || undefined;

  // ── Decompose ───────────────────────────────────────────────────────────────

  const runDecomposition = async () => {
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

  const setTaskDate = (taskId: string, dueDate: string | undefined) => {
    const updated = project.tasks.map(t =>
      t.id === taskId ? { ...t, dueDate } : t
    );
    setProjectTasks(project.id, updated);
    setDatePickerTaskId(null);
  };

  // Quick date options relative to today
  const today = format(new Date(), 'yyyy-MM-dd');
  const dateOptions: Array<{ label: string; value: string | undefined }> = [
    { label: 'Today',     value: today },
    { label: 'Tomorrow',  value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: '+3 days',   value: format(addDays(new Date(), 3), 'yyyy-MM-dd') },
    { label: 'Next week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
    { label: '+2 weeks',  value: format(addDays(new Date(), 14), 'yyyy-MM-dd') },
    { label: 'Next month',value: format(addDays(new Date(), 30), 'yyyy-MM-dd') },
    { label: 'No date',   value: undefined },
  ];

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
                <ActivityIndicator color={C.primary} style={{ marginBottom: 8 }} />
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
                      placeholderTextColor={C.textTertiary}
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
                        {/* Tappable date chip — tap to reschedule */}
                        <TouchableOpacity
                          onPress={() => !task.completed && setDatePickerTaskId(
                            datePickerTaskId === task.id ? null : task.id
                          )}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.taskDue, !task.dueDate && !task.completed && styles.taskDueEmpty]}>
                            {task.dueDate
                              ? format(new Date(task.dueDate + 'T00:00:00'), 'MMM d')
                              : !task.completed ? '+ date' : ''}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {/* Date picker chips — show inline below this task */}
                      {datePickerTaskId === task.id && (
                        <View style={styles.datePicker}>
                          {dateOptions.map(opt => (
                            <TouchableOpacity
                              key={opt.label}
                              style={[styles.dateChip, task.dueDate === opt.value && styles.dateChipActive]}
                              onPress={() => setTaskDate(task.id, opt.value)}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.dateChipText, task.dueDate === opt.value && styles.dateChipTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
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
                    accessibilityLabel="Delete task"
                    onPress={() => {
                      Alert.alert(
                        'Delete task?',
                        `"${task.text}" will be permanently removed.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => {
                            setEditingTaskId(null);
                            setProjectTasks(project.id, project.tasks.filter(t => t.id !== task.id));
                          }},
                        ],
                      );
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
                placeholderTextColor={C.textTertiary}
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

        {/* Delete project */}
        <TouchableOpacity
          style={styles.deleteProjectBtn}
          onPress={() =>
            Alert.alert(
              'Delete project?',
              `"${project.title}" and all its tasks will be permanently removed. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteProject(project.id);
                    navigation.goBack();
                  },
                },
              ]
            )
          }
        >
          <Text style={styles.deleteProjectText}>Delete project</Text>
        </TouchableOpacity>

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
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
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
              placeholderTextColor={C.textTertiary}
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

function makeStyles(C: any) {
  return StyleSheet.create({
    container:  { flex: 1, backgroundColor: C.background },
    scroll:     { padding: Spacing.base, paddingBottom: 40 },
    notFound:   { padding: Spacing.xl, color: C.textSecondary },

    title:       { fontSize: 26, fontWeight: '700', color: C.textPrimary, marginBottom: 8, letterSpacing: -0.4 },
    description: { fontSize: 15, color: C.textSecondary, lineHeight: 22, marginBottom: 8 },
    deadline:    { fontSize: 13, color: C.textTertiary, marginBottom: Spacing.base },

    progressCard:   { backgroundColor: C.surface, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    progressTitle:  { fontSize: 15, fontWeight: '600', color: C.textPrimary },
    progressPct:    { fontSize: 15, fontWeight: '700', color: C.primary },
    progressTrack:  { height: 8, backgroundColor: C.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressFill:   { height: 8, backgroundColor: C.primary, borderRadius: 4 },
    progressSub:    { fontSize: 12, color: C.textSecondary },

    nextActionCard:  { backgroundColor: C.primaryLight, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base, borderLeftWidth: 3, borderLeftColor: C.primary },
    nextActionLabel: { fontSize: 11, color: C.primary, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
    nextActionText:  { fontSize: 15, color: C.textPrimary, lineHeight: 22, marginBottom: 12 },
    addTodayBtn:     { alignSelf: 'flex-start', backgroundColor: C.primary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6 },
    addTodayBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

    // Decompose card
    decomposeCard:    { backgroundColor: C.surface, borderRadius: Radius.md, padding: Spacing.xl, marginBottom: Spacing.base, borderWidth: 1, borderColor: C.border },
    decomposeTitle:   { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 8 },
    decomposeSub:     { fontSize: 13, color: C.textSecondary, lineHeight: 20, marginBottom: Spacing.base },
    decomposeBtn:     { backgroundColor: C.ink, borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', marginTop: Spacing.sm },
    decomposeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

    // Context input
    contextToggle:     { marginBottom: Spacing.base },
    contextToggleText: { fontSize: 13, color: C.primary, fontWeight: '500' },
    contextInputWrap:  { marginBottom: Spacing.base },
    contextInput:      {
      borderWidth: 1, borderColor: C.border, borderRadius: Radius.md,
      padding: Spacing.sm, fontSize: 14, color: C.textPrimary,
      minHeight: 90, textAlignVertical: 'top', lineHeight: 20,
      backgroundColor: C.background,
    },
    contextClear:     { alignSelf: 'flex-end', marginTop: 6 },
    contextClearText: { fontSize: 12, color: C.textTertiary },

    redecomposeRow:  { alignItems: 'flex-start', marginBottom: Spacing.base },
    redecomposeText: { fontSize: 13, color: C.textTertiary, fontWeight: '500' },

    // Task list
    tasksSection: { marginBottom: Spacing.base },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: C.textPrimary, marginBottom: Spacing.sm },

    taskRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 6 },
    taskCheck:    { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.primary, marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center' },
    taskCheckDone:  { backgroundColor: C.primary, borderColor: C.primary },
    taskCheckMark:  { color: '#FFF', fontSize: 12, fontWeight: '700' },
    taskText:       { fontSize: 14, color: C.textPrimary, lineHeight: 20 },
    taskTextDone:   { textDecorationLine: 'line-through', color: C.textTertiary },
    taskMetaRow:    { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap' },
    taskMeta:       { fontSize: 11, color: C.textTertiary },
    taskDue:        { fontSize: 11, color: C.primary, fontWeight: '600' },
    taskDueEmpty:   { fontSize: 11, color: C.textTertiary, fontWeight: '500' },
    taskEditInput:  { fontSize: 14, color: C.textPrimary, borderBottomWidth: 1.5, borderBottomColor: C.primary, paddingVertical: 2 },

    // Date picker chips
    datePicker:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingBottom: 4 },
    dateChip:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    dateChipActive:     { backgroundColor: C.primaryLight, borderColor: C.primary },
    dateChipText:       { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
    dateChipTextActive: { color: C.primary, fontWeight: '700' },

    taskActions:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 },
    addTodaySmall:     { backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    addTodaySmallText: { fontSize: 11, color: C.primary, fontWeight: '600' },
    deleteBtn:         { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
    deleteBtnText:     { fontSize: 13, color: '#DC2626', fontWeight: '700' },

    // Manual add
    addTaskSection:   { marginBottom: Spacing.base },
    addTaskBtn:       { borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', borderRadius: Radius.sm, padding: Spacing.base, alignItems: 'center' },
    addTaskBtnText:   { color: C.textSecondary, fontSize: 14 },
    addTaskInputCard: { backgroundColor: C.surface, borderRadius: Radius.md, padding: Spacing.base },
    taskInput:        { borderWidth: 1, borderColor: C.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: 15, color: C.textPrimary, marginBottom: Spacing.sm },
    addTaskActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignItems: 'center' },
    addTaskCancel:    { paddingHorizontal: 16, paddingVertical: 8 },
    addTaskCancelText:{ color: C.textSecondary, fontSize: 14 },
    addTaskSave:      { backgroundColor: C.primary, borderRadius: Radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
    addTaskSaveText:  { color: '#FFF', fontWeight: '600', fontSize: 13 },

    // ── Scheduler modal ─────────────────────────────────────────────────────────
    schedulerScroll:  { padding: Spacing.base, paddingBottom: 60 },
    schedulerTitle:   { fontSize: 30, fontWeight: '800', color: C.textPrimary, letterSpacing: -1, marginBottom: 10 },
    schedulerSub:     { fontSize: 14, color: C.textSecondary, lineHeight: 22, marginBottom: Spacing.xl },
    schedulerLabel:   { fontSize: 11, fontWeight: '700', color: C.textTertiary, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 },

    hoursRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    hourChip:         { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.background },
    hourChipActive:   { backgroundColor: C.ink, borderColor: C.ink },
    hourChipText:     { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
    hourChipTextActive: { color: '#FFF' },
    hoursInput:       { borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.textPrimary, marginBottom: Spacing.xl },

    previewList:      { backgroundColor: C.surface, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: Spacing.xl },
    previewRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    previewNum:       { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
    previewNumText:   { fontSize: 12, fontWeight: '700', color: C.primary },
    previewTask:      { fontSize: 14, color: C.textPrimary, lineHeight: 19 },
    previewMeta:      { fontSize: 11, color: C.textTertiary, marginTop: 2 },
    previewDate:      { fontSize: 12, fontWeight: '700', color: C.primary, minWidth: 44, textAlign: 'right' },

    scheduleConfirmBtn:  { backgroundColor: C.ink, borderRadius: Radius.full, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
    scheduleConfirmText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    scheduleSkipBtn:     { alignItems: 'center', paddingVertical: 12 },
    scheduleSkipText:    { fontSize: 14, color: C.textTertiary },

    deleteProjectBtn:  { alignItems: 'center', paddingVertical: 16, marginTop: Spacing.lg },
    deleteProjectText: { fontSize: 15, color: C.error, fontWeight: '500' },
  });
}
