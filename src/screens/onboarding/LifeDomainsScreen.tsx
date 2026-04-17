import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParams } from '../../navigation';
import { Colors, Typography, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../../theme';
import { useStore, DomainKey, ALL_DOMAINS } from '../../store/useStore';

type Props = { navigation: NativeStackNavigationProp<RootStackParams, any> };

const DOMAIN_LABELS: Record<DomainKey, string> = {
  health:        'Health & Body',
  work:          'Career & Work',
  relationships: 'Relationships',
  finances:      'Finance & Wealth',
  learning:      'Learning & Growth',
  creativity:    'Creativity',
  personal:      'Mind & Spirit',
  community:     'Community & Giving',
};

export default function LifeDomainsScreen({ navigation }: Props) {
  const updateProfile = useStore(s => s.updateProfile);
  const existing = useStore(s => s.profile.selectedDomains);
  const [selected, setSelected] = useState<DomainKey[]>(existing);

  const toggle = (d: DomainKey) => {
    setSelected(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  };

  const proceed = () => {
    updateProfile({ selectedDomains: selected });
    (navigation as any).navigate('GoalSetting');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.step}>Step 1 of 3</Text>
          <Text style={styles.title}>Which areas of life{'\n'}matter most to you?</Text>
          <Text style={styles.sub}>
            Select at least 3 domains. Aiteall will use these to structure your goals and categorise your work.
          </Text>
        </View>

        <View style={styles.grid}>
          {ALL_DOMAINS.map((domain) => {
            const isSelected = selected.includes(domain);
            const dc = DomainColors[domain];
            return (
              <TouchableOpacity
                key={domain}
                style={[
                  styles.domainCard,
                  Shadow.sm,
                  isSelected && { borderColor: dc.text, borderWidth: 2, backgroundColor: dc.bg },
                ]}
                onPress={() => toggle(domain)}
                activeOpacity={0.75}
              >
                <Text style={styles.domainIcon}>{DomainIcons[domain]}</Text>
                <Text style={[styles.domainName, isSelected && { color: dc.text, fontWeight: Typography.weight.bold }]}>
                  {DOMAIN_LABELS[domain]}
                </Text>
                {isSelected && <Text style={[styles.check, { color: dc.text }]}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Text style={styles.count}>{selected.length} selected</Text>
          <TouchableOpacity
            style={[styles.btn, selected.length < 3 && styles.btnDisabled]}
            onPress={proceed}
            disabled={selected.length < 3}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl, paddingBottom: Spacing['3xl'] },
  header: { marginBottom: Spacing.xl },
  step: { fontSize: Typography.size.sm, color: Colors.primary, fontWeight: Typography.weight.semibold, marginBottom: 8 },
  title: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.textPrimary, lineHeight: 36, marginBottom: 12 },
  sub: { fontSize: Typography.size.base, color: Colors.textMuted, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: Spacing.xl },
  domainCard: {
    width: '47%', backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: Spacing.base, alignItems: 'flex-start', borderWidth: 2, borderColor: Colors.border,
    position: 'relative',
  },
  domainIcon: { fontSize: 26, marginBottom: 8 },
  domainName: { fontSize: Typography.size.sm, color: Colors.text, lineHeight: 18 },
  check: { position: 'absolute', top: 10, right: 12, fontSize: 16, fontWeight: Typography.weight.bold },
  footer: { alignItems: 'center' },
  count: { fontSize: Typography.size.sm, color: Colors.textMuted, marginBottom: 12 },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 18, width: '100%', alignItems: 'center',
  },
  btnDisabled: { backgroundColor: Colors.gray200 },
  btnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
});
