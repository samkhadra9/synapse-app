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
  const lastPortrait  = profile.portrait.lastAnyUpdate;
  const firstName     = (profile.name || '').split(' ')[0];

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
          paddingTop: Spacing.lg,
        }}
      >
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
              onPress={() => navigation.navigate('Main')}
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
            onPress={() => navigation.navigate('Main')}
            activeOpacity={0.75}
          >
            <Ionicons name="person-circle-outline" size={14} color={C.textSecondary} />
            <Text style={s.chipText}>
              {lastPortrait ? 'Revisit "You"' : 'Meet "You"'}
            </Text>
          </TouchableOpacity>
        </View>

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
      padding: Spacing.base,
      backgroundColor: C.surfaceWarm,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: C.accent + '33',
      marginBottom: Spacing.base,
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
      marginTop: Spacing.base,
    },
  });
}
