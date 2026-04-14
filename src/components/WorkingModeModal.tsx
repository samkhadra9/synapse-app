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
import { Task } from '../store/useStore';

interface WorkingModeModalProps {
  task: Task | null;
  projectTitle?: string;
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface Distraction {
  id: string;
  text: string;
}

export default function WorkingModeModal({
  task,
  projectTitle,
  visible,
  onClose,
  onComplete,
}: WorkingModeModalProps) {
  const C = useColors();
  const { width, height } = useWindowDimensions();
  const s = useMemo(() => makeStyles(C, width, height), [C, width, height]);

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasShown25MinCheckIn, setHasShown25MinCheckIn] = useState(false);

  // Distraction capture
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  const [newDistraction, setNewDistraction] = useState('');

  // Check-in modal state
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInResponse, setCheckInResponse] = useState<string | null>(null);
  const [blockerText, setBlockerText] = useState('');

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

  // Close modal handler
  const handleClose = () => {
    // Reset state when closing
    setElapsedSeconds(0);
    setIsPaused(false);
    setHasShown25MinCheckIn(false);
    setDistractions([]);
    setNewDistraction('');
    setCheckInVisible(false);
    setCheckInResponse(null);
    setBlockerText('');
    onClose();
  };

  // Complete task handler
  const handleComplete = () => {
    // Reset state
    setElapsedSeconds(0);
    setIsPaused(false);
    setHasShown25MinCheckIn(false);
    setDistractions([]);
    setNewDistraction('');
    setCheckInVisible(false);
    setCheckInResponse(null);
    setBlockerText('');
    onComplete();
  };

  if (!visible || !task) return null;

  const timerOpacity = isPaused ? C.textTertiary : C.textPrimary;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={[s.container, { backgroundColor: C.background }]}>
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
          {/* Focus mode label */}
          <View style={s.labelRow}>
            <Text style={s.focusLabel}>✦ FOCUS MODE</Text>
          </View>

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
          <Text style={s.distractionsLabel}>DISTRACTIONS</Text>

          {/* Input for capturing distractions */}
          <View style={s.inputRow}>
            <TextInput
              style={s.distractionInput}
              placeholder="+ Capture a thought..."
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
    distractionsLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textTertiary,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: Spacing.sm,
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
  });
}
