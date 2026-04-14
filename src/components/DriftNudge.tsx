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
 *     onReschedule={() => navigation.navigate('Chat', { mode: 'morning' })}
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

  useEffect(() => {
    const update = () => {
      setNudgeInfo(getNudgeInfo(mitTask, calEvents, isWorking));
    };
    update();
    const interval = setInterval(update, 60_000); // re-check every minute
    return () => clearInterval(interval);
  }, [mitTask, calEvents, isWorking]);

  if (dismissed || !nudgeInfo) return null;

  const { timeStr, minsUntil, eventTitle } = nudgeInfo;
  const urgency = minsUntil <= 15 ? 'urgent' : 'normal';

  return (
    <View style={[s.container, urgency === 'urgent' && s.containerUrgent]}>
      {/* Icon */}
      <View style={[s.iconWrap, urgency === 'urgent' && s.iconWrapUrgent]}>
        <Ionicons
          name={urgency === 'urgent' ? 'warning' : 'time-outline'}
          size={16}
          color={urgency === 'urgent' ? C.error : C.warning}
        />
      </View>

      {/* Message */}
      <View style={s.textWrap}>
        <Text style={[s.nudgeText, urgency === 'urgent' && s.nudgeTextUrgent]}>
          {timeStr} — {mitTask?.text
            ? `"${mitTask.text.length > 30 ? mitTask.text.slice(0, 30) + '…' : mitTask.text}"`
            : 'MIT'} not started.{' '}
          <Text style={s.eventText}>{minsUntil}m before {eventTitle}.</Text>
        </Text>
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.8}>
          <Text style={s.startBtnText}>Start now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rescheduleBtn} onPress={onReschedule} activeOpacity={0.75}>
          <Text style={s.rescheduleBtnText}>Reschedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.dismissBtn}
          onPress={() => setDismissed(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={C.textTertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 4,
      paddingHorizontal: 14,
      paddingVertical: 11,
      backgroundColor: C.warningLight,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.warning + '66',
    },
    containerUrgent: {
      backgroundColor: C.errorLight,
      borderColor: C.error + '66',
    },

    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: C.warning + '22',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconWrapUrgent: {
      backgroundColor: C.error + '22',
    },

    textWrap: {
      flex: 1,
    },
    nudgeText: {
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 18,
    },
    nudgeTextUrgent: {
      fontWeight: '600',
    },
    eventText: {
      fontWeight: '600',
      color: C.textPrimary,
    },

    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    startBtn: {
      paddingHorizontal: 12,
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
      paddingHorizontal: 10,
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
    dismissBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
