/**
 * AmbientChatStrip — Always-present inline chat strip
 *
 * Lives at the bottom of the home screen. You can talk to Synapse
 * without navigating away. Thought appears → strip expands → you reply
 * → AI responds in 1-2 sentences → collapses back.
 *
 * Design intent:
 * - Brain offload without context switch. No new screen.
 * - Fatigue: one input, one reply. Not a full conversation thread.
 * - "Open in Chat" escape hatch if they want to go deeper.
 *
 * Usage:
 *   <AmbientChatStrip
 *     navigation={navigation}
 *     profile={profile}
 *     tasks={tasks}
 *     goals={goals}
 *   />
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { fetchAnthropic } from '../lib/anthropic';
import { UserProfile, Task, LifeGoal } from '../store/useStore';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';

interface AmbientChatStripProps {
  navigation: any;
  profile: UserProfile;
  tasks: Task[];
  goals: LifeGoal[];
}

type StripState = 'collapsed' | 'expanded' | 'replied';

// Quick prompts shown in collapsed state to reduce decision load
const QUICK_PROMPTS = [
  "What should I start with?",
  "I feel stuck.",
  "Clear my head.",
  "Too much on my plate.",
  "What's the one thing?",
];

function buildAmbientSystemPrompt(profile: UserProfile, tasks: Task[], goals: LifeGoal[]): string {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const timeStr = format(now, 'h:mm a');
  const hour = now.getHours();
  const dayPhase = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const todayTasks = tasks.filter(t => t.date === today && !t.completed);
  const mits = todayTasks.filter(t => t.isMIT);
  const otherTasks = todayTasks.filter(t => !t.isMIT);
  const doneTasks = tasks.filter(t => t.date === today && t.completed);
  const inboxTasks = tasks.filter(t => (t.isInbox || !t.date || t.date === '') && !t.completed);

  const firstName = profile.name ? profile.name.split(' ')[0] : null;
  const topGoal = goals.find(g => g.horizon === '1year');

  return `You are Synapse, a brilliant and concise executive coach for someone with ADHD. You're embedded as a quick ambient helper — NOT a full chat session.

Current context:
- Time: ${timeStr} (${dayPhase})
- User: ${firstName ?? 'them'}
- MITs today (Most Important Tasks): ${mits.length > 0 ? mits.map(t => `"${t.text}"${t.estimatedMinutes ? ` (~${t.estimatedMinutes}m)` : ''}`).join(', ') : 'none set'}
- Other tasks today: ${otherTasks.length > 0 ? otherTasks.map(t => `"${t.text}"`).slice(0, 3).join(', ') : 'none'}
- Done today: ${doneTasks.length} task${doneTasks.length !== 1 ? 's' : ''}
- Inbox (unscheduled): ${inboxTasks.length} item${inboxTasks.length !== 1 ? 's' : ''}
${topGoal ? `- 1-year goal: "${topGoal.text}"` : ''}

Your rules:
1. Reply in 1-3 sentences MAX. Shorter is better.
2. Give ONE specific, actionable next step. Not options. Not lists.
3. Use the user's actual task names when referencing them.
4. Be warm, direct, slightly energising. No corporate tone.
5. If they're stuck or overwhelmed: name the feeling, then give the one door to walk through.
6. Never ask clarifying questions back. Just respond.
7. End with the physical first action if possible. "Open the doc." "Write the first line." "Set a 10-min timer."`.trim();
}

export default function AmbientChatStrip({
  navigation,
  profile,
  tasks,
  goals,
}: AmbientChatStripProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const anthropicKey = useStore(s => s.profile?.anthropicKey);

  const [state, setState] = useState<StripState>('collapsed');
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickPromptIndex, setQuickPromptIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Cycle through quick prompts for visual interest
  useEffect(() => {
    const timer = setInterval(() => {
      setQuickPromptIndex(i => (i + 1) % QUICK_PROMPTS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const heightAnim = useRef(new Animated.Value(56)).current;

  function expand() {
    setState('expanded');
    Animated.spring(heightAnim, {
      toValue: 160,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  function collapse() {
    setInput('');
    setResponse('');
    setState('collapsed');
    Animated.spring(heightAnim, {
      toValue: 56,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }

  function expandWithReply() {
    setState('replied');
    Animated.spring(heightAnim, {
      toValue: 220,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }

  function setQuickInput(text: string) {
    setInput(text);
    expand();
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setLoading(true);

    try {
      const systemPrompt = buildAmbientSystemPrompt(profile, tasks, goals);
      const res = await fetchAnthropic(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content: trimmed }],
        },
        anthropicKey,
      );

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = data?.content?.[0]?.text ?? "Let's figure it out — what feels most stuck right now?";
      setResponse(text);
      setLoading(false);
      expandWithReply();
    } catch {
      setResponse("Couldn't reach Synapse. Check your connection.");
      setLoading(false);
      expandWithReply();
    }
  }

  function openFullChat() {
    collapse();
    navigation.navigate('Chat', { mode: 'dump', prefill: input });
  }

  // ── Collapsed state ────────────────────────────────────────────────────────
  if (state === 'collapsed') {
    return (
      <TouchableOpacity style={s.collapsedStrip} onPress={expand} activeOpacity={0.82}>
        <View style={s.stripLeft}>
          <View style={s.sparkleWrap}>
            <Ionicons name="sparkles" size={14} color={C.primary} />
          </View>
          <Text style={s.promptText} numberOfLines={1}>
            {QUICK_PROMPTS[quickPromptIndex]}
          </Text>
        </View>
        <View style={s.stripRight}>
          <TouchableOpacity
            style={s.quickSendBtn}
            onPress={() => setQuickInput(QUICK_PROMPTS[quickPromptIndex])}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="send" size={13} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.expandBtn}
            onPress={expand}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={15} color={C.textTertiary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Expanded (typing) state ────────────────────────────────────────────────
  if (state === 'expanded') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={s.expandedContainer}>
          {/* Input row */}
          <View style={s.inputRow}>
            <View style={s.sparkleWrap}>
              <Ionicons name="sparkles" size={14} color={C.primary} />
            </View>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Tell me what's on your mind..."
              placeholderTextColor={C.textTertiary}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={send}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[s.sendBtn, !input.trim() && s.sendBtnOff]}
              onPress={send}
              disabled={!input.trim() || loading}
              activeOpacity={0.82}
            >
              {loading
                ? <ActivityIndicator size="small" color={C.textInverse} />
                : <Ionicons name="send" size={15} color={C.textInverse} />
              }
            </TouchableOpacity>
          </View>

          {/* Quick suggestion chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
            {QUICK_PROMPTS.filter(p => p !== input).slice(0, 4).map((p, i) => (
              <TouchableOpacity key={i} style={s.chip} onPress={() => setInput(p)} activeOpacity={0.7}>
                <Text style={s.chipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Dismiss */}
          <TouchableOpacity style={s.dismissRow} onPress={collapse} activeOpacity={0.6}>
            <Text style={s.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Replied state ─────────────────────────────────────────────────────────
  return (
    <View style={s.repliedContainer}>
      {/* User message */}
      <View style={s.userBubble}>
        <Text style={s.userBubbleText}>{input}</Text>
      </View>

      {/* AI response */}
      <View style={s.aiBubble}>
        <View style={s.sparkleWrap}>
          <Ionicons name="sparkles" size={12} color={C.primary} />
        </View>
        <Text style={s.aiBubbleText}>{response}</Text>
      </View>

      {/* Footer actions */}
      <View style={s.replyFooter}>
        <TouchableOpacity style={s.dismissSmall} onPress={collapse} activeOpacity={0.7}>
          <Text style={s.dismissSmallText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.openChatBtn} onPress={openFullChat} activeOpacity={0.8}>
          <Text style={s.openChatText}>Keep going →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    // ── Collapsed ──────────────────────────────────────────────────────────────
    collapsedStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      backgroundColor: C.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderLight,
    },
    stripLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    stripRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sparkleWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: C.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    promptText: {
      flex: 1,
      fontSize: 14,
      color: C.textSecondary,
      fontWeight: '400',
    },
    quickSendBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expandBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Expanded ───────────────────────────────────────────────────────────────
    expandedContainer: {
      backgroundColor: C.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderLight,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: Spacing.lg,
      marginBottom: 10,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      fontSize: 15,
      color: C.textPrimary,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.lg,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      lineHeight: 21,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendBtnOff: {
      backgroundColor: C.borderLight,
    },
    chipsScroll: { marginBottom: 4 },
    chips: {
      paddingHorizontal: Spacing.lg,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    chipText: {
      fontSize: 12,
      color: C.textSecondary,
      fontWeight: '500',
    },
    dismissRow: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    dismissText: {
      fontSize: 13,
      color: C.textTertiary,
    },

    // ── Replied ────────────────────────────────────────────────────────────────
    repliedContainer: {
      backgroundColor: C.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderLight,
      padding: Spacing.lg,
      gap: 10,
      paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: C.ink,
      borderRadius: Radius.lg,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 8,
      maxWidth: '80%',
    },
    userBubbleText: {
      fontSize: 14,
      color: '#fff',
      lineHeight: 20,
    },
    aiBubble: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      alignSelf: 'flex-start',
      maxWidth: '90%',
    },
    aiBubbleText: {
      flex: 1,
      fontSize: 14,
      color: C.textPrimary,
      lineHeight: 21,
      fontWeight: '400',
    },
    replyFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    dismissSmall: {
      paddingVertical: 8,
      paddingRight: 16,
    },
    dismissSmallText: {
      fontSize: 14,
      color: C.textTertiary,
    },
    openChatBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: C.primaryLight,
      borderRadius: Radius.full,
    },
    openChatText: {
      fontSize: 14,
      color: C.primary,
      fontWeight: '600',
    },
  });
}
