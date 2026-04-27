/**
 * PortraitScreen — the "You" tab. Hero feature of the app.
 *
 * This is the app's answer to "what does this thing actually know about
 * me?". Five sections, second-person voice, editable. The portrait is
 * written by the AI in the background (see portraitV2.ts) as a
 * byproduct of real conversations — the user never fills in a form.
 *
 * Design intent:
 * - Calm, editorial layout. This is where the user slows down.
 * - Show the "last updated" stamps so the portrait feels alive.
 * - "What changed this week" pill surfaces recent movement.
 * - Each section is editable inline — taps open a textarea, save
 *   writes with source: 'user' so the AI will respect the edit.
 * - Export to markdown (copy / share) — the user owns their portrait.
 * - Empty state for new users is gentle: "I'll get to know you."
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, Share, Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { Spacing, Radius, useColors } from '../theme';
import { useStore, PortraitSectionKey, makeEmptyPortrait } from '../store/useStore';
import { portraitToMarkdown, recentPortraitChanges, refreshPortrait } from '../services/portraitV2';

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_ORDER: PortraitSectionKey[] = [
  'howYouWork',
  'whatYoureBuilding',
  'whatGetsInTheWay',
  'whereYoureGoing',
  'whatIDontKnowYet',
];

const SECTION_META: Record<PortraitSectionKey, {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  emptyText: string;
}> = {
  howYouWork: {
    label: 'How you work',
    icon: 'pulse-outline',
    emptyText: "We haven't talked enough for me to see how you work yet. Keep going — I'm listening.",
  },
  whatYoureBuilding: {
    label: "What you're building",
    icon: 'construct-outline',
    emptyText: "You haven't told me what you're building yet. Mention it in chat and I'll remember.",
  },
  whatGetsInTheWay: {
    label: 'What gets in the way',
    icon: 'alert-circle-outline',
    emptyText: "When we hit a sticky loop, I'll notice it and name it here.",
  },
  whereYoureGoing: {
    label: "Where you're going",
    icon: 'compass-outline',
    emptyText: "Your horizon will come into focus as your choices accumulate.",
  },
  whatIDontKnowYet: {
    label: "What I don't know yet",
    icon: 'help-circle-outline',
    emptyText: "Everything. Tell me what matters.",
  },
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PortraitScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);

  const profile                  = useStore(st => st.profile);
  // CP9.2 — pick the active portrait based on the lens. Both portraits
  // exist independently; switching the tab rotates which one we render
  // (and which one the Refresh / save-edit pipeline writes into).
  const lens                     = (profile.portraitLens ?? 'work') as 'work' | 'life';
  const workPortrait             = useStore(st => st.profile.portrait);
  const rawLifePortrait          = useStore(st => st.profile.lifePortrait);
  const lifePortrait             = useMemo(
    () => rawLifePortrait ?? makeEmptyPortrait(),
    [rawLifePortrait],
  );
  const portrait                 = lens === 'life' ? lifePortrait : workPortrait;
  const updatePortraitSection    = useStore(st => st.updatePortraitSection);
  const updateLifePortraitSection = useStore(st => st.updateLifePortraitSection);
  const setPortraitLens          = useStore(st => st.setPortraitLens);
  const writeSection             = lens === 'life' ? updateLifePortraitSection : updatePortraitSection;
  const userAnthropicKey         = profile.anthropicKey;

  const [editingKey, setEditingKey] = useState<PortraitSectionKey | null>(null);
  const [editDraft, setEditDraft]   = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const recentKeys = useMemo(() => recentPortraitChanges(portrait, 7), [portrait]);
  const firstName  = (profile.name || '').split(' ')[0] || 'you';

  const isEmpty = SECTION_ORDER.every(k => !portrait[k]?.text?.trim());

  const openEdit = useCallback((key: PortraitSectionKey) => {
    setEditingKey(key);
    setEditDraft(portrait[key]?.text ?? '');
  }, [portrait]);

  const saveEdit = useCallback(() => {
    if (!editingKey) return;
    const text = editDraft.trim();
    writeSection(editingKey, { text, source: 'user' });
    setEditingKey(null);
    setEditDraft('');
  }, [editingKey, editDraft, writeSection]);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditDraft('');
  }, []);

  const onExport = useCallback(async () => {
    const md = portraitToMarkdown(portrait, profile.name);
    try {
      await Share.share({ message: md });
    } catch {
      Alert.alert('Couldn\'t share', 'Try again from a different surface.');
    }
  }, [portrait, profile.name]);

  const onRefresh = useCallback(async () => {
    // Manual refresh — useful when the user just had a big chat and
    // wants to see the portrait update immediately rather than waiting
    // for the passive pipeline.
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Pull the most recent chat messages — we don't have a persistent
      // cross-session message store, so this button just re-invites the
      // AI to look at the current portrait + tell us if anything in the
      // store (areas/projects/goals) updates any section.
      const st = useStore.getState();
      const synthetic = [
        {
          id:        'sys-refresh',
          role:      'user' as const,
          content:   buildRefreshContext(st),
          timestamp: new Date().toISOString(),
        },
      ];
      // CP9.2 — Refresh routes to the active lens. We hand portraitV2 the
      // selected portrait + a write function, so it doesn't need to know
      // which slot it's filling.
      const activePortrait = lens === 'life'
        ? (st.profile.lifePortrait ?? makeEmptyPortrait())
        : st.profile.portrait;
      const activeWrite = lens === 'life'
        ? st.updateLifePortraitSection
        : st.updatePortraitSection;
      const written = await refreshPortrait(
        synthetic,
        {
          portrait:              activePortrait,
          updatePortraitSection: activeWrite,
        },
        userAnthropicKey,
      );
      if (written === 0) {
        Alert.alert('Nothing new to add', 'I don\'t have new material to update your portrait yet. Have a chat and I\'ll come back to it.');
      }
    } catch {
      Alert.alert('Couldn\'t refresh', 'Something went wrong. Try again in a bit.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, userAnthropicKey, lens]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello}>You</Text>
            <Text style={s.sub}>
              {portrait.lastAnyUpdate
                ? `Updated ${formatDistanceToNow(new Date(portrait.lastAnyUpdate), { addSuffix: true })}`
                : "I'll get to know you as we talk."}
            </Text>
          </View>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={onExport}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-outline" size={18} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerBtn, { marginLeft: 8 }]}
            onPress={onRefresh}
            activeOpacity={0.7}
            disabled={refreshing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={refreshing ? 'hourglass-outline' : 'refresh-outline'}
              size={18}
              color={refreshing ? C.textTertiary : C.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* CP9.2 — Lens tabs (Work / Life). Two portraits, one tab control.
            Switching the lens swaps which slot renders + which slot the
            Refresh button writes into. */}
        <View style={s.lensRow}>
          <TouchableOpacity
            style={[s.lensTab, lens === 'work' && s.lensTabActive]}
            onPress={() => setPortraitLens('work')}
            activeOpacity={0.78}
            accessibilityLabel="Show work-self portrait"
          >
            <Text style={[s.lensTabText, lens === 'work' && s.lensTabTextActive]}>
              Work-self
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.lensTab, lens === 'life' && s.lensTabActive]}
            onPress={() => setPortraitLens('life')}
            activeOpacity={0.78}
            accessibilityLabel="Show life-self portrait"
          >
            <Text style={[s.lensTabText, lens === 'life' && s.lensTabTextActive]}>
              Life-self
            </Text>
          </TouchableOpacity>
        </View>

        {/* "What changed this week" pill */}
        {recentKeys.length > 0 && (
          <View style={s.diffPillWrap}>
            <View style={s.diffPill}>
              <Ionicons name="sparkles" size={12} color={C.accent} style={{ marginRight: 6 }} />
              <Text style={s.diffPillText}>
                {recentKeys.length === 1
                  ? '1 section moved this week'
                  : `${recentKeys.length} sections moved this week`}
              </Text>
            </View>
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>I'm still meeting you, {firstName}.</Text>
            <Text style={s.emptyBody}>
              Your portrait is written as a byproduct of talking. The more we talk, the more this page will look like you. There's no form to fill in — just go have a conversation.
            </Text>
          </View>
        )}

        {/* Sections */}
        {SECTION_ORDER.map(key => {
          const section = portrait[key];
          const meta    = SECTION_META[key];
          const hasText = Boolean(section?.text?.trim());
          const isRecent = recentKeys.includes(key);
          const userEdited = section?.source === 'user';

          return (
            <TouchableOpacity
              key={key}
              style={s.card}
              activeOpacity={0.85}
              onPress={() => openEdit(key)}
            >
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}>
                  <Ionicons name={meta.icon} size={16} color={C.primary} />
                </View>
                <Text style={s.cardLabel}>{meta.label}</Text>
                {isRecent && <View style={s.recentDot} />}
                <View style={{ flex: 1 }} />
                {userEdited && (
                  <View style={s.editedChip}>
                    <Text style={s.editedChipText}>your edit</Text>
                  </View>
                )}
                <Ionicons name="pencil-outline" size={14} color={C.textTertiary} />
              </View>
              <Text style={hasText ? s.cardBody : s.cardBodyEmpty}>
                {hasText ? section.text : meta.emptyText}
              </Text>
              {section?.lastUpdated && hasText && (
                <Text style={s.cardStamp}>
                  {formatDistanceToNow(new Date(section.lastUpdated), { addSuffix: true })}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={s.footer}>
          Your portrait is yours. Edits are respected. Export or reset any time.
        </Text>
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={!!editingKey}
        transparent
        animationType="slide"
        onRequestClose={cancelEdit}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalRoot}
        >
          <TouchableOpacity
            style={s.modalBackdrop}
            activeOpacity={1}
            onPress={cancelEdit}
          />
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={cancelEdit}>
                <Text style={s.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingKey ? SECTION_META[editingKey].label : ''}
              </Text>
              <TouchableOpacity onPress={saveEdit}>
                <Text style={s.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={editDraft}
              onChangeText={setEditDraft}
              style={s.modalInput}
              placeholder="Write in your own voice…"
              placeholderTextColor={C.textTertiary}
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <Text style={s.modalHint}>
              Your edits are saved with source "user" — the AI will respect them and only overwrite if it has substantially new material.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a synthetic "context blob" for the manual refresh path. We feed
 * the AI a snapshot of the user's current store state so it can at least
 * acknowledge what they're building, what's stuck, etc., without a live
 * conversation. This is deliberately light — the real portrait work
 * happens passively via ChatScreen's unmount pipeline.
 */
function buildRefreshContext(st: ReturnType<typeof useStore.getState>): string {
  const activeAreas    = st.areas.filter(a => a.isActive && !a.isArchived);
  const activeProjects = st.projects.filter(p => p.status === 'active');
  const openGoals      = st.goals;

  const areaBlock = activeAreas.length
    ? activeAreas.map(a => `- ${a.name}${a.description ? `: ${a.description}` : ''}`).join('\n')
    : '(none yet)';
  const projectBlock = activeProjects.length
    ? activeProjects.map(p => `- ${p.title}${p.description ? `: ${p.description}` : ''}`).join('\n')
    : '(none yet)';
  const goalBlock = openGoals.length
    ? openGoals.map(g => `- [${g.horizon}] ${g.text}`).join('\n')
    : '(none yet)';

  return [
    "Please revisit my portrait based on what you currently know about me.",
    "",
    "ACTIVE AREAS:",
    areaBlock,
    "",
    "ACTIVE PROJECTS:",
    projectBlock,
    "",
    "OPEN GOALS:",
    goalBlock,
    "",
    "Update sections where you have something to say. Skip the rest.",
  ].join('\n');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.base,
    },
    hello: {
      fontSize: 34,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: -1.2,
    },
    sub: {
      fontSize: 13,
      color: C.textSecondary,
      marginTop: 2,
    },
    headerBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
    },

    // CP9.2 — lens tabs (Work / Life)
    lensRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: Spacing.base,
      marginBottom: Spacing.base,
    },
    lensTab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    lensTabActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    lensTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
    },
    lensTabTextActive: {
      color: '#fff',
    },

    // Diff pill
    diffPillWrap: {
      paddingHorizontal: Spacing.base,
      marginBottom: Spacing.base,
    },
    diffPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: C.accentLight,
      borderRadius: Radius.full,
    },
    diffPillText: {
      fontSize: 12,
      color: C.accent,
      fontWeight: '600',
    },

    // Empty state
    emptyCard: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.base,
      padding: Spacing.base,
      backgroundColor: C.surfaceWarm,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    emptyBody: {
      fontSize: 14,
      lineHeight: 20,
      color: C.textSecondary,
    },

    // Card
    card: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.md,
      padding: Spacing.base,
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardIconWrap: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: C.primaryLight,
      alignItems: 'center', justifyContent: 'center',
      marginRight: 10,
    },
    cardLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    recentDot: {
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: C.accent,
      marginLeft: 8,
    },
    editedChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: C.primaryLight,
      borderRadius: Radius.full,
      marginRight: 8,
    },
    editedChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 0.3,
    },
    cardBody: {
      fontSize: 15,
      lineHeight: 22,
      color: C.textPrimary,
    },
    cardBodyEmpty: {
      fontSize: 14,
      lineHeight: 20,
      color: C.textTertiary,
      fontStyle: 'italic',
    },
    cardStamp: {
      fontSize: 11,
      color: C.textTertiary,
      marginTop: 8,
    },

    footer: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: Spacing.base,
      paddingHorizontal: Spacing.base,
    },

    // Modal
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    modalCard: {
      backgroundColor: C.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.lg,
      minHeight: 360,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.base,
    },
    modalCancel: { fontSize: 15, color: C.textSecondary },
    modalSave:   { fontSize: 15, color: C.primary, fontWeight: '700' },
    modalTitle:  { fontSize: 15, fontWeight: '700', color: C.textPrimary },
    modalInput: {
      minHeight: 180,
      fontSize: 16,
      lineHeight: 24,
      color: C.textPrimary,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    modalHint: {
      fontSize: 12,
      color: C.textTertiary,
      marginTop: Spacing.md,
      lineHeight: 18,
    },
  });
}
