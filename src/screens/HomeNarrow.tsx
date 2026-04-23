/**
 * HomeNarrow — the "narrow" state variant of Home.
 *
 * Shown when: the user is compressed — many short sessions recently,
 * or a heavy day with few completions. The worst thing we can do to
 * an ADHD brain in this state is show them the full dashboard with
 * seven pages of things to look at. So we don't.
 *
 * Design:
 * - Single focal card: THE ONE THING to do next (MIT, else next today).
 * - "Everything else, later" chip that collapses the rest.
 * - Inline reschedule / start buttons. No scrolling needed.
 * - Subtle "I'm noticing things are tight — want to talk?" drop-down
 *   into a dump session pre-seeded with that observation.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { Spacing, Radius, useColors } from '../theme';
import { useStore, Task } from '../store/useStore';
import { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

/** Pick the one thing worth doing right now. */
function pickOneThing(tasks: Task[]): Task | null {
  const today = format(new Date(), 'yyyy-MM-dd');
  const candidates = tasks.filter(
    t => !t.completed && !t.isInbox && (t.isToday || t.date === today),
  );
  // Priority: MIT → high → everything else
  const mit = candidates.find(t => t.isMIT);
  if (mit) return mit;
  const high = candidates.find(t => t.priority === 'high');
  if (high) return high;
  return candidates[0] ?? null;
}

export default function HomeNarrow() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<Nav>();

  const tasks    = useStore(st => st.tasks);
  const toggleTask = useStore(st => st.toggleTask);

  const oneThing = useMemo(() => pickOneThing(tasks), [tasks]);
  const todayLeft = tasks.filter(
    t => !t.completed && !t.isInbox && t.isToday,
  ).length;
  const laterCount = Math.max(0, todayLeft - (oneThing ? 1 : 0));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: Spacing.base,
          paddingTop: Spacing.lg,
        }}
      >
        {/* Eyebrow — why we simplified */}
        <View style={s.eyebrowRow}>
          <View style={s.eyebrowDot} />
          <Text style={s.eyebrow}>Keeping it simple today</Text>
        </View>

        {/* The one thing */}
        {oneThing ? (
          <View style={s.focusCard}>
            <Text style={s.focusLabel}>Next</Text>
            <Text style={s.focusText}>{oneThing.text}</Text>
            {oneThing.reason && (
              <Text style={s.focusReason}>{oneThing.reason}</Text>
            )}
            <View style={s.focusActions}>
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => toggleTask(oneThing.id)}
                activeOpacity={0.82}
              >
                <Ionicons name="checkmark" size={16} color={C.textInverse} />
                <Text style={s.primaryBtnText}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={() =>
                  navigation.navigate('Chat', {
                    mode: 'dump',
                    initialMessage: `I'm stuck on "${oneThing.text}". Help me start.`,
                  })
                }
                activeOpacity={0.75}
              >
                <Text style={s.secondaryBtnText}>Stuck</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.focusCard}>
            <Text style={s.focusLabel}>Next</Text>
            <Text style={s.focusText}>
              Nothing scheduled. Breathe.
            </Text>
            <Text style={s.focusReason}>
              There's nothing on today. If something comes up, it can go on the list.
            </Text>
          </View>
        )}

        {/* Later chip */}
        {laterCount > 0 && (
          <TouchableOpacity
            style={s.laterChip}
            onPress={() => navigation.navigate('Main')}
            activeOpacity={0.75}
          >
            <Ionicons name="time-outline" size={14} color={C.textSecondary} />
            <Text style={s.laterText}>
              {laterCount} more for today — later
            </Text>
            <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Talk about it */}
        <TouchableOpacity
          style={s.talkCard}
          onPress={() =>
            navigation.navigate('Chat', {
              mode: 'dump',
              initialMessage: "My day feels tight. Can we sort what's going on?",
            })
          }
          activeOpacity={0.85}
        >
          <View style={s.talkIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.talkTitle}>Feeling compressed?</Text>
            <Text style={s.talkBody}>
              I'm noticing short sessions and a heavy list. Want to talk it out?
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },

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

    focusCard: {
      padding: Spacing.base,
      backgroundColor: C.surface,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: Spacing.base,
    },
    focusLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    focusText: {
      fontSize: 22,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.4,
      lineHeight: 28,
      marginBottom: 8,
    },
    focusReason: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 18,
      marginBottom: Spacing.base,
    },
    focusActions: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: C.ink,
      borderRadius: Radius.full,
    },
    primaryBtnText: {
      color: C.textInverse,
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
    },
    secondaryBtnText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },

    laterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
      marginBottom: Spacing.base,
      alignSelf: 'flex-start',
    },
    laterText: {
      fontSize: 12,
      color: C.textSecondary,
      fontWeight: '600',
    },

    talkCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: Spacing.base,
      backgroundColor: C.primaryLight,
      borderRadius: Radius.lg,
    },
    talkIconWrap: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.surface,
      alignItems: 'center', justifyContent: 'center',
    },
    talkTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 2,
    },
    talkBody: {
      fontSize: 12,
      color: C.textSecondary,
      lineHeight: 16,
    },
  });
}
