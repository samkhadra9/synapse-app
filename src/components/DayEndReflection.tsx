/**
 * DayEndReflection — evening "here's what you did" card (Phase 6)
 *
 * Shows when:
 *   - Local time is evening (after 5pm) or late (after 9pm)
 *   - Today's completions log has at least one entry
 *
 * The idea: ADHD brains often hit the end of the day convinced they
 * did nothing. The passive log knows that's not true. This card shows
 * them the receipts — tasks ticked, chat-mentioned wins, deep work
 * sessions — without asking them to journal.
 *
 * From here they can:
 *   - Dismiss (slides out; persists dismissed-for-today in AsyncStorage)
 *   - "Talk about my day" → opens a dump chat primed with the list
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Spacing, Radius, useColors } from '../theme';
import { useStore, CompletionEntry } from '../store/useStore';
import { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

const DISMISS_KEY = '@aiteall/dayEndReflection/dismissedDate';

/**
 * Should the reflection card be on screen?
 * - Hour >= 17 (5pm) — "evening" threshold
 * - Not already dismissed today
 */
function isEveningHour(): boolean {
  return new Date().getHours() >= 17;
}

export default function DayEndReflection() {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<Nav>();

  const completions = useStore(st => st.completions);
  const [dismissed, setDismissed] = useState(true); // start dismissed, un-dismiss after load

  const today = format(new Date(), 'yyyy-MM-dd');
  const todays = useMemo(
    () => completions.filter(c => c.at.slice(0, 10) === today),
    [completions, today],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dismissedDate = await AsyncStorage.getItem(DISMISS_KEY);
      if (cancelled) return;
      // Only un-dismiss if it's evening, have completions, and not already dismissed today
      const shouldShow = isEveningHour()
        && todays.length > 0
        && dismissedDate !== today;
      setDismissed(!shouldShow);
    })();
    return () => { cancelled = true; };
  }, [today, todays.length]);

  const onDismiss = async () => {
    await AsyncStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  const onTalk = () => {
    const list = todays.map(c => `• ${c.text}`).join('\n');
    navigation.navigate('Chat', {
      mode: 'dump',
      initialMessage: `Here's what I got done today:\n${list}\n\nCan we talk about the day?`,
    });
  };

  if (dismissed || todays.length === 0) return null;

  // Split by source for subtle visual variety
  const byTask    = todays.filter(c => c.source === 'task');
  const byChat    = todays.filter(c => c.source === 'chat');
  const byDeep    = todays.filter(c => c.source === 'deepwork');

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <Ionicons name="moon-outline" size={16} color={C.accent} />
        </View>
        <Text style={s.title}>Before you go dark —</Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={16} color={C.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text style={s.lead}>
        {todays.length === 1
          ? "here's the thing you did today:"
          : `here are the ${todays.length} things you did today:`}
      </Text>

      <View style={s.list}>
        {todays.slice(0, 8).map((c: CompletionEntry) => (
          <View key={c.id} style={s.row}>
            <Ionicons
              name={
                c.source === 'task'     ? 'checkmark-circle-outline'
                : c.source === 'deepwork' ? 'time-outline'
                : 'chatbubble-outline'
              }
              size={14}
              color={C.primary}
            />
            <Text style={s.rowText} numberOfLines={2}>{c.text}</Text>
          </View>
        ))}
        {todays.length > 8 && (
          <Text style={s.more}>…and {todays.length - 8} more</Text>
        )}
      </View>

      <View style={s.meta}>
        {byTask.length > 0 && <Text style={s.metaText}>{byTask.length} tasks</Text>}
        {byChat.length > 0 && <Text style={s.metaText}>{byChat.length} mentioned</Text>}
        {byDeep.length > 0 && <Text style={s.metaText}>{byDeep.length} deep work</Text>}
      </View>

      <TouchableOpacity style={s.talkBtn} onPress={onTalk} activeOpacity={0.85}>
        <Text style={s.talkBtnText}>Talk about the day</Text>
        <Ionicons name="arrow-forward" size={14} color={C.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: {
      marginHorizontal: Spacing.base,
      marginVertical: Spacing.sm,
      padding: Spacing.base,
      backgroundColor: C.surfaceWarm,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.accent + '33',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    iconWrap: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: C.accentLight,
      alignItems: 'center', justifyContent: 'center',
    },
    title: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.2,
    },
    lead: {
      fontSize: 13,
      color: C.textSecondary,
      marginBottom: 10,
      lineHeight: 18,
    },
    list: {
      marginBottom: 10,
      gap: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rowText: {
      flex: 1,
      fontSize: 14,
      color: C.textPrimary,
      lineHeight: 20,
    },
    more: {
      fontSize: 12,
      color: C.textTertiary,
      fontStyle: 'italic',
      marginLeft: 22,
      marginTop: 2,
    },
    meta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 12,
    },
    metaText: {
      fontSize: 11,
      color: C.textTertiary,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    talkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: C.ink,
      borderRadius: Radius.full,
    },
    talkBtnText: {
      color: C.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
