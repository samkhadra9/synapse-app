/**
 * CP6.4 — Capture-surfaces onboarding tour
 *
 * The app has five fast-capture paths most users never discover:
 *   1. Lock-screen widget                    (one-tap "dump something quick")
 *   2. Share Extension                       (share to Aiteall from any app)
 *   3. Siri Shortcut                         ("Hey Siri, tell Aiteall…")
 *   4. App-icon long-press Quick Actions     (Dump / Done / I'm stuck)
 *   5. Paperclip + paste in chat             (PDF / photo / clipboard)
 *
 * Without surfacing them, capture stays text-only inside the app — and
 * we lose the cheapest D2 win we have.
 *
 * This screen is shown **once** per profile (stored in
 * `profile.captureTourSeenAt`), triggered the first time the user lands
 * on the Dashboard with at least one chat exchange behind them.
 *
 * Design rules carried from the rest of the app:
 *   - No exclaim marks, no "Great job", no urgency.
 *   - Skip is louder than continue (CP3.6 — `skip louder than continue`).
 *   - Each card stands alone — closing mid-tour still marks it complete
 *     (we don't want the modal to nag).
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, useColors } from '../theme';
import { useStore } from '../store/useStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../navigation';
import { CAPTURE_SURFACES } from '../data/captureSurfaces';

type Props = NativeStackScreenProps<RootStackParams, 'CaptureTour'>;

const CARDS = CAPTURE_SURFACES;

export default function CaptureToursScreen({ navigation, route }: Props) {
  const C       = useColors();
  const styles  = makeStyles(C);
  const insets  = useSafeAreaInsets();
  const updateProfile = useStore(s => s.updateProfile);
  // Settings can deep-link to a specific card (e.g. "Tell me about Siri").
  const initial = clampIndex(route.params?.initialIndex);
  const [idx, setIdx] = useState(initial);
  const card = CARDS[idx];
  const isLast = idx === CARDS.length - 1;

  function markSeenAndClose() {
    updateProfile({ captureTourSeenAt: new Date().toISOString() });
    navigation.goBack();
  }

  function next() {
    if (isLast) {
      markSeenAndClose();
    } else {
      setIdx(i => Math.min(CARDS.length - 1, i + 1));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Top bar — Skip lives here. CP3.6 says skip is louder than
          continue, so we keep it as a plain text button (no chevron). */}
      <View style={styles.topBar}>
        <Text style={styles.progress}>{idx + 1} of {CARDS.length}</Text>
        <TouchableOpacity onPress={markSeenAndClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Card body — vertical room for one tour card at a time. We
          use ScrollView so smaller phones still see the full body without
          truncation, but expectation is no scrolling on a 6.1" screen. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={card.icon} size={40} color={C.primary} />
        </View>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.body}>{card.body}</Text>
        <View style={styles.howToWrap}>
          <Text style={styles.howToLabel}>How</Text>
          <Text style={styles.howToText}>{card.howTo}</Text>
        </View>
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {CARDS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === idx && styles.dotActive]}
          />
        ))}
      </View>

      {/* Continue / Done */}
      <View style={[styles.cta, { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.base }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{isLast ? 'Done' : 'Got it'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function clampIndex(i: number | undefined): number {
  if (typeof i !== 'number' || !Number.isFinite(i)) return 0;
  if (i < 0) return 0;
  if (i >= CAPTURE_SURFACES.length) return CAPTURE_SURFACES.length - 1;
  return Math.floor(i);
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
    },
    progress: { fontSize: 13, color: C.textTertiary, fontWeight: '600' },
    skipText: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },

    scroll:        { flex: 1 },
    scrollContent: { padding: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center' },

    iconWrap: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: C.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.lg,
    },

    title: {
      fontSize: 26, fontWeight: '700', color: C.textPrimary,
      letterSpacing: -0.4, textAlign: 'center', marginBottom: Spacing.base,
    },
    body: {
      fontSize: 16, lineHeight: 24, color: C.textSecondary,
      textAlign: 'center', marginBottom: Spacing.xl,
    },

    howToWrap: {
      width: '100%',
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.lg,
      padding: Spacing.base,
      borderWidth: 1, borderColor: C.border,
    },
    howToLabel: {
      fontSize: 11, fontWeight: '700', color: C.textTertiary,
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4,
    },
    howToText: {
      fontSize: 14, lineHeight: 20, color: C.textPrimary, fontWeight: '500',
    },

    dotsRow: {
      flexDirection: 'row', justifyContent: 'center', gap: 6,
      paddingVertical: Spacing.base,
    },
    dot: {
      width: 6, height: 6, borderRadius: 3, backgroundColor: C.border,
    },
    dotActive: { backgroundColor: C.primary, width: 18 },

    cta: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    primaryBtn: {
      backgroundColor: C.ink, borderRadius: Radius.full,
      paddingVertical: 14, alignItems: 'center',
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  });
}
