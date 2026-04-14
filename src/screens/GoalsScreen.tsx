/**
 * GoalsScreen — Synapse V2
 *
 * Three time horizons: 1 year / 5 years / 10 years
 * One goal per life domain per horizon.
 * Clean, no emoji, matches dashboard aesthetic.
 *
 * Future: graph view showing goal → project → task connections (v3)
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, Colors, Spacing, Radius, DomainColors } from '../theme';
import { useStore, DomainKey, TimeHorizon, ALL_DOMAINS } from '../store/useStore';

// ── Constants ──────────────────────────────────────────────────────────────────

const HORIZONS: { key: TimeHorizon; label: string; tagline: string }[] = [
  { key: '1year',  label: '1 year',   tagline: 'Where will you be in 12 months?' },
  { key: '5year',  label: '5 years',  tagline: 'What does your life look like at 5 years?' },
  { key: '10year', label: '10 years', tagline: 'The long game — who are you becoming?' },
];

const DOMAIN_LABELS: Record<DomainKey, string> = {
  work:          'Work',
  health:        'Health',
  relationships: 'Relationships',
  personal:      'Personal',
  finances:      'Finances',
  learning:      'Learning',
  creativity:    'Creativity',
  community:     'Community',
};

// ── Goal Card ──────────────────────────────────────────────────────────────────

function GoalCard({ domain, horizon }: { domain: DomainKey; horizon: TimeHorizon }) {
  const goals      = useStore(s => s.goals);
  const updateGoal = useStore(s => s.updateGoal);
  const addGoal    = useStore(s => s.addGoal);
  const C          = useColors();

  const goal = goals.find(g => g.domain === domain && g.horizon === horizon);
  const dc   = DomainColors[domain] ?? DomainColors.work;

  const [editing, setEditing] = useState(false);
  const [text,    setText]    = useState(goal?.text ?? '');
  const styles = useMemo(() => makeStyles_goalCard(C), [C]);

  function save() {
    const trimmed = text.trim();
    if (!trimmed) { setEditing(false); return; }
    if (goal) {
      updateGoal(goal.id, { text: trimmed });
    } else {
      addGoal({ domain, horizon, text: trimmed, milestones: [] });
    }
    setEditing(false);
  }

  function startEdit() {
    setText(goal?.text ?? '');
    setEditing(true);
  }

  return (
    <View style={styles.card}>
      {/* Domain colour accent — left bar */}
      <View style={[styles.cardAccent, { backgroundColor: dc.text }]} />

      <View style={styles.cardBody}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <Text style={[styles.domainLabel, { color: dc.text }]}>
            {DOMAIN_LABELS[domain]}
          </Text>
          <TouchableOpacity onPress={startEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.editLink}>{goal ? 'Edit' : '+ Set'}</Text>
          </TouchableOpacity>
        </View>

        {/* Goal text or edit state */}
        {editing ? (
          <>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Your ${DOMAIN_LABELS[domain].toLowerCase()} goal for this horizon…`}
              placeholderTextColor={C.textTertiary}
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.inputActions}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : goal ? (
          <Text style={styles.goalText}>{goal.text}</Text>
        ) : (
          <Text style={styles.emptyText}>Not set yet</Text>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function GoalsScreen({ navigation }: any) {
  const goals   = useStore(s => s.goals);
  const profile = useStore(s => s.profile);
  const C       = useColors();

  const [selectedHorizon, setSelectedHorizon] = useState<TimeHorizon>('1year');

  const activeDomains: DomainKey[] =
    profile.selectedDomains?.length > 0 ? profile.selectedDomains : ALL_DOMAINS;

  const currentHorizon = HORIZONS.find(h => h.key === selectedHorizon)!;
  const setCount       = goals.filter(g => g.horizon === selectedHorizon).length;
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Goals</Text>
          <Text style={styles.subtitle}>{setCount} of {activeDomains.length} set</Text>
        </View>

        {/* Horizon tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {HORIZONS.map(h => {
            const active = selectedHorizon === h.key;
            return (
              <TouchableOpacity
                key={h.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setSelectedHorizon(h.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Body */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Horizon tagline */}
          <Text style={styles.tagline}>{currentHorizon.tagline}</Text>

          {/* Goal cards */}
          {activeDomains.map(domain => (
            <GoalCard key={domain} domain={domain} horizon={selectedHorizon} />
          ))}

          {/* Bottom CTA — open yearly/monthly session to set goals via Synapse */}
          <TouchableOpacity
            style={styles.synapseCTA}
            onPress={() => navigation?.navigate('Chat', {
              mode: selectedHorizon === '10year' ? 'yearly' : 'monthly',
            })}
            activeOpacity={0.82}
          >
            <Text style={styles.synapseCTAText}>
              Set goals with Synapse →
            </Text>
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>

      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles_goalCard(C: any) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      marginBottom: 10,
      overflow: 'hidden',
    },
    cardAccent: { width: 3, alignSelf: 'stretch' },
    cardBody:   { flex: 1, padding: 14, gap: 8 },

    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    domainLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    editLink:    { fontSize: 13, color: C.primary, fontWeight: '600' },

    goalText:  { fontSize: 15, color: C.textPrimary, lineHeight: 22, fontWeight: '400' },
    emptyText: { fontSize: 14, color: C.textTertiary, fontStyle: 'italic' },

    // Inline edit
    input: {
      borderWidth: 1, borderColor: C.border,
      borderRadius: Radius.md,
      padding: 12, fontSize: 15,
      color: C.textPrimary,
      minHeight: 72,
      lineHeight: 22,
      backgroundColor: C.surfaceSecondary,
    },
    inputActions: {
      flexDirection: 'row', justifyContent: 'flex-end',
      alignItems: 'center', gap: 12,
    },
    cancelLink:   { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
    saveBtn:      { backgroundColor: C.ink, borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 9 },
    saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
}

function makeStyles(C: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    safe: { flex: 1 },

    // Header
    header: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.sm,
    },
    title:    { fontSize: 38, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
    subtitle: { fontSize: 13, color: C.textTertiary, marginTop: 4, fontWeight: '500' },

    // Horizon tabs — text pills, no emoji
    tabs: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.base, gap: 8 },
    tab: {
      paddingHorizontal: 18, paddingVertical: 8,
      borderRadius: Radius.full,
      borderWidth: 1.5, borderColor: C.border,
      backgroundColor: C.background,
    },
    tabActive:     { backgroundColor: C.ink, borderColor: C.ink },
    tabText:       { fontSize: 14, fontWeight: '500', color: C.textSecondary },
    tabTextActive: { color: '#fff', fontWeight: '700' },

    // Tagline
    tagline: {
      fontSize: 15,
      color: C.textSecondary,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.base,
      lineHeight: 22,
      fontStyle: 'italic',
    },

    scroll: { paddingHorizontal: Spacing.lg },

    // Bottom CTA
    synapseCTA: {
      marginTop: Spacing.base,
      paddingVertical: 14, paddingHorizontal: 16,
      borderRadius: Radius.lg,
      borderWidth: 1, borderColor: C.primaryMid,
      backgroundColor: C.primaryLight,
    },
    synapseCTAText: { fontSize: 15, color: C.primary, fontWeight: '600' },
  });
}
