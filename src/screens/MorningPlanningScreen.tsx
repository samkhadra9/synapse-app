/**
 * MorningPlanningScreen
 *
 * Guided 3-step morning planning session:
 *   1. Brain dump  — free-form text input
 *   2. AI structure — sends text to OpenAI, shows structured plan
 *   3. Confirm    — user picks their Top 3 MITs and accepts the plan
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '../theme';
import { useStore } from '../store/useStore';
import { structureMorningText, StructuredTask } from '../services/openai';

type Step = 'dump' | 'loading' | 'review' | 'done';

export default function MorningPlanningScreen() {
  const navigation = useNavigation();
  const profile = useStore(s => s.profile);
  const addTodo = useStore(s => s.addTodo);
  const setTopPriority = useStore(s => s.setTopPriority);
  const upsertDailyLog = useStore(s => s.upsertDailyLog);
  const goals = useStore(s => s.goals);

  const [step, setStep] = useState<Step>('dump');
  const [rawText, setRawText] = useState('');
  const [structured, setStructured] = useState<Awaited<ReturnType<typeof structureMorningText>> | null>(null);
  const [selectedMITs, setSelectedMITs] = useState<Set<number>>(new Set());
  const [energyLevel, setEnergyLevel] = useState<number>(3);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Step 1 → 2: send to AI
  const structureText = async () => {
    if (!rawText.trim()) {
      Alert.alert('Nothing to plan', 'Write at least a few words about what you need to do today.');
      return;
    }

    if (!profile.openAiKey) {
      // Skip AI, let user manually set priorities
      const fallbackTasks: StructuredTask[] = rawText
        .split(/\n|,/)
        .map(t => t.trim())
        .filter(Boolean)
        .map((text, i) => ({ text, priority: i + 1, estimatedMinutes: 30, defer: false }));

      setStructured({
        topPriorities: fallbackTasks.slice(0, 3).map(t => t.text),
        todos: fallbackTasks,
        energySuggestion: 'Set up your OpenAI key in Settings for AI-powered planning.',
        warnings: [],
      });
      setStep('review');
      return;
    }

    setStep('loading');

    // Build goal context string
    const goalContext = goals
      .filter(g => g.horizon === 'monthly')
      .map(g => `${g.domain}: ${g.text}`)
      .join('; ');

    try {
      const result = await structureMorningText(rawText, profile.openAiKey, goalContext);
      setStructured(result);
      // Pre-select the AI's top 3
      const preSelected = new Set<number>();
      result.todos.forEach((t, i) => {
        if (result.topPriorities.includes(t.text)) preSelected.add(i);
      });
      setSelectedMITs(preSelected);
      setStep('review');
    } catch (e: any) {
      Alert.alert('AI error', e.message ?? 'Could not connect to OpenAI. Check your API key in Settings.');
      setStep('dump');
    }
  };

  // Step 3: save plan
  const confirmPlan = () => {
    if (!structured) return;
    if (selectedMITs.size === 0) {
      Alert.alert('Pick at least one priority', 'Select the tasks most important to you today.');
      return;
    }

    const mitTexts: string[] = [];

    // Add all non-deferred todos
    structured.todos.forEach((task, idx) => {
      if (task.defer) return;
      const isMIT = selectedMITs.has(idx);
      const newTodo = addTodo({
        text: task.text,
        date: todayStr,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
        isTopPriority: false,
      });
      if (isMIT && newTodo) {
        setTopPriority(newTodo.id);
        mitTexts.push(task.text);
      }
    });

    upsertDailyLog({
      date: todayStr,
      rawMorningText: rawText,
      topPriorities: mitTexts,
      energyLevel,
      morningCompleted: true,
    });

    setStep('done');
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneContainer}>
          <Text style={styles.doneEmoji}>🎯</Text>
          <Text style={styles.doneTitle}>You're set for the day</Text>
          <Text style={styles.doneSub}>
            Focus on your Top {selectedMITs.size} {selectedMITs.size === 1 ? 'priority' : 'priorities'}.
            Everything else is a bonus.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Start the day →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneContainer}>
          <ActivityIndicator size="large" color={Colors.teal} />
          <Text style={[styles.doneSub, { marginTop: Spacing.base }]}>
            Structuring your day…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.steps}>
              {['dump', 'review'].map((s, i) => (
                <View key={s} style={[styles.stepDot, step === s && styles.stepDotActive]} />
              ))}
            </View>
          </View>

          {step === 'dump' && (
            <>
              <Text style={styles.title}>What's in your head?</Text>
              <Text style={styles.sub}>
                Do a complete brain dump — tasks, worries, ideas, commitments. Don't filter. We'll sort it out together.
              </Text>

              {/* Energy check-in */}
              <View style={[styles.card, Shadow.sm, { marginBottom: Spacing.base }]}>
                <Text style={styles.cardTitle}>How's your energy today?</Text>
                <View style={styles.energyRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.energyBtn, energyLevel === n && styles.energyBtnActive]}
                      onPress={() => setEnergyLevel(n)}
                    >
                      <Text style={styles.energyBtnEmoji}>
                        {n === 1 ? '😴' : n === 2 ? '😔' : n === 3 ? '🙂' : n === 4 ? '😊' : '⚡'}
                      </Text>
                      <Text style={[styles.energyBtnLabel, energyLevel === n && { color: Colors.teal }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TextInput
                style={styles.dumpInput}
                placeholder={
                  `e.g.\n\n` +
                  `- Reply to Sarah re: project brief\n` +
                  `- Finish quarterly report (urgent)\n` +
                  `- Book dentist appointment\n` +
                  `- Research gym memberships\n` +
                  `- Team standup at 10am`
                }
                placeholderTextColor={Colors.textLight}
                multiline
                value={rawText}
                onChangeText={setRawText}
                textAlignVertical="top"
                autoFocus
              />

              <TouchableOpacity style={styles.btn} onPress={structureText} activeOpacity={0.85}>
                <Text style={styles.btnText}>Structure my day →</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'review' && structured && (
            <>
              <Text style={styles.title}>Your plan for today</Text>
              <Text style={styles.sub}>
                Tap to select your Top 3 most important tasks. Everything else is a bonus — not a failure.
              </Text>

              {structured.warnings.length > 0 && (
                <View style={[styles.warningBox]}>
                  {structured.warnings.map((w, i) => (
                    <Text key={i} style={styles.warningText}>⚠️  {w}</Text>
                  ))}
                </View>
              )}

              {structured.energySuggestion ? (
                <View style={[styles.card, { backgroundColor: Colors.tealLight, marginBottom: Spacing.base }]}>
                  <Text style={styles.energySuggestionText}>💡  {structured.energySuggestion}</Text>
                </View>
              ) : null}

              <Text style={styles.reviewLabel}>Select your Top 3 priorities:</Text>

              {structured.todos.map((task, idx) => {
                const isSelected = selectedMITs.has(idx);
                const canSelect = selectedMITs.size < 3 || isSelected;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.reviewTask,
                      isSelected && styles.reviewTaskSelected,
                      task.defer && styles.reviewTaskDeferred,
                      Shadow.sm,
                    ]}
                    onPress={() => {
                      if (!canSelect && !isSelected) {
                        Alert.alert('Max 3 priorities', 'Deselect one to choose a different priority.');
                        return;
                      }
                      setSelectedMITs(prev => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.reviewCheck, isSelected && styles.reviewCheckSelected]}>
                      {isSelected && <Text style={styles.reviewCheckMark}>★</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewTaskText, task.defer && { color: Colors.textLight }]}>
                        {task.defer ? '→ defer: ' : ''}{task.text}
                      </Text>
                      {task.estimatedMinutes && (
                        <Text style={styles.reviewTaskMeta}>~{task.estimatedMinutes} min</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.mitCountLabel}>
                {selectedMITs.size}/3 priorities selected
              </Text>

              <TouchableOpacity style={styles.btn} onPress={confirmPlan} activeOpacity={0.85}>
                <Text style={styles.btnText}>Lock in my plan →</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('dump')}>
                <Text style={styles.backBtnText}>← Edit brain dump</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: Spacing['3xl'] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 18, color: Colors.textMuted },
  steps: { flexDirection: 'row', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gray200 },
  stepDotActive: { backgroundColor: Colors.teal, width: 24 },
  title: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.navy, marginBottom: 10 },
  sub: { fontSize: Typography.size.base, color: Colors.textMuted, lineHeight: 22, marginBottom: Spacing.xl },
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.base },
  cardTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.navy, marginBottom: Spacing.sm },
  energyRow: { flexDirection: 'row', gap: 8 },
  energyBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.gray100 },
  energyBtnActive: { borderColor: Colors.teal, backgroundColor: Colors.tealLight },
  energyBtnEmoji: { fontSize: 20 },
  energyBtnLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, fontWeight: Typography.weight.semibold },
  dumpInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.base, fontSize: Typography.size.base, color: Colors.text,
    minHeight: 200, textAlignVertical: 'top', lineHeight: 24,
    backgroundColor: Colors.card, marginBottom: Spacing.xl,
  },
  btn: {
    backgroundColor: Colors.teal, borderRadius: Radius.lg,
    paddingVertical: 18, alignItems: 'center', marginBottom: Spacing.sm,
  },
  btnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
  warningBox: { backgroundColor: '#FFF3CD', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.base, borderLeftWidth: 3, borderLeftColor: '#FFC107' },
  warningText: { fontSize: Typography.size.sm, color: '#856404', marginBottom: 2 },
  energySuggestionText: { fontSize: Typography.size.sm, color: Colors.tealDark, lineHeight: 20 },
  reviewLabel: { fontSize: Typography.size.sm, color: Colors.textMuted, fontWeight: Typography.weight.semibold, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },
  reviewTask: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: Spacing.base, marginBottom: 8,
    borderWidth: 2, borderColor: 'transparent',
  },
  reviewTaskSelected: { borderColor: Colors.teal, backgroundColor: Colors.tealLight },
  reviewTaskDeferred: { opacity: 0.5 },
  reviewCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: Colors.gray300,
    marginRight: Spacing.sm, justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  reviewCheckSelected: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  reviewCheckMark: { color: Colors.white, fontSize: 14 },
  reviewTaskText: { fontSize: Typography.size.base, color: Colors.text, lineHeight: 22 },
  reviewTaskMeta: { fontSize: Typography.size.xs, color: Colors.textLight, marginTop: 3 },
  mitCountLabel: { textAlign: 'center', color: Colors.textMuted, fontSize: Typography.size.sm, marginBottom: Spacing.base },
  backBtn: { alignItems: 'center', paddingVertical: 12 },
  backBtnText: { color: Colors.textMuted, fontSize: Typography.size.sm },
  // Done state
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  doneEmoji: { fontSize: 64, marginBottom: Spacing.base },
  doneTitle: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.navy, textAlign: 'center', marginBottom: 12 },
  doneSub: { fontSize: Typography.size.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  doneBtn: {
    backgroundColor: Colors.teal, borderRadius: Radius.lg,
    paddingVertical: 18, paddingHorizontal: 48, alignItems: 'center',
  },
  doneBtnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
});
