import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { RootStackParams } from '../navigation';
import { Colors, Typography, Spacing, Radius, Shadow, DomainColors, DomainIcons, useColors } from '../theme';
import { useStore } from '../store/useStore';

type Nav = NativeStackNavigationProp<RootStackParams>;

// ─── Sub-components ────────────────────────────────────────────────────────────

function DateHeader() {
  const C = useColors();
  const styles = useMemo(() => makeStyles_dateHeader(C), [C]);
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
  const C = useColors();
  const styles = useMemo(() => makeStyles_morningBanner(C), [C]);
  const navigation = useNavigation<Nav>();
  const log = useStore(s => s.todayLog());
  if (log?.morningCompleted) return null;
  return (
    <TouchableOpacity
      style={styles.morningBanner}
      onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
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
  const C = useColors();
  const styles = useMemo(() => makeStyles_eveningBanner(C), [C]);
  const navigation = useNavigation<Nav>();
  const log = useStore(s => s.todayLog());
  const hour = new Date().getHours();
  if (!log?.morningCompleted || log?.eveningCompleted || hour < 17) return null;
  return (
    <TouchableOpacity
      style={[styles.morningBanner, { backgroundColor: C.ink }]}
      onPress={() => navigation.navigate('Chat', { mode: 'evening' })}
      activeOpacity={0.85}
    >
      <Text style={styles.morningBannerIcon}>🌙</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.morningBannerTitle, { color: C.white }]}>Evening review</Text>
        <Text style={[styles.morningBannerSub, { color: C.gray400 }]}>Close the day — 5 minutes</Text>
      </View>
      <Text style={[styles.morningBannerArrow, { color: C.primary }]}>→</Text>
    </TouchableOpacity>
  );
}

