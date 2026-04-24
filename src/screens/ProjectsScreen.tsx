import React, { useState, useMemo, useCallback } from 'react';
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
import { Colors, Spacing, Radius, Shadow, DomainColors, DomainIcons, useColors } from '../theme';
import { useStore, Project } from '../store/useStore';

type Nav = NativeStackNavigationProp<RootStackParams>;

function ProjectCard({ project }: { project: Project }) {
  const navigation = useNavigation<Nav>();
  const C = useColors();
  // CP1.5: daysLeft removed.
  // CP1.6: completed/total/pct/dc accent computations removed with the
  // progress bar. At rest a project card is a name + a one-line
  // description. Progress surfaces inside ProjectDetail, which the user
  // opens deliberately.
  const styles = useMemo(() => makeStyles_card(C), [C]);

  return (
    <TouchableOpacity
      style={[styles.card, Shadow.sm]}
      onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id })}
      activeOpacity={0.85}
    >
      <Text style={styles.cardTitle}>{project.title}</Text>
      {project.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{project.description}</Text>
      ) : null}

      {!project.isDecomposed && (
        <View style={[styles.decomposeBadge, { backgroundColor: C.primaryLight }]}>
          <Text style={[styles.decomposeText, { color: C.primary }]}>Plan with AI →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function AddProjectModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useColors();
  const addProject = useStore(s => s.addProject);
  const areas = useStore(s => s.areas).filter(a => a.isActive && !a.isArchived);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [deadline,    setDeadline]    = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(undefined);
  const styles = useMemo(() => makeStyles_modal(C), [C]);

  function save() {
    if (!title.trim()) { Alert.alert('Give your project a name'); return; }
    addProject({ title: title.trim(), description: description.trim(), domain: 'work', deadline: deadline || undefined, status: 'active', areaId: selectedAreaId });
    setTitle(''); setDescription(''); setDeadline(''); setSelectedAreaId(undefined);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
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
              placeholder="What are you working on?" placeholderTextColor={C.textTertiary} autoFocus
            />

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={description} onChangeText={setDescription}
              placeholder="What does success look like?" placeholderTextColor={C.textTertiary} multiline
            />

            <Text style={styles.fieldLabel}>Target date (optional)</Text>
            <TextInput
              style={styles.input} value={deadline} onChangeText={setDeadline}
              placeholder="YYYY-MM-DD" placeholderTextColor={C.textTertiary}
            />

            {areas.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Area (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.domainChip, !selectedAreaId && { backgroundColor: C.ink, borderColor: C.ink }]}
                      onPress={() => setSelectedAreaId(undefined)}
                    >
                      <Text style={[styles.domainChipText, !selectedAreaId && { color: '#fff' }]}>None</Text>
                    </TouchableOpacity>
                    {areas.map(a => {
                      const dc = DomainColors[a.domain];
                      const selected = selectedAreaId === a.id;
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={[styles.domainChip, selected && { backgroundColor: dc.bg, borderColor: dc.text }]}
                          onPress={() => setSelectedAreaId(a.id)}
                        >
                          <Text style={[styles.domainChipText, selected && { color: dc.text, fontWeight: '600' }]}>{a.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

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
  const C = useColors();
  const projects = useStore(s => s.projects);
  const [showAdd, setShowAdd] = useState(false);
  const [filter,  setFilter]  = useState<'active' | 'all'>('active');
  const styles = useMemo(() => makeStyles(C), [C]);

  const shown = useMemo(
    () => filter === 'active' ? projects.filter(p => p.status === 'active') : projects,
    [filter, projects],
  );
  const renderProject = useCallback(({ item }: { item: typeof projects[0] }) =>
    <ProjectCard project={item} />, []);

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
        renderItem={renderProject}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        ListEmptyComponent={
          // CP1.7: empty state rewritten without the implicit "you
          // should have one" framing. "No projects yet" → "Nothing here
          // yet." Nothing here is a state, not a failure.
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>When you've got something bigger on your mind — the kind of thing that needs more than one step — this is where it lives.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyBtnText}>Add one</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <AddProjectModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: C.background },

    // Header — editorial large title
    header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.md },
    screenTitle: { fontSize: 38, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 40 },
    addBtn:      { backgroundColor: C.ink, borderRadius: Radius.full, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 4 },
    addBtnText:  { color: '#FFF', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

    // Filter pills
    filterRow:           { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: 8, marginBottom: Spacing.md },
    filterTab:           { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border },
    filterTabActive:     { backgroundColor: C.ink, borderColor: C.ink },
    filterTabText:       { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    filterTabTextActive: { color: '#FFF', fontWeight: '700' },

    // List + Cards
    list: { padding: Spacing.base, paddingBottom: 120 },
    card: {
      backgroundColor: C.surface,
      borderRadius: Radius.xl,
      padding: Spacing.base,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    deadline:     { fontSize: 12, color: C.textTertiary, fontWeight: '500', marginBottom: 6 },
    cardTitle:    { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
    cardDesc:     { fontSize: 14, color: C.textSecondary, lineHeight: 21, marginBottom: 8 },
    progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    progressTrack:     { flex: 1, height: 3, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' },
    progressFill:      { height: 3, borderRadius: 2 },
    progressLabel:     { fontSize: 11, color: C.textTertiary, fontWeight: '500' },
    decomposeBadge:    { marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.sm, alignSelf: 'flex-start' },
    decomposeText:     { fontSize: 12, fontWeight: '600' },

    // Empty state — warm, editorial
    empty:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 24, fontWeight: '800', color: C.textPrimary, marginBottom: 10, letterSpacing: -0.5 },
    emptySub:   { fontSize: 15, color: C.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
    emptyBtn:   { backgroundColor: C.ink, borderRadius: Radius.full, paddingHorizontal: 28, paddingVertical: 16 },
    emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // Modal — clean page sheet
    modalScroll:  { padding: Spacing.lg, paddingBottom: 40 },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
    modalTitle:   { fontSize: 30, fontWeight: '800', color: C.textPrimary, letterSpacing: -1 },
    closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    closeText:    { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
    fieldLabel:   { fontSize: 11, fontWeight: '700', color: C.textTertiary, marginBottom: 8, marginTop: 16, letterSpacing: 1, textTransform: 'uppercase' },
    input:        { borderWidth: 1.5, borderColor: C.border, borderRadius: Radius.md, padding: 16, fontSize: 16, color: C.textPrimary, backgroundColor: C.surfaceSecondary, marginBottom: 4 },
    domainChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.background },
    domainChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    saveBtn:      { backgroundColor: C.ink, borderRadius: Radius.full, paddingVertical: 18, alignItems: 'center' },
    saveBtnText:  { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  });
}

function makeStyles_card(C: any) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: Radius.xl,
      padding: Spacing.base,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    deadline:     { fontSize: 12, color: C.textTertiary, fontWeight: '500', marginBottom: 6 },
    cardTitle:    { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
    cardDesc:     { fontSize: 14, color: C.textSecondary, lineHeight: 21, marginBottom: 8 },
    progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    progressTrack:     { flex: 1, height: 3, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' },
    progressFill:      { height: 3, borderRadius: 2 },
    progressLabel:     { fontSize: 11, color: C.textTertiary, fontWeight: '500' },
    decomposeBadge:    { marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.sm, alignSelf: 'flex-start' },
    decomposeText:     { fontSize: 12, fontWeight: '600' },
  });
}

function makeStyles_modal(C: any) {
  return StyleSheet.create({
    modalScroll:  { padding: Spacing.lg, paddingBottom: 40 },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
    modalTitle:   { fontSize: 30, fontWeight: '800', color: C.textPrimary, letterSpacing: -1 },
    closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    closeText:    { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
    fieldLabel:   { fontSize: 11, fontWeight: '700', color: C.textTertiary, marginBottom: 8, marginTop: 16, letterSpacing: 1, textTransform: 'uppercase' },
    input:        { borderWidth: 1.5, borderColor: C.border, borderRadius: Radius.md, padding: 16, fontSize: 16, color: C.textPrimary, backgroundColor: C.surfaceSecondary, marginBottom: 4 },
    domainChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.background },
    domainChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    saveBtn:      { backgroundColor: C.ink, borderRadius: Radius.full, paddingVertical: 18, alignItems: 'center' },
    saveBtnText:  { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  });
}
