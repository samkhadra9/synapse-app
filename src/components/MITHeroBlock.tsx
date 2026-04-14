/**
 * MITHeroBlock — Externalised PFC: initiation engine
 *
 * The single most important piece of UI in Synapse. It solves the
 * ADHD initiation problem: you know what to do, you just can't start.
 *
 * Clinically-informed design (based on ADHD coaching models):
 *
 * 1. MICRO-ACTION — AI generates the exact first physical step.
 *    Not "work on report" but "Open the Google Doc and read your last sentence."
 *    Removes ALL ambiguity. The brain can initiate because it knows the door.
 *
 * 2. FOCUS WINDOW — Shows time until next meeting.
 *    Time-blindness means the clock is invisible. Making it concrete ("1h 20m")
 *    reduces the anxiety of "I don't know how long I have."
 *
 * 3. GOAL BRIDGE — One sentence connecting the task to the north star.
 *    ADHD motivation is interest/relevance-driven, not importance/deadline-driven.
 *    Showing "This advances: become a senior PM" creates the dopamine bridge.
 *
 * 4. TWO ENTRY MODES — "Start working" (full focus session) or
 *    "Just 5 min" (low-stakes starter). Perfectionism and task-size
 *    anxiety block initiation; making 5 minutes feel legitimate unlocks it.
 *
 * 5. DONE IS PROMINENT BUT SAFE — Completing the MIT is big and satisfying,
 *    but separated spatially from Start to prevent accidental completion.
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
import { format } from 'date-fns';

interface MITHeroBlockProps {
  task: Task;
  calEvents: TodayEvent[];
  goals: LifeGoal[];
  profile: UserProfile;
  onStart: (quickStart?: boolean) => void;  // quickStart = 5-min mode
  onComplete: () => void;
}

// Parse event time string (e.g. "9:00 AM") → minutes since midnight
function parseTime(timeStr: string): number {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function getFocusWindow(calEvents: TodayEvent[]): { minsUntil: number; label: string; eventTitle: string } | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let nearest: { minsUntil: number; title: string } | null = null;

  for (const ev of calEvents) {
    if (ev.allDay) continue;
    const startM = parseTime(ev.start);
    if (startM < 0) continue;
    const minsAway = startM - nowMins;
    if (minsAway > 0 && (!nearest || minsAway < nearest.minsUntil)) {
      nearest = { minsUntil: minsAway, title: ev.title };
    }
  }

  if (!nearest) return null;

  const { minsUntil, title } = nearest;
  let label: string;
  if (minsUntil < 60) {
    label = `${minsUntil} min`;
  } else {
    const h = Math.floor(minsUntil / 60);
    const m = minsUntil % 60;
    label = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return { minsUntil, label, eventTitle: title };
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

  const focusWindow = useMemo(() => getFocusWindow(calEvents), [calEvents]);
  const topGoal = useMemo(() => goals.find(g => g.horizon === '1year'), [goals]);

  // Generate micro-action on mount / when task changes
  useEffect(() => {
    let cancelled = false;
    setMicroAction(null);

    async function generate() {
      setMicroLoading(true);
      try {
        const firstName = profile.name ? profile.name.split(' ')[0] : null;
        const res = await fetchAnthropic(
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 60,
            system: `You help people with ADHD start tasks. Given a task name, output ONLY the single smallest first physical action — 5-10 words max. No preamble, no punctuation at start. Just the action. Examples: "Open the doc and read your last sentence" / "Write the subject line only" / "Pull up the email and click Reply" / "Set a timer for 10 minutes"`,
            messages: [{
              role: 'user',
              content: `Task: "${task.text}"${focusWindow ? ` (${focusWindow.label} before ${focusWindow.eventTitle})` : ''}${topGoal ? `. Goal: "${topGoal.text}"` : ''}`,
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
  }, [task.id]);

  const focusWindowTight = focusWindow && focusWindow.minsUntil <= 30;

  return (
    <View style={s.container}>

      {/* ── Focus window band ── */}
      {focusWindow && (
        <View style={[s.windowBand, focusWindowTight && s.windowBandTight]}>
          <Ionicons
            name="time-outline"
            size={12}
            color={focusWindowTight ? C.error : 'rgba(255,255,255,0.75)'}
          />
          <Text style={[s.windowText, focusWindowTight && s.windowTextTight]}>
            {focusWindow.label} before {focusWindow.eventTitle}
          </Text>
        </View>
      )}

      {/* ── MIT label ── */}
      <View style={s.labelRow}>
        <View style={s.mitChip}>
          <Text style={s.mitChipText}>★  MIT</Text>
        </View>
        {task.estimatedMinutes ? (
          <Text style={s.duration}>~{task.estimatedMinutes} min</Text>
        ) : null}
      </View>

      {/* ── Task text ── */}
      <Text style={s.taskText} numberOfLines={3}>{task.text}</Text>

      {/* ── Micro-action: the first door ── */}
      <View style={s.microActionRow}>
        <View style={s.microArrow}>
          <Text style={s.microArrowText}>↳</Text>
        </View>
        <View style={{ flex: 1 }}>
          {microLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              <Text style={s.microLoading}>Finding your first step…</Text>
            </View>
          ) : microAction ? (
            <Text style={s.microAction}>{microAction}</Text>
          ) : task.reason ? (
            <Text style={s.microAction}>{task.reason}</Text>
          ) : null}
        </View>
      </View>

      {/* ── Goal bridge ── */}
      {topGoal && (
        <View style={s.goalBridge}>
          <Ionicons name="flag-outline" size={11} color="rgba(255,255,255,0.55)" />
          <Text style={s.goalBridgeText} numberOfLines={2}>
            This moves: <Text style={s.goalBridgeGoal}>{topGoal.text}</Text>
          </Text>
        </View>
      )}

      {/* ── Actions ── */}
      <View style={s.actions}>
        {/* 5-minute low-stakes start */}
        <TouchableOpacity
          style={s.quickStartBtn}
          onPress={() => onStart(true)}
          activeOpacity={0.78}
        >
          <Text style={s.quickStartLabel}>Just 5 min</Text>
        </TouchableOpacity>

        {/* Full focus session */}
        <TouchableOpacity
          style={s.startBtn}
          onPress={() => onStart(false)}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={14} color={C.primary} />
          <Text style={s.startLabel}>Start working</Text>
        </TouchableOpacity>
      </View>

      {/* ── Done — separate row, safer placement ── */}
      <TouchableOpacity style={s.doneRow} onPress={onComplete} activeOpacity={0.7}>
        <View style={s.doneCheck}>
          <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
        </View>
        <Text style={s.doneLabel}>Mark as done</Text>
      </TouchableOpacity>

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
      overflow: 'hidden',
    },

    // ── Focus window band ──────────────────────────────────────────────────────
    windowBand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 20,
      paddingVertical: 7,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    windowBandTight: {
      backgroundColor: 'rgba(220,38,38,0.35)',
    },
    windowText: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.75)',
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    windowTextTight: {
      color: '#fff',
    },

    // ── Content ────────────────────────────────────────────────────────────────
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    mitChip: {
      backgroundColor: 'rgba(255,255,255,0.20)',
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    mitChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.8,
    },
    duration: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.60)',
      fontWeight: '500',
    },

    taskText: {
      fontSize: 22,
      fontWeight: '700',
      color: '#fff',
      lineHeight: 28,
      letterSpacing: -0.5,
      paddingHorizontal: 20,
      marginTop: 10,
    },

    // ── Micro-action ───────────────────────────────────────────────────────────
    microActionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      paddingHorizontal: 20,
      marginTop: 10,
      minHeight: 20,
    },
    microArrow: {
      marginTop: 1,
    },
    microArrowText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.50)',
      fontWeight: '400',
    },
    microAction: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.82)',
      lineHeight: 20,
      fontStyle: 'italic',
    },
    microLoading: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.45)',
      fontStyle: 'italic',
    },

    // ── Goal bridge ────────────────────────────────────────────────────────────
    goalBridge: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      paddingHorizontal: 20,
      marginTop: 8,
    },
    goalBridgeText: {
      flex: 1,
      fontSize: 12,
      color: 'rgba(255,255,255,0.52)',
      lineHeight: 17,
    },
    goalBridgeGoal: {
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.70)',
    },

    // ── Action buttons ─────────────────────────────────────────────────────────
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 16,
    },

    // "Just 5 min" — low-stakes, lower visual weight
    quickStartBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.30)',
    },
    quickStartLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.80)',
    },

    // "Start working" — primary CTA, inverted colours (white bg)
    startBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
    },
    startLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: C.primary,
    },

    // ── Done row — visually separated, lower prominence ───────────────────────
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.15)',
      marginTop: 12,
    },
    doneCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.40)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneLabel: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.65)',
      fontWeight: '500',
    },
  });
}