function MITSection() {
  const C = useColors();
  const styles = useMemo(() => makeStyles_mitSection(C), [C]);
  const navigation = useNavigation<Nav>();
  const todos = useStore(s => s.todos);
  const toggleTodo = useStore(s => s.toggleTodo);
  const setTopPriority = useStore(s => s.setTopPriority);

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const mits = useMemo(() => todos.filter(t => t.date === todayStr && t.isMIT), [todos, todayStr]);
  const remaining = useMemo(() => todos.filter(t => t.date === todayStr && !t.isMIT && !t.completed), [todos, todayStr]);
  const completedMITs = useMemo(() => mits.filter(t => t.completed).length, [mits]);

  return (
    <View style={styles.mitSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🎯  Top 3 priorities</Text>
        <Text style={styles.mitCount}>{completedMITs}/{mits.length}</Text>
      </View>

      {mits.length === 0 ? (
        <TouchableOpacity
          style={styles.emptyMIT}
          onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
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
        onPress={() => navigation.navigate('Chat', { mode: 'dump' })}
      >
        <Text style={styles.addTodoBtnText}>+ Add task</Text>
      </TouchableOpacity>
    </View>
  );
}

function HabitsSection() {
  const C = useColors();
  const styles = useMemo(() => makeStyles_habitsSection(C), [C]);
  const habits = useStore(s => s.habits);
  const toggleHabitToday = useStore(s => s.toggleHabitToday);
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const todayHabits = useMemo(() => {
    const day = new Date().getDay();
    return habits.filter(h => {
      if (h.frequency === 'daily') return true;
      if (h.frequency === 'weekdays') return day >= 1 && day <= 5;
      return true;
    });
  }, [habits]);

  if (todayHabits.length === 0) return null;

  const completedCount = useMemo(
    () => todayHabits.filter(h => h.completedDates.includes(todayStr)).length,
    [todayHabits, todayStr],
  );

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
  const C = useColors();
  const styles = useMemo(() => makeStyles_todosSection(C), [C]);
  const navigation = useNavigation<Nav>();
  const todos = useStore(s => s.todos);
  const toggleTodo = useStore(s => s.toggleTodo);
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const regularTodos = useMemo(() => todos.filter(t => t.date === todayStr && !t.isMIT), [todos, todayStr]);
  const pending = useMemo(() => regularTodos.filter(t => !t.completed), [regularTodos]);
  const done = useMemo(() => regularTodos.filter(t => t.completed), [regularTodos]);

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
  const C = useColors();
  const styles = useMemo(() => makeStyles_weekStreak(C), [C]);
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
        {last7.map((d, i) => {
          const jsDay  = new Date(d + 'T12:00:00').getDay(); // 0=Sun … 6=Sat
          const label  = Number.isFinite(jsDay)
            ? days[jsDay === 0 ? 6 : jsDay - 1]  // Mon-Sun → M T W T F S S
            : '?';
          return (
            <View key={d} style={[styles.streakDot, filled[i] && styles.streakDotFilled]}>
              <Text style={[styles.streakDayLabel, filled[i] && { color: C.white }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
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

function makeStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.lg, paddingBottom: 100 },
  });
}

function makeStyles_dateHeader(C: any) {
  return StyleSheet.create({
    dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base },
    dayName: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: C.ink },
    dateStr: { fontSize: Typography.size.sm, color: C.textMuted },
    energyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
    energyEmoji: { fontSize: 16, marginRight: 4 },
    energyText: { fontSize: Typography.size.xs, color: C.textMuted, fontWeight: Typography.weight.medium },
  });
}

function makeStyles_morningBanner(C: any) {
  return StyleSheet.create({
    morningBanner: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.primaryLight, borderRadius: Radius.md,
      padding: Spacing.base, marginBottom: Spacing.base,
    },
    morningBannerIcon: { fontSize: 28, marginRight: Spacing.sm },
    morningBannerTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    morningBannerSub: { fontSize: Typography.size.sm, color: C.textMuted },
    morningBannerArrow: { fontSize: 20, color: C.primary, fontWeight: Typography.weight.bold },
  });
}

function makeStyles_eveningBanner(C: any) {
  return StyleSheet.create({
    morningBanner: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.primaryLight, borderRadius: Radius.md,
      padding: Spacing.base, marginBottom: Spacing.base,
    },
    morningBannerIcon: { fontSize: 28, marginRight: Spacing.sm },
    morningBannerTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    morningBannerSub: { fontSize: Typography.size.sm, color: C.textMuted },
    morningBannerArrow: { fontSize: 20, color: C.primary, fontWeight: Typography.weight.bold },
  });
}

function makeStyles_mitSection(C: any) {
  return StyleSheet.create({
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    sectionTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    mitCount: { fontSize: Typography.size.sm, color: C.textMuted },
    mitSection: { marginBottom: Spacing.xl },
    emptyMIT: {
      borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed',
      borderRadius: Radius.md, padding: Spacing.base, alignItems: 'center',
    },
    emptyMITText: { color: C.primary, fontSize: Typography.size.sm },
    mitCard: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: C.card, borderRadius: Radius.md,
      padding: Spacing.base, marginBottom: 8,
    },
    mitCardDone: { opacity: 0.55 },
    mitCheck: {
      width: 24, height: 24, borderRadius: 12,
      borderWidth: 2, borderColor: C.primary,
      marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center',
      marginTop: 2,
    },
    mitCheckDone: { backgroundColor: C.primary, borderColor: C.primary },
    checkMark: { color: C.white, fontSize: 13, fontWeight: Typography.weight.bold },
    mitText: { fontSize: Typography.size.base, color: C.text, lineHeight: 22, flexShrink: 1 },
    mitTextDone: { textDecorationLine: 'line-through', color: C.textMuted },
    mitMeta: { fontSize: Typography.size.xs, color: C.textLight, marginTop: 3 },
    addTodoBtn: {
      alignSelf: 'flex-start', paddingHorizontal: Spacing.base, paddingVertical: 8,
      borderRadius: Radius.full, borderWidth: 1, borderColor: C.border,
      marginTop: 8,
    },
    addTodoBtnText: { fontSize: Typography.size.sm, color: C.textMuted },
  });
}

function makeStyles_habitsSection(C: any) {
  return StyleSheet.create({
    habitsSection: { marginBottom: Spacing.xl },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    sectionTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    mitCount: { fontSize: Typography.size.sm, color: C.textMuted },
    habitsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    habitChip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: Radius.full,
      paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: C.border,
      gap: 4,
    },
    habitIcon: { fontSize: 16 },
    habitName: { fontSize: Typography.size.sm, color: C.text, fontWeight: Typography.weight.medium },
    habitDone: { fontSize: 12, color: C.success, fontWeight: Typography.weight.bold },
  });
}

function makeStyles_todosSection(C: any) {
  return StyleSheet.create({
    todosSection: { marginBottom: Spacing.xl },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    sectionTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    mitCount: { fontSize: Typography.size.sm, color: C.textMuted },
    todoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    todoCheck: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: C.gray400, marginRight: Spacing.sm },
    todoCheckDone: { backgroundColor: C.gray400, borderColor: C.gray400, justifyContent: 'center', alignItems: 'center' },
    todoCheckMark: { color: C.white, fontSize: 11, fontWeight: Typography.weight.bold },
    todoText: { flex: 1, fontSize: Typography.size.base, color: C.text },
    todoTextDone: { textDecorationLine: 'line-through', color: C.textLight },
    todoMeta: { fontSize: Typography.size.xs, color: C.textLight },
    doneDivider: { fontSize: Typography.size.xs, color: C.textLight, fontWeight: Typography.weight.semibold, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  });
}

function makeStyles_weekStreak(C: any) {
  return StyleSheet.create({
    streakCard: { backgroundColor: C.card, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
    streakTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: C.ink },
    streakCount: { fontSize: Typography.size.sm, color: C.textMuted },
    streakDots: { flexDirection: 'row', gap: 8 },
    streakDot: {
      flex: 1, aspectRatio: 1, borderRadius: 8,
      backgroundColor: C.gray100, borderWidth: 1, borderColor: C.border,
      justifyContent: 'center', alignItems: 'center',
    },
    streakDotFilled: { backgroundColor: C.primary, borderColor: C.primary },
    streakDayLabel: { fontSize: Typography.size.xs, color: C.textMuted, fontWeight: Typography.weight.bold },
  });
}
