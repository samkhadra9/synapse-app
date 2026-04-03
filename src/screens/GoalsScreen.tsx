import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, DomainColors, DomainIcons } from '../theme';
import { useStore, DomainKey, TimeHorizon, ALL_DOMAINS } from '../store/useStore';

const HORIZONS: { key: TimeHorizon; label: string; emoji: string }[] = [
  { key: '1year',  label: '1 year',   emoji: '🌱' },
  { key: '5year',  label: '5 years',  emoji: '🚀' },
  { key: '10year', label: '10 years', emoji: '🌟' },
];

function GoalCard({ domain, horizon }: { domain: DomainKey; horizon: TimeHorizon }) {
  const goals      = useStore(s => s.goals);
  const updateGoal = useStore(s => s.updateGoal);
  const addGoal    = useStore(s => s.addGoal);

  const goal = goals.find(g => g.domain === domain && g.horizon === horizon);
  const dc   = DomainColors[domain] ?? DomainColors.work;
  const [editing, setEditing] = useState(false);
  const [text,    setText]    = useState(goal?.text ?? '');

  function save() {
    if (!text.trim()) { setEditing(false); return; }
    if (goal) {
      updateGoal(goal.id, { text: text.trim() });
    } else {
      addGoal({ domain, horizon, text: text.trim(), milestones: [] });
    }
    setEditing(false);
  }

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalCardHeader}>
        <Text style={styles.goalCardIcon}>{DomainIcons[domain] ?? '📁'}</Text>
        <Text style={[styles.goalCardDomain, { color: dc.text }]}>
          {domain.charAt(0).toUpperCase() + domain.slice(1)}
        </Text>
        <TouchableOpacity onPress={() => { setText(goal?.text ?? ''); setEditing(true); }}>
          <Text style={styles.editBtn}>{goal ? '✏️' : '+'}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View>
          <TextInput
            style={styles.goalInput}
            placeholder={`Your ${domain} goal…`}
            placeholderTextColor={Colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
          />
          <View style={styles.goalInputActions}>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveGoalBtn} onPress={save}>
              <Text style={styles.saveGoalBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : goal ? (
        <Text style={styles.goalText}>{goal.text}</Text>
      ) : (
        <Text style={styles.goalEmpty}>Tap + to set a goal</Text>
      )}
    </View>
  );
}

export default function GoalsScreen() {
  const goals   = useStore(s => s.goals);
  const profile = useStore(s => s.profile);
  const [selectedHorizon, setSelectedHorizon] = useState<TimeHorizon>('1year');

  // Use domains from profile if set, otherwise show all
  const activeDomains: DomainKey[] =
    profile.selectedDomains?.length > 0 ? profile.selectedDomains : ALL_DOMAINS;

  const horizonGoals = goals.filter(g => g.horizon === selectedHorizon);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Goals</Text>
        <Text style={styles.screenSub}>{horizonGoals.length} set for this horizon</Text>
      </View>

      {/* Horizon selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizonRow}
      >
        {HORIZONS.map(h => (
          <TouchableOpacity
            key={h.key}
            style={[styles.horizonTab, selectedHorizon === h.key && styles.horizonTabActive]}
            onPress={() => setSelectedHorizon(h.key)}
          >
            <Text style={styles.horizonEmoji}>{h.emoji}</Text>
            <Text style={[styles.horizonLabel, selectedHorizon === h.key && styles.horizonLabelActive]}>
              {h.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.horizonIntro}>
          <Text style={styles.horizonIntroEmoji}>
            {HORIZONS.find(h => h.key === selectedHorizon)?.emoji}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.horizonIntroTitle}>
              {HORIZONS.find(h => h.key === selectedHorizon)?.label} goals
            </Text>
            <Text style={styles.horizonIntroSub}>
              {selectedHorizon === '1year'  && 'Where will you be in 12 months?'}
              {selectedHorizon === '5year'  && 'What does your life look like in 5 years?'}
              {selectedHorizon === '10year' && 'The big picture — who are you becoming?'}
            </Text>
          </View>
        </View>

        {activeDomains.map(domain => (
          <GoalCard key={domain} domain={domain} horizon={selectedHorizon} />
        ))}

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },

  // Editorial header
  header:      { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.md },
  screenTitle: { fontSize: 38, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1.5, lineHeight: 40 },
  screenSub:   { fontSize: 13, color: Colors.textTertiary, marginTop: 6, fontWeight: '500' },

  // Horizon pills — black when active
  horizonRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: 8 },
  horizonTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  horizonTabActive:   { backgroundColor: Colors.ink, borderColor: Colors.ink },
  horizonEmoji:       { fontSize: 15 },
  horizonLabel:       { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  horizonLabelActive: { color: '#FFF', fontWeight: '700' },

  scroll: { padding: Spacing.base, paddingBottom: 120 },

  // Horizon intro — editorial card
  horizonIntro: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.base,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  horizonIntroEmoji: { fontSize: 30 },
  horizonIntroTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3 },
  horizonIntroSub:   { fontSize: 13, color: Colors.textSecondary, marginTop: 3, lineHeight: 19 },

  // Goal cards — full border, no left accent stripe
  goalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl, padding: Spacing.base,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  goalCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  goalCardIcon:   { fontSize: 16, marginRight: 8 },
  goalCardDomain: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  editBtn:        { fontSize: 16, padding: 4, color: Colors.textTertiary },
  goalText:       { fontSize: 15, color: Colors.textPrimary, lineHeight: 23, fontWeight: '400' },
  goalEmpty:      { fontSize: 13, color: Colors.textTertiary, fontStyle: 'italic' },

  goalInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 14, fontSize: 15, color: Colors.textPrimary,
    minHeight: 70, textAlignVertical: 'top', lineHeight: 23,
    backgroundColor: Colors.surfaceSecondary, marginBottom: 10,
  },
  goalInputActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, alignItems: 'center' },
  cancelText:       { color: Colors.textSecondary, fontSize: 14, paddingVertical: 8, fontWeight: '500' },
  saveGoalBtn:      { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 10 },
  saveGoalBtnText:  { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
