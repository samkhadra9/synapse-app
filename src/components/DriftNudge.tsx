/**
 * DriftNudge — Time-blindness protection
 *
 * Shows when: you have an unstarted MIT AND a calendar event is within 45 minutes.
 * Message: "It's 11:43am. MIT not started. 17 min before BMC meeting."
 *
 * Design intent:
 * - ADHD time-blindness makes the clock invisible. This makes it visible.
 * - Not nagging — specific and actionable.
 * - "Start now" → focus mode. "Reschedule" → planning chat.
 * - Auto-dismisses when MIT is started or meeting passes.
 *
 * Usage:
 *   <DriftNudge
 *     mitTask={firstUnstartedMIT}
 *     calEvents={calEvents}
 *     isWorking={workingTaskVisible}
 *     onStart={openFocusMode}
 *     onReschedule={() => navigation.navigate('Chat', { mode: 'dump' })}
 *   />
 */

import React, { useMemo, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { Task } from '../store/useStore';
import { TodayEvent } from '../services/calendar';
import { format } from 'date-fns';

interface DriftNudgeProps {
  mitTask: Task | null;
  calEvents: TodayEvent[];
  isWorking: boolean;
  onStart: () => void;
  onReschedule: () => void;
}

function parseEventTime(timeStr: string): number {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

interface NudgeInfo {
  timeStr: string;
  minsUntil: number;
  eventTitle: string;
}

function getNudgeInfo(
  mitTask: Task | null,
  calEvents: TodayEvent[],
  isWorking: boolean,
): NudgeInfo | null {
  if (!mitTask || isWorking) return null;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const timeStr = format(now, 'h:mma');

  // Find the nearest upcoming event within 45 minutes
  const WINDOW = 45;
  let nearest: { title: string; minsUntil: number } | null = null;

  for (const ev of calEvents) {
    if (ev.allDay) continue;
    const startM = parseEventTime(ev.start);
    if (startM < 0) continue;
    const minsAway = startM - nowMins;
    if (minsAway > 0 && minsAway <= WINDOW) {
      if (!nearest || minsAway < nearest.minsUntil) {
        nearest = { title: ev.title, minsUntil: minsAway };
      }
    }
  }

  if (!nearest) return null;
  return { timeStr, minsUntil: nearest.minsUntil, eventTitle: nearest.title };
}

export default function DriftNudge({
  mitTask,
  calEvents,
  isWorking,
  onStart,
  onReschedule,
}: DriftNudgeProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);

  const [dismissed, setDismissed] = useState(false);
  const [nudgeInfo, setNudgeInfo] = useState<NudgeInfo | null>(null);

  useEffect(() => {
    setDismissed(false); // re-arm if MIT or events change
  }, [mitTask?.id]);

  // Re-run getNudgeInfo whenever dependencies change AND every 60 seconds for clock ticks
  useEffect(() => {
    // Call immediately with current deps
    setNudgeInfo(getNudgeInfo(mitTask, calEvents, isWorking));

    // Set up interval to re-check every minute (in case time passes)
    const interval = setInterval(() => {
      setNudgeInfo(prev => {
        // Re-calculate with current state to avoid stale closure
        const updated = getNudgeInfo(mitTask, calEvents, isWorking);
        // Only return new object if nudge actually changed (prevents unnecessary re-renders)
        if (!updated && !prev) return null;
        if (!updated || !prev) return updated;
        if (updated.minsUntil !== prev.minsUntil || updated.eventTitle !== prev.eventTitle) return updated;
        // Time string will always change (new minute) but that's expected
        return updated;
      });
    }, 60_000); // re-check every minute

    return () => clearInterval(interval);
  }, [mitTask, calEvents, isWorking]);

  if (dismissed || !nudgeInfo) return null;

  const { timeStr, minsUntil, eventTitle } = nudgeInfo;
  const urgency = minsUntil <= 15 ? 'urgent' : 'normal';

  return (
    <View style={[s.container, urgency === 'urgent' && s.containerUrgent]}>
      {/* Row 1: icon + message + dismiss */}
      <View style={s.topRow}>
        <View style={[s.iconWrap, urgency === 'urgent' && s.iconWrapUrgent]}>
          <Ionicons
            name={urgency === 'urgent' ? 'warning' : 'time-outline'}
            size={15}
            color={urgency === 'urgent' ? C.error : C.warning}
          />
        </View>
        <Text style={[s.nudgeText, urgency === 'urgent' && s.nudgeTextUrgent]} numberOfLines={2}>
          {timeStr} — {mitTask?.text
            ? `"${mitTask.text.length > 28 ? mitTask.text.slice(0, 28) + '…' : mitTask.text}"`
            : 'MIT'} not started.{' '}
          <Text style={s.eventText}>{minsUntil}m before {eventTitle}.</Text>
        </Text>
        <TouchableOpacity
          style={s.dismissBtn}
          onPress={() => setDismissed(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={15} color={C.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Row 2: action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.8}>
          <Text style={s.startBtnText}>Start now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rescheduleBtn} onPress={onReschedule} activeOpacity={0.75}>
          <Text style={s.rescheduleBtnText}>Reschedule</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 4,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: C.warningLight,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.warning + '66',
    },
    containerUrgent: {
      backgroundColor: C.errorLight,
      borderColor: C.error + '66',
    },

    // Row 1: icon + text + dismiss
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8,
    },
    iconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.warning + '22',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },
    iconWrapUrgent: {
      backgroundColor: C.error + '22',
    },
    nudgeText: {
      flex: 1,
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 18,
    },
    nudgeTextUrgent: {
      fontWeight: '600',
    },
    eventText: {
      fontWeight: '700',
      color: C.textPrimary,
    },
    dismissBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },

    // Row 2: action buttons
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 30, // indent to align with text (icon width + gap)
    },
    startBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: C.primary,
      borderRadius: Radius.full,
    },
    startBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textInverse,
    },
    rescheduleBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: C.border,
    },
    rescheduleBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
    },
  });
}
