/**
 * MITHeroBlock — Most Important Task, front and centre
 *
 * Shown at the top of TodayTimelinePage when there's an incomplete MIT.
 * Single task. Big visual weight. Start button → WorkingModeModal.
 * Tap the check → triggers MIT completion celebration upstream.
 *
 * Design intent:
 * - You open the app and immediately see THE thing.
 * - One tap to enter focus mode. No hunting.
 */

import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { Task } from '../store/useStore';

interface MITHeroBlockProps {
  task: Task;
  onStart: () => void;
  onComplete: () => void;
}

export default function MITHeroBlock({ task, onStart, onComplete }: MITHeroBlockProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={s.container}>
      {/* Label row */}
      <View style={s.labelRow}>
        <View style={s.mitChip}>
          <Text style={s.mitChipText}>★ MIT</Text>
        </View>
        {task.estimatedMinutes ? (
          <Text style={s.duration}>{task.estimatedMinutes} min</Text>
        ) : null}
      </View>

      {/* Task text */}
      <Text style={s.taskText} numberOfLines={3}>{task.text}</Text>

      {/* Reason / why-now */}
      {task.reason ? (
        <Text style={s.reason}>{task.reason}</Text>
      ) : null}

      {/* Actions */}
      <View style={s.actions}>
        {/* Check / complete */}
        <TouchableOpacity style={s.checkBtn} onPress={onComplete} activeOpacity={0.75}>
          <View style={s.checkCircle}>
            <Ionicons name="checkmark" size={18} color={C.textInverse} />
          </View>
          <Text style={s.checkLabel}>Done</Text>
        </TouchableOpacity>

        {/* Start focus session */}
        <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.82}>
          <Ionicons name="play" size={15} color={C.textInverse} />
          <Text style={s.startLabel}>Start working</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.base,
      marginBottom: Spacing.sm,
      backgroundColor: C.primary,
      borderRadius: Radius.xl,
      padding: 20,
      gap: 10,
    },

    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    mitChip: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    mitChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.5,
    },

    duration: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.65)',
      fontWeight: '500',
    },

    taskText: {
      fontSize: 22,
      fontWeight: '700',
      color: '#fff',
      lineHeight: 28,
      letterSpacing: -0.5,
    },

    reason: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.72)',
      lineHeight: 18,
      fontStyle: 'italic',
    },

    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },

    // Checkmark / done button — secondary, quieter
    checkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(255,255,255,0.30)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },

    // Start button — primary CTA
    startBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    startLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
  });
}
