/**
 * ProjectDetailScreen — Synapse V2
 *
 * Shows a project's task list and lets the user trigger AI decomposition.
 * If not yet decomposed → shows the "Break it down with AI" CTA.
 * Once decomposed → shows tasks with checkboxes, next action highlighted.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { RootStackParams } from '../navigation';
import { Colors, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore } from '../store/useStore';
import { decomposeProject } from '../services/openai';

type RouteParams = RouteProp<RootStackParams, 'ProjectDetail'>;

export default function ProjectDetailScreen() {
  const navigation  = useNavigation();
  const { params }  = useRoute<RouteParams>();
  const { projectId } = params;

  const project          = useStore(s => s.projects.find(p => p.id === projectId));
  const updateProject    = useStore(s => s.updateProject);
  const setProjectTasks  = useStore(s => s.setProjectTasks);
  const toggleProjectTask = useStore(s => s.toggleProjectTask);
  const addTodo          = useStore(s => s.addTodo);
  const profile          = useStore(s => s.profile);

  const [decomposing,     setDecomposing]     = useState(false);
  const [nextAction,      setNextAction]      = useState<string | null>(null);
  const [estimatedHours,  setEstimatedHours]  = useState<number | null>(null);
  const [addingTask,      setAddingTask]      = useState(false);
  const [newTaskText,     setNewTaskText]     = useState('');

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

  const runDecomposition = async () => {
    if (!apiKey) {
      Alert.alert('OpenAI key needed', 'Add your OpenAI API key in Settings to use AI project decomposition.', [{ text: 'OK' }]);
      return;
    }
    Alert.alert(
      'Break this down with AI?',
      `Synapse will analyse "${project.title}" and create a step-by-step task list with time estimates.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decompose',
          onPress: async () => {
            setDecomposing(true);
            try {
              const result = await decomposeProject(
                project.title,
                project.description,
                project.deadline,
                apiKey
              );
              setProjectTasks(project.id, result.tasks);
              setNextAction(result.nextAction);
              setEstimatedHours(result.estimatedTotalHours);
              updateProject(project.id, { isDecomposed: true, status: 'active' });
            } catch (e: any) {
              Alert.alert('AI error', e.message ?? 'Could not decompose. Check your API key.');
            } finally {
              setDecomposing(false);
            }
          },
        },
      ]
    );
  };

  const addToToday = (taskText: string, minutes?: number) => {
    addTodo({
      text: taskText,
      date: format(new Date(), 'yyyy-MM-dd'),
      projectId: project.id,
      estimatedMinutes: minutes,
      isTopPriority: false,
    });
    Alert.alert('Added to today', `"${taskText}" has been added to your today list.`);
  };

  const saveManualTask = () => {
    if (!newTaskText.trim()) return;
    setProjectTasks(project.id, [
      ...project.tasks,
      { id: Date.now().toString(), text: newTaskText.trim(), completed: false },
    ]);
    setNewTaskText('');
    setAddingTask(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Domain badge + back row handled by nav header; just show badge here */}
        <View style={styles.badgeRow}>
          <View style={[styles.domainBadge, { backgroundColor: dc.bg, borderColor: dc.border }]}>
            <Text style={styles.domainBadgeIcon}>{DomainIcons[project.domain] ?? '📁'}</Text>
            <Text style={[styles.domainBadgeText, { color: dc.text }]}>
              {project.domain.charAt(0).toUpperCase() + project.domain.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{project.title}</Text>
        {project.description ? (
          <Text style={styles.description}>{project.description}</Text>
        ) : null}
        {project.deadline && (
          <Text style={styles.deadline}>📅 Due {format(new Date(project.deadline), 'MMMM d, yyyy')}</Text>
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
            <Text style={styles.nextActionLabel}>⚡ NEXT ACTION</Text>
            <Text style={styles.nextActionText}>{nextAction}</Text>
            <TouchableOpacity style={styles.addTodayBtn} onPress={() => addToToday(nextAction, 30)}>
              <Text style={styles.addTodayBtnText}>Add to today →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AI Decompose CTA */}
        {!project.isDecomposed && (
          <TouchableOpacity
            style={[styles.decomposeCard, Shadow.sm]}
            onPress={runDecomposition}
            activeOpacity={0.85}
            disabled={decomposing}
          >
            {decomposing ? (
              <>
                <ActivityIndicator color={Colors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.decomposeTitle}>Breaking it down…</Text>
                <Text style={styles.decomposeSub}>This takes about 10 seconds</Text>
              </>
            ) : (
              <>
                <Text style={styles.decomposeEmoji}>🤖</Text>
                <Text style={styles.decomposeTitle}>Break this down with AI</Text>
                <Text style={styles.decomposeSub}>
                  Synapse will analyse the project and create a step-by-step plan with time estimates.
                </Text>
                <View style={styles.decomposeBtn}>
                  <Text style={styles.decomposeBtnText}>Decompose project</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Task list */}
        {project.tasks.length > 0 && (
          <View style={styles.tasksSection}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            {project.tasks.map(task => (
              <View key={task.id} style={[styles.taskRow, Shadow.sm]}>
                <TouchableOpacity
                  style={[styles.taskCheck, task.completed && styles.taskCheckDone]}
                  onPress={() => toggleProjectTask(project.id, task.id)}
                >
                  {task.completed && <Text style={styles.taskCheckMark}>✓</Text>}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskText, task.completed && styles.taskTextDone]}>
                    {task.text}
                  </Text>
                  {task.estimatedMinutes && !task.completed ? (
                    <Text style={styles.taskMeta}>~{task.estimatedMinutes} min</Text>
                  ) : null}
                </View>
                {!task.completed && (
                  <TouchableOpacity
                    style={styles.addTodaySmall}
                    onPress={() => addToToday(task.text, task.estimatedMinutes)}
                  >
                    <Text style={styles.addTodaySmallText}>+ Today</Text>
                  </TouchableOpacity>
                )}
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
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  scroll:     { padding: Spacing.base, paddingBottom: 40 },
  notFound:   { padding: Spacing.xl, color: Colors.textSecondary },

  badgeRow:       { flexDirection: 'row', marginBottom: Spacing.sm },
  domainBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  domainBadgeIcon: { fontSize: 12 },
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

  decomposeCard:  { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.xl, marginBottom: Spacing.base, alignItems: 'center' },
  decomposeEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  decomposeTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  decomposeSub:   { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.base },
  decomposeBtn:   { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 12 },
  decomposeBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },

  tasksSection: { marginBottom: Spacing.base },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },

  taskRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 6 },
  taskCheck:    { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.primary, marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center' },
  taskCheckDone:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  taskCheckMark:  { color: '#FFF', fontSize: 12, fontWeight: '700' },
  taskText:       { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  taskTextDone:   { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskMeta:       { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },

  addTodaySmall:     { backgroundColor: Colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  addTodaySmallText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  addTaskSection:  { marginBottom: Spacing.base },
  addTaskBtn:      { borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: Radius.sm, padding: Spacing.base, alignItems: 'center' },
  addTaskBtnText:  { color: Colors.textSecondary, fontSize: 14 },
  addTaskInputCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.base },
  taskInput:       { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.sm },
  addTaskActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignItems: 'center' },
  addTaskCancel:   { paddingHorizontal: 16, paddingVertical: 8 },
  addTaskCancelText: { color: Colors.textSecondary, fontSize: 14 },
  addTaskSave:     { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  addTaskSaveText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
});
