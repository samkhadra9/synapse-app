/**
 * DashboardScreen — Solas V2
 *
 * Layout:
 *   Horizontal pager (pagingEnabled):
 *     Page 0 (left):  Today — Greeting / Deep Work / Plan / Tasks / Habits / Projects
 *     Page 1 (right): Goals — 1yr / 5yr / 10yr aspirational goals (aesthetic panel)
 *   Dot page indicator between header and content
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
  Dimensions, NativeScrollEvent, NativeSyntheticEvent, Animated,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { Colors, Spacing, Radius, DomainColors, useColors } from '../theme';
import { useStore, DomainKey, Task, LifeGoal, TimeHorizon, TimeBlockType, PlannedSlot } from '../store/useStore';
import { syncAllProjects, getTodayCalendarEvents, getTodayReminders, TodayEvent, TodayReminder, reconcileCalendarToDayPlan } from '../services/calendar';
import FloatingAddButton from '../components/FloatingAddButton';
import WorkingModeModal from '../components/WorkingModeModal';
import MITHeroBlock from '../components/MITHeroBlock';
import AmbientChatStrip from '../components/AmbientChatStrip';
import DriftNudge from '../components/DriftNudge';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect natural-language date hints in captured task text.
 *  Returns { date: 'YYYY-MM-DD', label: 'Friday 11 Apr' } or null. */
function parseNaturalDate(text: string): { date: string; label: string } | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const now   = new Date();

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now.getTime() + 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM') };
  }

  // "next week" / "this week"
  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now.getTime() + 7 * 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: `Week of ${format(d, 'EEE d MMM')}` };
  }

  // "by/on/next <day>" e.g. "by friday", "on monday", "next wednesday"
  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayMatch = lower.match(/\b(?:by|on|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const target   = DAY_NAMES.indexOf(dayMatch[1]);
    const current  = now.getDay();
    let   daysAway = target - current;
    if (daysAway <= 0) daysAway += 7;
    // "next <day>" adds another week
    if (/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)) {
      daysAway += 7;
    }
    const d = new Date(now.getTime() + daysAway * 86400000);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM') };
  }

  return null;
}

