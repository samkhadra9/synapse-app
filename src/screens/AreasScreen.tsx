/**
 * AreasScreen — Synapse V2
 *
 * Shows the user's life Areas (ongoing domains — Health, Work, Relationships…).
 * Areas are never "done" — they're the recurring commitments and contexts
 * that give life its structure.
 *
 * Each area card shows:
 *  - Area name + domain colour
 *  - Description
 *  - Linked habits count
 *  - Linked tasks today count
 *
 * Tab: "Areas" (renamed from Goals)
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Modal, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, Radius, DomainColors } from '../theme';
import { useStore, Area, DomainKey, ALL_DOMAINS } from '../store/useStore';

// ── Constants ──────────────────────────────────────────────────────────────────

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

const DOMAIN_DESCRIPTIONS: Record<DomainKey, string> = {
  work:          'Career, projects, professional growth',
  health:        'Physical fitness, sleep, nutrition, energy',
  relationships: 'Family, friends, partner, community',
  personal:      'Identity, values, personal development',
  finances:      'Income, savings, investments, budget',
  learning:      'Skills, reading, education, curiosity',
  creativity:    'Art, writing, music, making things',
  community:     'Giving back, volunteering, social impact',
};

// ── Add / Edit Modal ───────────────────────────────────────────────────────────

interface AreaModalProps {
  visible: boolean;
  existing?: Area;
  onClose: () => void;
  onSave: (name: string, domain: DomainKey, description: string) => void;
}

function AreaModal({ visible, existing, onClose, onSave }: AreaModalProps) {
  const [name,   setName]   = useState(existing?.name ?? '');
  const [domain, setDomain] = useState<DomainKey>(existing?.domain ?? 'work');
  const [desc,   setDesc]   = useState(existing?.description ?? '');

  React.useEffect(() => {
    if (visible) {
      setName(existing?.name ?? '');
      setDomain(existing?.domain ?? 'work');
      setDesc(existing?.description ?? '');
    }
  }, [visible]);

  function handleSave() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this area a name.'); return; }
    onSave(name.trim(), domain, desc.trim());
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={modalStyles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modalStyles.title}>{existing ? 'Edit Area' : 'New Area'}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={modalStyles.saveLink}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modalStyles.scroll} keyboardShouldPersistTaps="handled">

            {/* Name */}
            <Text style={modalStyles.label}>AREA NAME</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Physical Health"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
            />

            {/* Domain */}
            <Text style={modalStyles.label}>LIFE DOMAIN</Text>
            <View style={modalStyles.domainGrid}>
              {ALL_DOMAINS.map(d => {
                const active = domain === d;
                const dc = DomainColors[d];
                return (
                  <TouchableOpacity
                    key={d}
                    style={[modalStyles.domainChip, active && { backgroundColor: dc.text, borderColor: dc.text }]}
                    onPress={() => setDomain(d)}
                    activeOpacity={0.75}
                  >
                    <Text style={[modalStyles.domainChipText, active && { color: '#fff' }]}>
                      {DOMAIN_LABELS[d]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <Text style={modalStyles.label}>DESCRIPTION (optional)</Text>
            <TextInput
              style={[modalStyles.input, { minHeight: 80 }]}
              value={desc}
              onChangeText={setDesc}
              placeholder={DOMAIN_DESCRIPTIONS[domain]}
              placeholderTextColor={Colors.textTertiary}
              multiline
              textAlignVertical="top"
            />

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderLight,
  },
  title:    { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  cancel:   { fontSize: 16, color: Colors.textSecondary },
  saveLink: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
  scroll:   { padding: Spacing.lg },
  label: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    color: Colors.textTertiary, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 20,
  },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 14, fontSize: 16, color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  domainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  domainChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  domainChipText: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
});

// ── Area Card ──────────────────────────────────────────────────────────────────

function AreaCard({ area, onEdit }: { area: Area; onEdit: (a: Area) => void }) {
  const habits = useStore(s => s.habits);
  const tasks  = useStore(s => s.tasks);

  const today         = format(new Date(), 'yyyy-MM-dd');
  const linkedHabits  = habits.filter(h => h.domain === area.domain);
  const todayTasks    = tasks.filter(t => t.areaId === area.id && t.date === today && !t.completed);
  const dc            = DomainColors[area.domain] ?? DomainColors.work;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onEdit(area)}
      activeOpacity={0.82}
    >
      {/* Left colour bar */}
      <View style={[styles.cardBar, { backgroundColor: dc.text }]} />

      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <Text style={styles.areaName}>{area.name}</Text>
          <Text style={[styles.domainBadge, { color: dc.text }]}>
            {DOMAIN_LABELS[area.domain]}
          </Text>
        </View>

        {/* Description */}
        {area.description ? (
          <Text style={styles.areaDesc} numberOfLines={2}>{area.description}</Text>
        ) : null}

        {/* Stats row */}
        <View style={styles.statsRow}>
          {linkedHabits.length > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="repeat" size={12} color={Colors.textTertiary} />
              <Text style={styles.statText}>{linkedHabits.length} habit{linkedHabits.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
          {todayTasks.length > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="checkmark-circle-outline" size={12} color={Colors.textTertiary} />
              <Text style={styles.statText}>{todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} today</Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ alignSelf: 'center', marginRight: 14 }} />
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AreasScreen({ navigation }: any) {
  const areas      = useStore(s => s.areas);
  const addArea    = useStore(s => s.addArea);
  const updateArea = useStore(s => s.updateArea);
  const deleteArea = useStore(s => s.deleteArea);

  const [showModal,   setShowModal]   = useState(false);
  const [editingArea, setEditingArea] = useState<Area | undefined>(undefined);

  function openAdd() {
    setEditingArea(undefined);
    setShowModal(true);
  }

  function openEdit(area: Area) {
    setEditingArea(area);
    setShowModal(true);
  }

  function handleSave(name: string, domain: DomainKey, description: string) {
    if (editingArea) {
      updateArea(editingArea.id, { name, domain, description });
    } else {
      addArea({ name, domain, description, isActive: true });
    }
  }

  function handleDelete(area: Area) {
    Alert.alert(
      'Delete Area',
      `Remove "${area.name}"? This won't delete tasks or habits linked to it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => deleteArea(area.id),
        },
      ]
    );
  }

  const activeAreas = areas.filter(a => a.isActive);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Areas</Text>
            <Text style={styles.subtitle}>The ongoing domains of your life</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {activeAreas.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🌿</Text>
              <Text style={styles.emptyTitle}>No areas yet</Text>
              <Text style={styles.emptyBody}>
                Areas are the ongoing parts of your life — health, work, relationships.
                They don't have an end date. They just matter.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
                <Text style={styles.emptyBtnText}>Add your first area</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {activeAreas.map(area => (
                <AreaCard key={area.id} area={area} onEdit={openEdit} />
              ))}

              {/* Skeleton CTA */}
              <TouchableOpacity
                style={styles.skeletonCTA}
                onPress={() => navigation?.navigate('Chat', { mode: 'morning' })}
                activeOpacity={0.82}
              >
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                <Text style={styles.skeletonCTAText}>Build your weekly time skeleton →</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>

      </SafeAreaView>

      <AreaModal
        visible={showModal}
        existing={editingArea}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  title:    { fontSize: 38, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
  subtitle: { fontSize: 13, color: Colors.textTertiary, marginTop: 4, fontWeight: '500' },

  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  // Area cards
  card: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardBar:  { width: 3.5 },
  cardBody: { flex: 1, padding: 14, gap: 6 },

  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  areaName: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  domainBadge: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 8 },
  areaDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  statText: { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
  emptyBody:  { fontSize: 15, color: Colors.textSecondary, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
  emptyBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.full,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Skeleton CTA
  skeletonCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: Spacing.base, padding: 16,
    borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.primaryMid, backgroundColor: Colors.primaryLight,
  },
  skeletonCTAText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
});
