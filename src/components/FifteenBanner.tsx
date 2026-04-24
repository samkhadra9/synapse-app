/**
 * FifteenBanner — the floating countdown while a 15-min session is live.
 *
 * Mounted at the root so it hovers above whatever screen the user is on.
 * Reads from the useFifteen zustand store. Renders nothing when no
 * session is active, so it's invisible by default.
 *
 * ADHD-aware:
 *   - Only one number on screen: MM:SS remaining. No progress bar
 *     (ratios are the shame loop — CP1 roadmap item 13).
 *   - "Done early" button as the primary action. Stops the timer
 *     without marking anything incomplete.
 *   - No big visual treatment — pill at the bottom, short of the
 *     tab bar. Ignorable if they're in a different task now.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFifteen, formatRemaining } from '../services/fifteen';
import { useColors, Radius } from '../theme';

export default function FifteenBanner() {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);

  const active    = useFifteen(st => st.active);
  const taskText  = useFifteen(st => st.taskText);
  const stop      = useFifteen(st => st.stop);
  // tick subscription — this forces re-render every second while active
  const _tick     = useFifteen(st => st.tick);
  const remaining = useFifteen(st => st.remaining)();

  if (!active) return null;

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={s.pill}>
        <View style={s.playDot}>
          <Ionicons name="time-outline" size={13} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.time}>{formatRemaining(remaining)}</Text>
          {taskText ? (
            <Text style={s.label} numberOfLines={1}>{taskText}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={stop}
          activeOpacity={0.75}
          style={s.stopBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.stopText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(_C: any) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0, right: 0,
      // Sit above the tab bar (~83pt on iOS with home indicator)
      bottom: Platform.select({ ios: 96, default: 80 }),
      alignItems: 'center',
      zIndex: 1000,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 10,
      paddingRight: 14,
      paddingVertical: 8,
      backgroundColor: '#1C1C1E',
      borderRadius: Radius.full,
      maxWidth: '90%',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    playDot: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center', justifyContent: 'center',
    },
    time: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.5,
      fontVariant: ['tabular-nums'],
    },
    label: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.60)',
      marginTop: 1,
    },
    stopBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    stopText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.3,
    },
  });
}
