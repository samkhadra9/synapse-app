import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, isToday } from 'date-fns';
import { RootStackParams } from '../navigation';
import { Colors, Typography, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore } from '../store/useStore';

type Nav = NativeStackNavigationProp<RootStackParams>;

// ─── Sub-components ────────────────────────────────────────────────────────────

function DateHeader() {
  const today = new Date();
  const dayName = format(today, 'EEEE');
  const dateStr = format(today, 'MMMM d');
  const log = useStore(s => s.todayLog());
  return (
    <View style={styles.dateHeader}>
      <View>
        <Text style={styles.dayName}>{dayName}</Text>
        <Text style={styles.dateStr}>{dateStr}</Text>
      </View>
      {log?.energyLevel !== undefined && (
        <View style={styles.energyBadge}>
          <Text style={styles.energyEmoji}>
            {log.energyLevel >= 4 ? '⚡' : log.energyLevel >= 3 ? '🙂' : '😴'}
          </Text>
          <Text style={styles.energyText}>Energy {log.energyLevel}/5</Text>
        </View>
      )}
    </View>
  );
}

function MorningBanner() {
  const navigation = useNavigation<Nav>();
  const log = useStore(s => s.todayLog());
  if (log?.morningCompleted) return null;
  return (
    <TouchableOpacity
      style={styles.morningBanner}
      onPress={() => navigation.navigate('MorningPlanning')}
      activeOpacity={0.85}
    >
      <Text style={styles.morningBannerIcon}>☀️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.morningBannerTitle}>Start your morning planning</Text>
        <Text style={styles.morningBannerSub}>10 minutes to set up a great day</Text>
      </View>
      <Text style={styles.morningBannerArrow}>→</Text>
    </TouchableOpacity>
  );
}

function EveningBanner() {
  const navigation = useNavigation<Nav>();
  const log = useStore(s => s.todayLog());
  const hour = new Date().getHours();
  if (!log?.morningCompleted || log?.eveningCompleted || hour < 17) return null;
  return (
    <TouchableOpacity
      style={[styles.morningBanner, { backgroundColor: Colors.navy }]}
      onPress={() => navigation.navigate('EveningReview')}
      activeOpacity={0.85}
    >
      <Text style={styles.morningBannerIcon}>🌙</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.morningBannerTitle, { color: Colors.white }]}>Evening review</Text>
        <Text style={[styles.morningBannerSub, { color: Colors.gray300 }]}>Close the day — 5 minutes</Text>
      </View>
      <Text style={[styles.morningBannerArrow, { color: Colors.teal }]}>→</Text>
    </TouchableOpacity>
  );
}

