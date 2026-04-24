/**
 * DeepWorkScreen — Solas
 *
 * Full-screen focus session. Three phases:
 *   1. SET — user states their session goal (what they'll produce)
 *   2. ACTIVE — countdown timer, interruption tracking, Focus mode prompt
 *   3. CAPTURE — post-session artifact capture (what did I produce? next action?)
 *
 * App-blocking note: True cross-app blocking (like Opal) requires Apple's
 * Family Controls entitlement which is only available in a custom dev build,
 * not Expo Go. This screen uses AppState to detect escapes + expo-keep-awake
 * to hold the screen. Full blocking can be wired in once on TestFlight.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, AppState, AppStateStatus, Linking, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { soft, done as hapticDone } from '../services/haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useColors, Spacing, Radius } from '../theme';
import { useStore } from '../store/useStore';

type Phase = 'set' | 'active' | 'capture';

const FOCUS_MODE_URL = 'App-prefs:FOCUS_CONFIGURATION'; // opens iOS Focus settings

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// 10-minute increments from 10 min to 4 hours
const TIME_OPTIONS = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240,
];

function makeStyles(C: any) {
  return StyleSheet.create({
    // SET + CAPTURE phase: warm white with amber orb
    setContainer: { flex: 1, backgroundColor: C.background },
    safe:         { flex: 1 },

    // C.Lab-style decorative orb — warm amber glow
    orbDecor: {
      position: 'absolute',
      width: 280, height: 280,
      borderRadius: 140,
      backgroundColor: '#F4A96A',   // warm amber
      opacity: 0.18,
      top: -60, right: -60,
      // React Native can't do blur, but the soft orb shape still reads as the C.Lab aesthetic
    },
    // Green orb for capture/success phase
    orbDecorGreen: {
      position: 'absolute',
      width: 260, height: 260,
      borderRadius: 130,
      backgroundColor: '#6ECC8A',
      opacity: 0.14,
      top: -40, right: -40,
    },

    closeBtn:     { position: 'absolute', top: 56, right: Spacing.base, zIndex: 10, padding: 8 },
    closeBtnText: { fontSize: 18, color: C.textTertiary, fontWeight: '500' },

    // ── SET phase ── editorial, airy
    setContent: { padding: Spacing.lg, paddingTop: Spacing.xl * 2, paddingBottom: 60 },
    setLabel: {
      fontSize: 11, fontWeight: '700', color: C.accent,
      letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase',
    },
    setTitle: {
      fontSize: 40, fontWeight: '800', color: C.textPrimary,
      letterSpacing: -1.5, lineHeight: 44, marginBottom: 16,
    },
    setSub: {
      fontSize: 15, color: C.textSecondary,
      lineHeight: 24, marginBottom: Spacing.xl,
    },
    goalInput: {
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.lg, borderWidth: 1.5, borderColor: C.border,
      padding: 18, fontSize: 16, color: C.textPrimary, minHeight: 100,
      textAlignVertical: 'top', lineHeight: 24, marginBottom: Spacing.base,
    },
    timePickerLabel: {
      fontSize: 11, fontWeight: '700', color: C.textTertiary,
      letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, marginTop: Spacing.sm,
    },
    timePickerScroll: { marginBottom: Spacing.xl },
    timePickerRow:    { flexDirection: 'row', gap: 8, paddingRight: Spacing.base },
    timeChip: {
      paddingHorizontal: 16, paddingVertical: 11,
      borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border,
      backgroundColor: C.background,
    },
    timeChipActive:     { backgroundColor: C.ink, borderColor: C.ink },
    timeChipText:       { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
    timeChipTextActive: { color: '#FFF' },

    startBtn: {
      backgroundColor: C.ink, borderRadius: Radius.full,
      paddingVertical: 20, alignItems: 'center',
    },
    startBtnDisabled: { opacity: 0.3 },
    startBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF', letterSpacing: 0.2 },

    // ── ACTIVE phase — stays dark and immersive ──
    container: { flex: 1, backgroundColor: '#0A0F1A' },   // deeper, richer dark

    progressBarTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
    progressBarFill:  { height: 2, backgroundColor: '#D4621A' },   // warm amber progress
    progressBarOver:  { backgroundColor: '#1A5C4A' },               // teal when done

    activeContent: { flex: 1, padding: Spacing.lg, justifyContent: 'center', gap: Spacing.xl },
    timerWrap:     { alignItems: 'center' },
    timerText:     { fontSize: 80, fontWeight: '200', color: '#F8FAFC', letterSpacing: -5, fontVariant: ['tabular-nums'] },
    timerTextOver: { color: '#6ECC8A' },
    timerTarget:   { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 10, letterSpacing: 0.5 },

    goalReminder: {
      backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: Radius.lg,
      padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    goalReminderLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
    goalReminderText:  { fontSize: 16, color: 'rgba(255,255,255,0.85)', lineHeight: 25 },

    interruptionBadge: {
      backgroundColor: 'rgba(220,38,38,0.12)', borderRadius: Radius.full,
      paddingHorizontal: 16, paddingVertical: 7, alignSelf: 'center',
      borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)',
    },
    interruptionText: { fontSize: 13, color: '#FCA5A5', fontWeight: '500' },

    focusLink:     { alignItems: 'center' },
    focusLinkText: { fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecorationLine: 'underline' },

    endBtnWrap: { padding: Spacing.base, paddingBottom: Spacing.xl },
    endBtn: {
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
      borderRadius: Radius.full, paddingVertical: 17, alignItems: 'center',
    },
    endBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },

    // ── CAPTURE phase ── warm editorial (back to light)
    captureContent: { flex: 1, padding: Spacing.lg, paddingTop: Spacing.xl },
    captureLabel: {
      fontSize: 11, fontWeight: '700', color: C.primary,
      letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase',
      textAlign: 'center',
    },
    captureTitle: {
      fontSize: 52, fontWeight: '200', color: C.textPrimary,
      textAlign: 'center', letterSpacing: -3, lineHeight: 56, marginBottom: 8,
      fontVariant: ['tabular-nums'],
    },
    captureMeta: {
      fontSize: 14, color: C.textSecondary, textAlign: 'center',
      marginBottom: Spacing.xl, fontWeight: '500',
    },
    captureGoalBox: {
      backgroundColor: C.surfaceSecondary, borderRadius: Radius.lg,
      padding: 16, marginBottom: Spacing.lg, borderWidth: 1, borderColor: C.border,
    },
    captureGoalLabel: { fontSize: 10, color: C.textTertiary, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' },
    captureGoal:      { fontSize: 15, color: C.textPrimary, lineHeight: 23, fontWeight: '500' },
    captureFieldLabel: { fontSize: 11, color: C.textTertiary, fontWeight: '700', marginBottom: 8, marginTop: Spacing.md, letterSpacing: 0.8, textTransform: 'uppercase' },
    captureInput: {
      backgroundColor: C.surfaceSecondary, borderRadius: Radius.lg,
      borderWidth: 1.5, borderColor: C.border,
      padding: 16, fontSize: 15, color: C.textPrimary, minHeight: 76,
      textAlignVertical: 'top', lineHeight: 23, marginBottom: Spacing.sm,
    },
    saveBtn: {
      backgroundColor: C.ink, borderRadius: Radius.full,
      paddingVertical: 19, alignItems: 'center', marginTop: Spacing.base,
    },
    saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', letterSpacing: 0.2 },
    skipBtn:     { alignItems: 'center', paddingVertical: 14 },
    skipBtnText: { fontSize: 14, color: C.textTertiary },
  });
}

export default function DeepWorkScreen({ navigation }: any) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const { profile, addDeepWorkSession } = useStore();
  const insets = useSafeAreaInsets();

  const [phase,         setPhase]        = useState<Phase>('set');
  const [goal,          setGoal]         = useState('');
  const [artifact,      setArtifact]     = useState('');
  const [nextAction,    setNextAction]   = useState('');
  const [elapsed,       setElapsed]      = useState(0);          // seconds counted up
  const [selectedMins,  setSelectedMins] = useState(profile.deepWorkBlockLength ?? 60);
  const [interruptions, setInterruptions] = useState(0);

  const sessionIdRef  = useRef<string>(
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    })
  );
  const startTimeRef  = useRef<Date | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef   = useRef<AppStateStatus>(AppState.currentState);
  const bgTimeRef     = useRef<number | null>(null);            // when user left

  // ── Keep screen awake during session ─────────────────────────────────────
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => { deactivateKeepAwake(); };
  }, []);

  // ── Timer — counts up; we display countdown from selectedMins ────────────
  useEffect(() => {
    if (phase === 'active') {
      startTimeRef.current = new Date();
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1;
          if (next >= selectedMins * 60) {
            // Time's up — one "done" tick, not an alarm pattern.
            hapticDone();
            clearInterval(timerRef.current!);
            setPhase('capture');
          }
          return next;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, selectedMins]);

  // ── AppState — detect when user leaves ───────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current === 'active' && next === 'background') {
        bgTimeRef.current = Date.now();
      }
      if (appStateRef.current === 'background' && next === 'active') {
        const away = bgTimeRef.current ? Math.round((Date.now() - bgTimeRef.current) / 1000) : 0;
        if (away > 5) {
          setInterruptions(i => i + 1);
          // "Welcome back" — soft, not scolding. CP3.0.
          soft();
        }
        // Recalculate elapsed from startTimeRef so the timer stays accurate
        // even when iOS pauses the JS thread while the app is backgrounded
        if (startTimeRef.current) {
          const trueElapsed = Math.round((Date.now() - startTimeRef.current.getTime()) / 1000);
          setElapsed(trueElapsed);
        }
        bgTimeRef.current = null;
      }
      appStateRef.current = next;
    });

    return () => sub.remove();
  }, [phase]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const startSession = useCallback(() => {
    if (!goal.trim()) return;

    Alert.alert(
      'Enable Focus mode',
      'Turning on iOS Focus mode will silence notifications during your session. Want to open Focus settings now?',
      [
        { text: 'Skip', onPress: () => setPhase('active') },
        {
          text: 'Open Focus settings',
          onPress: () => {
            Linking.openURL(FOCUS_MODE_URL).catch(() => {});
            setTimeout(() => setPhase('active'), 500);
          },
        },
      ]
    );
  }, [goal]);

  const endSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('capture');
  }, []);

  const confirmEnd = useCallback(() => {
    // CP3.4 — no "are you sure?" for ending a session. If the user tapped End,
    // they meant End. We go straight to the capture phase (the data isn't
    // destroyed — it's still in state, and the capture flow has its own
    // "keep going" affordance if they want to resume.)
    endSession();
  }, [endSession]);

  const saveAndExit = useCallback(() => {
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    addDeepWorkSession({
      startedAt:       startTimeRef.current?.toISOString() ?? new Date().toISOString(),
      endedAt:         new Date().toISOString(),
      durationMinutes,
      goal:            goal.trim(),
      artifact:        artifact.trim() || undefined,
      nextAction:      nextAction.trim() || undefined,
      interruptions,
      completed:       true,
    });
    navigation.goBack();
  }, [elapsed, goal, artifact, nextAction, interruptions, addDeepWorkSession, navigation]);

  const skipCapture = useCallback(() => {
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    addDeepWorkSession({
      startedAt:       startTimeRef.current?.toISOString() ?? new Date().toISOString(),
      endedAt:         new Date().toISOString(),
      durationMinutes,
      goal:            goal.trim(),
      interruptions,
      completed:       true,
    });
    navigation.goBack();
  }, [elapsed, goal, interruptions, addDeepWorkSession, navigation]);

  // ── Timer display — countdown ─────────────────────────────────────────────
  const targetSecs  = selectedMins * 60;
  const remaining   = Math.max(0, targetSecs - elapsed);
  const progressPct = Math.min(elapsed / targetSecs, 1);
  const isDone      = remaining === 0;

  // ── Renders ───────────────────────────────────────────────────────────────

  if (phase === 'set') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.setContainer}>
        <View style={styles.orbDecor} />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={[styles.setContent, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.setLabel}>DEEP WORK</Text>
            <Text style={styles.setTitle}>What will you{'\n'}produce?</Text>
            <Text style={styles.setSub}>
              Name the specific artifact. A note, a plan, a draft, a decision.
              Not "work on X" — what will exist when you're done?
            </Text>

            <TextInput
              style={styles.goalInput}
              value={goal}
              onChangeText={setGoal}
              placeholder="e.g. First draft of proposal, Outline for presentation…"
              placeholderTextColor={C.textTertiary}
              multiline
              autoFocus
            />

            {/* Time picker */}
            <Text style={styles.timePickerLabel}>SESSION LENGTH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timePickerScroll} contentContainerStyle={styles.timePickerRow}>
              {TIME_OPTIONS.map(mins => {
                const isSelected = selectedMins === mins;
                const label = mins < 60
                  ? `${mins}m`
                  : mins % 60 === 0
                    ? `${mins / 60}h`
                    : `${Math.floor(mins / 60)}h${mins % 60}m`;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.timeChip, isSelected && styles.timeChipActive]}
                    onPress={() => setSelectedMins(mins)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.startBtn, !goal.trim() && styles.startBtnDisabled]}
              onPress={startSession}
              disabled={!goal.trim()}
              activeOpacity={0.88}
            >
              <Text style={styles.startBtnText}>Start {selectedMins < 60 ? `${selectedMins}m` : selectedMins % 60 === 0 ? `${selectedMins / 60}h` : `${Math.floor(selectedMins / 60)}h${selectedMins % 60}m`} session</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
      </KeyboardAvoidingView>
    );
  }

  if (phase === 'active') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

          {/* Progress ring / bar */}
          <View style={styles.progressBarTrack}>
            <View style={[
              styles.progressBarFill,
              { width: `${progressPct * 100}%` as any },
              isDone && styles.progressBarOver,
            ]} />
          </View>

          <View style={styles.activeContent}>
            {/* Timer — countdown */}
            <View style={styles.timerWrap}>
              <Text style={[styles.timerText, isDone && styles.timerTextOver]}>
                {formatTime(remaining)}
              </Text>
              <Text style={styles.timerTarget}>
                {isDone
                  ? `✓ Time's up`
                  : `${selectedMins < 60 ? `${selectedMins}m` : `${Math.floor(selectedMins / 60)}h${selectedMins % 60 > 0 ? `${selectedMins % 60}m` : ''}`} session`}
              </Text>
            </View>

            {/* Goal reminder */}
            <View style={styles.goalReminder}>
              <Text style={styles.goalReminderLabel}>PRODUCING</Text>
              <Text style={styles.goalReminderText}>{goal}</Text>
            </View>

            {/* Interruptions */}
            {interruptions > 0 && (
              <View style={styles.interruptionBadge}>
                <Text style={styles.interruptionText}>
                  {interruptions} interruption{interruptions !== 1 ? 's' : ''} detected
                </Text>
              </View>
            )}

            {/* Focus mode reminder */}
            <TouchableOpacity
              style={styles.focusLink}
              onPress={() => Linking.openURL(FOCUS_MODE_URL).catch(() => {})}
            >
              <Text style={styles.focusLinkText}>Enable iOS Focus mode →</Text>
            </TouchableOpacity>
          </View>

          {/* End session */}
          <View style={styles.endBtnWrap}>
            <TouchableOpacity style={styles.endBtn} onPress={confirmEnd} activeOpacity={0.88}>
              <Text style={styles.endBtnText}>End session</Text>
            </TouchableOpacity>
          </View>

        </SafeAreaView>
      </View>
    );
  }

  // phase === 'capture'
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.setContainer}>
        <View style={styles.orbDecorGreen} />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.captureContent}>
              <Text style={styles.captureLabel}>SESSION COMPLETE</Text>
              <Text style={styles.captureTitle}>
                {formatTime(elapsed)}
              </Text>
              <Text style={styles.captureMeta}>
                {interruptions === 0 ? 'Zero interruptions. Nice.' : `${interruptions} interruption${interruptions !== 1 ? 's' : ''}`}
              </Text>

              <View style={styles.captureGoalBox}>
                <Text style={styles.captureGoalLabel}>YOU SET OUT TO PRODUCE</Text>
                <Text style={styles.captureGoal}>{goal}</Text>
              </View>

              <Text style={styles.captureFieldLabel}>What did you actually produce?</Text>
              <TextInput
                style={styles.captureInput}
                value={artifact}
                onChangeText={setArtifact}
                placeholder="Be honest — even 'got blocked by X' is useful data"
                placeholderTextColor={C.textTertiary}
                multiline
              />

              <Text style={styles.captureFieldLabel}>What's the very next action?</Text>
              <TextInput
                style={styles.captureInput}
                value={nextAction}
                onChangeText={setNextAction}
                placeholder="One specific physical action…"
                placeholderTextColor={C.textTertiary}
                multiline
              />

              <TouchableOpacity style={styles.saveBtn} onPress={saveAndExit} activeOpacity={0.88}>
                <Text style={styles.saveBtnText}>Save & finish</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={skipCapture} style={styles.skipBtn}>
                <Text style={styles.skipBtnText}>Skip capture</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