function formatMinutes(total: number): string {
  const h    = Math.floor(total / 60);
  const m    = total % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function roundUpToHalfHour(date: Date): number {
  const total = date.getHours() * 60 + date.getMinutes();
  return Math.ceil(total / 30) * 30;
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Top action buttons — Deep Work + time-aware Plan/Wind-down
const CHARCOAL = '#18181B';

const PLAN_LABELS: Record<string, { label: string; title: string }> = {
  morning: { label: 'MORNING', title: 'Plan my day'   },
  evening: { label: 'EVENING', title: 'Wind down'     },
  weekly:  { label: 'WEEKLY',  title: 'Weekly review' },
};

function HomeActionsV2({ navigation }: { navigation: any }) {
  const planMode: 'morning' | 'evening' | 'weekly' = (() => {
    const h = new Date().getHours(), dow = new Date().getDay();
    if (dow === 0) return 'weekly';
    if (h >= 17) return 'evening';
    return 'morning';
  })();

  return (
    <HomeActions
      onDeepWork={() => navigation.navigate('DeepWork')}
      onPlan={() => navigation.navigate('Chat', { mode: planMode === 'weekly' ? 'weekly' : planMode === 'evening' ? 'evening' : 'morning' })}
      mode={planMode}
      accent="#D4821A"
    />
  );
}

function HomeActions({ onDeepWork, onPlan, mode, accent }: {
  onDeepWork: () => void;
  onPlan:     () => void;
  mode:       'morning' | 'evening' | 'weekly';
  accent:     string;
}) {
  const C = useColors();
  const ha = useMemo(() => makeHa(C), [C]);
  const plan = PLAN_LABELS[mode];
  return (
    <View style={ha.row}>
      {/* Deep Work pill */}
      <TouchableOpacity style={ha.pill} onPress={onDeepWork} activeOpacity={0.78}>
        <Ionicons name="flash" size={15} color={C.textPrimary} />
        <Text style={ha.pillText}>Deep work</Text>
        <Ionicons name="chevron-forward" size={13} color={C.textTertiary} />
      </TouchableOpacity>

      {/* Plan pill */}
      <TouchableOpacity style={[ha.pill, { borderColor: accent + '55', backgroundColor: accent + '12' }]} onPress={onPlan} activeOpacity={0.78}>
        <Ionicons name="sparkles" size={15} color={accent} />
        <Text style={[ha.pillText, { color: accent }]}>{plan.title}</Text>
        <Ionicons name="chevron-forward" size={13} color={accent + '88'} />
      </TouchableOpacity>
    </View>
  );
}

function makeHa(C: any) { return StyleSheet.create({
  row:  { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: C.border,
  },
  pillText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textPrimary, letterSpacing: -0.2 },
}); }

// Clean flat checklist — MITs first, then regular tasks
function TodaySequence({ tasks, onToggle, accent }: { tasks: Task[]; onToggle: (id: string) => void; accent: string }) {
  const C = useColors();
  const seq = useMemo(() => makeSeq(C), [C]);
  // Sort: MITs first, then by completed status
  const sorted = [
    ...tasks.filter(t => t.isMIT && !t.completed),
    ...tasks.filter(t => !t.isMIT && !t.completed),
    ...tasks.filter(t => t.completed),
  ];

  return (
    <View style={seq.list}>
      {sorted.map((task, i) => {
        const isMIT = task.isMIT && !task.completed;
        return (
          <View
            key={task.id}
            style={[seq.row, i > 0 && seq.rowBorder, task.completed && seq.rowDone]}
          >
            {/* Checkbox — only this triggers complete */}
            <TouchableOpacity
              style={[
                seq.circle,
                isMIT && { borderColor: accent, borderWidth: 2 },
                task.completed && seq.circleDone,
              ]}
              onPress={() => onToggle(task.id)}
              activeOpacity={0.65}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {task.completed && <Text style={seq.tick}>✓</Text>}
            </TouchableOpacity>

            {/* Text + reason — tapping does nothing (no accidental complete) */}
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  seq.label,
                  isMIT && seq.labelBold,
                  task.completed && seq.labelDone,
                ]}
                numberOfLines={2}
              >
                {task.text}
              </Text>
              {task.reason && !task.completed ? (
                <Text style={seq.reason}>{task.reason}</Text>
              ) : null}
            </View>

            {/* Right-side: MIT badge + time */}
            <View style={seq.right}>
              {task.isMIT && !task.completed ? (
                <View style={[seq.mitPill, { backgroundColor: accent + '22' }]}>
                  <Text style={[seq.mitPillText, { color: accent }]}>★</Text>
                </View>
              ) : null}
              {task.estimatedMinutes && !task.completed ? (
                <Text style={seq.time}>{task.estimatedMinutes}m</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeSeq(C: any) { return StyleSheet.create({
  list: {},

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: C.surface,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderLight },
  rowDone:   { opacity: 0.38 },

  // Circle checkbox
  circle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  circleAccent: { borderColor: '#D4621A', borderWidth: 2 },
  circleDone:  { backgroundColor: C.textTertiary, borderColor: C.textTertiary },
  tick:        { fontSize: 9, color: '#fff', fontWeight: '900' },

  // Text
  label:     { fontSize: 14, fontWeight: '400', color: C.textSecondary, lineHeight: 20 },
  labelBold: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  labelDone: { textDecorationLine: 'line-through', color: C.textTertiary },
  reason:    { fontSize: 11, color: C.textTertiary, marginTop: 1, fontStyle: 'italic' },

  // Right side
  right:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mitPill:     { backgroundColor: C.accentLight, borderRadius: 99, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  mitPillText: { fontSize: 10, color: C.accent },
  time:        { fontSize: 11, color: C.textTertiary },
}); }

// Inbox task row
function InboxRow({ task, onSchedule }: { task: Task; onSchedule: () => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <TouchableOpacity style={styles.inboxRow} onPress={onSchedule} activeOpacity={0.75}>
      <View style={styles.inboxDot} />
      <Text style={styles.inboxText} numberOfLines={1}>{task.text}</Text>
      {task.estimatedMinutes ? (
        <Text style={styles.inboxMeta}>~{task.estimatedMinutes}m</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// Overdue banner — shown above Today if tasks are overdue
function OverdueBanner({ tasks, onPress }: { tasks: Task[]; onPress: () => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const today = format(new Date(), 'yyyy-MM-dd');
  if (!tasks.length) return null;
  const aged = tasks.filter(t => {
    try { return differenceInDays(new Date(today), parseISO(t.date)) >= 7; }
    catch { return false; }
  });
  return (
    <TouchableOpacity style={styles.overdueBanner} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.overdueLeft}>
        <Text style={styles.overdueTitle}>
          {tasks.length} overdue{aged.length > 0 ? ` · ${aged.length} stale 7d+` : ''}
        </Text>
        <Text style={styles.overdueSub} numberOfLines={1}>
          {tasks.slice(0, 2).map(t => t.text).join(' · ')}
          {tasks.length > 2 ? ` +${tasks.length - 2} more` : ''}
        </Text>
      </View>
      <Text style={styles.overdueAction}>Review →</Text>
    </TouchableOpacity>
  );
}

// Compact project row
function ProjectRow({ project, onPress }: { project: any; onPress: () => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dc       = DomainColors[project.domain as DomainKey] ?? DomainColors.work;
  const total    = project.tasks?.length ?? 0;
  const done     = project.tasks?.filter((t: any) => t.completed).length ?? 0;
  const pct      = total > 0 ? done / total : 0;
  const daysLeft = (() => {
    if (!project.deadline) return null;
    try {
      const d = parseISO(project.deadline);
      return isNaN(d.getTime()) ? null : differenceInDays(d, new Date());
    } catch { return null; }
  })();

  return (
    <TouchableOpacity style={styles.projectRow} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.projectAccent, { backgroundColor: dc.text }]} />
      <View style={styles.projectBody}>
        <Text style={styles.projectTitle} numberOfLines={1}>{project.title}</Text>
        {total > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${Math.round(pct * 100)}%` as any,
                backgroundColor: dc.text,
              }]} />
            </View>
            <Text style={styles.progressLabel}>{done}/{total}</Text>
          </View>
        )}
      </View>
      {daysLeft !== null && (
        <Text style={[styles.daysLeft, daysLeft < 7 && { color: C.error }]}>
          {daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : `${daysLeft}d`}
        </Text>
      )}
      <Text style={styles.projectChevron}>›</Text>
    </TouchableOpacity>
  );
}

// Quick-add modal (inbox-first: task goes to inbox unless user flips to today)
function QuickAddModal({ visible, onClose, onAdd }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (text: string, addToToday: boolean, detectedDate?: string) => void;
}) {
  const C = useColors();
  const qa = useMemo(() => makeQa(C), [C]);
  const [text,         setText]         = useState('');
  const [addToToday,   setAddToToday]   = useState(false);
  const [ignoredDate,  setIgnoredDate]  = useState(false);

  const detectedDate = ignoredDate ? null : parseNaturalDate(text);

  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim(), addToToday, detectedDate?.date);
    setText(''); setAddToToday(false); setIgnoredDate(false); onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={qa.overlay}>
        <TouchableOpacity style={qa.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={qa.sheet}>
          <View style={qa.handle} />
          <Text style={qa.title}>Capture task</Text>
          <TextInput
            style={qa.input}
            value={text}
            onChangeText={t => { setText(t); setIgnoredDate(false); }}
            placeholder="What's on your mind?"
            placeholderTextColor={C.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          {/* Natural-language date chip */}
          {detectedDate && (
            <View style={qa.dateChipRow}>
              <View style={qa.dateChip}>
                <Text style={qa.dateChipText}>📅 {detectedDate.label}</Text>
              </View>
              <TouchableOpacity onPress={() => setIgnoredDate(true)} style={qa.dateChipRemove}>
                <Text style={qa.dateChipRemoveText}>×</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={qa.mitRow}>
            <View>
              <Text style={qa.mitLabel}>Add to today</Text>
              <Text style={qa.mitSub}>Off = goes to Inbox to schedule later</Text>
            </View>
            <Switch
              value={addToToday}
              onValueChange={setAddToToday}
              trackColor={{ false: C.borderLight, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={[qa.addBtn, !text.trim() && qa.addBtnOff]} onPress={submit} disabled={!text.trim()} activeOpacity={0.85}>
            <Text style={qa.addBtnText}>{addToToday ? 'Add to today' : 'Add to inbox'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={qa.cancelBtn} onPress={onClose}>
            <Text style={qa.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Timeline Page (Page 0) ────────────────────────────────────────────────────

const SLOT_H        = 36;  // px per 30-min slot — compact
const TL_START      = 5;   // 5 AM (absolute min)
const TL_END        = 23;  // 11 PM
const TIME_W        = 48;  // width of the time label column
const STRIP_H       = 288; // fixed height of the timeline strip (4 hours × 2 slots × 36px = 288)
const WINDOW_H      = 2;   // hours before current time to show
const WINDOW_TOTAL  = 4;   // total hours visible in strip

function minsToY(totalMins: number): number {
  return ((totalMins - TL_START * 60) / 30) * SLOT_H;
}

function parseEventTime(timeStr: string): number {
  // timeStr from getTodayCalendarEvents is like "9:00 AM" or "9:30 PM"
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function parseEventColor(type: TimeBlockType): string {
  return BLOCK_COLORS[type] || '#3B82F6';
}

// ── Next Event Countdown Component ────────────────────────────────────────────

function NextEventCountdown({ calEvents }: { calEvents: TodayEvent[] }) {
  const C = useColors();

  const [countdown, setCountdown] = useState<{
    minutesUntil: number;
    eventTitle: string;
  } | null>(null);

  // ── ALL hooks must live before any early return ───────────────────────────
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Countdown interval — updates every 30 s
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      let nextEvent: TodayEvent | null = null;
      let minMinutesAway = 240; // look ahead max 4 hours
      for (const ev of calEvents) {
        const startM = parseEventTime(ev.start);
        if (startM < 0) continue;
        const minutesAway = startM - nowMins;
        if (minutesAway > 0 && minutesAway < minMinutesAway) {
          minMinutesAway = minutesAway;
          nextEvent = ev;
        }
      }
      setCountdown(nextEvent ? { minutesUntil: minMinutesAway, eventTitle: nextEvent.title } : null);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 30000);
    return () => clearInterval(timer);
  }, [calEvents]);

  // Pulse animation when event is < 30 min away — derived from countdown state
  const isUrgent = countdown !== null && countdown.minutesUntil < 30;
  useEffect(() => {
    if (isUrgent) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 0.7, duration: 750, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1.0, duration: 750, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      opacityAnim.setValue(1);
    }
  }, [isUrgent, opacityAnim]);

  // ── Early return AFTER all hooks ──────────────────────────────────────────
  if (!countdown) return null;

  const { minutesUntil, eventTitle } = countdown;
  let displayText: string;
  let statusColor: string;

  if (minutesUntil > 60) {
    const h = Math.floor(minutesUntil / 60);
    const m = minutesUntil % 60;
    displayText = `${h}h ${m}min until ${eventTitle}`;
    statusColor = C.success;
  } else if (minutesUntil >= 30) {
    displayText = `${minutesUntil} min until ${eventTitle}`;
    statusColor = '#F59E0B';
  } else {
    displayText = `⚠ ${minutesUntil} min until ${eventTitle}`;
    statusColor = '#EF4444';
  }

  return (
    <Animated.View style={[{
      borderRadius: Radius.full,
      paddingVertical: 7,
      paddingHorizontal: 14,
      backgroundColor: statusColor + '22',
      alignSelf: 'flex-start',
      marginHorizontal: Spacing.lg,
      marginBottom: 8,
    }, isUrgent ? { opacity: opacityAnim } : {}]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: statusColor }}>
        {displayText}
      </Text>
    </Animated.View>
  );
}

// ── Momentum Celebration Component ────────────────────────────────────────────

function MomentumCelebration({
  task,
  projectTitle,
  goalText,
  onDismiss,
}: {
  task: Task | null;
  projectTitle?: string;
  goalText?: string;
  onDismiss: () => void;
}) {
  const C = useColors();

  useEffect(() => {
    if (task) {
      const timer = setTimeout(onDismiss, 2500);
      return () => clearTimeout(timer);
    }
  }, [task, onDismiss]);

  if (!task) return null;

  return (
    <Modal
      visible={task !== null}
      animationType="fade"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={onDismiss}
        activeOpacity={1}
      >
        <TouchableOpacity
          style={{
            backgroundColor: C.surface,
            borderRadius: Radius.xl,
            padding: Spacing.xl,
            alignItems: 'center',
            maxWidth: '80%',
          }}
          onPress={() => {}} // Prevent dismissal when tapping the card
          activeOpacity={1}
        >
          {/* Checkmark circle */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: C.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: Spacing.lg,
            }}
          >
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>

          {/* Task text */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: C.textPrimary,
              textAlign: 'center',
              marginBottom: projectTitle || goalText ? Spacing.md : 0,
            }}
          >
            {task.text}
          </Text>

          {/* Project title */}
          {projectTitle && (
            <Text
              style={{
                fontSize: 13,
                color: C.textTertiary,
                textAlign: 'center',
                marginBottom: goalText ? Spacing.sm : 0,
              }}
            >
              → {projectTitle}
            </Text>
          )}

          {/* Goal text */}
          {goalText && (
            <Text
              style={{
                fontSize: 13,
                color: C.primary,
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              Moves you toward: {goalText}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PlanningPromptCard({
  onPlanPress,
  onDismiss,
  visible,
}: {
  onPlanPress: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  if (!visible) return null;
  const C = useColors();
  return (
    <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.base }}>
      <View
        style={{
          backgroundColor: C.surface,
          borderRadius: Radius.xl,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: C.border,
          padding: 18,
        }}
      >
        {/* Top row: amber dot + "No plan yet" */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: C.primary, // amber/primary
            }}
          />
          <Text
            style={{
              fontSize: 11,
              color: C.textTertiary,
              fontWeight: '600',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            No plan yet
          </Text>
        </View>

        {/* Large text: "Let's build your day" */}
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: C.textPrimary,
            marginTop: 6,
            marginBottom: 4,
          }}
        >
          Let's build your day
        </Text>

        {/* Sub text */}
        <Text
          style={{
            fontSize: 13,
            color: C.textSecondary,
            lineHeight: 18,
            marginBottom: 14,
          }}
        >
          Takes 3 minutes. Your tasks, sequenced.
        </Text>

        {/* Full-width button */}
        <TouchableOpacity
          style={{
            backgroundColor: C.ink,
            borderRadius: Radius.lg,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={onPlanPress}
          activeOpacity={0.8}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: '700',
            }}
          >
            Plan my day →
          </Text>
        </TouchableOpacity>

        {/* Small dismiss link */}
        <TouchableOpacity
          style={{
            marginTop: 10,
            alignItems: 'center',
          }}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text
            style={{
              fontSize: 12,
              color: C.textTertiary,
              textAlign: 'center',
            }}
          >
            I'll wing it today
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TodayTimelinePage({
  navigation,
  onQuickAdd,
  workingTask,
  setWorkingTask,
  calEvents,
  quickStart = false,
}: {
  navigation: any;
  onQuickAdd: () => void;
  workingTask: Task | null;
  setWorkingTask: (t: Task | null, isQuick?: boolean) => void;
  calEvents: TodayEvent[];
  quickStart?: boolean;
}) {
  const C = useColors();
  const tl = useMemo(() => makeTl(C), [C]);

  const [momentumTask, setMomentumTask] = useState<Task | null>(null);
  const [showMITInput, setShowMITInput] = useState(false);
  const [mitInputText, setMitInputText] = useState('');
  const [showPlanningPrompt, setShowPlanningPrompt] = useState(true);

  // Live clock — keeps greeting/timeline/planMode current
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { profile, tasks, toggleTask, dayPlan, togglePlannedTask, projects, goals, addTask, saveDayPlan, lastCalendarSync, focusTaskId, setFocusTask } = useStore(s => ({
    profile: s.profile,
    tasks: s.tasks,
    toggleTask: s.toggleTask,
    dayPlan: s.dayPlan,
    togglePlannedTask: s.togglePlannedTask,
    projects: s.projects,
    goals: s.goals,
    addTask: s.addTask,
    saveDayPlan: s.saveDayPlan,
    lastCalendarSync: s.lastCalendarSync,
    focusTaskId: s.focusTaskId,
    setFocusTask: s.setFocusTask,
  }));

  // Option C: reconcile iOS Calendar → DayPlan on focus and on app foreground.
  // Pulls back any time-shifts or deletions the user made externally (e.g.
  // dragged an [Aiteall] block on Mac Calendar). Tasks are source of truth
  // for everything except the scheduled time, which flows both ways.
  const reconcileWithCalendar = useCallback(async () => {
    const current = useStore.getState().dayPlan;
    if (!current || !current.slots?.length) return;
    try {
      const reconciled = await reconcileCalendarToDayPlan(current);
      if (reconciled) useStore.getState().saveDayPlan(reconciled);
      // Mark sync timestamp — even when nothing changed, the read itself confirms
      // we're in sync with the calendar as of now.
      useStore.getState().markCalendarSynced();
    } catch {
      // Silent — reconcile is a best-effort background sync
    }
  }, []);

  useFocusEffect(useCallback(() => { reconcileWithCalendar(); }, [reconcileWithCalendar]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') reconcileWithCalendar();
    });
    return () => sub.remove();
  }, [reconcileWithCalendar]);

  // Reset showPlanningPrompt when todayPlan becomes null
  useEffect(() => {
    if (!dayPlan || dayPlan.date !== format(now, 'yyyy-MM-dd')) {
      setShowPlanningPrompt(true);
    }
  }, [dayPlan, now]);

  const today = format(now, 'yyyy-MM-dd');
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Window: WINDOW_H hours before now to (WINDOW_H + WINDOW_TOTAL) hours after start
  const windowStartMins = Math.max(TL_START * 60, nowMins - WINDOW_H * 60);
  const windowEndMins = windowStartMins + WINDOW_TOTAL * 60;

  // Convert absolute minutes to Y within the strip
  function minsToStripY(mins: number): number {
    return ((mins - windowStartMins) / 30) * SLOT_H;
  }

  // Hour markers to show in strip
  const stripHours = Array.from(
    { length: WINDOW_TOTAL + 1 },
    (_, i) => Math.floor(windowStartMins / 60) + i,
  ).filter(h => h >= TL_START && h <= TL_END);

  const timeBlocks = profile.weekTemplate ?? [];
  const todayDow = now.getDay();

  // Day plan for today
  const todayPlan = dayPlan?.date === today ? dayPlan : null;

  // Helper: get planned slot for a given event label / time
  function getPlannedSlot(eventLabel: string): PlannedSlot | undefined {
    return todayPlan?.slots.find(s =>
      s.eventLabel.toLowerCase() === eventLabel.toLowerCase()
    );
  }

  // Helper: format "HH:MM" 24hr plan time → "2:00 PM"
  function formatPlanTime(time24: string): string {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // Build taskId → {time, label} map from today's day plan (for sorted task list)
  const taskSlotMap = useMemo<Record<string, { time: string; label: string }>>(() => {
    if (!todayPlan) return {};
    const map: Record<string, { time: string; label: string }> = {};
    todayPlan.slots.forEach(slot => {
      slot.tasks.forEach(t => {
        map[t.id] = { time: slot.time, label: slot.eventLabel };
      });
    });
    return map;
  }, [todayPlan]);

  // Handle task toggle with momentum celebration for MIT completion
  function handleToggleTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    const wasIncomplete = task && !task.completed;
    const isMIT = task?.isMIT;
    toggleTask(taskId);
    if (wasIncomplete && isMIT) {
      setMomentumTask(task);
    }
  }

  // Resolve project and goal for momentum display
  const momentumProject = momentumTask?.projectId
    ? projects.find(p => p.id === momentumTask.projectId)
    : undefined;
  const momentumGoal = goals.find(g => g.horizon === '1year');

  // Primary MIT for hero block + drift nudge — first incomplete MIT today
  const primaryMIT = useMemo(
    () => tasks.find(t => t.date === today && t.isMIT && !t.completed) ?? null,
    [tasks, today],
  );

  // Today's tasks
  const todayTasks = useMemo(
    () => tasks.filter(t => t.date === today).sort((a, b) => {
      if (a.isMIT && !b.isMIT) return -1;
      if (!a.isMIT && b.isMIT) return 1;
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      return 0;
    }),
    [tasks, today],
  );

  // Overwhelm triggers — too many MITs, or chronic backlog.
  const activeMITCount = useMemo(
    () => tasks.filter(t => t.date === today && t.isMIT && !t.completed).length,
    [tasks, today],
  );
  // Overdue = Aiteall tasks with a due date before today that aren't done.
  // Cap at 30-day-old so ancient brain-dumps don't keep this card alive forever.
  const overdueCount = useMemo(() => {
    const thirtyDaysAgo = format(addDays(new Date(), -30), 'yyyy-MM-dd');
    return tasks.filter(t =>
      t.date && t.date < today && t.date >= thirtyDaysAgo && !t.completed
    ).length;
  }, [tasks, today]);
  const overwhelmReason: 'too-many-mits' | 'backlog' | null =
    activeMITCount >= 3 ? 'too-many-mits'
    : overdueCount >= 5 ? 'backlog'
    : null;

  const completedCount = todayTasks.filter(t => t.completed).length;

  const timeOfDay = now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening';
  const firstName = profile.name ? profile.name.split(' ')[0] : null;

  // Focus window — next event timing for header subtitle
  const focusWindowSubtitle = useMemo(() => {
    if (!calEvents.length) return null;
    const nowM = now.getHours() * 60 + now.getMinutes();
    let nearest: { minsUntil: number; title: string } | null = null;
    for (const ev of calEvents) {
      if (ev.allDay) continue;
      const m = ev.start.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) continue;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      const startM = h * 60 + min;
      const minsAway = startM - nowM;
      if (minsAway > 0 && (!nearest || minsAway < nearest.minsUntil)) {
        nearest = { minsUntil: minsAway, title: ev.title };
      }
    }
    if (!nearest) return null;
    const { minsUntil, title } = nearest;
    const h = Math.floor(minsUntil / 60);
    const m = minsUntil % 60;
    const label = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${minsUntil}m`;
    return `${label} before ${title}`;
  }, [calEvents, now]);

  // Handle MIT input submission
  const handleMITSubmit = () => {
    const text = mitInputText.trim();
    if (!text) return;
    addTask({
      text,
      isMIT: true,
      date: today,
      isToday: true,
      isInbox: false,
      priority: 'high',
      domain: profile.selectedDomains?.[0] ?? 'work',
      completed: false,
    });
    setMitInputText('');
    setShowMITInput(false);
  };

  // Resolve focus task — when set, render a locked "Just this" view.
  const focusTask = focusTaskId ? tasks.find(t => t.id === focusTaskId) ?? null : null;

  if (focusTask && !focusTask.completed) {
    return (
      <View style={{ width: SCREEN_W, flex: 1, backgroundColor: C.background, padding: Spacing.lg, justifyContent: 'center' }}>
        <View style={tl.focusHeader}>
          <Text style={tl.focusEyebrow}>JUST THIS</Text>
          <TouchableOpacity onPress={() => setFocusTask(null)} activeOpacity={0.7}>
            <Text style={tl.focusExit}>Exit focus mode</Text>
          </TouchableOpacity>
        </View>

        <View style={tl.focusCard}>
          <Text style={tl.focusPrompt}>Your brain is full. Stop deciding.</Text>
          <Text style={tl.focusLabel}>Do this one thing:</Text>
          <Text style={tl.focusTaskText}>{focusTask.text}</Text>
          {focusTask.reason ? (
            <Text style={tl.focusReason}>{focusTask.reason}</Text>
          ) : null}
          <Text style={tl.focusTimerHint}>
            Set a 10-minute timer when you start. That's your only commitment.
          </Text>
        </View>

        <TouchableOpacity
          style={tl.focusDoneBtn}
          onPress={() => {
            handleToggleTask(focusTask.id);
            setFocusTask(null);
          }}
          activeOpacity={0.85}
        >
          <Text style={tl.focusDoneText}>✓ Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ width: SCREEN_W, flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <View style={tl.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={tl.pageTitle}>{timeOfDay}</Text>
          <Text style={tl.pageSubtitle}>
            {format(now, 'EEEE, d MMMM')}
            {focusWindowSubtitle ? `  ·  ${focusWindowSubtitle}` : completedCount > 0 ? `  ·  ${completedCount} done` : ''}
          </Text>
        </View>
        <TouchableOpacity style={tl.datePlusBtn} onPress={onQuickAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={C.textInverse} />
        </TouchableOpacity>
      </View>

      {/* ── Overwhelm card — proactively surfaces when load is too high ──── */}
      {overwhelmReason && (
        <TouchableOpacity
          style={tl.overwhelmCard}
          onPress={() => navigation.navigate('Chat', { mode: 'fatigue' })}
          activeOpacity={0.85}
        >
          <View style={tl.overwhelmLeft}>
            <Text style={tl.overwhelmIcon}>⚡︎</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={tl.overwhelmTitle}>
              {overwhelmReason === 'too-many-mits'
                ? `${activeMITCount} "must do" tasks today`
                : `${overdueCount} tasks past their due date`}
            </Text>
            <Text style={tl.overwhelmSub}>
              {overwhelmReason === 'too-many-mits'
                ? 'Only one can actually be the MIT. Let me help you choose.'
                : 'Your Aiteall task list is piling up. Let me help triage — pick one, defer the rest.'}
            </Text>
          </View>
          <Text style={tl.overwhelmArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ── MIT Hero Block — primary task, front and centre ─────────────── */}
      {primaryMIT && (
        <MITHeroBlock
          task={primaryMIT}
          calEvents={calEvents}
          goals={goals}
          profile={profile}
          onStart={(isQuick) => setWorkingTask(primaryMIT, isQuick)}
          onComplete={() => handleToggleTask(primaryMIT.id)}
        />
      )}

      {/* ── MIT Empty State — when no MIT is set yet ──────────────────────── */}
      {!primaryMIT && (
        <View style={[tl.mitEmptyCard, { borderColor: C.border, backgroundColor: C.surface }]}>
          {!showMITInput ? (
            <>
              <View style={tl.mitEmptyTop}>
                <Text style={[tl.mitEmptyTitle, { color: C.textPrimary }]}>No MIT set yet</Text>
                <Text style={[tl.mitEmptySubtext, { color: C.textSecondary }]}>
                  What's the one thing that would make today count?
                </Text>
              </View>
              <TouchableOpacity
                style={tl.mitEmptyRow}
                onPress={() => setShowMITInput(true)}
                activeOpacity={0.7}
              >
                <Text style={[tl.mitEmptyRowText, { color: C.primary }]}>Set my MIT →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[tl.mitEmptyTitle, { color: C.textPrimary, marginBottom: Spacing.md }]}>
                What's your MIT?
              </Text>
              <TextInput
                style={[tl.mitEmptyInput, { borderColor: C.border, color: C.textPrimary }]}
                placeholder="Enter your one main thing..."
                placeholderTextColor={C.textTertiary}
                value={mitInputText}
                onChangeText={setMitInputText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleMITSubmit}
              />
              <View style={tl.mitEmptyButtonRow}>
                <TouchableOpacity
                  style={[tl.mitEmptyButton, { backgroundColor: C.surfaceVariant }]}
                  onPress={() => {
                    setShowMITInput(false);
                    setMitInputText('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[tl.mitEmptyButtonText, { color: C.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[tl.mitEmptyButton, { backgroundColor: C.primary }]}
                  onPress={handleMITSubmit}
                  activeOpacity={0.7}
                >
                  <Text style={[tl.mitEmptyButtonText, { color: C.textInverse }]}>Add MIT</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Planning Prompt Card — suggest planning when no day plan exists ──── */}
      {!todayPlan && showPlanningPrompt && (
        <PlanningPromptCard
          visible={!todayPlan && showPlanningPrompt}
          onPlanPress={() => navigation.navigate('Chat', { mode: 'morning' })}
          onDismiss={() => setShowPlanningPrompt(false)}
        />
      )}

      {/* ── Drift Nudge — time-blindness protection ───────────────────────── */}
      <DriftNudge
        mitTask={primaryMIT}
        calEvents={calEvents}
        isWorking={workingTask !== null}
        onStart={() => primaryMIT && setWorkingTask(primaryMIT, false)}
        onReschedule={() => navigation.navigate('Chat', { mode: 'morning' })}
      />

      {/* ── Next event countdown ─────────────────────────────────────────── */}
      <NextEventCountdown calEvents={calEvents} />

      {/* ── Brain-full tile — surfaces when there are many competing tasks ── */}
      {(() => {
        const activeTodayCount = todayTasks.filter(t => !t.completed).length;
        if (activeTodayCount < 4) return null;
        return (
          <TouchableOpacity
            style={tl.fatigueCard}
            onPress={() => navigation.navigate('Chat', { mode: 'fatigue' })}
            activeOpacity={0.82}
          >
            <View style={tl.fatigueInner}>
              <Text style={tl.fatigueIcon}>🧠</Text>
              <View style={{ flex: 1 }}>
                <Text style={tl.fatigueTitle}>Brain full?</Text>
                <Text style={tl.fatigueSub}>
                  {activeTodayCount} tasks waiting — let me pick one for you
                </Text>
              </View>
              <Text style={tl.fatigueArrow}>→</Text>
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* ── Timeline strip ───────────────────────────────────────────────── */}
      <View style={tl.timelineSection}>
        <View style={tl.timelineSectionHeader}>
          <Text style={tl.timelineSectionLabel}>TODAY'S TIMELINE</Text>
          <View style={tl.timelineSectionDivider} />
          {lastCalendarSync ? (
            <View style={tl.syncChip}>
              <View style={tl.syncDot} />
              <Text style={tl.syncChipText}>
                {(() => {
                  const diffMs = Date.now() - lastCalendarSync;
                  const m = Math.floor(diffMs / 60000);
                  if (m < 1) return 'synced just now';
                  if (m < 60) return `synced ${m}m ago`;
                  const h = Math.floor(m / 60);
                  if (h < 24) return `synced ${h}h ago`;
                  return 'synced today';
                })()}
              </Text>
            </View>
          ) : null}
        </View>
      <View style={[tl.strip, { height: STRIP_H }]}>
        {/* Hour grid lines + labels */}
        {stripHours.map(h => {
          const y = minsToStripY(h * 60);
          if (y < 0 || y > STRIP_H) return null;
          return (
            <View key={h} style={[tl.hourRow, { top: y }]}>
              <Text style={tl.hourLabel}>{format(new Date(2000, 0, 1, h), 'h a')}</Text>
              <View style={tl.hourLine} />
            </View>
          );
        })}

        {/* Half-hour lines */}
        {stripHours.map(h => {
          const y = minsToStripY(h * 60 + 30);
          if (y < 0 || y > STRIP_H) return null;
          return <View key={`h${h}`} style={[tl.halfLine, { top: y }]} />;
        })}

        {/* Time blocks from skeleton — with planned tasks if day plan exists */}
        {timeBlocks
          .filter(b => b.dayOfWeek.includes(todayDow))
          .map(block => {
            const [bh, bm] = block.startTime.split(':').map(Number);
            const startM = bh * 60 + bm;
            const endM   = startM + block.durationMinutes;
            if (endM < windowStartMins || startM > windowEndMins) return null;
            const top    = Math.max(0, minsToStripY(startM));
            const bottom = Math.min(STRIP_H, minsToStripY(endM));
            const blockH = Math.max(18, bottom - top - 2);
            const color  = parseEventColor(block.type);
            const planned = getPlannedSlot(block.label);
            const doneCount  = planned?.tasks.filter(t => t.done).length ?? 0;
            const totalCount = planned?.tasks.length ?? 0;
            return (
              <View key={block.id} style={[tl.block, { top, left: TIME_W + 4, right: 4, height: blockH, backgroundColor: color + '28', borderLeftColor: color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[tl.blockLabel, { color }]} numberOfLines={1}>{block.label}</Text>
                  {totalCount > 0 && (
                    <Text style={{ fontSize: 9, color, fontWeight: '700', marginLeft: 4 }}>
                      {doneCount}/{totalCount}
                    </Text>
                  )}
                </View>
                {planned && blockH > 36 && planned.tasks.slice(0, 3).map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
                    onPress={() => togglePlannedTask(planned.time, t.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{
                      width: 11, height: 11, borderRadius: 5.5,
                      borderWidth: 1.5, borderColor: color,
                      backgroundColor: t.done ? color : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.done && <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>✓</Text>}
                    </View>
                    <Text style={{
                      fontSize: 10, color, flex: 1,
                      textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1,
                    }} numberOfLines={1}>{t.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}

        {/* Calendar events — with planned tasks nested inside */}
        {calEvents.map((ev, i) => {
          const startM = parseEventTime(ev.start);
          if (startM < 0) return null;
          const endM = ev.end ? parseEventTime(ev.end) : startM + 60;
          if (endM < windowStartMins || startM > windowEndMins) return null;
          const top    = Math.max(0, minsToStripY(startM));
          const bottom = Math.min(STRIP_H, minsToStripY(endM));
          const blockH = Math.max(18, bottom - top - 2);
          const planned = getPlannedSlot(ev.title);
          const doneCount = planned?.tasks.filter(t => t.done).length ?? 0;
          const totalCount = planned?.tasks.length ?? 0;
          return (
            <View key={i} style={[tl.block, { top, left: TIME_W + 4, right: 4, height: blockH, backgroundColor: C.primaryLight, borderLeftColor: C.primary }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[tl.blockLabel, { color: C.primary }]} numberOfLines={1}>{ev.title}</Text>
                {totalCount > 0 && (
                  <Text style={{ fontSize: 9, color: C.primary, fontWeight: '700', marginLeft: 4 }}>
                    {doneCount}/{totalCount}
                  </Text>
                )}
              </View>
              {planned && blockH > 36 && planned.tasks.slice(0, 3).map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
                  onPress={() => togglePlannedTask(planned.time, t.id)}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 11, height: 11, borderRadius: 5.5,
                    borderWidth: 1.5, borderColor: C.primary,
                    backgroundColor: t.done ? C.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {t.done && <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={{
                    fontSize: 10, color: C.primary, flex: 1,
                    textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1,
                  }} numberOfLines={1}>{t.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* Standalone planned blocks — from day plan, not tied to a real event or skeleton block */}
        {todayPlan?.slots.map((slot, i) => {
          // Skip if already rendered inside a matching skeleton block or calendar event
          const alreadyMatched =
            calEvents.some(ev => ev.title.toLowerCase() === slot.eventLabel.toLowerCase()) ||
            timeBlocks.some(b =>
              b.label.toLowerCase() === slot.eventLabel.toLowerCase() &&
              b.dayOfWeek.includes(todayDow)
            );
          if (alreadyMatched) return null;

          const [sh, sm] = slot.time.split(':').map(Number);
          const startM = sh * 60 + sm;
          // Estimate block height from task count — 45 min per task, min 30 min
          const durationM = Math.max(30, slot.tasks.length * 45);
          const endM = startM + durationM;
          if (endM < windowStartMins || startM > windowEndMins) return null;

          const top    = Math.max(0, minsToStripY(startM));
          const bottom = Math.min(STRIP_H, minsToStripY(endM));
          const blockH = Math.max(24, bottom - top - 2);
          const planColor = '#10B981'; // emerald — distinct from skeleton (varied) and cal events (blue)
          const doneCount  = slot.tasks.filter(t => t.done).length;
          const totalCount = slot.tasks.length;

          return (
            <View key={`plan-standalone-${i}`} style={[tl.block, {
              top, left: TIME_W + 4, right: 4, height: blockH,
              backgroundColor: planColor + '1A',
              borderLeftColor: planColor,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                  <Text style={[tl.blockLabel, { color: planColor }]} numberOfLines={1}>{slot.eventLabel}</Text>
                  <View style={{ backgroundColor: planColor + '25', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 8, color: planColor, fontWeight: '800', letterSpacing: 0.3 }}>PLAN</Text>
                  </View>
                </View>
                {totalCount > 0 && (
                  <Text style={{ fontSize: 9, color: planColor, fontWeight: '700' }}>
                    {doneCount}/{totalCount}
                  </Text>
                )}
              </View>
              {blockH > 36 && slot.tasks.slice(0, 3).map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
                  onPress={() => togglePlannedTask(slot.time, t.id)}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 11, height: 11, borderRadius: 5.5,
                    borderWidth: 1.5, borderColor: planColor,
                    backgroundColor: t.done ? planColor : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {t.done && <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={{
                    fontSize: 10, color: planColor, flex: 1,
                    textDecorationLine: t.done ? 'line-through' : 'none',
                    opacity: t.done ? 0.55 : 1,
                  }} numberOfLines={1}>{t.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* Current time indicator */}
        {nowMins >= windowStartMins && nowMins <= windowEndMins && (
          <View style={[tl.nowRow, { top: minsToStripY(nowMins) }]}>
            <View style={tl.nowDot} />
            <View style={tl.nowBar} />
          </View>
        )}
      </View>
      </View>

      {/* ── Today's tasks — time-sequenced when day plan exists ─────────── */}
      <View style={{ marginBottom: Spacing.base }}>
        <Text style={[tl.sectionLabel, { paddingHorizontal: Spacing.lg }]}>
          Today{todayTasks.length > 0 ? ` — ${todayTasks.length - completedCount} left` : ''}
        </Text>

        {todayTasks.length === 0 ? (
          <View style={[tl.tasksCard, { padding: Spacing.lg, alignItems: 'center' }]}>
            <Text style={{ color: C.textTertiary, fontSize: 14 }}>Nothing planned yet — use + to add tasks</Text>
          </View>
        ) : (() => {
          // ── When a day plan exists: group tasks by slot, sorted by time ──────
          if (todayPlan && Object.keys(taskSlotMap).length > 0) {
            // Sort today's tasks by slot time (unscheduled tasks go to the end)
            const sorted = [...todayTasks].sort((a, b) => {
              const aSlot = taskSlotMap[a.id];
              const bSlot = taskSlotMap[b.id];
              if (aSlot && bSlot) return aSlot.time.localeCompare(bSlot.time);
              if (aSlot && !bSlot) return -1;
              if (!aSlot && bSlot) return 1;
              // Both unscheduled: MITs first, then completed last
              if (a.isMIT && !b.isMIT) return -1;
              if (!a.isMIT && b.isMIT) return 1;
              if (!a.completed && b.completed) return -1;
              if (a.completed && !b.completed) return 1;
              return 0;
            });

            // Group consecutive tasks that share the same slot
            type TaskGroup = { time: string | null; label: string | null; tasks: Task[] };
            const groups: TaskGroup[] = [];
            sorted.forEach(task => {
              const slot = taskSlotMap[task.id];
              const slotKey = slot?.time ?? null;
              const last = groups[groups.length - 1];
              if (last && last.time === slotKey) {
                last.tasks.push(task);
              } else {
                groups.push({ time: slotKey, label: slot?.label ?? null, tasks: [task] });
              }
            });

            return (
              <>
                {groups.map((group, gi) => (
                  <View key={group.time ?? `unscheduled-${gi}`}>
                    {/* Slot header row */}
                    {group.time ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: gi === 0 ? 4 : Spacing.base, paddingBottom: 6, gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981', minWidth: 52 }}>
                          {formatPlanTime(group.time)}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                          {group.label}
                        </Text>
                        <View style={{ height: StyleSheet.hairlineWidth, width: 24, backgroundColor: C.border }} />
                      </View>
                    ) : gi > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.base, paddingBottom: 6, gap: 8 }}>
                        <Text style={{ fontSize: 11, color: C.textTertiary, fontWeight: '500' }}>Unscheduled</Text>
                        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
                      </View>
                    ) : null}

                    {/* Tasks in this slot */}
                    <View style={tl.tasksCard}>
                      {group.tasks.map((t, i) => {
                        const accent = t.isMIT ? C.primary : C.border;
                        return (
                          <View key={t.id}>
                            {i > 0 && <View style={tl.taskDivider} />}
                            <TouchableOpacity
                              style={tl.taskRow}
                              onPress={() => handleToggleTask(t.id)}
                              activeOpacity={0.7}
                            >
                              <View style={[tl.taskCheck, t.completed && tl.taskCheckDone, { borderColor: accent }]}>
                                {t.completed && <Ionicons name="checkmark" size={13} color={C.textInverse} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[tl.taskLabel, t.completed && tl.labelDone]} numberOfLines={2}>
                                  {t.text}
                                </Text>
                                {t.reason ? <Text style={tl.reason}>{t.reason}</Text> : null}
                              </View>
                              {!t.completed && (
                                <TouchableOpacity
                                  style={tl.focusButton}
                                  onPress={() => setWorkingTask(t, false)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="play" size={12} color={C.primary} />
                                </TouchableOpacity>
                              )}
                              {t.isMIT && (
                                <View style={tl.mitBadge}>
                                  <Text style={tl.mitBadgeText}>MIT</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            );
          }

          // ── No day plan: flat list sorted by MIT / completion ──────────────
          return (
            <View style={tl.tasksCard}>
              {todayTasks.map((t, i) => {
                const accent = t.isMIT ? C.primary : C.border;
                return (
                  <View key={t.id}>
                    {i > 0 && <View style={tl.taskDivider} />}
                    <TouchableOpacity
                      style={tl.taskRow}
                      onPress={() => handleToggleTask(t.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[tl.taskCheck, t.completed && tl.taskCheckDone, { borderColor: accent }]}>
                        {t.completed && <Ionicons name="checkmark" size={13} color={C.textInverse} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[tl.taskLabel, t.completed && tl.labelDone]} numberOfLines={2}>
                          {t.text}
                        </Text>
                        {t.reason ? <Text style={tl.reason}>{t.reason}</Text> : null}
                      </View>
                      {!t.completed && (
                        <TouchableOpacity
                          style={tl.focusButton}
                          onPress={() => setWorkingTask(t, false)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="play" size={12} color={C.primary} />
                        </TouchableOpacity>
                      )}
                      {t.isMIT && (
                        <View style={tl.mitBadge}>
                          <Text style={tl.mitBadgeText}>MIT</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      {/* ── HomeActions (plan / focus CTAs) ──────────────────────────────── */}
      <View style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.base }}>
        <HomeActionsV2 navigation={navigation} />
      </View>

      {/* ── Working Mode Modal ────────────────────────────────────────── */}
      <WorkingModeModal
        task={workingTask}
        visible={workingTask !== null}
        quickStart={quickStart}
        projectTitle={workingTask ? projects.find(p => p.id === workingTask.projectId)?.title : undefined}
        onClose={() => setWorkingTask(null)}
        onComplete={() => {
          if (workingTask) handleToggleTask(workingTask.id);
          setWorkingTask(null);
        }}
      />

      {/* ── Momentum Celebration Modal ──────────────────────────────────── */}
      <MomentumCelebration
        task={momentumTask}
        projectTitle={momentumProject?.title}
        goalText={momentumGoal?.text}
        onDismiss={() => setMomentumTask(null)}
      />
    </ScrollView>
  );
}

// Styles for TodayTimelinePage — defined outside component to avoid re-creation
// (uses a function so C theme tokens work; called once per theme change in useMemo)
function makeTl(C: any) { return StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 4 },
  dayLabel:      { fontSize: 34, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 38 },
  dateLabel:     { fontSize: 14, color: C.textTertiary, fontWeight: '500', marginTop: 2 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  doneBadge:     { backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  doneBadgeText: { fontSize: 11, color: C.primary, fontWeight: '700' },
  plusBtn:       { width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusBtnText:   { fontSize: 22, color: '#fff', fontWeight: '300', lineHeight: 26 },

  pageHeader:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  pageTitle:    { fontSize: 32, fontWeight: '800', color: C.textPrimary, letterSpacing: -1, lineHeight: 36 },
  pageSubtitle: { fontSize: 13, color: C.textTertiary, fontWeight: '500', marginTop: 2 },
  dateRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  dateText:  { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  datePlusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },

  timelineSection: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
    borderRadius: Radius.xl,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    // Soft lift so it feels like its own surface, not jammed against the MIT card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  timelineSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  timelineSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.textTertiary,
  },
  timelineSectionDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.borderLight ?? C.border,
  },
  syncChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: (C.primaryLight ?? '#E6F2EC'),
  },
  syncDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.primary ?? '#0A8F5C',
  },
  syncChipText: {
    fontSize: 10, fontWeight: '600', color: C.primary ?? '#0A8F5C',
    letterSpacing: 0.2,
  },

  // Brain-full / decision fatigue tile
  fatigueCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.accent ?? C.primary,
    backgroundColor: C.surface,
  },
  fatigueInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  fatigueIcon:  { fontSize: 22 },
  fatigueTitle: { fontSize: 14, fontWeight: '700', color: (C.accent ?? C.primary), marginBottom: 2 },
  fatigueSub:   { fontSize: 12, color: C.textSecondary },
  fatigueArrow: { fontSize: 18, color: (C.accent ?? C.primary), fontWeight: '700' },

  // Overwhelm card — more urgent visual than fatigue tile
  overwhelmCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.xl,
    backgroundColor: '#FEF3C7',   // amber — attention without alarm
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  overwhelmLeft: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  overwhelmIcon:  { fontSize: 16, color: '#B45309', fontWeight: '800' },
  overwhelmTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  overwhelmSub:   { fontSize: 12, color: '#78350F', lineHeight: 16 },
  overwhelmArrow: { fontSize: 18, color: '#92400E', fontWeight: '700' },

  // ── "Just this" single-task focus mode ────────────────────────────────
  focusHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  focusEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: C.textTertiary,
  },
  focusExit: {
    fontSize: 13, color: C.textSecondary, fontWeight: '500',
  },
  focusCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  focusPrompt: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    marginBottom: Spacing.md, letterSpacing: 0.2,
  },
  focusLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.45)', marginBottom: Spacing.sm,
  },
  focusTaskText: {
    fontSize: 26, fontWeight: '700', color: '#fff',
    letterSpacing: -0.4, lineHeight: 32, marginBottom: Spacing.md,
  },
  focusReason: {
    fontSize: 14, color: 'rgba(255,255,255,0.72)',
    fontStyle: 'italic', lineHeight: 20, marginBottom: Spacing.md,
  },
  focusTimerHint: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 17,
  },
  focusDoneBtn: {
    alignSelf: 'center',
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: Radius.full,
    backgroundColor: C.primary,
    minWidth: 180, alignItems: 'center',
  },
  focusDoneText: {
    fontSize: 15, fontWeight: '700', color: C.textInverse, letterSpacing: 0.3,
  },
  strip: {
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },

  hourRow:   { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  hourLabel: { fontSize: 10, color: C.textTertiary, fontWeight: '600', textAlign: 'right', paddingRight: 8, width: TIME_W },
  timeLabel: { fontSize: 10, color: C.textTertiary, fontWeight: '600', textAlign: 'right', paddingRight: 8 },
  hourLine:  { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  halfLine:  { position: 'absolute', right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, opacity: 0.5 },

  block: {
    position: 'absolute',
    borderLeftWidth: 3, borderRadius: 6,
    paddingHorizontal: 8, paddingTop: 5, paddingBottom: 4,
  },
  blockLabel: { fontSize: 12, fontWeight: '700', letterSpacing: -0.2 },
  blockMeta:  { fontSize: 10, marginTop: 2, opacity: 0.8 },
  nowChip:    { borderRadius: 8, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  nowChipText:{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  nowLine: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  nowRow:  { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  nowDot:  { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#EF4444' },
  nowBar:  { flex: 1, height: 1.5, backgroundColor: '#EF4444' },

  sectionLabel:      { fontSize: 11, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  tasksSection:      { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  tasksSectionTitle: { fontSize: 11, fontWeight: '700', color: C.textTertiary, letterSpacing: 1.2, marginBottom: 8 },
  tasksCard:         { backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, overflow: 'hidden' },
  taskDivider:       { height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 46 },
  taskRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskCheck:         { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskCheckDone:     { backgroundColor: C.ink, borderColor: C.ink },
  taskCheckMark:     { fontSize: 10, color: '#fff', fontWeight: '700' },
  taskLabel:         { fontSize: 15, color: C.textPrimary, lineHeight: 20, fontWeight: '400' },
  labelDone:         { textDecorationLine: 'line-through', color: C.textTertiary },
  taskText:          { fontSize: 15, color: C.textPrimary, lineHeight: 20, fontWeight: '400' },
  taskTextDone:      { textDecorationLine: 'line-through', color: C.textTertiary },
  taskMeta:          { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  reason:            { fontSize: 12, color: C.textTertiary, marginTop: 2, fontStyle: 'italic' },
  focusButton:       { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  mitBadge:          { backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  mitBadgeText:      { fontSize: 10, color: C.primary, fontWeight: '700', letterSpacing: 0.4 },
  planCTA:           { margin: Spacing.lg, padding: 16, backgroundColor: C.accentLight, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.accentMid },
  planCTAText:       { fontSize: 15, color: C.accent, fontWeight: '600' },
  mitEmptyCard:      { marginHorizontal: Spacing.lg, marginVertical: Spacing.base, borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.base },
  mitEmptyTop:       { alignItems: 'center', gap: Spacing.sm },
  mitEmptyIcon:      { fontSize: 40, marginBottom: Spacing.sm },
  mitEmptyTitle:     { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  mitEmptySubtext:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  mitEmptyRow:       { borderTopWidth: 1, borderTopColor: C.border, paddingTop: Spacing.base, alignItems: 'center' },
  mitEmptyRowText:   { fontSize: 16, fontWeight: '600' },
  mitEmptyInput:     { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15, minHeight: 44, marginVertical: Spacing.sm },
  mitEmptyButtonRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  mitEmptyButton:    { flex: 1, borderRadius: Radius.full, paddingVertical: Spacing.md, alignItems: 'center' },
  mitEmptyButtonText:{ fontSize: 15, fontWeight: '600' },
}); }

// Singleton styles — theme-reactive via useMemo in TodayTimelinePage
let tl: ReturnType<typeof makeTl>;
function TlStyles(C: any) { tl = makeTl(C); return null; }

// ── Inbox Page (Page 1) ───────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortForInbox(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // MITs always first
    if (a.isMIT && !b.isMIT) return -1;
    if (!a.isMIT && b.isMIT) return 1;
    // Then by priority
    const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (pd !== 0) return pd;
    // Then dated before undated
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    // Then by date ascending
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });
}

// ── InboxTriageModal ──────────────────────────────────────────────────────────

interface InboxTriageModalProps {
  visible: boolean;
  tasks: Task[];
  onClose: () => void;
}

function InboxTriageModal({ visible, tasks, onClose }: InboxTriageModalProps) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { scheduleTaskToDate, deleteTask } = useStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const isComplete = currentIndex >= tasks.length;
  const currentTask = tasks[currentIndex];
  const progressPercent = tasks.length > 0 ? (currentIndex / tasks.length) * 100 : 0;

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextFriday = (() => {
    const d = new Date();
    const currentDay = d.getDay();
    const daysUntilFriday = (5 - currentDay + 7) % 7 || 7;
    return format(addDays(d, daysUntilFriday), 'yyyy-MM-dd');
  })();

  const handleAction = (action: 'today' | 'tomorrow' | 'week' | 'later' | 'delete') => {
    if (!currentTask) return;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      if (action === 'today') {
        scheduleTaskToDate(currentTask.id, today);
      } else if (action === 'tomorrow') {
        scheduleTaskToDate(currentTask.id, tomorrow);
      } else if (action === 'week') {
        scheduleTaskToDate(currentTask.id, nextFriday);
      } else if (action === 'delete') {
        deleteTask(currentTask.id);
      }
      // 'later' does nothing, just advance

      // Reset animations and advance
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      setCurrentIndex(prev => prev + 1);
      setIsDeleting(false);
    }, 250);
  };

  const handleDeleteWithConfirm = () => {
    if (isDeleting) {
      handleAction('delete');
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 1000);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
        }}>
          <View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.textPrimary }}>Triage inbox</Text>
            <Text style={{ fontSize: 12, color: C.textTertiary, marginTop: 1 }}>
              {isComplete ? 'All done' : `${currentIndex + 1} of ${tasks.length}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View style={{ height: 2, backgroundColor: C.border }}>
          <View style={{ height: '100%', backgroundColor: C.primary, width: `${progressPercent}%` }} />
        </View>

        {/* Main Content */}
        {isComplete ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg }}>
            <Ionicons name="checkmark-circle" size={72} color={C.primary} />
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.textPrimary }}>Inbox clear.</Text>
            <Text style={{ fontSize: 15, color: C.textTertiary }}>Nice work.</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ marginTop: Spacing.md, paddingHorizontal: 32, paddingVertical: Spacing.base, backgroundColor: C.primary, borderRadius: Radius.full }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.textInverse }}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : currentTask ? (
          <View style={{ flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl }}>

            {/* Question label */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.base }}>
              When should this happen?
            </Text>

            {/* Task Card */}
            <Animated.View style={{
              opacity: fadeAnim,
              transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 100], outputRange: [0, 60] }) }],
            }}>
              <View style={{
                backgroundColor: C.surface, borderRadius: Radius.xl,
                borderWidth: 1, borderColor: C.border,
                padding: Spacing.xl, gap: Spacing.xs, minHeight: 100,
              }}>
                <Text style={{ fontSize: 19, fontWeight: '600', color: C.textPrimary, lineHeight: 27 }}>
                  {currentTask.text}
                </Text>
                {currentTask.date && (
                  <Text style={{ fontSize: 13, color: C.textTertiary }}>
                    Originally due {format(new Date(currentTask.date + 'T00:00:00'), 'd MMM')}
                  </Text>
                )}
                {currentTask.reason && (
                  <Text style={{ fontSize: 13, color: C.textTertiary, fontStyle: 'italic' }}>
                    {currentTask.reason}
                  </Text>
                )}
              </View>
            </Animated.View>

            {/* Action Buttons */}
            <View style={{ marginTop: Spacing.xl, gap: Spacing.sm }}>
              {/* Primary: Today + Tomorrow */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  onPress={() => handleAction('today')}
                  style={{ flex: 1, paddingVertical: 15, backgroundColor: C.primary, borderRadius: Radius.lg, alignItems: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.textInverse }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleAction('tomorrow')}
                  style={{ flex: 1, paddingVertical: 15, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: C.primary, alignItems: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.primary }}>Tomorrow</Text>
                </TouchableOpacity>
              </View>

              {/* This Week */}
              <TouchableOpacity
                onPress={() => handleAction('week')}
                style={{ paddingVertical: 13, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.textPrimary }}>This Week</Text>
              </TouchableOpacity>

              {/* Skip + Remove */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>
                <TouchableOpacity
                  onPress={() => handleAction('later')}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center', backgroundColor: C.surface }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>Skip for now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteWithConfirm}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center',
                    backgroundColor: isDeleting ? '#FEE2E2' : (C.surface),
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: isDeleting ? '#DC2626' : C.textTertiary, fontWeight: isDeleting ? '700' : '400' }}>
                    {isDeleting ? 'Tap again to delete' : 'Remove'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

      </SafeAreaView>
    </Modal>
  );
}

function InboxPage({ navigation, onQuickAdd }: { navigation: any; onQuickAdd: () => void }) {
  const C      = useColors();
  const tasks  = useStore(s => s.tasks);
  const { toggleTask } = useStore();
  const today  = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [showAll, setShowAll] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const CAP = 5;

  const overdueTasks = useMemo(() =>
    sortForInbox(tasks.filter(t => t.date && t.date < today && !t.completed)),
    [tasks, today],
  );
  const inboxTasks = useMemo(() =>
    sortForInbox(tasks.filter(t => (t.isInbox || !t.date || t.date === '') && !t.completed)),
    [tasks],
  );

  const totalCount   = overdueTasks.length + inboxTasks.length;
  const visibleInbox = showAll ? inboxTasks : inboxTasks.slice(0, CAP);
  const hiddenCount  = inboxTasks.length - CAP;

  function InboxRow({ t, accent }: { t: Task; accent: string }) {
    const scheduleTaskToDate = useStore(s => (s as any).scheduleTaskToDate);
    const setPriority        = useStore(s => (s as any).setPriority);
    const today_             = format(new Date(), 'yyyy-MM-dd');

    const priorityColors: Record<string, string> = {
      low: '#9CA3AF', medium: C.primary, high: '#D97706',
    };

    function renderLeft(progress: any, drag: any) {
      return (
        <TouchableOpacity
          style={{
            backgroundColor: C.primary, justifyContent: 'center',
            alignItems: 'center', width: 80, borderRadius: Radius.md,
            marginBottom: 2, marginLeft: 2,
          }}
          onPress={() => scheduleTaskToDate?.(t.id, today_)}
        >
          <Text style={{ color: C.textInverse, fontSize: 11, fontWeight: '700' }}>TODAY</Text>
        </TouchableOpacity>
      );
    }

    function renderRight(progress: any, drag: any) {
      const nextPriority = t.priority === 'low' ? 'medium' : t.priority === 'medium' ? 'high' : 'low';
      const bgColor = nextPriority === 'high' ? '#D97706' : nextPriority === 'medium' ? C.primary : '#9CA3AF';
      return (
        <TouchableOpacity
          style={{
            backgroundColor: bgColor, justifyContent: 'center',
            alignItems: 'center', width: 80, borderRadius: Radius.md,
            marginBottom: 2, marginRight: 2,
          }}
          onPress={() => setPriority?.(t.id, nextPriority)}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
            {nextPriority.toUpperCase()}
          </Text>
        </TouchableOpacity>
      );
    }

    const priorityDot = t.priority !== 'low'
      ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: priorityColors[t.priority], marginRight: 6, marginTop: 1 }} />
      : null;

    const inboxContent = (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 }}>
        <TouchableOpacity
          onPress={() => toggleTask(t.id)}
          style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: t.isMIT ? C.primary : accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          activeOpacity={0.7}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: C.textPrimary, lineHeight: 20 }}>{t.text}</Text>
          {t.date && t.date < today
            ? <Text style={{ fontSize: 12, color: '#E07B45', marginTop: 2 }}>from {t.date}</Text>
            : t.date
            ? <Text style={{ fontSize: 12, color: C.textTertiary, marginTop: 2 }}>due {t.date}</Text>
            : null}
        </View>
        {t.isMIT && (
          <View style={{ backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>MIT</Text>
          </View>
        )}
      </View>
    );

    return (
      <Swipeable renderLeftActions={renderLeft} renderRightActions={renderRight} friction={2} overshootLeft={false} overshootRight={false}>
        {inboxContent}
      </Swipeable>
    );
  }

  return (
    <>
    <ScrollView style={{ width: SCREEN_W }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 4 }}>
        <View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5 }}>Inbox</Text>
          <Text style={{ fontSize: 14, color: C.textTertiary, marginTop: 3 }}>
            {totalCount === 0
              ? 'Nothing waiting — nice one.'
              : totalCount === 1
              ? 'One thing waiting for you.'
              : `${totalCount} things waiting — no rush.`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          {totalCount > 0 && (
            <TouchableOpacity
              onPress={() => setTriaging(true)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: Radius.full,
                borderWidth: 1.5,
                borderColor: C.primary,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.primary }}>Triage</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onQuickAdd} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action row — Triage and Prioritise explained */}
      {totalCount > 0 && (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.sm }}>
          <View style={{ flex: 1, padding: 12, backgroundColor: C.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary, letterSpacing: 0.5, marginBottom: 2 }}>TRIAGE</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 16 }}>Go through tasks one by one — when should each happen?</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
            style={{ flex: 1, padding: 12, backgroundColor: C.accentLight, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.accentMid }}
            activeOpacity={0.82}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, letterSpacing: 0.5, marginBottom: 2 }}>PRIORITISE</Text>
            <Text style={{ fontSize: 12, color: C.accent, lineHeight: 16, opacity: 0.8 }}>Plan with AI — build a time-blocked day from your list.</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* From earlier (overdue — warm tone, not alarming red) */}
      {overdueTasks.length > 0 && (
        <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.base }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#E07B45', letterSpacing: 1, marginBottom: 8 }}>FROM EARLIER</Text>
          <View style={{ backgroundColor: C.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: C.accentMid, overflow: 'hidden' }}>
            {overdueTasks.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 48 }} />}
                <InboxRow t={t} accent="#E07B45" />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* On your list */}
      <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.base }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: C.textTertiary, letterSpacing: 1, marginBottom: 8 }}>ON YOUR LIST</Text>
        {inboxTasks.length === 0 ? (
          <View style={{ padding: Spacing.xl, backgroundColor: C.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: C.textTertiary }}>Clear — well done.</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            {visibleInbox.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 48 }} />}
                <InboxRow t={t} accent={C.border} />
              </View>
            ))}
            {!showAll && hiddenCount > 0 && (
              <TouchableOpacity
                onPress={() => setShowAll(true)}
                style={{ padding: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderLight }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: C.textTertiary, fontWeight: '500' }}>+{hiddenCount} more — tap to show</Text>
              </TouchableOpacity>
            )}
            {showAll && hiddenCount > 0 && (
              <TouchableOpacity
                onPress={() => setShowAll(false)}
                style={{ padding: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderLight }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: C.textTertiary, fontWeight: '500' }}>Show less ↑</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </ScrollView>
    <InboxTriageModal
      visible={triaging}
      tasks={[...overdueTasks, ...inboxTasks]}
      onClose={() => setTriaging(false)}
    />
  </>
  );
}

// ── Daily Structure Page ──────────────────────────────────────────────────────

const BLOCK_COLORS: Record<TimeBlockType, string> = {
  deep_work: '#2EC4A9',
  area_work: '#D4821A',
  social:    '#8B5CF6',
  admin:     '#64748B',
  protected: '#EF4444',
  personal:  '#3B82F6',
};

const BLOCK_LABELS: Record<TimeBlockType, string> = {
  deep_work: 'Deep work',
  area_work: 'Area work',
  social:    'Social',
  admin:     'Admin',
  protected: 'Protected',
  personal:  'Personal',
};

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins: number): string {
  const h    = Math.floor(mins / 60) % 24;
  const m    = mins % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr   = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function DailyStructurePage({ navigation }: { navigation: any }) {
  const C = useColors();
  const ds = useMemo(() => makeDs(C), [C]);
  const profile    = useStore(s => s.profile);
  const tasks      = useStore(s => s.tasks);
  const today      = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const todayDow   = useMemo(() => new Date().getDay(), []);
  const nowMinutes = useMemo(() => new Date().getHours() * 60 + new Date().getMinutes(), []);

  const todayBlocks = useMemo(() =>
    (profile.weekTemplate ?? [])
      .filter(b => b.dayOfWeek.includes(todayDow))
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)),
    [profile.weekTemplate, todayDow],
  );

  const mitTasks   = useMemo(() => tasks.filter(t => t.date === today && t.isMIT   && !t.completed), [tasks, today]);
  const otherTasks = useMemo(() => tasks.filter(t => t.date === today && !t.isMIT  && !t.completed), [tasks, today]);
  const doneTasks  = useMemo(() => tasks.filter(t => t.date === today && t.completed), [tasks, today]);

  const hasBlocks = profile.skeletonBuilt && todayBlocks.length > 0;
  const hasTasks  = mitTasks.length > 0 || otherTasks.length > 0;

  const [calEvents,  setCalEvents]  = useState<TodayEvent[]>([]);
  const [reminders,  setReminders]  = useState<TodayReminder[]>([]);

  useEffect(() => {
    getTodayCalendarEvents().then(setCalEvents).catch(() => {});
    getTodayReminders().then(setReminders).catch(() => {});
  }, []);

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={ds.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={ds.header}>
        <View>
          <Text style={ds.dayLabel}>{format(new Date(), 'EEEE')}</Text>
          <Text style={ds.dateLabel}>{format(new Date(), 'd MMMM')}</Text>
        </View>
        <View style={ds.headerRight}>
          {doneTasks.length > 0 && (
            <View style={ds.doneBadge}>
              <Text style={ds.doneBadgeText}>✓ {doneTasks.length} done</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Time blocks ── */}
      {hasBlocks ? (
        <>
          <Text style={ds.sectionTitle}>STRUCTURE</Text>
          <View style={ds.blocksCard}>
            {todayBlocks.map((block, i) => {
              const startMins = parseTimeToMinutes(block.startTime);
              const endMins   = startMins + block.durationMinutes;
              const isNow     = nowMinutes >= startMins && nowMinutes < endMins;
              const isPast    = nowMinutes >= endMins;
              const color     = BLOCK_COLORS[block.type];

              return (
                <View key={block.id}>
                  {i > 0 && <View style={ds.blockDivider} />}
                  <View style={[ds.blockRow, isPast && ds.blockRowPast]}>
                    <View style={[ds.blockAccent, { backgroundColor: color }]} />
                    <View style={ds.blockTimes}>
                      <Text style={[ds.blockTimeText, isPast && ds.blockTimePast]}>
                        {minutesToLabel(startMins)}
                      </Text>
                      <View style={ds.blockTimeLine} />
                      <Text style={[ds.blockTimeText, isPast && ds.blockTimePast]}>
                        {minutesToLabel(endMins)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={ds.blockLabelRow}>
                        <Text style={[ds.blockName, isPast && ds.blockNamePast]} numberOfLines={1}>
                          {block.label}
                        </Text>
                        {isNow && (
                          <View style={[ds.nowPill, { backgroundColor: color + '22', borderColor: color }]}>
                            <Text style={[ds.nowPillText, { color }]}>now</Text>
                          </View>
                        )}
                        {block.isProtected && !isNow && (
                          <View style={ds.protectedPill}>
                            <Text style={ds.protectedPillText}>protected</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[ds.blockTypeMeta, isPast && ds.blockTimePast]}>
                        {BLOCK_LABELS[block.type]} · {block.durationMinutes} min
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={ds.emptyBlocks}
          onPress={() => navigation.navigate('SkeletonBuilder')}
          activeOpacity={0.82}
        >
          <Text style={ds.emptyBlocksTitle}>No structure yet</Text>
          <Text style={ds.emptyBlocksSub}>Build your weekly skeleton and your day structure will appear here →</Text>
        </TouchableOpacity>
      )}

      {/* ── Today's tasks ── */}
      <Text style={ds.sectionTitle}>TODAY'S TASKS</Text>

      {!hasTasks ? (
        <TouchableOpacity
          style={ds.emptyTasks}
          onPress={() => navigation.navigate('Chat', { mode: 'morning' })}
          activeOpacity={0.82}
        >
          <Text style={ds.emptyTasksText}>No tasks planned yet →</Text>
        </TouchableOpacity>
      ) : (
        <View style={ds.tasksCard}>
          {mitTasks.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={ds.taskDivider} />}
              <View style={ds.taskRow}>
                <View style={ds.mitDot} />
                <View style={{ flex: 1 }}>
                  <Text style={ds.taskText} numberOfLines={2} ellipsizeMode="tail">{t.text}</Text>
                  {t.estimatedMinutes ? (
                    <Text style={ds.taskMeta}>~{t.estimatedMinutes} min</Text>
                  ) : null}
                </View>
                <View style={ds.mitBadge}>
                  <Text style={ds.mitBadgeText}>MIT</Text>
                </View>
              </View>
            </View>
          ))}
          {otherTasks.map((t, i) => (
            <View key={t.id}>
              <View style={ds.taskDivider} />
              <View style={ds.taskRow}>
                <View style={ds.otherDot} />
                <View style={{ flex: 1 }}>
                  <Text style={ds.taskText} numberOfLines={2} ellipsizeMode="tail">{t.text}</Text>
                  {t.estimatedMinutes ? (
                    <Text style={ds.taskMeta}>~{t.estimatedMinutes} min</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Calendar events ── */}
      {calEvents.length > 0 && (
        <>
          <Text style={ds.sectionTitle}>CALENDAR TODAY</Text>
          <View style={ds.calCard}>
            {calEvents.map((e, i) => (
              <View key={i}>
                {i > 0 && <View style={ds.taskDivider} />}
                <View style={ds.calRow}>
                  <View style={ds.calDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={ds.taskText} numberOfLines={1}>{e.title}</Text>
                    <Text style={ds.taskMeta}>
                      {e.allDay ? 'All day' : `${e.start}${e.end ? ` – ${e.end}` : ''}`}
                      {e.calendar ? `  ·  ${e.calendar}` : ''}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Reminders due today ── */}
      {reminders.length > 0 && (
        <>
          <Text style={ds.sectionTitle}>REMINDERS</Text>
          <View style={ds.calCard}>
            {reminders.map((r, i) => (
              <View key={i}>
                {i > 0 && <View style={ds.taskDivider} />}
                <View style={ds.calRow}>
                  <View style={[ds.calDot, { backgroundColor: '#FF9500' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={ds.taskText} numberOfLines={1}>{r.title}</Text>
                    {r.dueDate && <Text style={ds.taskMeta}>Due {r.dueDate}</Text>}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

function makeDs(C: any) { return StyleSheet.create({
  scroll: { paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.base,
  },
  dayLabel:    { fontSize: 38, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
  dateLabel:   { fontSize: 16, color: C.textTertiary, fontWeight: '500', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', paddingBottom: 4 },
  doneBadge:   { backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  doneBadgeText: { fontSize: 12, color: C.primary, fontWeight: '700' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: C.textTertiary,
    letterSpacing: 1.2, textTransform: 'uppercase',
    paddingHorizontal: Spacing.lg, marginBottom: 8, marginTop: Spacing.base,
  },

  // Blocks card
  blocksCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  blockRow: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingVertical: 14, paddingRight: 16,
  },
  blockRowPast: { opacity: 0.4 },
  blockAccent: { width: 3, marginRight: 14, borderRadius: 2, alignSelf: 'stretch' },
  blockTimes: {
    width: 60, alignItems: 'center', justifyContent: 'center',
    gap: 2, paddingRight: 10,
  },
  blockTimeText: { fontSize: 11, color: C.textTertiary, fontWeight: '600', letterSpacing: 0.2 },
  blockTimePast: { color: C.borderLight },
  blockTimeLine: { width: 1, height: 10, backgroundColor: C.borderLight },
  blockLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  blockName:     { fontSize: 15, fontWeight: '600', color: C.textPrimary, flex: 1 },
  blockNamePast: { color: C.textTertiary },
  blockTypeMeta: { fontSize: 12, color: C.textTertiary },
  blockDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 17 },

  nowPill: {
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  nowPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  protectedPill: {
    backgroundColor: C.errorLight, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  protectedPillText: { fontSize: 10, color: C.error, fontWeight: '600' },

  emptyBlocks: {
    marginHorizontal: Spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: C.border,
    padding: Spacing.xl,
  },
  emptyBlocksTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 6 },
  emptyBlocksSub:   { fontSize: 14, color: C.textSecondary, lineHeight: 21 },

  // Tasks card
  tasksCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  taskRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 14 },
  taskText:    { fontSize: 15, color: C.textPrimary, lineHeight: 21, fontWeight: '400' },
  taskMeta:    { fontSize: 12, color: C.textTertiary, marginTop: 2 },

  mitDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, flexShrink: 0 },
  otherDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border,  flexShrink: 0 },

  // Calendar / Reminders card
  calCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  calDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, flexShrink: 0 },

  mitBadge:     { backgroundColor: C.primaryLight, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  mitBadgeText: { fontSize: 10, color: C.primary, fontWeight: '700', letterSpacing: 0.5 },

  emptyTasks: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.base,
    backgroundColor: C.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border,
  },
  emptyTasksText: { fontSize: 14, color: C.textSecondary },
}); }

// ── Goals Panel ───────────────────────────────────────────────────────────────

const HORIZONS: { key: TimeHorizon; label: string }[] = [
  { key: '1year',  label: '1 year'   },
  { key: '5year',  label: '5 years'  },
  { key: '10year', label: '10 years' },
];

function GoalsPanelPage({ navigation }: { navigation: any }) {
  const C = useColors();
  const gp = useMemo(() => makeGp(C), [C]);
  const goals   = useStore(s => s.goals);
  const profile = useStore(s => s.profile);

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={gp.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={gp.header}>
        <Text style={gp.title}>Your vision</Text>
        <Text style={gp.subtitle}>Where you're going</Text>
      </View>

      {/* Horizon blocks */}
      {HORIZONS.map(h => {
        const horizonGoals = goals.filter(g => g.horizon === h.key);
        return (
          <View key={h.key} style={gp.horizonBlock}>
            <View style={gp.horizonHeader}>
              <Text style={gp.horizonLabel}>{h.label}</Text>
            </View>

            {horizonGoals.length === 0 ? (
              <Text style={gp.empty}>Not set yet</Text>
            ) : (
              horizonGoals.map(goal => {
                const dc = DomainColors[goal.domain] ?? DomainColors.work;
                return (
                  <View key={goal.id} style={gp.goalRow}>
                    <View style={[gp.goalDot, { backgroundColor: dc.text }]} />
                    <Text style={gp.goalText}>{goal.text}</Text>
                  </View>
                );
              })
            )}
          </View>
        );
      })}

      {/* CTA */}
      <TouchableOpacity
        style={gp.cta}
        onPress={() => navigation?.navigate('Chat', { mode: 'yearly' })}
        activeOpacity={0.82}
      >
        <Text style={gp.ctaText}>Set goals →</Text>
      </TouchableOpacity>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

function makeGp(C: any) { return StyleSheet.create({
  scroll:   { paddingBottom: 40 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title:    { fontSize: 38, fontWeight: '800', color: C.textPrimary, letterSpacing: -1.5, lineHeight: 42 },
  subtitle: { fontSize: 14, color: C.textTertiary, marginTop: 4, fontWeight: '500', fontStyle: 'italic' },

  horizonBlock: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
    padding: 18,
    gap: 10,
  },
  horizonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  horizonEmoji:  { fontSize: 20 },
  horizonLabel:  { fontSize: 13, fontWeight: '700', color: C.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' },

  goalRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  goalDot:  { width: 7, height: 7, borderRadius: 3.5, marginTop: 7, flexShrink: 0 },
  goalText: { flex: 1, fontSize: 16, color: C.textPrimary, lineHeight: 24, fontWeight: '400' },

  empty: { fontSize: 14, color: C.textTertiary, fontStyle: 'italic' },

  cta: {
    marginHorizontal: Spacing.lg,
    marginTop: 8,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.primaryMid,
    backgroundColor: C.primaryLight,
  },
  ctaText: { fontSize: 15, color: C.primary, fontWeight: '600' },
}); }

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const C = useColors();  // active theme tokens
  const styles = useMemo(() => makeStyles(C), [C]);
  const { profile, tasks, projects, goals, toggleTask, updateProject, updateProfile, addTask, touchLastActive } = useStore();
  const [syncing,       setSyncing]       = useState(false);
  const [showQuickAdd,  setShowQuickAdd]  = useState(false);
  const [activePage,    setActivePage]    = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const [showAllToday,  setShowAllToday]  = useState(false);

  // Lifted: focus session state (shared with AmbientChatStrip for "Yes, let's go")
  const [workingTask, setWorkingTask] = useState<Task | null>(null);
  const [quickStart, setQuickStart] = useState(false);
  // Lifted: calendar events (needed by both TodayTimelinePage and AmbientChatStrip)
  const [calEvents, setCalEvents] = useState<TodayEvent[]>([]);

  // ── Live clock — refreshes on screen focus + every minute ───────────────
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(useCallback(() => {
    // Refresh time and calendar events every time the screen comes into focus
    setNow(new Date());
    getTodayCalendarEvents().then(setCalEvents).catch(() => {});
  }, []));

  useEffect(() => {
    // Tick every 60 s so greeting/mode update without needing a tab switch
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Mark today as active & cancel any pending lapse notification on open
  useEffect(() => {
    touchLastActive();
    import('../services/notifications').then(n => n.cancelLapseNotification()).catch(() => {});
    // Initial calendar fetch
    getTodayCalendarEvents().then(setCalEvents).catch(() => {});
    import('../services/notifications').then(n => n.requestPermissions()).catch(() => {});
  }, []);

  // Derived from live clock — always fresh
  const today = format(now, 'yyyy-MM-dd');

  // Time-aware plan mode
  const planMode: 'morning' | 'evening' | 'weekly' = (() => {
    const h   = now.getHours();
    const dow = now.getDay();
    if (dow === 0) return 'weekly';
    if (h >= 17)  return 'evening';
    return 'morning';
  })();

  const mits = useMemo(
    () => tasks.filter(t => t.date === today && t.isMIT && !t.completed),
    [tasks, today],
  );
  const otherToday = useMemo(
    () => tasks.filter(t => t.date === today && !t.isMIT && !t.completed),
    [tasks, today],
  );
  const inboxTasks = useMemo(
    () => tasks.filter(t => (t.isInbox || !t.date || t.date === '') && !t.completed),
    [tasks],
  );
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.date && t.date < today && !t.completed),
    [tasks, today],
  );
  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'active').slice(0, 4),
    [projects],
  );

  // Today's time blocks from the week skeleton
  const nowMinutes  = now.getHours() * 60 + now.getMinutes();
  const todayDow    = now.getDay();
  const todayBlocks = useMemo(() =>
    (profile.weekTemplate ?? [])
      .filter(b => b.dayOfWeek.includes(todayDow))
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)),
    [profile.weekTemplate, todayDow],
  );
  const completedToday = useMemo(() => tasks.filter(t => t.date === today && t.completed).length, [tasks, today]);
  const totalToday     = mits.length + otherToday.length;

  // Lapse detection — days since last recorded active session
  const daysSinceActive = useMemo(() => {
    if (!profile.lastActiveDate) return 0;
    try {
      return differenceInDays(new Date(today), parseISO(profile.lastActiveDate));
    } catch { return 0; }
  }, [profile.lastActiveDate, today]);

  // Focused today: first 2 incomplete tasks (MITs first), expand on demand
  const FOCUSED_LIMIT = 2;
  const allIncompleteMITs  = mits.filter(t => !t.completed);
  const allIncompleteOther = otherToday.filter(t => !t.completed);
  const focusedTasks = [...allIncompleteMITs, ...allIncompleteOther].slice(0, FOCUSED_LIMIT);
  const totalIncomplete = allIncompleteMITs.length + allIncompleteOther.length;
  const hiddenCount = Math.max(0, totalIncomplete - FOCUSED_LIMIT);

  // If returning after a lapse, schedule a gentle follow-up notification
  // (fires 3h later in case they close the app again without planning)
  useEffect(() => {
    if (daysSinceActive >= 3) {
      import('../services/notifications')
        .then(n => n.scheduleLapseNotification(daysSinceActive))
        .catch(() => {});
    }
  }, [daysSinceActive]);

  function handlePageChange(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActivePage(page);
  }

  function handleQuickAdd(text: string, addToToday: boolean, detectedDate?: string) {
    // If a natural-language date was detected, use it as the due date (and skip inbox)
    const resolvedDate = detectedDate ?? (addToToday ? today : '');
    const isScheduled  = resolvedDate !== '';
    addTask({
      text,
      isMIT:     false,
      completed: false,
      date:      resolvedDate,
      isInbox:   !isScheduled,
      isToday:   resolvedDate === today,
      priority:  'medium',
      domain:    (profile.selectedDomains?.[0] as DomainKey) ?? 'work',
    });
  }

  async function handleCalendarSync() {
    const withDeadlines = projects.filter(p => p.deadline && p.status === 'active');
    if (!withDeadlines.length) {
      Alert.alert('Nothing to sync', 'Add deadlines to your active projects first.\n\nOpen a project and set a deadline to get started.');
      return;
    }
    if (!profile.synapseCalendarId) {
      Alert.alert(
        'No calendar selected',
        'Go to Settings → Calendar Sync and pick which calendar to use.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSyncing(true);
    try {
      const result = await syncAllProjects(projects, profile.synapseCalendarId);
      if (result.calendarId && result.calendarId !== profile.synapseCalendarId) {
        updateProfile({ synapseCalendarId: result.calendarId });
      }
      result.projectResults.forEach(({ projectId, eventId }: any) =>
        updateProject(projectId, { calendarEventId: eventId }),
      );
      if (result.synced === 0) {
        Alert.alert('Nothing new to sync', `All ${withDeadlines.length} project deadline${withDeadlines.length !== 1 ? 's' : ''} are already in your calendar.`);
      } else {
        Alert.alert('Calendar synced ✓', `${result.synced} project deadline${result.synced !== 1 ? 's' : ''} added to "${profile.selectedCalendarName ?? 'your calendar'}".${result.failed > 0 ? `\n\n${result.failed} failed — check the project has a valid date.` : ''}`);
      }
    } catch (e: any) {
      Alert.alert('Sync failed', `${e.message ?? 'Unknown error'}\n\nCheck that Aiteall has calendar access in iPhone Settings → Privacy → Calendars.`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── Page tabs ──────────────────────────────────────────────────── */}
        <View style={styles.tabRow}>
          {(['Today', 'Inbox', 'Vision'] as const).map((label, i) => (
            <TouchableOpacity
              key={label}
              style={styles.tabItem}
              onPress={() => {
                pagerRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
                setActivePage(i);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activePage === i && styles.tabLabelActive]}>
                {label}
              </Text>
              {activePage === i && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Horizontal pager ───────────────────────────────────────────── */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePageChange}
          style={{ flex: 1 }}
          scrollEventThrottle={16}
          decelerationRate="fast"
        >

          {/* ── Page 0: Today timeline ────────────────────────────────────── */}
          {/* CRITICAL: explicit width: SCREEN_W on every page — without this,
              horizontal pager doesn't constrain children and content bleeds right */}
          <TlStyles C={C} />
          <View style={{ width: SCREEN_W, overflow: 'hidden' }}>
            <TodayTimelinePage
              navigation={navigation}
              onQuickAdd={() => setShowQuickAdd(true)}
              workingTask={workingTask}
              setWorkingTask={(t, isQuick?) => {
                if (t === null) {
                  setQuickStart(false);
                } else {
                  setQuickStart(!!isQuick);
                }
                setWorkingTask(t);
              }}
              calEvents={calEvents}
              quickStart={quickStart}
            />
          </View>

          {/* ── Page 1: Inbox ─────────────────────────────────────────────── */}
          <View style={{ width: SCREEN_W, overflow: 'hidden' }}>
            <InboxPage
              navigation={navigation}
              onQuickAdd={() => setShowQuickAdd(true)}
            />
          </View>

          {/* ── Page 2: Goals panel ───────────────────────────────────────── */}
          <View style={{ width: SCREEN_W, overflow: 'hidden' }}>
            <GoalsPanelPage navigation={navigation} />
          </View>


        </ScrollView>

        {/* ── Ambient Chat Strip — always present on Today page ─────────── */}
        {activePage === 0 && (
          <AmbientChatStrip
            navigation={navigation}
            profile={profile}
            tasks={tasks}
            goals={goals}
            calEvents={calEvents}
            primaryMIT={mits[0] ?? null}
            onStartMIT={(isQuick) => {
              const mit = mits[0];
              if (mit) { setQuickStart(!!isQuick); setWorkingTask(mit); }
            }}
          />
        )}

      </SafeAreaView>

      <QuickAddModal
        visible={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={handleQuickAdd}
      />

      <FloatingAddButton />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: any) { return StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.background },
  safe:  { flex: 1 },
  scroll:{ paddingBottom: 40 },

  // Page tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    marginBottom: 2,
  },
  tabItem: {
    marginRight: Spacing.lg,
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textTertiary,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: C.textPrimary,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.primary,
  },

  // Greeting
  greetingWrap:  { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  dateText:      { fontSize: 12, color: C.textTertiary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  greetingText:  { fontSize: 38, fontWeight: '800', color: C.textPrimary, lineHeight: 44, letterSpacing: -1.5 },

  // Top action cards
  topActions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
  },
  topCard: {
    flex: 1, borderWidth: 1, borderColor: C.border,
    borderRadius: Radius.lg, padding: 16, gap: 6,
    backgroundColor: C.surface,
  },
  topCardHighlight: {
    backgroundColor: C.accentLight,
    borderColor: C.accentMid,
  },
  topCardLabel:          { fontSize: 10, fontWeight: '700', color: C.textTertiary, letterSpacing: 1.2 },
  topCardLabelHighlight: { color: '#D4621A' },
  topCardTitle:          { fontSize: 16, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3 },
  topCardTitleHighlight: { color: '#D4621A' },
  topCardArrow:          { fontSize: 16, color: C.textTertiary, marginTop: 4 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle:  { fontSize: 22, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5 },
  sectionAction: { fontSize: 14, color: C.primary, fontWeight: '600' },
  sectionBody:   { paddingHorizontal: Spacing.lg },

  // Today sequence
  seqRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  seqRowDone:    { opacity: 0.4 },
  seqTimeCol:    { width: 62, alignItems: 'flex-end', gap: 1 },
  seqTimeStart:  { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  seqTimeEnd:    { fontSize: 10, color: C.textTertiary },
  seqTimeDash:   { width: 1, height: 5, backgroundColor: C.borderLight, alignSelf: 'center' },
  seqTimeDone:   { color: C.textTertiary },
  seqCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seqCheckDone:  { backgroundColor: C.ink, borderColor: C.ink },
  seqCheckMark:  { fontSize: 11, color: '#fff', fontWeight: '700' },
  seqLabel:      { fontSize: 15, fontWeight: '500', color: C.textPrimary, lineHeight: 20 },
  seqLabelDone:  { textDecorationLine: 'line-through', color: C.textTertiary },
  seqReason:     { fontSize: 12, color: C.textTertiary, marginTop: 2, fontStyle: 'italic', lineHeight: 16 },

  planCTA: {
    paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: C.accentLight,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: C.accentMid,
    marginTop: 4,
  },
  planCTAText: { fontSize: 15, color: C.accent, fontWeight: '600', letterSpacing: 0.1 },

  seeAllBtn:  { paddingVertical: 12, alignItems: 'center' },
  seeAllText: { fontSize: 13, color: C.textTertiary, fontWeight: '500' },

  // Decision fatigue card
  fatigueCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: 4,
    borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1.5, borderColor: C.accent,
    backgroundColor: C.surface,
  },
  fatigueInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  fatigueIcon:  { fontSize: 22 },
  fatigueTitle: { fontSize: 14, fontWeight: '700', color: C.accent, marginBottom: 2 },
  fatigueSub:   { fontSize: 12, color: C.textMuted },
  fatigueArrow: { fontSize: 18, color: C.accent, fontWeight: '700' },

  // Home time-blocks
  homeBlocksCard: {
    marginHorizontal: Spacing.base,
    backgroundColor: C.surface,
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  homeBlockRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 14 },
  homeBlockPast:     { opacity: 0.35 },
  homeBlockAccent:   { width: 3, alignSelf: 'stretch', marginRight: 12 },
  homeBlockTimes:    { width: 56, alignItems: 'center', gap: 1, paddingRight: 8 },
  homeBlockTime:     { fontSize: 10, color: C.textTertiary, fontWeight: '600' },
  homeBlockTimeDash: { fontSize: 9, color: C.borderLight },
  homeBlockLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  homeBlockName:     { fontSize: 14, fontWeight: '600', color: C.textPrimary, flex: 1 },
  homeBlockNamePast: { color: C.textTertiary },
  homeBlockMeta:     { fontSize: 11, color: C.textTertiary },
  homeBlockDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 15 },
  homeNowPill:       { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  homeNowText:       { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  // Inbox nudge
  inboxNudge: {
    marginHorizontal: Spacing.base, marginTop: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1, borderStyle: 'dashed' as const, borderColor: C.border,
  },
  inboxNudgeText: { fontSize: 13, color: C.textTertiary },

  // Lapse recovery card
  lapseCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.base, marginBottom: 4,
    borderRadius: Radius.lg, padding: 18,
    backgroundColor: C.primaryLight,
    borderWidth: 1, borderColor: C.primaryMid,
  },
  lapseTitle: { fontSize: 16, fontWeight: '700', color: C.primary, marginBottom: 4 },
  lapseBody:  { fontSize: 14, color: C.primary, lineHeight: 20, fontWeight: '400' },

  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayCount:  { fontSize: 13, color: C.textTertiary, fontWeight: '500' },

  taskGroupLabel: {
    fontSize: 10, fontWeight: '700', color: C.textTertiary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  taskCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCheckDone:  { backgroundColor: C.ink, borderColor: C.ink },
  taskCheckMark:  { fontSize: 11, color: '#fff', fontWeight: '700' },
  taskText:       { fontSize: 15, fontWeight: '500', color: C.textPrimary, lineHeight: 20 },
  taskTextDone:   { textDecorationLine: 'line-through', color: C.textTertiary },
  taskMeta:       { fontSize: 11, color: C.textTertiary, marginTop: 2 },

  // Greeting row (greeting + plus button)
  greetingRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingRight: Spacing.lg,
  },
  plusBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.ink,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28, flexShrink: 0,
  },
  plusBtnText: { fontSize: 22, color: '#fff', lineHeight: 26, fontWeight: '300' },

  // Inbox count badge (reused habitCount style)
  habitCount: { fontSize: 13, color: C.textTertiary, fontWeight: '500' },
  habitScroll:{ paddingLeft: Spacing.lg, paddingRight: Spacing.lg, paddingVertical: 4, gap: 8 },

  // Inbox
  inboxCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  inboxRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  inboxDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: C.textTertiary, flexShrink: 0,
  },
  inboxText: { flex: 1, fontSize: 15, color: C.textPrimary, fontWeight: '400' },
  inboxMeta: { fontSize: 12, color: C.textTertiary, fontWeight: '400' },
  inboxMore: {
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
  },
  inboxMoreText: { fontSize: 13, color: C.primary, fontWeight: '600' },

  // Overdue banner
  overdueBanner: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.warningLight,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  overdueLeft:   { flex: 1, gap: 2 },
  overdueTitle:  { fontSize: 14, fontWeight: '700', color: C.warning },
  overdueSub:    { fontSize: 12, color: C.textTertiary },
  overdueAction: { fontSize: 13, fontWeight: '600', color: C.warning },

  // Projects
  projectsCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  projectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  projectAccent: { width: 3, height: 32, borderRadius: 2, flexShrink: 0 },
  projectBody:   { flex: 1, gap: 5 },
  projectTitle:  { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 3, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2 },
  progressLabel: { fontSize: 11, color: C.textTertiary, width: 28, textAlign: 'right' },
  daysLeft:      { fontSize: 12, color: C.textTertiary, fontWeight: '500' },
  projectChevron:{ fontSize: 18, color: C.textTertiary },

  emptyCard: {
    marginHorizontal: Spacing.lg, marginTop: 4,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border,
  },
  emptyCardText: { fontSize: 14, color: C.textTertiary },

  // Calendar sync
  calBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: C.border,
  },
  calBtnText: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
}); }

function makeQa(C: any) { return StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
  },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  title:    { fontSize: 20, fontWeight: '700', color: C.textPrimary, marginBottom: 16 },
  input: {
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: C.textPrimary, marginBottom: 16,
  },
  dateChipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  dateChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primaryLight, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: C.primaryMid,
  },
  dateChipText:       { fontSize: 13, color: C.primary, fontWeight: '600' },
  dateChipRemove:     { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dateChipRemoveText: { fontSize: 18, color: C.textTertiary, lineHeight: 22 },

  mitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.background, borderRadius: Radius.md,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20,
  },
  mitLabel:   { fontSize: 15, fontWeight: '500', color: C.textPrimary },
  mitSub:     { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  addBtn:     { backgroundColor: C.ink, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  addBtnOff:  { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:  { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: C.textSecondary, fontSize: 15 },
}); }
