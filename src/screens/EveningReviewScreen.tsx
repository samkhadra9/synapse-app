/**
 * EveningReviewScreen — 3-part end-of-day ritual
 *  1. Score the day (MITs recap + focus score)
 *  2. Brain dump open loops + tomorrow intention
 *  3. Done
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow } from '../theme';
import { useStore } from '../store/useStore';

type Step = 'score' | 'dump' | 'done';

export default function EveningReviewScreen() {
  const navigation = useNavigation();
  const tasks = useStore(s => s.tasks);
  const updateTodayLog = useStore(s => s.updateTodayLog);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayMITs = tasks.filter(t => t.date === todayStr && t.isMIT);
  const completedMITs = todayMITs.filter(t => t.completed);

  const [step, setStep] = useState<Step>('score');
  const [focusScore, setFocusScore] = useState<number>(3);
  const [eveningNote, setEveningNote] = useState('');
  const [tomorrowIntention, setTomorrowIntention] = useState('');

  const finishReview = () => {
    updateTodayLog({
      focusScore,
      eveningNote: `${eveningNote}\n\nTomorrow: ${tomorrowIntention}`.trim(),
      eveningCompleted: true,
    });
    setStep('done');
  };

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centred}>
          <Text style={styles.doneEmoji}>🌙</Text>
          <Text style={styles.doneTitle}>Day closed</Text>
          <Text style={styles.doneSub}>Rest well. Tomorrow you start fresh with a clear intention.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Good night →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Evening review</Text>
          <Text style={styles.sub}>5 minutes to close the day properly.</Text>

          {/* MITs recap */}
          <View style={[styles.card, Shadow.sm]}>
            <Text style={styles.cardTitle}>
              Today's priorities — {completedMITs.length}/{todayMITs.length} done
            </Text>
            {todayMITs.length === 0
              ? <Text style={styles.emptyText}>No priorities were set today.</Text>
              : todayMITs.map(t => (
                  <View key={t.id} style={styles.mitRow}>
                    <Text style={styles.mitIcon}>{t.completed ? '✅' : '⬜'}</Text>
                    <Text style={[styles.mitText, t.completed && styles.mitDone]}>{t.text}</Text>
                  </View>
                ))
            }
          </View>

          {/* Step 1 — focus score */}
          {step === 'score' && (
            <>
              <View style={[styles.card, Shadow.sm]}>
                <Text style={styles.cardTitle}>How was your focus today?</Text>
                <View style={styles.scoreRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.scoreBtn, focusScore === n && styles.scoreBtnActive]}
                      onPress={() => setFocusScore(n)}
                    >
                      <Text style={styles.scoreEmoji}>
                        {n === 1 ? '😵' : n === 2 ? '😕' : n === 3 ? '😐' : n === 4 ? '🙂' : '🔥'}
                      </Text>
                      <Text style={[styles.scoreLabel, focusScore === n && { color: Colors.primary }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={styles.btn} onPress={() => setStep('dump')} activeOpacity={0.85}>
                <Text style={styles.btnText}>Continue →</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Step 2 — brain dump + tomorrow */}
          {step === 'dump' && (
            <>
              <View style={[styles.card, Shadow.sm]}>
                <Text style={styles.cardTitle}>Open loops brain dump</Text>
                <Text style={styles.cardSub}>
                  Anything unfinished or on your mind. Get it out — then you can properly rest.
                </Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="e.g. Reply to mum, chase invoice, dentist pending…"
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={eveningNote}
                  onChangeText={setEveningNote}
                  textAlignVertical="top"
                  autoFocus
                />
              </View>

              <View style={[styles.card, Shadow.sm]}>
                <Text style={styles.cardTitle}>One intention for tomorrow</Text>
                <Text style={styles.cardSub}>The single most important thing to accomplish.</Text>
                <TextInput
                  style={[styles.textArea, { minHeight: 60 }]}
                  placeholder="e.g. Finish the quarterly report draft."
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={tomorrowIntention}
                  onChangeText={setTomorrowIntention}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity style={styles.btn} onPress={finishReview} activeOpacity={0.85}>
                <Text style={styles.btnText}>Close the day →</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backLink} onPress={() => setStep('score')}>
                <Text style={styles.backLinkText}>← Back</Text>
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
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: Spacing.base },
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 18, color: Colors.textMuted },
  title: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.textPrimary, marginBottom: 10 },
  sub: { fontSize: Typography.size.base, color: Colors.textMuted, lineHeight: 22, marginBottom: Spacing.xl },
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.base },
  cardTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.textPrimary, marginBottom: 4 },
  cardSub: { fontSize: Typography.size.sm, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.sm },
  emptyText: { fontSize: Typography.size.sm, color: Colors.textLight, fontStyle: 'italic' },
  mitRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  mitIcon: { fontSize: 16, marginRight: 8 },
  mitText: { fontSize: Typography.size.base, color: Colors.text, flex: 1, lineHeight: 22 },
  mitDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.gray100 },
  scoreBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  scoreEmoji: { fontSize: 22 },
  scoreLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, fontWeight: Typography.weight.semibold, marginTop: 2 },
  textArea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.sm, fontSize: Typography.size.base, color: Colors.text,
    minHeight: 100, textAlignVertical: 'top', lineHeight: 22, backgroundColor: Colors.background,
  },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 18, alignItems: 'center', marginBottom: Spacing.sm },
  btnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backLinkText: { color: Colors.textMuted, fontSize: Typography.size.sm },
  // Done state
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  doneEmoji: { fontSize: 64, marginBottom: Spacing.base },
  doneTitle: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  doneSub: { fontSize: Typography.size.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  doneBtn: { backgroundColor: Colors.textPrimary, borderRadius: Radius.lg, paddingVertical: 18, paddingHorizontal: 48 },
  doneBtnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
});
