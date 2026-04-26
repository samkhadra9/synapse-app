/**
 * AmbientChatStrip — Proactive externalised PFC
 *
 * The app reaches out to YOU — it doesn't wait. On mount it reads your
 * context (MIT, calendar, time of day) and generates a personalised
 * opening: "You're clear until 10am. That's 1h 15min — enough for the
 * draft intro. Ready when you are."
 *
 * Action chips give immediate options:
 *   "Yes, let's go" → opens focus session
 *   "Just 5 min"    → opens 5-min starter
 *   "I'm stuck"     → sends to AI inline
 *
 * Tapping the strip or the ✏ icon expands to full text input.
 * After a reply, "Keep going →" opens full chat with context.
 *
 * Design intent:
 * - ADHD brains need external initiation cues. The app provides them.
 * - Chips remove the blank-input paralysis — pre-formulated is easier.
 * - One-pane reply only. Not a thread. Deep work stays in ChatScreen.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, Radius } from '../theme';
import { fetchAnthropic } from '../lib/anthropic';
import { UserProfile, Task, LifeGoal, useStore } from '../store/useStore';
import { TodayEvent } from '../services/calendar';
import { format } from 'date-fns';

interface AmbientChatStripProps {
  navigation: any;
  profile: UserProfile;
  tasks: Task[];
  goals: LifeGoal[];
  calEvents?: TodayEvent[];
  primaryMIT?: Task | null;
  onStartMIT?: (quickStart?: boolean) => void;
}

type StripState = 'proactive' | 'expanded' | 'replied';

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTime(timeStr: string): number {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function getNextEventInfo(calEvents: TodayEvent[]): { minsUntil: number; label: string; title: string } | null {
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
  return { minsUntil, label, title };
}

function getStaticContextualMessage(
  profile: UserProfile,
  tasks: Task[],
  goals: LifeGoal[],
  calEvents: TodayEvent[],
  primaryMIT: Task | null,
): string {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const timeStr = format(now, 'h:mm a');
  const hour = now.getHours();
  const dayPhase = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const firstName = profile.name ? profile.name.split(' ')[0] : null;
  const nextEvent = getNextEventInfo(calEvents);
  const topGoal = goals.find(g => g.horizon === '1year');

  const doneTasks = tasks.filter(t => t.date === today && t.completed).length;
  const totalToday = tasks.filter(t => t.date === today && !t.completed).length;

  // Generate a contextual fallback message (no AI needed)
  if (primaryMIT) {
    if (nextEvent) {
      return `You've got ${nextEvent.label} until "${nextEvent.title}". Enough time to move "${primaryMIT.text.slice(0, 40)}" forward. Ready when you are.`;
    } else {
      return `Today's focus: "${primaryMIT.text.slice(0, 40)}${primaryMIT.text.length > 40 ? '…' : ''}". Ready when you are.`;
    }
  }

  if (doneTasks > 0) {
    return `You've done ${doneTasks} task${doneTasks !== 1 ? 's' : ''} already. Momentum's good. What's next?`;
  }

  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `It's ${hour12}:00 ${ampm}. You're clear. Where do you want to start?`;
}

function buildProactivePrompt(
  profile: UserProfile,
  tasks: Task[],
  goals: LifeGoal[],
  calEvents: TodayEvent[],
  primaryMIT: Task | null,
): string {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const timeStr = format(now, 'h:mm a');
  const hour = now.getHours();
  const dayPhase = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const firstName = profile.name ? profile.name.split(' ')[0] : null;
  const nextEvent = getNextEventInfo(calEvents);
  const topGoal = goals.find(g => g.horizon === '1year');

  const doneTasks = tasks.filter(t => t.date === today && t.completed).length;
  const totalToday = tasks.filter(t => t.date === today && !t.completed).length;

  return `You are the Aiteall AI, a warm executive coach for someone with ADHD. Generate ONE proactive message — 1-2 sentences — that opens the session.

Context:
- Time: ${timeStr} (${dayPhase})
- User: ${firstName ?? 'them'}
- The one (today's single focal task): ${primaryMIT ? `"${primaryMIT.text}"${primaryMIT.estimatedMinutes ? ` (~${primaryMIT.estimatedMinutes}m)` : ''}` : 'not picked'}
- Next event: ${nextEvent ? `"${nextEvent.title}" in ${nextEvent.label}` : 'none'}
- Tasks today: ${totalToday} remaining, ${doneTasks} done
- 1-year goal: ${topGoal ? `"${topGoal.text}"` : 'not set'}

Rules:
1. Be specific about time if you have it: "You're clear until X" or "You've got Yh before Z"
2. Reference the actual task name if available — call it "today's focus" or just the task name, never "MIT" or "the one thing"
3. End with a warm, forward-leaning prompt: "Ready when you are." / "Where do you want to start?"
4. 1-2 sentences MAX. Tight and warm. No lists. No questions except the final invite.
5. Do NOT start with "Hi" or "Hello" — just say the thing.
6. Banned: "Great job", "Nice work", "Amazing", "Awesome", "productive", "achieve", "overdue", "deadline", "behind", "missed". No exclamation-mark praise. Past-dated tasks are "from earlier", not "overdue".

Examples of good messages:
- "You're clear until 10am — 1h 20min. Enough to get the draft intro done. Ready when you are."
- "8:15am and today's focus hasn't started yet. Open the doc and just read your last sentence."
- "You've done 2 tasks already. Momentum's good. What's next?"`.trim();
}

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

  return `You are the Aiteall AI, a brilliant and concise executive coach for someone with ADHD. You're embedded as a quick ambient helper — NOT a full chat session.

Current context:
- Time: ${timeStr} (${dayPhase})
- User: ${firstName ?? 'them'}
- Today's focal tasks (the one + any legacy MITs): ${mits.length > 0 ? mits.map(t => `"${t.text}"${t.estimatedMinutes ? ` (~${t.estimatedMinutes}m)` : ''}`).join(', ') : 'not picked'}
- Other tasks today: ${otherTasks.length > 0 ? otherTasks.map(t => `"${t.text}"`).slice(0, 3).join(', ') : 'none'}
- Done today: ${doneTasks.length} task${doneTasks.length !== 1 ? 's' : ''}
- Inbox (unscheduled): ${inboxTasks.length} item${inboxTasks.length !== 1 ? 's' : ''}
${topGoal ? `- 1-year goal: "${topGoal.text}"` : ''}

Your rules:
1. Reply in 1-3 sentences MAX. Shorter is better.
2. Give ONE specific, actionable next step. Not options. Not lists.
3. Use the user's actual task names when referencing them. Call the focal task "today's focus" or just the task name — never "MIT" or "the one thing".
4. Be warm, direct, slightly energising. No corporate tone.
5. If stuck or overwhelmed: name the feeling, then give the one door to walk through.
6. Never ask clarifying questions. Just respond.
7. End with the physical first action if possible.
8. Banned words: "Great job", "Nice work", "Amazing", "Awesome", "productive", "achieve", "overdue", "deadline", "behind", "missed". No exclamation-mark praise. Past-dated tasks are "from earlier", not "overdue".`.trim();
}

export default function AmbientChatStrip({
  navigation,
  profile,
  tasks,
  goals,
  calEvents = [],
  primaryMIT = null,
  onStartMIT,
}: AmbientChatStripProps) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const anthropicKey = useStore(st => st.profile?.anthropicKey);

  const [state, setState] = useState<StripState>('proactive');
  const [proactiveMsg, setProactiveMsg] = useState<string | null>(null);
  const [proactiveLoading, setProactiveLoading] = useState(true);

  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [sentText, setSentText] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const sendAbortRef = useRef<boolean>(false);

  // ── Generate proactive opening on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setProactiveLoading(true);

    async function generate() {
      try {
        // Always try the AI — fetchAnthropic routes through the Supabase proxy
        // when no personal key is set, so this works for all users.
        const systemPrompt = buildProactivePrompt(profile, tasks, goals, calEvents, primaryMIT);
        const res = await fetchAnthropic(
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 100,
            system: systemPrompt,
            messages: [{ role: 'user', content: 'Generate the opening message.' }],
          },
          anthropicKey || undefined,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const text = (data?.content?.[0]?.text ?? '').trim();
        if (!cancelled && text) setProactiveMsg(text);
      } catch {
        // Silently fall back to static contextual message
        if (!cancelled) {
          const staticMsg = getStaticContextualMessage(profile, tasks, goals, calEvents, primaryMIT);
          setProactiveMsg(staticMsg);
        }
      } finally {
        if (!cancelled) setProactiveLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicKey, primaryMIT?.id, calEvents.length, new Date().getHours()]);  // Regenerate when MIT, events, key, or hour-of-day changes

  // Cleanup abort flag on unmount
  useEffect(() => {
    return () => { sendAbortRef.current = true; };
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setSentText(trimmed);
    setInput('');
    setLoading(true);
    setState('replied');
    sendAbortRef.current = false;

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
      if (sendAbortRef.current) return;
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const reply = data?.content?.[0]?.text ?? "Start with the very next physical action.";
      if (!sendAbortRef.current) setResponse(reply);
    } catch {
      if (!sendAbortRef.current) setResponse("Couldn't connect — check your connection.");
    } finally {
      if (!sendAbortRef.current) setLoading(false);
    }
  }, [loading, profile, tasks, goals, anthropicKey]);

  function collapse() {
    setInput('');
    setResponse('');
    setSentText('');
    setState('proactive');
  }

  function expand() {
    setState('expanded');
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  function openFullChat() {
    const textToCarry = sentText || input;
    collapse();
    navigation.navigate('Chat', { mode: 'dump', initialMessage: textToCarry });
  }

  // ── PROACTIVE STATE ───────────────────────────────────────────────────────
  if (state === 'proactive') {
    const hasMIT = primaryMIT !== null;
    return (
      <View style={s.proactiveContainer}>
        {/* Sparkle + message */}
        <View style={s.proactiveHeader}>
          <View style={s.sparkleWrap}>
            <Ionicons name="sparkles" size={14} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            {proactiveLoading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color={C.textTertiary} />
                <Text style={s.loadingText}>…</Text>
              </View>
            ) : (
              <Text style={s.proactiveText}>
                {proactiveMsg ?? (hasMIT
                  ? `Today: "${primaryMIT!.text.slice(0, 40)}${primaryMIT!.text.length > 40 ? '…' : ''}". Ready when you are.`
                  : "What would make today a win?"
                )}
              </Text>
            )}
          </View>
          {/* Edit button */}
          <TouchableOpacity
            style={s.editBtn}
            onPress={expand}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={15} color={C.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Action chips */}
        <View style={s.chipsRow}>
          {hasMIT && onStartMIT && (
            <>
              <TouchableOpacity
                style={[s.chip, s.chipPrimary]}
                onPress={() => onStartMIT(false)}
                activeOpacity={0.82}
              >
                <Ionicons name="play" size={11} color="#fff" />
                <Text style={s.chipPrimaryText}>Yes, let's go</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.chip}
                onPress={() => onStartMIT(true)}
                activeOpacity={0.82}
              >
                <Text style={s.chipText}>Just 5 min</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={s.chip}
            onPress={() => sendText("I'm stuck and can't start. Help me take the first step.")}
            activeOpacity={0.82}
          >
            <Text style={s.chipText}>I'm stuck</Text>
          </TouchableOpacity>

          {!hasMIT && (
            <TouchableOpacity
              style={s.chip}
              onPress={() => sendText("What should I prioritise today?")}
              activeOpacity={0.82}
            >
              <Text style={s.chipText}>Prioritise today</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── EXPANDED (typing) STATE ───────────────────────────────────────────────
  if (state === 'expanded') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.expandedContainer}>
          <View style={s.inputRow}>
            <View style={s.sparkleWrap}>
              <Ionicons name="sparkles" size={14} color={C.primary} />
            </View>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything…"
              placeholderTextColor={C.textTertiary}
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
              onPress={() => sendText(input)}
              activeOpacity={0.78}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={14} color={input.trim() ? '#fff' : C.textTertiary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.collapseRow} onPress={collapse} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={14} color={C.textTertiary} />
            <Text style={s.collapseText}>Collapse</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── REPLIED STATE ─────────────────────────────────────────────────────────
  return (
    <View style={s.repliedContainer}>
      {/* User's message */}
      <View style={s.userBubble}>
        <Text style={s.userBubbleText}>{sentText}</Text>
      </View>

      {/* AI response */}
      <View style={s.aiBubble}>
        <View style={s.sparkleWrap}>
          <Ionicons name="sparkles" size={12} color={C.primary} />
        </View>
        {loading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={C.textTertiary} />
            <Text style={s.loadingText}>Thinking…</Text>
          </View>
        ) : (
          <Text style={s.aiText}>{response}</Text>
        )}
      </View>

      {/* Footer actions */}
      {!loading && (
        <View style={s.repliedFooter}>
          <TouchableOpacity style={s.keepGoingBtn} onPress={openFullChat} activeOpacity={0.8}>
            <Text style={s.keepGoingText}>Keep going →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={collapse} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.dismissText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    // ── Proactive ────────────────────────────────────────────────────────────
    proactiveContainer: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 4,
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    proactiveHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      paddingBottom: 10,
    },
    sparkleWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },
    proactiveText: {
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 19,
    },
    editBtn: {
      padding: 2,
      flexShrink: 0,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    loadingText: {
      fontSize: 12,
      color: C.textTertiary,
      fontStyle: 'italic',
    },

    // Chips
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      paddingHorizontal: 14,
      paddingBottom: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.background,
    },
    chipPrimary: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
    },
    chipPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
    },
    noKeyHint: {
      paddingHorizontal: 14,
      paddingBottom: 12,
    },
    noKeyHintText: {
      fontSize: 11,
      color: C.textTertiary,
    },

    // ── Expanded ─────────────────────────────────────────────────────────────
    expandedContainer: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 4,
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.primary + '66',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 12,
    },
    textInput: {
      flex: 1,
      fontSize: 14,
      color: C.textPrimary,
      lineHeight: 20,
      maxHeight: 80,
    },
    sendBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendBtnDisabled: {
      backgroundColor: C.borderLight ?? C.border,
    },
    collapseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingBottom: 10,
    },
    collapseText: {
      fontSize: 11,
      color: C.textTertiary,
    },

    // ── Replied ──────────────────────────────────────────────────────────────
    repliedContainer: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 4,
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      gap: 10,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: C.primary + '18',
      borderRadius: Radius.md,
      paddingHorizontal: 12,
      paddingVertical: 7,
      maxWidth: '80%',
    },
    userBubbleText: {
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 18,
    },
    aiBubble: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    aiText: {
      flex: 1,
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 19,
    },
    repliedFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderLight ?? C.border,
    },
    keepGoingBtn: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: Radius.full,
      backgroundColor: C.primary + '18',
    },
    keepGoingText: {
      fontSize: 12,
      fontWeight: '600',
      color: C.primary,
    },
    dismissText: {
      fontSize: 12,
      color: C.textTertiary,
      paddingHorizontal: 4,
    },
  });
}
