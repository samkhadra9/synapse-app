/**
 * AddTodoScreen — modal for quickly adding a task or habit
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore, DomainKey } from '../store/useStore';

const DOMAINS: DomainKey[] = ['health','work','relationships','finances','learning','creativity','community','personal'];

const TIME_ESTIMATES = [
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h+', value: 120 },
];

export default function AddTodoScreen() {
  const navigation = useNavigation();
  const addTask = useStore(s => s.addTask);
  const todaysMITs = useStore(s => s.todaysMITs());

  const [text, setText] = useState('');
  const [isMIT, setIsMIT] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<DomainKey | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | undefined>(undefined);

  const canSetMIT = todaysMITs.length < 3;

  const save = () => {
    if (!text.trim()) return;
    addTask({
      text: text.trim(),
      date: format(new Date(), 'yyyy-MM-dd'),
      domain: selectedDomain ?? undefined,
      estimatedMinutes,
      isMIT: isMIT && canSetMIT,
      isToday: true,
      completed: false,
      priority: isMIT ? 'high' : 'medium',
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Handle bar */}
          <View style={styles.handleBar} />

          <Text style={styles.title}>Add a task</Text>

          {/* Task text */}
          <TextInput
            style={styles.textInput}
            placeholder="What needs to happen?"
            placeholderTextColor={Colors.textLight}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            returnKeyType="done"
          />

          {/* MIT toggle */}
          <View style={[styles.row, Shadow.sm]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Top priority (MIT)</Text>
              <Text style={styles.rowSub}>
                {canSetMIT
                  ? `${3 - todaysMITs.length} priority slot${3 - todaysMITs.length === 1 ? '' : 's'} remaining`
                  : 'You already have 3 top priorities'}
              </Text>
            </View>
            <Switch
              value={isMIT && canSetMIT}
              onValueChange={v => canSetMIT && setIsMIT(v)}
              trackColor={{ false: Colors.gray200, true: Colors.primary }}
              thumbColor={Colors.white}
              disabled={!canSetMIT}
            />
          </View>

          {/* Time estimate */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Time estimate</Text>
            <View style={styles.timeRow}>
              {TIME_ESTIMATES.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.timeChip, estimatedMinutes === t.value && styles.timeChipActive]}
                  onPress={() => setEstimatedMinutes(prev => prev === t.value ? undefined : t.value)}
                >
                  <Text style={[styles.timeChipText, estimatedMinutes === t.value && styles.timeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Domain */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Life domain (optional)</Text>
            <View style={styles.domainGrid}>
              {DOMAINS.map(d => {
                const dc = DomainColors[d];
                const isSelected = selectedDomain === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.domainChip, isSelected && { backgroundColor: dc.bg, borderColor: dc.border }]}
                    onPress={() => setSelectedDomain(prev => prev === d ? null : d)}
                  >
                    <Text style={styles.domainIcon}>{DomainIcons[d]}</Text>
                    <Text style={[styles.domainText, isSelected && { color: dc.text }]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !text.trim() && { opacity: 0.5 }]}
              onPress={save}
              disabled={!text.trim()}
            >
              <Text style={styles.saveBtnText}>Add task</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl, paddingBottom: 60 },
  handleBar: { width: 40, height: 4, backgroundColor: Colors.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.xl },
  title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.heavy, color: Colors.textPrimary, marginBottom: Spacing.base },
  textInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.base, fontSize: Typography.size.base, color: Colors.text,
    minHeight: 80, textAlignVertical: 'top', lineHeight: 24,
    backgroundColor: Colors.card, marginBottom: Spacing.base,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  rowTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: Colors.textPrimary },
  rowSub: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  section: { marginBottom: Spacing.base },
  sectionLabel: { fontSize: Typography.size.sm, color: Colors.textMuted, fontWeight: Typography.weight.semibold, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeChip: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  timeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timeChipText: { fontSize: Typography.size.sm, color: Colors.textMuted, fontWeight: Typography.weight.medium },
  timeChipTextActive: { color: Colors.white, fontWeight: Typography.weight.bold },
  domainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  domainChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  domainIcon: { fontSize: 14 },
  domainText: { fontSize: Typography.size.sm, color: Colors.text },
  actions: { flexDirection: 'row', gap: 12, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: 16, alignItems: 'center',
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  cancelBtnText: { fontSize: Typography.size.base, color: Colors.textMuted },
  saveBtn: {
    flex: 2, paddingVertical: 16, alignItems: 'center',
    borderRadius: Radius.lg, backgroundColor: Colors.primary,
  },
  saveBtnText: { fontSize: Typography.size.base, color: Colors.white, fontWeight: Typography.weight.bold },
});
