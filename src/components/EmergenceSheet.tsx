/**
 * EmergenceSheet — the "is this what you're building?" modal (Phase 5)
 *
 * When the user opens the app after ~3 days of use, if the background
 * entity extractor has quietly surfaced Areas / Projects / Tasks /
 * Goals, we offer them back one at a time. The user can:
 *
 *   - KEEP   → promote to origin:'confirmed'. Lives in the store like
 *              anything else they created. Gets synced.
 *   - EDIT   → open the name/text inline, then keep.
 *   - KILL   → delete. Gone.
 *   - SKIP   → ask me later.
 *
 * Framing: "Here's what I heard you say you're working on. Help me
 * get it right." — never "I found 7 new things!". Emergence is about
 * the user recognising themselves in the list, not admin.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, useColors } from '../theme';
import {
  useStore, Area, Project, Task, LifeGoal,
} from '../store/useStore';
import {
  EmergenceCandidates, markEmergenceResolved, dismissEmergence,
} from '../services/emergence';

type Kind = 'area' | 'project' | 'task' | 'goal';

interface Candidate {
  id: string;
  kind: Kind;
  displayText: string;
  subtitle?: string;
}

interface Props {
  visible: boolean;
  candidates: EmergenceCandidates;
  onClose: () => void;
}

function flatten(c: EmergenceCandidates): Candidate[] {
  const rows: Candidate[] = [];
  for (const a of c.areas)    rows.push({ id: a.id, kind: 'area',    displayText: a.name,  subtitle: 'Area' });
  for (const p of c.projects) rows.push({ id: p.id, kind: 'project', displayText: p.title, subtitle: 'Project' });
  for (const g of c.goals)    rows.push({ id: g.id, kind: 'goal',    displayText: g.text,  subtitle: `Goal · ${g.horizon}` });
  for (const t of c.tasks)    rows.push({ id: t.id, kind: 'task',    displayText: t.text,  subtitle: 'Task' });
  return rows;
}

export default function EmergenceSheet({ visible, candidates, onClose }: Props) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);

  const confirmArea    = useStore(st => st.confirmArea);
  const confirmProject = useStore(st => st.confirmProject);
  const confirmTask    = useStore(st => st.confirmTask);
  const confirmGoal    = useStore(st => st.confirmGoal);
  const updateArea     = useStore(st => st.updateArea);
  const updateProject  = useStore(st => st.updateProject);
  const updateTask     = useStore(st => st.updateTask);
  const updateGoal     = useStore(st => st.updateGoal);
  const deleteArea     = useStore(st => st.deleteArea);
  const deleteProject  = useStore(st => st.deleteProject);
  const deleteTask     = useStore(st => st.deleteTask);
  const deleteGoal     = useStore(st => st.deleteGoal);

  // Flatten once per open — mutations happen directly on the store,
  // but we don't re-pull while the sheet is open because the user
  // walks through the *initial* list. New inferred entities appear
  // next time.
  const rows = useMemo(
    () => (visible ? flatten(candidates) : []),
    [visible, candidates],
  );

  const [index, setIndex]       = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState('');

  // Reset when opening fresh
  React.useEffect(() => {
    if (visible) {
      setIndex(0);
      setEditMode(false);
      setEditDraft('');
    }
  }, [visible]);

  if (!visible) return null;

  const current = rows[index];
  const total = rows.length;
  const done = index >= total;

  const finish = async () => {
    await markEmergenceResolved();
    onClose();
  };

  const handleKeep = () => {
    if (!current) return;
    const text = editMode ? editDraft.trim() : current.displayText;
    if (editMode && text && text !== current.displayText) {
      // Write the edit first, then confirm.
      applyRename(current, text);
    }
    confirmCandidate(current);
    advance();
  };

  const handleKill = () => {
    if (!current) return;
    deleteCandidate(current);
    advance();
  };

  const handleSkip = () => {
    if (!current) return;
    advance();
  };

  const advance = () => {
    setEditMode(false);
    setEditDraft('');
    if (index + 1 >= total) {
      finish();
    } else {
      setIndex(index + 1);
    }
  };

  const onDismissAll = async () => {
    await dismissEmergence(2);
    onClose();
  };

  // ── confirm / update / delete helpers ────────────────────────────────────

  function confirmCandidate(c: Candidate) {
    switch (c.kind) {
      case 'area':    confirmArea(c.id);    break;
      case 'project': confirmProject(c.id); break;
      case 'task':    confirmTask(c.id);    break;
      case 'goal':    confirmGoal(c.id);    break;
    }
  }
  function deleteCandidate(c: Candidate) {
    switch (c.kind) {
      case 'area':    deleteArea(c.id);    break;
      case 'project': deleteProject(c.id); break;
      case 'task':    deleteTask(c.id);    break;
      case 'goal':    deleteGoal(c.id);    break;
    }
  }
  function applyRename(c: Candidate, text: string) {
    switch (c.kind) {
      case 'area':    updateArea(c.id,    { name:  text } as Partial<Area>);    break;
      case 'project': updateProject(c.id, { title: text } as Partial<Project>); break;
      case 'task':    updateTask(c.id,    { text         } as Partial<Task>);   break;
      case 'goal':    updateGoal(c.id,    { text         } as Partial<LifeGoal>); break;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismissAll}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.root}
      >
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onDismissAll}
        />
        <View style={s.card}>
          {done || !current ? (
            <View>
              <Text style={s.title}>All caught up.</Text>
              <Text style={s.body}>
                That's everything I'd been holding. Thanks for letting me know what's real.
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={finish} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.eyebrowRow}>
                <View style={s.eyebrowDot} />
                <Text style={s.eyebrow}>Is this you?</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.pageCount}>{index + 1} of {total}</Text>
              </View>

              <Text style={s.lead}>
                I heard you mention this. Want me to keep it?
              </Text>

              <View style={s.candidateCard}>
                <Text style={s.candidateKind}>{current.subtitle}</Text>
                {editMode ? (
                  <TextInput
                    value={editDraft}
                    onChangeText={setEditDraft}
                    style={s.candidateInput}
                    autoFocus
                    multiline
                  />
                ) : (
                  <Text style={s.candidateText}>{current.displayText}</Text>
                )}
              </View>

              <View style={s.actions}>
                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={handleKeep}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark" size={16} color={C.textInverse} />
                  <Text style={s.primaryBtnText}>Keep{editMode ? ' (edited)' : ''}</Text>
                </TouchableOpacity>

                {!editMode && (
                  <TouchableOpacity
                    style={s.ghostBtn}
                    onPress={() => {
                      setEditMode(true);
                      setEditDraft(current.displayText);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="pencil-outline" size={15} color={C.textSecondary} />
                    <Text style={s.ghostBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={s.killBtn}
                  onPress={handleKill}
                  activeOpacity={0.75}
                >
                  <Ionicons name="close" size={16} color={C.error} />
                  <Text style={s.killBtnText}>Not me</Text>
                </TouchableOpacity>
              </View>

              <View style={s.footerRow}>
                <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.footerLink}>Skip for now</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onDismissAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.footerLink}>Ask me later</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    card: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.lg,
      minHeight: 340,
      maxHeight: '75%',
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: Spacing.md,
    },
    eyebrowDot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: C.accent,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    pageCount: {
      fontSize: 11,
      color: C.textTertiary,
      fontWeight: '600',
    },

    title: {
      fontSize: 24,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    body: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 20,
      marginBottom: Spacing.base,
    },
    lead: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.base,
    },

    candidateCard: {
      padding: Spacing.base,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: Spacing.base,
    },
    candidateKind: {
      fontSize: 10,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    candidateText: {
      fontSize: 20,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 26,
    },
    candidateInput: {
      fontSize: 20,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 26,
      backgroundColor: C.surface,
      borderRadius: Radius.md,
      padding: 10,
      minHeight: 60,
    },

    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.base,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      paddingVertical: 11,
      backgroundColor: C.ink,
      borderRadius: Radius.full,
    },
    primaryBtnText: {
      color: C.textInverse,
      fontSize: 14,
      fontWeight: '700',
    },
    ghostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 11,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
    },
    ghostBtnText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    killBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 11,
      backgroundColor: C.errorLight,
      borderRadius: Radius.full,
    },
    killBtnText: {
      color: C.error,
      fontSize: 14,
      fontWeight: '600',
    },

    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
    },
    footerLink: {
      fontSize: 12,
      color: C.textTertiary,
      fontWeight: '600',
    },
  });
}