function MITSection() {
  const navigation = useNavigation<Nav>();
  const todos = useStore(s => s.todos);
  const toggleTodo = useStore(s => s.toggleTodo);
  const setTopPriority = useStore(s => s.setTopPriority);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const mits = todos.filter(t => t.date === todayStr && t.isTopPriority);
  const remaining = todos.filter(t => t.date === todayStr && !t.isTopPriority && !t.completed);

  const completedMITs = mits.filter(t => t.completed).length;

  return (
    <View style={styles.mitSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🎯  Top 3 priorities</Text>
        <Text style={styles.mitCount}>{completedMITs}/{mits.length}</Text>
      </View>

      {mits.length === 0 ? (
        <TouchableOpacity
          style={styles.emptyMIT}
          onPress={() => navigation.navigate('MorningPlanning')}
        >
          <Text style={styles.emptyMITText}>
            No priorities set — tap to run morning planning
          </Text>
        </TouchableOpacity>
      ) : (
        mits.map(todo => (
          <TouchableOpacity
            key={todo.id}
            style={[styles.mitCard, todo.completed && styles.mitCardDone, Shadow.sm]}
            onPress={() => toggleTodo(todo.id)}
            activeOpacity={0.8}
          >
            <View style={[styles.mitCheck, todo.completed && styles.mitCheckDone]}>
              {todo.completed && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mitText, todo.completed && styles.mitTextDone]}>
                {todo.text}
              </Text>
              {todo.estimatedMinutes && !todo.completed && (
                <Text style={styles.mitMeta}>~{todo.estimatedMinutes} min</Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Add todo shortcut */}
      <TouchableOpacity
        style={styles.addTodoBtn}
        onPress={() => navigation.navigate('AddTodo')}
      >
        <Text style={styles.addTodoBtnText}>+ Add task</Text>
      </TouchableOpacity>
    </View>
  );
}

function HabitsSection() {
  const habits = useStore(s => s.habits);
  const toggleHabitToday = useStore(s => s.toggleHabitToday);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const todayHabits = habits.filter(h => {
    if (h.frequency === 'daily') return true;
    if (h.frequency === 'weekdays') {
      const day = new Date().getDay();
      return day >= 1 && day <= 5;
    }
    return true;
  });

  if (todayHabits.length === 0) return null;

  const completedCount = todayHabits.filter(h => h.completedDates.includes(todayStr)).length;

  return (
    <View style={styles.habitsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>⚡  Daily habits</Text>
        <Text style={styles.mitCount}>{completedCount}/{todayHabits.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.habitsRow}>
          {todayHabits.map(habit => {
            const done = habit.completedDates.includes(todayStr);
            const dc = DomainColors[habit.domain as keyof typeof DomainColors] ?? DomainColors.health;
            return (
              <TouchableOpacity
                key={habit.id}
                style={[styles.habitChip, done && { backgroundColor: dc.bg, borderColor: dc.border }]}
                onPress={() => toggleHabitToday(habit.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.habitIcon}>{habit.icon}</Text>
                <Text style={[styles.habitName, done && { color: dc.text }]}>{habit.name}</Text>
                {done && <Text style={styles.habitDone}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function TodayTodosSection() {
  const navigation = useNavigation<Nav>();
  const todos = useStore(s => s.todos);
  const toggleTodo = useStore(s => s.toggleTodo);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const regularTodos = todos.filter(t => t.date === todayStr && !t.isTopPriority);
  const pending = regularTodos.filter(t => !t.completed);
  const done = regularTodos.filter(t => t.completed);

  if (regularTodos.length === 0) return null;

  return (
    <View style={styles.todosSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📋  Other tasks</Text>
        <Text style={styles.mitCount}>{done.length}/{regularTodos.length}</Text>
      </View>

      {pending.map(todo => (
        <TouchableOpacity
          key={todo.id}
          style={[styles.todoRow]}
          onPress={() => toggleTodo(todo.id)}
          activeOpacity={0.8}
        >
          <View style={styles.todoCheck} />
          <Text style={styles.todoText}>{todo.text}</Text>
          {todo.estimatedMinutes && (
            <Text style={styles.todoMeta}>{todo.estimatedMinutes}m</Text>
          )}
        </TouchableOpacity>
      ))}

      {done.length > 0 && (
        <>
          <Text style={styles.doneDivider}>Done</Text>
          {done.map(todo => (
            <TouchableOpacity
              key={todo.id}
              style={styles.todoRow}
              onPress={() => toggleTodo(todo.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.todoCheck, styles.todoCheckDone]}>
                <Text style={styles.todoCheckMark}>✓</Text>
              </View>
              <Text style={[styles.todoText, styles.todoTextDone]}>{todo.text}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

function WeekStreak() {
  const logs = useStore(s => s.dailyLogs);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Build last 7 days
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return format(d, 'yyyy-MM-dd');
  });

  const filled = last7.map(dateStr => logs.some(l => l.date === dateStr && l.morningCompleted));
  const streak = filled.filter(Boolean).length;

  return (
    <View style={[styles.streakCard, Shadow.sm]}>
      <View style={styles.streakHeader}>
        <Text style={styles.streakTitle}>🔥 Week streak</Text>
        <Text style={styles.streakCount}>{streak}/7</Text>
      </View>
      <View style={styles.streakDots}>
        {last7.map((d, i) => (
          <View key={d} style={[styles.streakDot, filled[i] && styles.streakDotFilled]}>
            <Text style={[styles.streakDayLabel, filled[i] && { color: Colors.white }]}>
              {days[new Date(d + 'T12:00:00').getDay() === 0 ? 6 : new Date(d + 'T12:00:00').getDay() - 1]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const profile = useStore(s => s.profile);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <DateHeader />
        <MorningBanner />
        <EveningBanner />
        <MITSection />
        <HabitsSection />
        <TodayTodosSection />
        <WeekStreak />

        {/* Bottom padding for tab bar */}
        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: 100 },

  // Date header
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base },
  dayName: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.navy },
  dateStr: { fontSize: Typography.size.sm, color: Colors.textMuted },
  energyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  energyEmoji: { fontSize: 16, marginRight: 4 },
  energyText: { fontSize: Typography.size.xs, color: Colors.textMuted, fontWeight: Typography.weight.medium },

  // Morning banner
  morningBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.tealLight, borderRadius: Radius.md,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  morningBannerIcon: { fontSize: 28, marginRight: Spacing.sm },
  morningBannerTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.navy },
  morningBannerSub: { fontSize: Typography.size.sm, color: Colors.textMuted },
  morningBannerArrow: { fontSize: 20, color: Colors.teal, fontWeight: Typography.weight.bold },

  // Section shared
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.navy },
  mitCount: { fontSize: Typography.size.sm, color: Colors.textMuted },

  // MITs
  mitSection: { marginBottom: Spacing.xl },
  emptyMIT: {
    borderWidth: 1.5, borderColor: Colors.teal, borderStyle: 'dashed',
    borderRadius: Radius.md, padding: Spacing.base, alignItems: 'center',
  },
  emptyMITText: { color: Colors.teal, fontSize: Typography.size.sm },
  mitCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: Spacing.base, marginBottom: 8,
  },
  mitCardDone: { opacity: 0.55 },
  mitCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.teal,
    marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  mitCheckDone: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  checkMark: { color: Colors.white, fontSize: 13, fontWeight: Typography.weight.bold },
  mitText: { fontSize: Typography.size.base, color: Colors.text, lineHeight: 22, flexShrink: 1 },
  mitTextDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  mitMeta: { fontSize: Typography.size.xs, color: Colors.textLight, marginTop: 3 },
  addTodoBtn: {
    alignSelf: 'flex-start', paddingHorizontal: Spacing.base, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    marginTop: 8,
  },
  addTodoBtnText: { fontSize: Typography.size.sm, color: Colors.textMuted },

  // Habits
  habitsSection: { marginBottom: Spacing.xl },
  habitsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  habitChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
    gap: 4,
  },
  habitIcon: { fontSize: 16 },
  habitName: { fontSize: Typography.size.sm, color: Colors.text, fontWeight: Typography.weight.medium },
  habitDone: { fontSize: 12, color: Colors.success, fontWeight: Typography.weight.bold },

  // Other todos
  todosSection: { marginBottom: Spacing.xl },
  todoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  todoCheck: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.gray400, marginRight: Spacing.sm },
  todoCheckDone: { backgroundColor: Colors.gray400, borderColor: Colors.gray400, justifyContent: 'center', alignItems: 'center' },
  todoCheckMark: { color: Colors.white, fontSize: 11, fontWeight: Typography.weight.bold },
  todoText: { flex: 1, fontSize: Typography.size.base, color: Colors.text },
  todoTextDone: { textDecorationLine: 'line-through', color: Colors.textLight },
  todoMeta: { fontSize: Typography.size.xs, color: Colors.textLight },
  doneDivider: { fontSize: Typography.size.xs, color: Colors.textLight, fontWeight: Typography.weight.semibold, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Streak
  streakCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base },
  streakHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  streakTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.navy },
  streakCount: { fontSize: Typography.size.sm, color: Colors.textMuted },
  streakDots: { flexDirection: 'row', gap: 8 },
  streakDot: {
    flex: 1, aspectRatio: 1, borderRadius: 8,
    backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  streakDotFilled: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  streakDayLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, fontWeight: Typography.weight.bold },
});
