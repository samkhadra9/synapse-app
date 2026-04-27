/**
 * HomeHeld — the "held" state variant of Home.
 *
 * Shown when: the user has been away for 48h+, or is brand new. The
 * full dashboard would feel loud — what they need is a warm welcome
 * back and an obvious path into chat.
 *
 * Design:
 * - Single column, lots of whitespace.
 * - Name-based greeting that reads what time of day it is.
 * - Single big "what's on your mind?" card → opens Chat (dump).
 * - Tiny row: "N things waiting" + "You" pill (portrait hint).
 * - No goals / habits / tasks grid. All of that is one tap away but
 *   not in the user's face.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDistanceToNow } from 'date-fns';
import { Spacing, Radius, useColors } from '../theme';
import { useStore } from '../store/useStore';
import { RootStackParams } from '../navigation';
import DayEndReflection from '../components/DayEndReflection';
// CP9.4 — gentle "you've shown up" line, no number-as-trophy.
import { computeShowingUpStreak } from '../services/streak';

type Nav = NativeStackNavigationProp<RootStackParams>;

function greeting(firstName: string): string {
  const h = new Date().getHours();
  const who = firstName || 'there';
  if (h < 5)  return `Up late, ${who}.`;
  if (h < 12) return `Morning, ${who}.`;
  if (h < 17) return `Afternoon, ${who}.`;
  if (h < 21) return `Evening, ${who}.`;
  return `Late, ${who}.`;
}

export default function HomeHeld() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<Nav>();

  const profile       = useStore(st => st.profile);
  const tasks         = useStore(st => st.tasks);
  const completions   = useStore(st => st.completions);
  const lastPortrait  = profile.portrait.lastAnyUpdate;
  const firstName     = (profile.name || '').split(' ')[0];
  // CP9.4 — quiet showing-up line. We compute it inside useMemo so the
  // string only re-derives when completions change, not on every parent
  // render. Returns null when there's nothing to say (no shame on gaps).
  const streakLine = useMemo(
    () => computeShowingUpStreak(completions).line,
    [completions],
  );

  const inboxCount  = tasks.filter(t => t.isInbox && !t.completed).length;
  const todayCount  = tasks.filter(
    t => t.isToday && !t.completed && !t.isInbox,
  ).length;

  const lastActiveLabel = profile.lastActiveDate
    ? formatDistanceToNow(new Date(profile.lastActiveDate), { addSuffix: true })
    : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: Spacing.base,
          // CP2.5: the welcome greeting gets more sky above it — this is the
          // first screen a returning-after-48h user sees.
          paddingTop: Spacing.xl,
        }}
      >
        {/* Day-end reflection — shows in the evening when there are completions */}
        <DayEndReflection />

        {/* Greeting */}
        <Text style={s.greeting}>{greeting(firstName)}</Text>
        {lastActiveLabel && (
          <Text style={s.sub}>Last here {lastActiveLabel}.</Text>
        )}

        {/* Big chat card */}
        <TouchableOpacity
          style={s.chatCard}
          onPress={() => navigation.navigate('Chat', { mode: 'dump' })}
          activeOpacity={0.88}
        >
          <View style={s.chatIconWrap}>
            <Ionicons name="sparkles" size={18} color={C.accent} />
          </View>
          <Text style={s.chatTitle}>What's on your mind?</Text>
          <Text style={s.chatBody}>
            {firstName ? `Tell me where you are, ${firstName}. ` : ''}
            Dump it all out. I'll sort the shape of it with you.
          </Text>
          <View style={s.chatCta}>
            <Text style={s.chatCtaText}>Start talking</Text>
            <Ionicons name="arrow-forward" size={14} color={C.textInverse} />
          </View>
        </TouchableOpacity>

        {/* Quiet row */}
        <View style={s.quietRow}>
          {inboxCount > 0 && (
            <TouchableOpacity
              style={s.chip}
              onPress={() =>
                navigation.navigate('Chat', {
                  mode: 'dump',
                  initialMessage: `I've got ${inboxCount} things in my inbox I haven't sorted. Help me take a look.`,
                })
              }
              activeOpacity={0.75}
            >
              <Ionicons name="albums-outline" size={14} color={C.textSecondary} />
              <Text style={s.chipText}>
                {inboxCount} in inbox
              </Text>
            </TouchableOpacity>
          )}
          {todayCount > 0 && (
            <TouchableOpacity
              style={s.chip}
              onPress={() =>
                navigation.navigate('Chat', {
                  mode: 'dump',
                  initialMessage: `I've got ${todayCount} things marked for today. Help me see what actually matters before I pick anything up.`,
                })
              }
              activeOpacity={0.75}
            >
              <Ionicons name="sunny-outline" size={14} color={C.textSecondary} />
              <Text style={s.chipText}>
                {todayCount} today
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.chip}
            // Cross-tab jump into Portrait. useNavigation is typed as the
            // root stack, which doesn't include the tab routes — `as never`
            // quiets TS while letting React Navigation resolve the name
            // against the full navigator tree.
            onPress={() => navigation.getParent()?.navigate('Portrait' as never)}
            activeOpacity={0.75}
          >
            <Ionicons name="person-circle-outline" size={14} color={C.textSecondary} />
            <Text style={s.chipText}>
              {lastPortrait ? 'Revisit "You"' : 'Meet "You"'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* CP9.4 — gentle streak line. No number-as-trophy, no flame, no
            reset-shame. If nothing to say, render nothing — silence beats
            performative encouragement. */}
        {streakLine && (
          <Text style={s.streakLine}>{streakLine}</Text>
        )}

        <Text style={s.footer}>
          You don't have to plan before you talk. Just start.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },

    greeting: {
      fontSize: 34,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: -1.2,
    },
    sub: {
      fontSize: 13,
      color: C.textSecondary,
      marginTop: 4,
      marginBottom: Spacing.lg,
    },

    chatCard: {
      // CP2.5: more breathing room inside the hero chat card.
      padding: Spacing.lg,
      backgroundColor: C.surfaceWarm,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: C.accent + '33',
      marginBottom: Spacing.lg,
    },
    chatIconWrap: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: C.accentLight,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 12,
    },
    chatTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.5,
      marginBottom: 6,
    },
    chatBody: {
      fontSize: 14,
      lineHeight: 20,
      color: C.textSecondary,
      marginBottom: Spacing.base,
    },
    chatCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: C.ink,
      borderRadius: Radius.full,
    },
    chatCtaText: {
      color: C.textInverse,
      fontSize: 14,
      fontWeight: '700',
    },

    quietRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.lg,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
    },
    chipText: {
      fontSize: 12,
      color: C.textSecondary,
      fontWeight: '600',
    },

    footer: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      // CP2.5: let the reassurance line sit on its own island.
      marginTop: Spacing.xl,
    },
    streakLine: {
      // CP9.4 — sits above the footer, slightly more present than tertiary
      // copy because it's the only earned signal on screen, but quiet enough
      // to never feel like a metric demanding attention.
      fontSize: 12,
      fontStyle: 'italic',
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.lg,
    },
  });
}
