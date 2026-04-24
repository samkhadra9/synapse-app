/**
 * UndoSnackbar — the 10-second window between "did that" and "actually did that."
 *
 * CP3.4. Mounted once at the app root. Subscribes to `useUndo` and renders
 * a small floating pill near the bottom of the screen whenever an entry is
 * active. Fades in / out with a 200ms ease-out timing curve (CP3.1 rules:
 * no spring, no bounce).
 *
 * Sits above the tab bar but below any modal — that way if the user deletes
 * something and then opens a full-screen sheet, the snackbar isn't lost
 * beneath it (this is handled by z-order — the snackbar is drawn by the
 * root component, so it's above screen content but below modal presentations,
 * which is the correct behavior: modals pre-empt all ambient chrome).
 *
 * The snackbar itself is a tap target — tapping Undo calls the stored undo
 * function. Tapping outside the label (or the × icon) dismisses without
 * running undo.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing, useColors } from '../theme';
import { useUndo } from '../services/undo';

export default function UndoSnackbar() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);

  const entry = useUndo(u => u.entry);
  const run = useUndo(u => u.run);
  const dismiss = useUndo(u => u.dismiss);

  // Opacity + translate — fade up in, fade down out. 220ms ease-out.
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (entry) {
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 0, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(translate, { toValue: 12, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [entry, opacity, translate]);

  // No entry — render nothing. Skip the animated wrapper too so it doesn't
  // eat taps on whatever's behind (pointerEvents 'none' would also work,
  // but returning null keeps the component tree cleaner).
  if (!entry) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        s.wrap,
        { bottom: insets.bottom + 100, opacity, transform: [{ translateY: translate }] },
      ]}
    >
      <View style={s.pill}>
        <Text numberOfLines={1} style={s.label}>{entry.label}</Text>
        <TouchableOpacity onPress={run} hitSlop={8} activeOpacity={0.7}>
          <Text style={s.undoText}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} hitSlop={8} activeOpacity={0.7} style={s.closeBtn}>
          <Ionicons name="close" size={14} color={C.textInverse} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0, right: 0,
      alignItems: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      maxWidth: '92%',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.ink,
      borderRadius: Radius.full,
      // Soft shadow — platform blends this on iOS, elevation kicks in on Android.
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
    },
    label: {
      flexShrink: 1,
      color: C.textInverse,
      fontSize: 14,
      fontWeight: '500',
    },
    undoText: {
      color: C.accentMid,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    closeBtn: {
      width: 18, height: 18, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
      opacity: 0.6,
    },
  });
}
