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
 *  - Health score dot (green/amber/red based on recent activity)
 *
 * Tab: "Areas"
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Modal, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, parseISO, isWithinInterval } from 'date-fns';
import { useColors, Spacing, Radius, DomainColors } from '../theme';
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

// ── Health score helper ────────────────────────────────────────────────────────

function getHealthScore(area: Area, tasks: any[], habits: any[]): 'green' | 'amber' | 'red' {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const fourteenDaysAgo = subDays(now, 14);

  // Check for task completion in last 7 days
  const taskCompletion = tasks
    .filter(t => t.areaId === area.id && t.completed && t.date)
    .some(t => {
      try {
        const d = parseISO(t.date + 'T00:00:00');
        return isWithinInterval(d, { start: sevenDaysAgo, end: now });
      } catch { return false; }
    });

  if (taskCompletion) return 'green';

  // Check for habit completion in last 7 days
  const habitCompletion = habits
    .filter(h => h.domain === area.domain && h.completedDates && Array.isArray(h.completedDates))
    .some(h => h.completedDates.some((d: string) => {
      try {
        const date = parseISO(d + 'T00:00:00');
        return isWithinInterval(date, { start: sevenDaysAgo, end: now });
      } catch { return false; }
    }));

  if (habitCompletion) return 'green';

  // Check for activity in 4-14 days range
  const midRangeActivity = tasks
    .filter(t => t.areaId === area.id && t.completed && t.date)
    .some(t => {
      try {
        const d = parseISO(t.date + 'T00:00:00');
        return isWithinInterval(d, { start: fourteenDaysAgo, end: sevenDaysAgo });
      } catch { return false; }
    }) || habits
    .filter(h => h.domain === area.domain && h.completedDates && Array.isArray(h.completedDates))
    .some(h => h.completedDates.some((d: string) => {
      try {
        const date = parseISO(d + 'T00:00:00');
        return isWithinInterval(date, { start: fourteenDaysAgo, end: sevenDaysAgo });
      } catch { return false; }
    }));

  if (midRangeActivity) return 'amber';

  return 'red';
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────────

interface AreaModalProps {
  visible: boolean;
  existing?: Area;
  onClose: () => void;
  onSave: (name: string, domain: DomainKey, description: string) => void;
}

function makeModalStyles(C: any) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
    },
    title:    { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    cancel:   { fontSize: 16, color: C.textSecondary },
    saveLink: { fontSize: 16, color: C.primary, fontWeight: '700' },
    scroll:   { padding: Spacing.lg },
    label: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
      color: C.textTertiary, textTransform: 'uppercase',
      marginBottom: 8, marginTop: 20,
    },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: Radius.md,
      padding: 14, fontSize: 16, color: C.textPrimary,
      backgroundColor: C.surface,
    },
    domainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    domainChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
      borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface,
    },
    domainChipText: { fontSize: 14, fontWeight: '500', color: C.textSecondary },
  });
}

