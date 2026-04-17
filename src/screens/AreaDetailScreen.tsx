/**
 * AreaDetailScreen — Solas V2
 *
 * Shows detailed view of a single area with:
 * - Weekly tasks for this area
 * - Linked habits
 * - Monthly stats
 * - Recurring tasks
 * - Quick-add for new tasks with recurrence
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isWithinInterval, parseISO, addDays, isWeekend,
} from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore, Task, DomainKey } from '../store/useStore';
import { RootStackParams } from '../navigation';

type AreaDetailRoute = RouteProp<RootStackParams, 'AreaDetail'>;

// ── UUID generator ────────────────────────────────────────────────────────────

const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    safe: { flex: 1 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: C.textPrimary, flex: 1 },
    moreBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

    colorBanner: { height: 3 },

    scroll: { padding: Spacing.lg },

    section: { marginBottom: Spacing.xl },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.md },

    taskRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
      borderRadius: Radius.md, backgroundColor: C.surface,
      marginBottom: 8,
    },
    taskCheckbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    taskCheckboxChecked: { borderColor: C.primary, backgroundColor: C.primary },
    taskText: { flex: 1, fontSize: 15, color: C.textPrimary, fontWeight: '500' },
    taskTextCompleted: { color: C.textTertiary, textDecorationLine: 'line-through' },
    taskDate: { fontSize: 12, color: C.textTertiary, fontWeight: '500' },

    habitRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
      borderRadius: Radius.md, backgroundColor: C.surface,
      marginBottom: 8,
    },
    habitIcon: { fontSize: 18 },
    habitName: { flex: 1, fontSize: 15, color: C.textPrimary, fontWeight: '500' },
    habitLastDone: { fontSize: 12, color: C.textTertiary },

    statCard: {
      padding: Spacing.lg, borderRadius: Radius.lg,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      marginBottom: 8,
    },
    statLabel: { fontSize: 12, color: C.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    statValue: { fontSize: 28, fontWeight: '800', color: C.primary },

    recurringRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
      borderRadius: Radius.md, backgroundColor: C.surface,
      marginBottom: 8,
    },
    recurringText: { flex: 1, fontSize: 15, color: C.textPrimary, fontWeight: '500' },
    recurringBadge: {
      paddingHorizontal: 10, paddingVertical: 4,
      backgroundColor: C.primaryLight, borderRadius: Radius.full,
    },
    recurringBadgeText: { fontSize: 11, fontWeight: '600', color: C.primary, textTransform: 'uppercase' },
    recurringDate: { fontSize: 12, color: C.textTertiary, fontWeight: '500' },

    quickAdd: { gap: Spacing.sm, marginBottom: Spacing.xl },
    quickAddLabel: { fontSize: 12, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
    quickAddInput: {
      borderWidth: 1, borderColor: C.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: 15, color: C.textPrimary,
      backgroundColor: C.surface,
    },
    frequencyRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    frequencyChip: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radius.full, borderWidth: 1,
      borderColor: C.border, backgroundColor: C.surface,
    },
    frequencyChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    frequencyChipText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
    frequencyChipTextActive: { color: '#fff' },

    addBtn: {
      padding: Spacing.md, borderRadius: Radius.md,
      backgroundColor: C.primary, alignItems: 'center',
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    emptyState: { alignItems: 'center', paddingVertical: Spacing.lg },
    emptyText: { fontSize: 14, color: C.textTertiary, fontWeight: '500' },
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AreaDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<AreaDetailRoute>();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const { areaId } = route.params;
  const areas = useStore(s => s.areas);
  const tasks = useStore(s => s.tasks);
  const habits = useStore(s => s.habits);
  const toggleTask = useStore(s => s.toggleTask);
  const addTask = useStore(s => s.addTask);

  const area = areas.find(a => a.id === areaId);

  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddFreq, setQuickAddFreq] = useState<'daily' | 'weekly' | 'weekdays' | 'monthly' | null>(null);

  if (!area) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Area not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dc = DomainColors[area.domain] ?? DomainColors.work;

  // ── Computed data ──────────────────────────────────────────────────────────

  // This week's tasks
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const weekTasks = useMemo(
    () => tasks
      .filter(t => t.areaId === area.id && t.date)
      .filter(t => {
        try {
          const d = parseISO(t.date + 'T00:00:00');
          return isWithinInterval(d, { start: weekStart, end: weekEnd });
        } catch { return false; }
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
    [tasks, area.id, weekStart, weekEnd],
  );

  // Linked habits
  const linkedHabits = useMemo(
    () => habits.filter(h => h.domain === area.domain),
    [habits, area.domain],
  );

  // This month's completed tasks count
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthCompleted = useMemo(
    () => tasks
      .filter(t => t.areaId === area.id && t.completed && t.date)
      .filter(t => {
        try {
          const d = parseISO(t.date + 'T00:00:00');
          return isWithinInterval(d, { start: monthStart, end: monthEnd });
        } catch { return false; }
      }).length,
    [tasks, area.id, monthStart, monthEnd],
  );

  // Recurring tasks
  const recurringTasks = useMemo(
    () => tasks
      .filter(t => t.areaId === area.id && t.recurrence && !t.completed),
    [tasks, area.id],
  );

  const handleAddTask = useCallback(() => {
    if (!quickAddText.trim()) {
      Alert.alert('Please enter a task name');
      return;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    const groupId = quickAddFreq ? uid() : undefined;
    addTask({
      text: quickAddText.trim(),
      areaId: area.id,
      date: today,
      isToday: true,
      isMIT: false,
      isInbox: false,
      priority: 'medium',
      completed: false,
      recurrence: quickAddFreq || undefined,
      recurrenceGroupId: groupId,
    });
    setQuickAddText('');
    setQuickAddFreq(null);
  }, [quickAddText, quickAddFreq, area.id, addTask]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{area.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => {
            Alert.alert('Area options', undefined, [
              { text: 'Edit', onPress: () => {/* TODO: open edit modal */ } },
              { text: 'Archive', onPress: () => {/* TODO: confirm archive */ }, style: 'destructive' },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={C.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.colorBanner, { backgroundColor: dc.text }]} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* This week section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This week</Text>
          {weekTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nothing scheduled this week</Text>
            </View>
          ) : (
            weekTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => toggleTask(task.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.taskCheckbox, task.completed && styles.taskCheckboxChecked]}>
                  {task.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
                  {task.text}
                </Text>
                <Text style={styles.taskDate}>{format(parseISO(task.date + 'T00:00:00'), 'MMM d')}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Habits section */}
        {linkedHabits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Habits</Text>
            {linkedHabits.map(habit => {
              const lastCompleted = habit.completedDates && habit.completedDates.length > 0
                ? habit.completedDates[habit.completedDates.length - 1]
                : null;
              const daysSince = lastCompleted
                ? Math.floor((Date.now() - parseISO(lastCompleted + 'T00:00:00').getTime()) / 86400000)
                : null;
              return (
                <View key={habit.id} style={styles.habitRow}>
                  <Text style={styles.habitIcon}>{habit.icon}</Text>
                  <Text style={styles.habitName}>{habit.name}</Text>
                  <Text style={styles.habitLastDone}>
                    {daysSince === null ? 'Never' : daysSince === 0 ? 'Today' : `${daysSince}d ago`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* This month section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This month</Text>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{format(now, 'MMMM')} Completed</Text>
            <Text style={styles.statValue}>{monthCompleted}</Text>
          </View>
        </View>

        {/* Recurring section */}
        {recurringTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recurring</Text>
            {recurringTasks.map(task => {
              const recurrenceLabel = {
                daily: 'Daily',
                weekly: 'Weekly',
                weekdays: 'Weekdays',
                monthly: 'Monthly',
              }[task.recurrence || 'daily'];
              return (
                <View key={task.id} style={styles.recurringRow}>
                  <Text style={styles.recurringText}>{task.text}</Text>
                  <View style={styles.recurringBadge}>
                    <Text style={styles.recurringBadgeText}>{recurrenceLabel}</Text>
                  </View>
                  <Text style={styles.recurringDate}>{format(parseISO(task.date + 'T00:00:00'), 'MMM d')}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Quick add section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add task</Text>
          <View style={styles.quickAdd}>
            <TextInput
              style={styles.quickAddInput}
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder="Task name..."
              placeholderTextColor={C.textTertiary}
            />

            <View>
              <Text style={styles.quickAddLabel}>Frequency (optional)</Text>
              <View style={styles.frequencyRow}>
                {(['daily', 'weekdays', 'weekly', 'monthly'] as const).map(freq => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.frequencyChip, quickAddFreq === freq && styles.frequencyChipActive]}
                    onPress={() => setQuickAddFreq(quickAddFreq === freq ? null : freq)}
                  >
                    <Text style={[styles.frequencyChipText, quickAddFreq === freq && styles.frequencyChipTextActive]}>
                      {freq === 'daily' ? 'Daily' : freq === 'weekdays' ? 'Weekdays' : freq === 'weekly' ? 'Weekly' : 'Monthly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={handleAddTask} activeOpacity={0.75}>
              <Text style={styles.addBtnText}>Add task</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
