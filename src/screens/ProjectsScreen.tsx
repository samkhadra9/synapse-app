import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, TextInput, Modal, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, parseISO, differenceInDays } from 'date-fns';
import { RootStackParams } from '../navigation';
import { Colors, Spacing, Radius, Shadow, DomainColors, DomainIcons } from '../theme';
import { useStore, Project, DomainKey, ALL_DOMAINS } from '../store/useStore';

type Nav = NativeStackNavigationProp<RootStackParams>;

function ProjectCard({ project }: { project: Project }) {
  const navigation = useNavigation<Nav>();
  const completed = project.tasks.filter(t => t.completed).length;
  const total     = project.tasks.length;
  const pct       = total > 0 ? completed / total : 0;
  const dc        = DomainColors[project.domain] ?? DomainColors.work;
  const daysLeft  = project.deadline
    ? differenceInDays(parseISO(project.deadline), new Date())
    : null;

  return (
    <TouchableOpacity
      style={[styles.card, Shadow.sm]}
      onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={[styles.domainBadge, { backgroundColor: dc.bg, borderColor: dc.border }]}>
          <Text style={styles.domainBadgeIcon}>{DomainIcons[project.domain] ?? '📁'}</Text>
          <Text style={[styles.domainBadgeText, { color: dc.text }]}>
            {project.domain.charAt(0).toUpperCase() + project.domain.slice(1)}
          </Text>
        </View>
        {daysLeft !== null && (
          <Text style={[styles.deadline, daysLeft < 7 && { color: Colors.error }]}>
            {daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
          </Text>
        )}
      </View>

      <Text style={styles.cardTitle}>{project.title}</Text>
      {project.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{project.description}</Text>
      ) : null}

      {total > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: dc.text }]} />
          </View>
          <Text style={styles.progressLabel}>{completed}/{total} tasks</Text>
        </View>
      )}

      {!project.isDecomposed && (
        <View style={[styles.decomposeBadge, { backgroundColor: Colors.primaryLight }]}>
          <Text style={[styles.decomposeText, { color: Colors.primary }]}>🤖 Tap to plan with AI</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function AddProjectModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const addProject = useStore(s => s.addProject);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [domain,      setDomain]      = useState<DomainKey>('work');
  const [deadline,    setDeadline]    = useState('');

  function save() {
    if (!title.trim()) { Alert.alert('Give your project a name'); return; }
    addProject({ title: title.trim(), description: description.trim(), domain, deadline: deadline || undefined, status: 'active' });
    setTitle(''); setDescription(''); setDeadline('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New project</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input} value={title} onChangeText={setTitle}
              placeholder="What are you working on?" placeholderTextColor={Colors.textTertiary} autoFocus
            />

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={description} onChangeText={setDescription}
              placeholder="What does success look like?" placeholderTextColor={Colors.textTertiary} multiline
            />

            <Text style={styles.fieldLabel}>Deadline (optional)</Text>
            <TextInput
              style={styles.input} value={deadline} onChangeText={setDeadline}
              placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.fieldLabel}>Area of life</Text>
            <View style={styles.domainGrid}>
              {ALL_DOMAINS.map(d => {
                const dc = DomainColors[d] ?? DomainColors.work;
                const selected = domain === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.domainChip, selected && { backgroundColor: dc.bg, borderColor: dc.text }]}
                    onPress={() => setDomain(d)}
                  >
                    <Text>{DomainIcons[d] ?? '📁'}</Text>
                    <Text style={[styles.domainChipText, selected && { color: dc.text, fontWeight: '600' }]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={save} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Create project</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default function ProjectsScreen() {
  const projects = useStore(s => s.projects);
  const [showAdd, setShowAdd] = useState(false);
  const [filter,  setFilter]  = useState<'active' | 'all'>('active');

  const shown = filter === 'active' ? projects.filter(p => p.status === 'active') : projects;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Projects</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['active', 'all'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f === 'active' ? 'Active' : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={p => p.id}
        renderItem={({ item }) => <ProjectCard project={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptySub}>Projects are things you're building with a clear outcome. Add your first one to get started.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyBtnText}>+ Add your first project</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <AddProjectModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },

  // Header — editorial large title
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.md },
  screenTitle: { fontSize: 38, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1.5, lineHeight: 40 },
  addBtn:      { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 4 },
  addBtnText:  { color: '#FFF', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

  // Filter pills
  filterRow:           { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: 8, marginBottom: Spacing.md },
  filterTab:           { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border },
  filterTabActive:     { backgroundColor: Colors.ink, borderColor: Colors.ink },
  filterTabText:       { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterTabTextActive: { color: '#FFF', fontWeight: '700' },

  // List + Cards — Abby-style bordered, no heavy shadow
  list: { padding: Spacing.base, paddingBottom: 120 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  domainBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  domainBadgeIcon: { fontSize: 11 },
  domainBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  deadline:     { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },
  cardTitle:    { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  cardDesc:     { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 8 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  progressTrack:     { flex: 1, height: 3, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  progressFill:      { height: 3, borderRadius: 2 },
  progressLabel:     { fontSize: 11, color: Colors.textTertiary, fontWeight: '500' },
  decomposeBadge:    { marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  decomposeText:     { fontSize: 12, fontWeight: '600' },

  // Empty state — warm, editorial
  empty:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44, marginBottom: 20 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, letterSpacing: -0.5 },
  emptySub:   { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  emptyBtn:   { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingHorizontal: 28, paddingVertical: 16 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Modal — clean page sheet
  modalScroll:  { padding: Spacing.lg, paddingBottom: 40 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle:   { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  closeText:    { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: Colors.textTertiary, marginBottom: 8, marginTop: 16, letterSpacing: 1, textTransform: 'uppercase' },
  input:        { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: 16, fontSize: 16, color: Colors.textPrimary, backgroundColor: Colors.surfaceSecondary, marginBottom: 4 },
  domainGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.xl },
  domainChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  domainChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  saveBtn:      { backgroundColor: Colors.ink, borderRadius: Radius.full, paddingVertical: 18, alignItems: 'center' },
  saveBtnText:  { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