function AreaModal({ visible, existing, onClose, onSave }: AreaModalProps) {
  const C = useColors();
  const modalStyles = useMemo(() => makeModalStyles(C), [C]);

  const [name,   setName]   = useState(existing?.name ?? '');
  const [domain, setDomain] = useState<DomainKey>(existing?.domain ?? 'work');
  const [desc,   setDesc]   = useState(existing?.description ?? '');

  React.useEffect(() => {
    if (visible) {
      setName(existing?.name ?? '');
      setDomain(existing?.domain ?? 'work');
      setDesc(existing?.description ?? '');
    }
  }, [visible, existing]);

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
              placeholderTextColor={C.textTertiary}
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
              placeholderTextColor={C.textTertiary}
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

// ── Area Card ──────────────────────────────────────────────────────────────────

function AreaCard({
  area,
  onNavigateDetail,
  onEdit,
  onArchive,
  onAddTask,
}: {
  area: Area;
  onNavigateDetail: (a: Area) => void;
  onEdit: (a: Area) => void;
  onArchive: (a: Area) => void;
  onAddTask: (areaId: string) => void;
}) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const habits = useStore(s => s.habits);
  const tasks  = useStore(s => s.tasks);

  const today         = format(new Date(), 'yyyy-MM-dd');
  const linkedHabits  = habits.filter(h => h.domain === area.domain);
  const todayTasks    = tasks.filter(t => t.areaId === area.id && t.date === today && !t.completed);
  const dc            = DomainColors[area.domain] ?? DomainColors.work;
  const healthScore   = getHealthScore(area, tasks, habits);

  const healthColor = healthScore === 'green' ? '#4ade80' : healthScore === 'amber' ? '#fbbf24' : '#ef4444';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onNavigateDetail(area)}
      activeOpacity={0.82}
      onLongPress={() => onEdit(area)}
    >
      {/* Left colour bar */}
      <View style={[styles.cardBar, { backgroundColor: dc.text }]} />

      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.areaName}>{area.name}</Text>
            {area.description ? (
              <Text style={styles.areaDesc} numberOfLines={1}>{area.description}</Text>
            ) : null}
          </View>

          {/* Health dot */}
          <View
            style={[styles.healthDot, { backgroundColor: healthColor }]}
          />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {linkedHabits.length > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="repeat" size={12} color={C.textTertiary} />
              <Text style={styles.statText}>{linkedHabits.length} habit{linkedHabits.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
          {todayTasks.length > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="checkmark-circle-outline" size={12} color={C.textTertiary} />
              <Text style={styles.statText}>{todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} today</Text>
            </View>
          )}
        </View>
      </View>

      {/* Add Task micro button */}
      <TouchableOpacity
        style={[styles.addTaskBtn, { backgroundColor: C.primaryLight }]}
        onPress={() => onAddTask(area.id)}
        activeOpacity={0.7}
      >
        <Text style={[styles.addTaskBtnText, { color: C.primary }]}>+ Task</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    safe: { flex: 1 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.sm,
    },
    title:    { fontSize: 38, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
    subtitle: { fontSize: 13, color: C.textTertiary, marginTop: 4, fontWeight: '500' },

    addBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.ink,
      alignItems: 'center', justifyContent: 'center',
    },

    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    // Area cards
    card: {
      flexDirection: 'row',
      borderRadius: Radius.lg,
      borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface,
      marginBottom: 10,
      overflow: 'hidden',
      alignItems: 'center',
    },
    cardBar:  { width: 3.5 },
    cardBody: { flex: 1, padding: 14, gap: 6 },

    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    areaName: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    areaDesc: { fontSize: 13, color: C.textSecondary, marginTop: 2 },

    healthDot: {
      width: 10, height: 10, borderRadius: 5,
      marginTop: 2,
    },

    statsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    statChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: C.surfaceSecondary,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
    },
    statText: { fontSize: 12, color: C.textTertiary, fontWeight: '500' },

    addTaskBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radius.full,
      marginRight: 12,
    },
    addTaskBtnText: { fontSize: 12, fontWeight: '600' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIcon:  { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginBottom: 10, textAlign: 'center' },
    emptyBody:  { fontSize: 15, color: C.textSecondary, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
    emptyBtn: {
      backgroundColor: C.ink, borderRadius: Radius.full,
      paddingHorizontal: 28, paddingVertical: 14,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    // Archived section
    archivedSection: { marginTop: Spacing.lg },
    archivedHeader: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    archivedHeaderText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },

    archivedCards: { paddingHorizontal: Spacing.lg },
    archivedCard: {
      flexDirection: 'row',
      borderRadius: Radius.lg,
      borderWidth: 1, borderColor: C.borderLight,
      backgroundColor: C.surfaceSecondary,
      marginBottom: 8,
      overflow: 'hidden',
      paddingHorizontal: 14, paddingVertical: 10,
      opacity: 0.6,
    },
    archivedCardBar: { width: 3.5, marginRight: 10 },
    archivedCardText: { fontSize: 14, color: C.textTertiary, fontWeight: '500' },

    // Skeleton CTA
    skeletonCTA: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: Spacing.base, padding: 16,
      borderRadius: Radius.lg, borderWidth: 1,
      borderColor: C.primaryMid, backgroundColor: C.primaryLight,
    },
    skeletonCTAText: { fontSize: 15, color: C.primary, fontWeight: '600' },

    // Inline quick-add
    quickAddRow: {
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.sm,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    quickAddInput: {
      flex: 1,
      borderWidth: 1, borderColor: C.border, borderRadius: Radius.md,
      padding: 10, fontSize: 14, color: C.textPrimary,
      backgroundColor: C.surface,
    },
    quickAddBtn: {
      paddingHorizontal: 16, paddingVertical: 8,
      borderRadius: Radius.md,
      backgroundColor: C.primary,
    },
    quickAddBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  });
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AreasScreen({ navigation }: any) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const areas        = useStore(s => s.areas);
  const addArea      = useStore(s => s.addArea);
  const updateArea   = useStore(s => s.updateArea);
  const archiveArea  = useStore(s => s.archiveArea);
  const addTask      = useStore(s => s.addTask);

  const [showModal,   setShowModal]   = useState(false);
  const [editingArea, setEditingArea] = useState<Area | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const [addingTaskForAreaId, setAddingTaskForAreaId] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState('');

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

  function handleArchive(area: Area) {
    Alert.alert(
      'Archive Area',
      `Archive "${area.name}"? It'll be hidden but you can restore it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveArea(area.id) },
      ]
    );
  }

  function handleAddTaskClick(areaId: string) {
    setAddingTaskForAreaId(areaId);
    setTaskInput('');
  }

  function handleAddTaskConfirm(areaId: string) {
    if (!taskInput.trim()) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    addTask({
      text: taskInput.trim(),
      areaId,
      date: today,
      isToday: true,
      isMIT: false,
      isInbox: false,
      priority: 'medium',
      completed: false,
    });
    setTaskInput('');
    setAddingTaskForAreaId(null);
  }

  const activeAreas = areas.filter(a => a.isActive && !a.isArchived);
  const archivedAreas = areas.filter(a => a.isArchived);

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
                <React.Fragment key={area.id}>
                  <AreaCard
                    area={area}
                    onNavigateDetail={(a) => navigation.navigate('AreaDetail', { areaId: a.id })}
                    onEdit={openEdit}
                    onArchive={handleArchive}
                    onAddTask={handleAddTaskClick}
                  />
                  {addingTaskForAreaId === area.id && (
                    <View style={styles.quickAddRow}>
                      <TextInput
                        style={styles.quickAddInput}
                        value={taskInput}
                        onChangeText={setTaskInput}
                        placeholder="Task name..."
                        placeholderTextColor={C.textTertiary}
                        autoFocus
                      />
                      <TouchableOpacity
                        style={styles.quickAddBtn}
                        onPress={() => handleAddTaskConfirm(area.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAddBtnText}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setTaskInput('');
                          setAddingTaskForAreaId(null);
                        }}
                      >
                        <Text style={{ color: C.textTertiary }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </React.Fragment>
              ))}

              {/* Skeleton CTA */}
              <TouchableOpacity
                style={styles.skeletonCTA}
                onPress={() => navigation?.navigate('Chat', { mode: 'morning' })}
                activeOpacity={0.82}
              >
                <Ionicons name="calendar-outline" size={18} color={C.primary} />
                <Text style={styles.skeletonCTAText}>Build your weekly time skeleton →</Text>
              </TouchableOpacity>

              {/* Archived section */}
              {archivedAreas.length > 0 && (
                <View style={styles.archivedSection}>
                  <TouchableOpacity
                    style={styles.archivedHeader}
                    onPress={() => setShowArchived(!showArchived)}
                  >
                    <Text style={styles.archivedHeaderText}>
                      {showArchived ? '▼' : '▶'} Archived ({archivedAreas.length})
                    </Text>
                  </TouchableOpacity>

                  {showArchived && (
                    <View style={styles.archivedCards}>
                      {archivedAreas.map(area => {
                        const dc = DomainColors[area.domain] ?? DomainColors.work;
                        return (
                          <View key={area.id} style={styles.archivedCard}>
                            <View style={[styles.archivedCardBar, { backgroundColor: dc.text }]} />
                            <Text style={styles.archivedCardText}>{area.name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
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
