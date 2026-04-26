/**
 * HomeAdaptive — the Home tab's brain.
 *
 * Picks one of three variants based on UIStateClassifier's read of the
 * user's recent behaviour:
 *
 *   'open'   → DashboardScreen (the full horizontal pager, all the tiles)
 *   'narrow' → HomeNarrow (one focal task, everything else hidden)
 *   'held'   → HomeHeld (warm welcome + big chat CTA)
 *
 * We re-classify each time the screen comes into focus so a state
 * change propagates cleanly (e.g. "narrow" after a heavy chat burst,
 * then back to "open" after completing things).
 *
 * A subtle dev hint sits at the very top when __DEV__ — tells us which
 * state won and why — and is omitted in production builds.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParams } from '../navigation';
import { useColors } from '../theme';
import { useStore } from '../store/useStore';
import { classifyUIState, UIState, UIStateDecision } from '../services/uiStateClassifier';
import { getEmergenceReadiness, EmergenceCandidates } from '../services/emergence';
import EmergenceSheet    from '../components/EmergenceSheet';

import DashboardScreen from './DashboardScreen';
import HomeNarrow      from './HomeNarrow';
import HomeHeld        from './HomeHeld';

export default function HomeAdaptive() {
  const C = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [decision, setDecision] = useState<UIStateDecision>({ state: 'open', reason: 'init' });

  const [emergenceOpen, setEmergenceOpen] = useState(false);
  const [emergenceCandidates, setEmergenceCandidates] =
    useState<EmergenceCandidates>({ areas: [], projects: [], tasks: [], goals: [], total: 0 });

  // Pull the raw snapshot inputs. We read them directly (not via
  // selectors) because the classifier wants a consistent snapshot — if
  // we slice selectors we could see a mid-state. `useStore.getState()`
  // inside the effect gives us a single atomic read.

  // Re-classify every time the tab is focused + check if emergence
  // moment should fire.
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const s = useStore.getState();

      const d = classifyUIState({
        sessionLog:     s.sessionLog,
        tasks:          s.tasks,
        firstOpenDate:  s.profile.firstOpenDate,
        lastActiveDate: s.profile.lastActiveDate,
      });
      setDecision(d);
      // CP2.4: publish to the store so the tab bar can recede in narrow/held.
      s.setUIState(d.state);

      // Stamp an 'open' event so the next classification sees us.
      s.logSession({ kind: 'open', note: d.state });
      s.touchLastActive();

      // Emergence check — fire-and-forget. Only shows if thresholds
      // are crossed and user hasn't dismissed recently. We avoid
      // showing emergence in the 'narrow' state — the whole point of
      // narrow is fewer interruptions.
      if (d.state !== 'narrow') {
        getEmergenceReadiness({
          firstOpenDate: s.profile.firstOpenDate,
          areas:         s.areas,
          projects:      s.projects,
          tasks:         s.tasks,
          goals:         s.goals,
        }).then(r => {
          if (cancelled) return;
          if (r.ready) {
            setEmergenceCandidates(r.candidates);
            setEmergenceOpen(true);
          }
        });
      }

      // CP6.4 — surface the capture-surfaces tour the first time the
      // user lands here with at least one real chat behind them. We
      // gate on:
      //   - tour never seen     (profile.captureTourSeenAt nullish)
      //   - has chatted at all  (any session with a user message)
      //   - NOT in 'narrow'     (focus state — don't break the cocoon)
      //   - NOT showing emergence  (already a moment, don't stack)
      const tourEligible =
        !s.profile.captureTourSeenAt
        && d.state !== 'narrow'
        && Object.values(s.chatSessions).some(arr => arr.some(m => m.role === 'user'));
      if (tourEligible) {
        // Defer one tick so the focus effect commits before we navigate
        // — otherwise the modal opens during the tab transition and
        // animation looks crooked.
        setTimeout(() => {
          if (!cancelled) navigation.navigate('CaptureTour');
        }, 600);
      }

      return () => { cancelled = true; };
    }, []),
  );

  const Variant = useMemo(() => pickVariant(decision.state), [decision.state]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Dev-only: show why this variant was picked. Invisible in prod. */}
      {__DEV__ && (
        <View style={styles.devBadge} pointerEvents="none">
          <Text style={styles.devBadgeText}>
            UI: {decision.state} · {decision.reason}
          </Text>
        </View>
      )}
      <Variant />
      <EmergenceSheet
        visible={emergenceOpen}
        candidates={emergenceCandidates}
        onClose={() => setEmergenceOpen(false)}
      />
    </View>
  );
}

function pickVariant(state: UIState): React.ComponentType {
  switch (state) {
    case 'narrow': return HomeNarrow;
    case 'held':   return HomeHeld;
    case 'open':
    default:       return DashboardScreen;
  }
}

const styles = StyleSheet.create({
  devBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    zIndex: 1000,
  },
  devBadgeText: {
    fontSize: 9,
    color: '#666',
    fontWeight: '600',
  },
});
