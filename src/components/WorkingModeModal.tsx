/**
 * WorkingModeModal — Full-screen focus mode for executing tasks
 *
 * Features:
 * - Counts up from 0:00 (MM:SS format)
 * - 25-minute check-in milestone with in-app overlay card
 * - Distraction capture to offload intrusive thoughts
 * - Pause/Resume functionality
 * - Done button to complete task with optional momentum animation
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  SafeAreaView, useWindowDimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { Task, useStore } from '../store/useStore';

interface WorkingModeModalProps {
  task: Task | null;
  projectTitle?: string;
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  /** If true, shows "5 min starter" framing at top instead of the full focus framing */
  quickStart?: boolean;
}

interface Distraction {
  id: string;
  text: string;
}

interface ReviewItem {
  id: string;
  text: string;
  keep: boolean;
}

export default function WorkingModeModal({
  task,
  projectTitle,
  visible,
  onClose,
  onComplete,
  quickStart = false,
}: WorkingModeModalProps) {
  const addTask = useStore(s => s.addTask);
  const C = useColors();
  const { width, height } = useWindowDimensions();
  const s = useMemo(() => makeStyles(C, width, height), [C, width, height]);

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasShown25MinCheckIn, setHasShown25MinCheckIn] = useState(false);
  const [hasShown5MinCheckIn, setHasShown5MinCheckIn] = useState(false);
  const [show5MinOverlay, setShow5MinOverlay] = useState(false);

  // Distraction capture
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  const [newDistraction, setNewDistraction] = useState('');
  const [showInboxReview, setShowInboxReview] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  // Check-in modal state
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInResponse, setCheckInResponse] = useState<string | null>(null);
  const [blockerText, setBlockerText] = useState('');

  // Abort flag to prevent state updates on unmounted component
  const unmountedRef = useRef(false);
  // Track whether we're closing or completing after review
  const pendingActionRef = useRef<'close' | 'complete' | null>(null);

  // Unmount cleanup
  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  // Timer effect
  useEffect(() => {
    if (!visible || !task || isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, task, isPaused]);

  // Check-in milestone at 25 minutes (1500 seconds)
  useEffect(() => {
    if (visible && elapsedSeconds === 1500 && !hasShown25MinCheckIn) {
      setHasShown25MinCheckIn(true);
      setCheckInVisible(true);
    }
  }, [elapsedSeconds, hasShown25MinCheckIn, visible]);

  // Check-in milestone at 5 minutes (300 seconds) — only for quickStart mode
  useEffect(() => {
    if (quickStart && visible && elapsedSeconds === 300 && !hasShown5MinCheckIn) {
      setHasShown5MinCheckIn(true);
      setShow5MinOverlay(true);
    }
  }, [elapsedSeconds, hasShown5MinCheckIn, visible, quickStart]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Add distraction
  const handleAddDistraction = () => {
    const text = newDistraction.trim();
    if (!text) return;
    setDistractions(prev => [...prev, { id: Date.now().toString(), text }]);
    setNewDistraction('');
  };

  // Remove distraction
  const handleRemoveDistraction = (id: string) => {
    setDistractions(prev => prev.filter(d => d.id !== id));
  };

  // Handle check-in response
  const handleCheckInResponse = (response: 'fire' | 'progress' | 'stuck') => {
    setCheckInResponse(response);
    if (response === 'stuck') {
      // Show text input for blocker description
      return;
    }
    // For fire and progress, just dismiss and continue
    setCheckInVisible(false);
  };

  // Submit blocker description
  const handleBlockerSubmit = () => {
    if (blockerText.trim()) {
      // Distraction capture to remember the blocker
      setDistractions(prev => [
        ...prev,
        { id: Date.now().toString(), text: `BLOCKER: ${blockerText.trim()}` },
      ]);
    }
    setBlockerText('');
    setCheckInResponse(null);
    setCheckInVisible(false);
  };

  /** Save filtered brain dump items to inbox. */
  const flushDistractionsToInbox = (items: ReviewItem[]): void => {
    items.forEach(item => {
      if (item.keep) {
        addTask({
          text: item.text,
          completed: false,
          date: '',        // no date = inbox
          isToday: false,
          isMIT: false,
          isInbox: true,
          priority: 'medium',
          projectId: task?.projectId,
          createdAt: new Date().toISOString(),
        });
      }
    });
  };

  /** Clear all state and exit the modal with the pending action. */
  const resetAndExit = (action: 'close' | 'complete'): void => {
    setElapsedSeconds(0);
    setIsPaused(false);
    setHasShown25MinCheckIn(false);
    setHasShown5MinCheckIn(false);
    setShow5MinOverlay(false);
    setDistractions([]);
    setNewDistraction('');
    setCheckInVisible(false);
    setCheckInResponse(null);
    setBlockerText('');
    setShowInboxReview(false);
    setReviewItems([]);
    pendingActionRef.current = null;

    if (action === 'close') {
      onClose();
    } else {
      onComplete();
    }
  };

  // Close modal handler
  const handleClose = () => {
    if (distractions.length === 0) {
      resetAndExit('close');
    } else {
      pendingActionRef.current = 'close';
      setReviewItems(distractions.map(d => ({ ...d, keep: true })));
      setShowInboxReview(true);
    }
  };

  // Complete task handler
  const handleComplete = () => {
    if (distractions.length === 0) {
      resetAndExit('complete');
    } else {
      pendingActionRef.current = 'complete';
      setReviewItems(distractions.map(d => ({ ...d, keep: true })));
      setShowInboxReview(true);
    }
  };

  if (!visible || !task) return null;

  const timerOpacity = isPaused ? C.textTertiary : C.textPrimary;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={[s.container, { backgroundColor: C.background }]}>
        {showInboxReview ? (
          /* Review screen for filtered brain dump */
          <>
            {/* Header */}
            <View style={s.reviewHeader}>
              <Text style={s.reviewHeaderText}>✓ Session done</Text>
            </View>

            {/* Spacer */}
            <View style={{ height: Spacing.lg }} />

            {/* Title & Subtitle */}
            <View style={s.reviewTitleSection}>
              <Text style={s.reviewTitle}>Thoughts you captured</Text>
              <Text style={s.reviewSubtitle}>Tap to deselect anything you don't want to keep</Text>
            </View>

            {/* Scrollable list of review items */}
            <View style={s.reviewListContainer}>
              {reviewItems.map((item, idx) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={s.reviewItemRow}
                    onPress={() => {
                      setReviewItems(prev =>
                        prev.map(ri => (ri.id === item.id ? { ...ri, keep: !ri.keep } : ri))
                      );
                    }}
                    activeOpacity={0.6}
                  >
                    <View
                      style={[
                        s.reviewCheckbox,
                        { borderColor: C.primary, backgroundColor: item.keep ? C.primary : 'transparent' },
                      ]}
                    >
                      {item.keep && (
                        <Text style={[s.reviewCheckmark, { color: C.textInverse }]}>✓</Text>
                      )}
                    </View>
                    <Text style={[s.reviewItemText, { color: item.keep ? C.textPrimary : C.textTertiary }]}>
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                  {idx < reviewItems.length - 1 && (
                    <View style={[s.reviewHairline, { backgroundColor: C.border }]} />
                  )}
                </View>
              ))}
            </View>

            {/* Bottom spacing */}
            <View style={{ flex: 1 }} />

            {/* Action buttons */}
            <View style={s.reviewButtonsContainer}>
              <TouchableOpacity
                style={[s.reviewButtonPrimary, { backgroundColor: C.primary }]}
                onPress={() => {
                  flushDistractionsToInbox(reviewItems);
                  const action = pendingActionRef.current || 'close';
                  resetAndExit(action);
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.reviewButtonText, { color: C.textInverse }]}>Save to Inbox</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.reviewButtonSecondary, { borderColor: C.border }]}
                onPress={() => {
                  const action = pendingActionRef.current || 'close';
                  resetAndExit(action);
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.reviewButtonText, { color: C.textPrimary }]}>Dismiss all</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Header: Close button + Pause/Resume */}
            <View style={s.header}>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={C.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsPaused(!isPaused)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={isPaused ? 'play' : 'pause'} size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Content area */}
            <View style={s.scrollContent}>
          {/* Focus mode label — or 5-min quickstart banner */}
          {quickStart ? (
            <View style={[s.labelRow, s.quickStartBanner]}>
              <Text style={s.quickStartLabel}>⚡ 5-MINUTE STARTER</Text>
              <Text style={s.quickStartHint}>Just start. You can keep going after.</Text>
            </View>
          ) : (
            <View style={s.labelRow}>
              <Text style={s.focusLabel}>✦ FOCUS MODE</Text>
            </View>
          )}

          {/* Task text (large, prominent) */}
          <Text style={s.taskTitle} numberOfLines={3}>
            {task.text}
          </Text>

          {/* Reason/context (if exists) */}
          {task.reason && <Text style={s.reason}>{task.reason}</Text>}

          {/* Project pill (if exists) */}
          {projectTitle && <View style={s.projectPill}>
            <Text style={s.projectPillText}>{projectTitle}</Text>
          </View>}

          {/* Timer */}
          <View style={s.timerRow}>
            <Text style={[s.timer, { color: timerOpacity }]}>
              {formatTime(elapsedSeconds)}
            </Text>
          </View>

          {/* Divider */}
          <View style={s.divider} />

          {/* Distractions section */}
          <View style={s.distractionsHeader}>
            <Text style={s.distractionsLabel}>BRAIN DUMP</Text>
            <Text style={s.distractionsHint}>Thought popping up? Drop it here — stay focused.</Text>
          </View>

          {/* Input for capturing distractions */}
          <View style={s.inputRow}>
            <TextInput
              style={s.distractionInput}
              placeholder="Type any thought and press Return…"
              placeholderTextColor={C.textTertiary}
              value={newDistraction}
              onChangeText={setNewDistraction}
              onSubmitEditing={handleAddDistraction}
              returnKeyType="done"
              multiline
              maxLength={80}
            />
          </View>

          {/* Distraction list */}
          {distractions.length > 0 && (
            <View style={s.distractionsList}>
              {distractions.map(d => (
                <View key={d.id} style={s.distractionItem}>
                  <Text style={s.distractionText}>• {d.text}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveDistraction(d.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.removeButton}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

            {/* Bottom spacing */}
            <View style={{ height: Spacing.lg }} />
          </View>

          {/* Divider before done button */}
          <View style={s.bottomDivider} />

          {/* Done button */}
          <View style={s.doneButtonContainer}>
            <TouchableOpacity
              style={s.doneButton}
              onPress={handleComplete}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={20} color={C.textInverse} />
              <Text style={s.doneButtonText}>Done — I finished it</Text>
            </TouchableOpacity>
          </View>
          </>
        )}
      </SafeAreaView>

      {/* 25-minute check-in overlay */}
      {checkInVisible && (
        <CheckInCard
          visible={checkInVisible}
          response={checkInResponse}
          blockerText={blockerText}
          onSetBlockerText={setBlockerText}
          onSubmitBlocker={handleBlockerSubmit}
          onResponse={handleCheckInResponse}
          colors={C}
          styles={s}
        />
      )}

      {/* 5-minute check-in overlay — only for quickStart mode */}
      {show5MinOverlay && (
        <View style={s.overlay5Min}>
          <View style={[s.card5Min, { backgroundColor: C.surface }]}>
            <Text style={[s.title5Min, { color: C.textPrimary }]}>⚡ 5 minutes!</Text>
            <Text style={[s.subtitle5Min, { color: C.textSecondary }]}>
              You started. That's the hardest part.
            </Text>
            <View style={s.buttons5Min}>
              <TouchableOpacity
                style={[s.button5Min, { backgroundColor: C.primary }]}
                onPress={() => {
                  setShow5MinOverlay(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.buttonText5Min, { color: C.textInverse }]}>Keep going →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.button5Min, { borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' }]}
                onPress={() => {
                  setShow5MinOverlay(false);
                  setIsPaused(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.buttonText5Min, { color: C.textPrimary }]}>I need a pause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.button5Min, { borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' }]}
                onPress={() => {
                  setShow5MinOverlay(false);
                  handleClose();
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.buttonText5Min, { color: C.textPrimary }]}>That's enough for now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

interface CheckInCardProps {
  visible: boolean;
  response: string | null;
  blockerText: string;
  onSetBlockerText: (text: string) => void;
  onSubmitBlocker: () => void;
  onResponse: (response: 'fire' | 'progress' | 'stuck') => void;
  colors: any;
  styles: any;
}

function CheckInCard({
  visible,
  response,
  blockerText,
  onSetBlockerText,
  onSubmitBlocker,
  onResponse,
  colors: C,
  styles: s,
}: CheckInCardProps) {
  if (!visible) return null;

  return (
    <View style={s.checkInOverlay}>
      <View style={[s.checkInCard, { backgroundColor: C.surface }]}>
        {response === 'stuck' ? (
          <>
            <Text style={s.checkInTitle}>What's the blocker?</Text>
            <TextInput
              style={s.checkInInput}
              placeholder="Describe what's stuck..."
              placeholderTextColor={C.textTertiary}
              value={blockerText}
              onChangeText={onSetBlockerText}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[s.checkInButton, { backgroundColor: C.primary }]}
              onPress={onSubmitBlocker}
              activeOpacity={0.85}
            >
              <Text style={s.checkInButtonText}>Got it — keep going</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.checkInTitle}>25 minutes in. How's it going?</Text>
            <View style={s.checkInOptions}>
              <TouchableOpacity
                style={[s.checkInOption, { borderColor: C.primary }]}
                onPress={() => onResponse('fire')}
                activeOpacity={0.7}
              >
                <Text style={[s.checkInOptionText, { color: C.primary }]}>In the zone 🔥</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.checkInOption, { borderColor: C.primary }]}
                onPress={() => onResponse('progress')}
                activeOpacity={0.7}
              >
                <Text style={[s.checkInOptionText, { color: C.primary }]}>Making progress</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.checkInOption, { borderColor: C.primary }]}
                onPress={() => onResponse('stuck')}
                activeOpacity={0.7}
              >
                <Text style={[s.checkInOptionText, { color: C.primary }]}>Stuck — need help</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(C: any, width: number, height: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: 'space-between',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    scrollContent: {
      flex: 1,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.base,
    },
    labelRow: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    focusLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    quickStartBanner: {
      backgroundColor: C.primary + '14',
      borderRadius: Radius.md,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    quickStartLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 3,
      textAlign: 'center',
    },
    quickStartHint: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
    },
    taskTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: C.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.base,
      lineHeight: 28,
    },
    reason: {
      fontSize: 14,
      fontStyle: 'italic',
      color: C.textTertiary,
      textAlign: 'center',
      marginBottom: Spacing.base,
    },
    projectPill: {
      alignSelf: 'center',
      backgroundColor: C.primaryLight,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.full,
      marginBottom: Spacing.lg,
    },
    projectPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: C.primary,
    },
    timerRow: {
      alignItems: 'center',
      marginVertical: Spacing.lg,
    },
    timer: {
      fontSize: 56,
      fontWeight: '800',
      letterSpacing: 1,
      fontFamily: 'Menlo',
    },
    divider: {
      height: 1,
      backgroundColor: C.border,
      marginVertical: Spacing.lg,
    },
    distractionsHeader: {
      marginBottom: Spacing.sm,
    },
    distractionsLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textTertiary,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    distractionsHint: {
      fontSize: 12,
      color: C.textTertiary,
      lineHeight: 16,
    },
    inputRow: {
      marginBottom: Spacing.sm,
    },
    distractionInput: {
      fontSize: 15,
      color: C.textPrimary,
      paddingHorizontal: 0,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    distractionsList: {
      gap: Spacing.sm,
    },
    distractionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: 6,
    },
    distractionText: {
      flex: 1,
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 20,
    },
    removeButton: {
      fontSize: 20,
      color: C.textTertiary,
      fontWeight: '400',
    },
    bottomDivider: {
      height: 1,
      backgroundColor: C.border,
    },
    doneButtonContainer: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      gap: Spacing.md,
    },
    doneButton: {
      backgroundColor: C.primary,
      borderRadius: Radius.full,
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    doneButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: C.textInverse,
    },
    checkInOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    checkInCard: {
      borderRadius: Radius.xl,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.base,
      maxWidth: 300,
    },
    checkInTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: C.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.md,
    },
    checkInInput: {
      width: '100%',
      minHeight: 80,
      fontSize: 15,
      color: C.textPrimary,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    checkInButton: {
      width: '100%',
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    checkInButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: C.textInverse,
    },
    checkInOptions: {
      width: '100%',
      gap: Spacing.md,
    },
    checkInOption: {
      borderWidth: 1.5,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    checkInOptionText: {
      fontSize: 15,
      fontWeight: '600',
    },
    overlay5Min: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    card5Min: {
      borderRadius: Radius.xl,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.lg,
      maxWidth: 320,
    },
    title5Min: {
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    subtitle5Min: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 22,
    },
    buttons5Min: {
      width: '100%',
      gap: Spacing.md,
    },
    button5Min: {
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    buttonText5Min: {
      fontSize: 15,
      fontWeight: '600',
    },
    // Review screen styles
    reviewHeader: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    reviewHeaderText: {
      fontSize: 14,
      fontWeight: '600',
      color: C.textSecondary,
    },
    reviewTitleSection: {
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    reviewTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: Spacing.sm,
    },
    reviewSubtitle: {
      fontSize: 13,
      color: C.textTertiary,
      lineHeight: 18,
    },
    reviewListContainer: {
      flex: 1,
      paddingHorizontal: Spacing.lg,
    },
    reviewItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
    },
    reviewCheckbox: {
      width: 24,
      height: 24,
      borderRadius: Radius.md,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    reviewCheckmark: {
      fontSize: 14,
      fontWeight: '700',
    },
    reviewItemText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
    },
    reviewHairline: {
      height: 1,
      marginLeft: 24 + Spacing.md, // align with checkbox + gap
    },
    reviewButtonsContainer: {
      gap: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
    },
    reviewButtonPrimary: {
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    reviewButtonSecondary: {
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    reviewButtonText: {
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
