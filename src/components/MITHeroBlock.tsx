/**
 * MITHeroBlock — Externalised PFC: initiation engine
 *
 * Clinically-informed design (ADHD coaching models):
 *
 * 1. MICRO-ACTION — AI generates the exact first physical step.
 *    "Open the Google Doc and read your last sentence." Removes ALL ambiguity.
 *
 * 2. FOCUS WINDOW — Time until next event shown in header subtitle.
 *    Time-blindness: making time concrete reduces "how long do I have?" anxiety.
 *
 * 3. GOAL BRIDGE — Connects the task to the 1-year north star.
 *    ADHD motivation is interest/relevance-driven. Showing "This advances: …"
 *    creates the dopamine bridge.
 *
 * 4. TWO ENTRY MODES — "Just 5 min" (low-stakes) + "Start working" (full).
 *    Perfectionism and task-size anxiety block initiation; 5 min feels safe.
 *
 * 5. DONE IS SEPARATE — Completing the MIT is satisfying but spatially
 *    separated from Start to prevent accidental completion.
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { Task, LifeGoal, UserProfile, useStore } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';
import { TodayEvent } from '../services/calendar';

interface MITHeroBlockProps {
  task: Task;
  calEvents: TodayEvent[];
  goals: LifeGoal[];
  profile: UserProfile;
  onStart: (quickStart?: boolean) => void;
  onComplete: () => void;
}

// ── Helper: Generate static fallback micro-action ──────────────────────────
function getStaticMicroAction(taskText: string): string {
  const lowerText = taskText.toLowerCase();

  if (lowerText.includes('email') || lowerText.includes('inbox')) {
    return 'Open your email and read the first subject line';
  }
  if (lowerText.includes('write') || lowerText.includes('draft') || lowerText.includes('doc')) {
    return 'Open the doc and write one sentence';
  }
  if (lowerText.includes('call') || lowerText.includes('meet')) {
    return 'Find the contact and press dial';
  }
  return 'Open whatever app you need and read the first line';
}

export default function MITHeroBlock({
  task,
  calEvents,
  goals,
  profile,
  onStart,
  onComplete,
}: MITHeroBlockProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const anthropicKey = useStore(st => st.profile?.anthropicKey);

  const [microAction, setMicroAction] = useState<string | null>(null);
  const [microLoading, setMicroLoading] = useState(false);

  const topGoal = useMemo(() => goals.find(g => g.horizon === '1year'), [goals]);

  // Generate micro-action on mount / when task changes
  useEffect(() => {
    let cancelled = false;

    // If no API key, use static fallback
    if (!anthropicKey) {
      setMicroLoading(false);
      const staticAction = getStaticMicroAction(task.text);
      if (!cancelled) {
        setMicroAction(staticAction);
      }
      return;
    }

    setMicroAction(null);

    async function generate() {
      setMicroLoading(true);
      try {
        const res = await fetchAnthropic(
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 60,
            system: `You help people with ADHD start tasks. Output ONLY the single smallest first physical action — 5-10 words max. No preamble. Just the action. Examples: "Open the doc and read your last sentence" / "Write the subject line only" / "Pull up the email and click Reply"`,
            messages: [{
              role: 'user',
              content: `Task: "${task.text}"${topGoal ? `. Goal: "${topGoal.text}"` : ''}`,
            }],
          },
          anthropicKey,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const text = (data?.content?.[0]?.text ?? '').trim().replace(/^["']|["']$/g, '');
        if (!cancelled && text) setMicroAction(text);
      } catch {
        // Silently fail — hero block still works without it
      } finally {
        if (!cancelled) setMicroLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [task.id, anthropicKey]);

  return (
    <View style={s.cardWrapper}>
    <View style={s.card}>

      {/* ── Header row: MIT chip + duration ── */}
      <View style={s.headerRow}>
        <View style={s.mitChip}>
          <Text style={s.mitChipText}>★  MUST DO TODAY</Text>
        </View>
        {task.estimatedMinutes ? (
          <Text style={s.duration}>~{task.estimatedMinutes}m</Text>
        ) : null}
      </View>

      {/* ── Task text ── */}
      <Text style={s.taskText} numberOfLines={2}>{task.text}</Text>

      {/* ── Micro-action: the first door ── */}
      <View style={s.microRow}>
        <Text style={s.microArrow}>↳</Text>
        {microLoading ? (
          <View style={s.microLoadingRow}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.45)" />
            <Text style={s.microLoadingText}>Finding your first step…</Text>
          </View>
        ) : (microAction || task.reason) ? (
          <Text style={s.microText} numberOfLines={2}>
            {microAction ?? task.reason}
          </Text>
        ) : null}
      </View>

      {/* ── Goal bridge ── */}
      {topGoal && (
        <View style={s.goalRow}>
          <Ionicons name="flag-outline" size={10} color="rgba(255,255,255,0.45)" />
          <Text style={s.goalText} numberOfLines={1}>
            {'Advances: '}
            <Text style={s.goalHighlight}>{topGoal.text}</Text>
          </Text>
        </View>
      )}

      {/* ── Action buttons ── */}
      <View style={s.actions}>
        {/* "Just 5 min" — low-stakes */}
        <TouchableOpacity
          style={s.fiveMinBtn}
          onPress={() => onStart(true)}
          activeOpacity={0.78}
        >
          <Text style={s.fiveMinLabel}>Just 5 min</Text>
        </TouchableOpacity>

        {/* "Start working" — primary CTA */}
        <TouchableOpacity
          style={s.startBtn}
          onPress={() => onStart(false)}
          activeOpacity={0.85}
        >
          <View style={s.playCircle}>
            <Ionicons name="play" size={12} color={C.primary} />
          </View>
          <Text style={s.startLabel}>Start working</Text>
        </TouchableOpacity>
      </View>

      {/* ── Mark done — separate, lower prominence ── */}
      <TouchableOpacity style={s.doneRow} onPress={onComplete} activeOpacity={0.7}>
        <View style={s.doneCircle}>
          <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.6)" />
        </View>
        <Text style={s.doneLabel}>Mark as done</Text>
      </TouchableOpacity>

    </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    // Now that the page container has explicit width: SCREEN_W, marginHorizontal works correctly
    cardWrapper: {
      marginTop: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    card: {
      marginHorizontal: Spacing.lg,
      backgroundColor: '#1C1C1E',   // hardcoded dark — always creates contrast in any theme
      borderRadius: Radius.xl,
      overflow: 'hidden',
    },

    // ── Header ──────────────────────────────────────────────────────────────
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 2,
    },
    mitChip: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: Radius.full,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    mitChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: 0.8,
    },
    duration: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.45)',
      fontWeight: '500',
    },

    // ── Task text ────────────────────────────────────────────────────────────
    taskText: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
      lineHeight: 26,
      letterSpacing: -0.4,
      paddingHorizontal: 16,
      paddingTop: 8,
    },

    // ── Micro-action ─────────────────────────────────────────────────────────
    microRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      paddingHorizontal: 16,
      marginTop: 7,
      minHeight: 18,
    },
    microArrow: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.38)',
      marginTop: 1,
    },
    microText: {
      flex: 1,
      fontSize: 13,
      color: 'rgba(255,255,255,0.72)',
      lineHeight: 18,
      fontStyle: 'italic',
    },
    microLoadingRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    microLoadingText: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.38)',
      fontStyle: 'italic',
    },

    // ── Goal bridge ──────────────────────────────────────────────────────────
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 16,
      marginTop: 6,
    },
    goalText: {
      flex: 1,
      fontSize: 11,
      color: 'rgba(255,255,255,0.38)',
      lineHeight: 15,
    },
    goalHighlight: {
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.55)',
    },

    // ── Action buttons ───────────────────────────────────────────────────────
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 14,
    },

    fiveMinBtn: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    fiveMinLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.72)',
    },

    startBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
    },
    playCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.primary ?? '#6366F1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    startLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: C.ink ?? '#1C1C1E',
    },

    // ── Done row ─────────────────────────────────────────────────────────────
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.10)',
      marginTop: 10,
    },
    doneCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.30)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.50)',
      fontWeight: '500',
    },
  });
}
