import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParams } from '../../navigation';
import { Colors, Typography, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../../theme';
import { useStore, LifeDomain, TimeHorizon } from '../../store/useStore';

type Props = { navigation: NativeStackNavigationProp<RootStackParams, any> };

const HORIZONS: { key: TimeHorizon; label: string; sub: string }[] = [
  { key: '1year',   label: '1 Year',   sub: 'Where do you want to be in 12 months?' },
  { key: '5year',   label: '5 Years',  sub: 'What does life look like at your best?' },
  { key: '10year',  label: '10 Years', sub: 'Your biggest possible vision.' },
];

const DOMAIN_LABELS: Record<string, string> = {
  health:        'Health',
  work:          'Career',
  relationships: 'Relationships',
  finances:      'Finance',
  learning:      'Learning',
  creativity:    'Creativity',
  personal:      'Spirit & Mindset',
  community:     'Community',
};

export default function GoalSettingScreen({ navigation }: Props) {
  const selectedDomains = useStore(s => s.profile.selectedDomains);
  const addGoal = useStore(s => s.addGoal);
  const [activeHorizon, setActiveHorizon] = useState<TimeHorizon>('1year');
  const [goals, setGoals] = useState<Partial<Record<LifeDomain, string>>>({});

  const setGoal = (domain: LifeDomain, text: string) => {
    setGoals(prev => ({ ...prev, [domain]: text }));
  };

  const proceed = () => {
    // Save all entered goals
    selectedDomains.forEach(domain => {
      const text = goals[domain];
      if (text?.trim()) {
        addGoal({ domain, horizon: activeHorizon, text: text.trim(), milestones: [] });
      }
    });
    (navigation as any).navigate('SMSSetup');
  };

  const filledCount = selectedDomains.filter(d => goals[d]?.trim()).length;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={20}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.step}>Step 2 of 3</Text>
            <Text style={styles.title}>Set your goals</Text>
            <Text style={styles.sub}>
              Where do you want to be? Even rough answers help Synapse prioritise what matters. You can always update these.
            </Text>
          </View>

          {/* Horizon tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizonScroll}>
            {HORIZONS.map(h => (
              <TouchableOpacity
                key={h.key}
                style={[styles.horizonTab, activeHorizon === h.key && styles.horizonActive]}
                onPress={() => setActiveHorizon(h.key)}
              >
                <Text style={[styles.horizonLabel, activeHorizon === h.key && styles.horizonLabelActive]}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.horizonSub}>
            {HORIZONS.find(h => h.key === activeHorizon)?.sub}
          </Text>

          {/* Goal inputs per domain */}
          <View style={styles.goalList}>
            {selectedDomains.map(domain => {
              const dc = DomainColors[domain];
              return (
                <View key={domain} style={[styles.goalCard, Shadow.sm]}>
                  <View style={styles.goalCardHeader}>
                    <Text style={styles.goalIcon}>{DomainIcons[domain]}</Text>
                    <Text style={[styles.goalDomain, { color: dc.text }]}>
                      {DOMAIN_LABELS[domain]}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.goalInput}
                    placeholder={`What does success look like in ${DOMAIN_LABELS[domain].toLowerCase()}?`}
                    placeholderTextColor={Colors.textLight}
                    multiline
                    numberOfLines={2}
                    value={goals[domain] ?? ''}
                    onChangeText={t => setGoal(domain, t)}
                    returnKeyType="done"
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={styles.count}>{filledCount} of {selectedDomains.length} goals set</Text>
            <TouchableOpacity style={styles.btn} onPress={proceed} activeOpacity={0.85}>
              <Text style={styles.btnText}>
                {filledCount === 0 ? 'Skip for now →' : 'Save & Continue →'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerNote}>You can add more goals anytime from the Goals tab</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl, paddingBottom: Spacing['3xl'] },
  header: { marginBottom: Spacing.lg },
  step: { fontSize: Typography.size.sm, color: Colors.primary, fontWeight: Typography.weight.semibold, marginBottom: 8 },
  title: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.textPrimary, marginBottom: 10 },
  sub: { fontSize: Typography.size.base, color: Colors.textMuted, lineHeight: 22 },
  horizonScroll: { marginBottom: Spacing.sm },
  horizonTab: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, marginRight: 8,
    backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.border,
  },
  horizonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  horizonLabel: { fontSize: Typography.size.sm, color: Colors.gray600, fontWeight: Typography.weight.medium },
  horizonLabelActive: { color: Colors.white, fontWeight: Typography.weight.bold },
  horizonSub: { fontSize: Typography.size.sm, color: Colors.textMuted, marginBottom: Spacing.lg, fontStyle: 'italic' },
  goalList: { gap: 12, marginBottom: Spacing.xl },
  goalCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.base },
  goalCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  goalIcon: { fontSize: 20, marginRight: 8 },
  goalDomain: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
  goalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.size.base, color: Colors.text,
    minHeight: 60, textAlignVertical: 'top', lineHeight: 22,
  },
  footer: { alignItems: 'center', marginTop: Spacing.sm },
  count: { fontSize: Typography.size.sm, color: Colors.textMuted, marginBottom: 12 },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 18, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  btnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
  footerNote: { fontSize: Typography.size.xs, color: Colors.textLight, textAlign: 'center' },
});
