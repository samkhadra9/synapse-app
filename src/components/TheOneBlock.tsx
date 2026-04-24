/**
 * TheOneBlock — the single focal task for today.
 *
 * Replaces the old MITHeroBlock. One task, one button, one door. The
 * ADHD brain shouldn't be asked to pick between "Just 5 min" and
 * "Start working" — that's executive-function tax. We offer one
 * action: "Start 15 min." The timer and haptics are wired in the
 * FifteenTimer service (see services/fifteen.ts).
 *
 * Kept from MITHeroBlock:
 *   - the Claude-generated micro-action ("open the doc and read your
 *     last sentence") — the single most valuable ADHD affordance.
 *
 * Dropped from MITHeroBlock:
 *   - "★  MUST DO TODAY" shame eyebrow
 *   - two competing CTAs
 *   - "Mark as done" at the bottom (moved into the simpler action row)
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { Task, LifeGoal, UserProfile, useStore } from '../store/useStore';
import { fetchAnthropic } from '../lib/anthropic';

interface TheOneBlockProps {
  task: Task;
  goals: LifeGoal[];
  profile: UserProfile;
  /** Called when the user taps "Start 15 min". In CP1.3 this will start the
   *  FifteenTimer. For CP1.2 it can just navigate into a focus session. */
  onStartFifteen: () => void;
  /** Called when the user marks the-one done. */
  onComplete: () => void;
}

// Static fallback micro-action for when we have no API key.
function getStaticMicroAction(taskText: string): string {
  const t = taskText.toLowerCase();
  if (t.includes('email') || t.includes('inbox'))       return 'Open your email and read the first subject line';
  if (t.includes('write') || t.includes('draft') || t.includes('doc')) return 'Open the doc. Read your last sentence';
  if (t.includes('call') || t.includes('meet'))         return 'Find the contact. Press dial';
  return 'Open whatever app you need. Read the first line';
}

export default function TheOneBlock({
  task,
  goals,
  profile: _profile,
  onStartFifteen,
  onComplete,
}: TheOneBlockProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const anthropicKey = useStore(st => st.profile?.anthropicKey);

  const [microAction, setMicroAction] = useState<string | null>(null);
  const [microLoading, setMicroLoading] = useState(false);

  const topGoal = useMemo(() => goals.find(g => g.horizon === '1year'), [goals]);

  // Generate a micro-action ("the first physical step") when the task changes.
  useEffect(() => {
    let cancelled = false;

    if (!anthropicKey) {
      setMicroLoading(false);
      setMicroAction(getStaticMicroAction(task.text));
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
            // Keep the tone calm — no "Great first step!" energy.
            system:
              'You help people with ADHD start tasks. Output ONLY the single smallest first physical action — 5-10 words max. No preamble. No exclamation marks. Just the action. Examples: "Open the doc. Read your last sentence" / "Write the subject line only" / "Pull up the email and click reply"',
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
        const text = (data?.content?.[0]?.text ?? '').trim().replace(/^["']|["']$/g, '').replace(/!+$/g, '.');
        if (!cancelled && text) setMicroAction(text);
      } catch {
        // Silently fall back — the block still works without it.
      } finally {
        if (!cancelled) setMicroLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [task.id, anthropicKey, topGoal]);

  return (
    <View style={s.cardWrapper}>
      <View style={s.card}>

        {/* Eyebrow — just "Today", lowercase, no alarm */}
        <Text style={s.eyebrow}>today</Text>

        {/* The task itself — big, calm */}
        <Text style={s.taskText} numberOfLines={3}>{task.text}</Text>

        {/* Micro-action: the first door */}
        <View style={s.microRow}>
          <Text style={s.microArrow}>↳</Text>
          {microLoading ? (
            <View style={s.microLoadingRow}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.45)" />
              <Text style={s.microLoadingText}>Finding your first step…</Text>
            </View>
          ) : (microAction || task.reason) ? (
            <Text style={s.microText} numberOfLines={3}>
              {microAction ?? task.reason}
            </Text>
          ) : null}
        </View>

        {/* Quiet goal bridge — only if we have a 1-year goal to tie it to */}
        {topGoal && (
          <View style={s.goalRow}>
            <Ionicons name="flag-outline" size={10} color="rgba(255,255,255,0.40)" />
            <Text style={s.goalText} numberOfLines={1}>
              {'Tied to: '}
              <Text style={s.goalHighlight}>{topGoal.text}</Text>
            </Text>
          </View>
        )}

        {/* Primary action: fifteen minutes. One button. No choice required. */}
        <TouchableOpacity
          style={s.startBtn}
          onPress={onStartFifteen}
          activeOpacity={0.85}
        >
          <View style={s.playCircle}>
            <Ionicons name="play" size={12} color={C.primary} />
          </View>
          <Text style={s.startLabel}>Start 15 min</Text>
        </TouchableOpacity>

        {/* Done row — quiet, lower prominence, no shame if never tapped */}
        <TouchableOpacity style={s.doneRow} onPress={onComplete} activeOpacity={0.7}>
          <View style={s.doneCircle}>
            <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.6)" />
          </View>
          <Text style={s.doneLabel}>Done</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    cardWrapper: {
      marginTop: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    card: {
      marginHorizontal: Spacing.lg,
      backgroundColor: '#1C1C1E',   // deep charcoal — always high-contrast
      borderRadius: Radius.xl,
      overflow: 'hidden',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },

    eyebrow: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.42)',
      letterSpacing: 2,
      fontWeight: '600',
    },

    taskText: {
      fontSize: 22,
      fontWeight: '700',
      color: '#fff',
      lineHeight: 28,
      letterSpacing: -0.4,
      marginTop: 8,
    },

    // Micro-action
    microRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      marginTop: 10,
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

    // Goal bridge
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
    },
    goalText: {
      flex: 1,
      fontSize: 11,
      color: 'rgba(255,255,255,0.40)',
      lineHeight: 15,
    },
    goalHighlight: {
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.58)',
    },

    // Primary CTA
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
      marginTop: 16,
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

    // Done row
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingTop: 12,
      paddingBottom: 14,
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.10)',
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
      color: 'rgba(255,255,255,0.60)',
      fontWeight: '500',
    },
  });
}
