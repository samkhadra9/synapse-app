/**
 * OnboardingChatScreen — Solas V2
 *
 * A conversation that feels natural but quietly builds the user's
 * PARA structure (Areas → Projects → Goals) behind the scenes.
 *
 * The LLM is prompted to:
 *   1. Get to know the person warmly
 *   2. Uncover their life areas organically
 *   3. Find active projects with deadlines
 *   4. Understand their bigger aspirations
 *   5. Set up morning/evening reminder times
 *   6. End by populating the store with structured data
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, StatusBar, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { format } from 'date-fns';
import { useStore, ChatMessage, DomainKey } from '../../store/useStore';
import { pushAll } from '../../services/sync';
import { fetchAnthropic } from '../../lib/anthropic';

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Aiteall AI — a personal operating system for people who want to build a life with intention rather than just manage a schedule.

Core belief: You don't react to life. You construct it. Every day can be a small act of becoming the person you're building toward.

You are conducting a focused onboarding conversation. Be warm but direct — a thoughtful friend, not a form, and definitely not an AI assistant.

Rules:
- Ask ONE question at a time
- Keep messages SHORT (2-3 sentences max)
- Natural conversational prose only — no bullet points or lists
- Never mention frameworks, productivity methods, or jargon
- Sound human — contractions, natural rhythm, occasional informality
- Move with purpose — don't linger

Conversation arc (follow this order):
1. The opening message has already been shown — it introduced Aiteall and asked "what brings you to Aiteall?". The user is now replying. Pick up from their reply warmly, naturally — do NOT re-introduce yourself or re-ask what brings them here.
2. From their answer, pick up on who they are. Then ask their name naturally ("By the way, I don't think I caught your name?") if it hasn't come up.
3. Ask: "Before we get into the practical stuff — what are you building toward? Like, where do you actually want to be in a few years?" This sets the motivational frame. Accept whatever they say without probing.
4. Transition naturally into asking about what they're actively working on. When you do, briefly explain the two types of things Aiteall tracks — keep it to 2 sentences, conversational, not a lecture: something like "I'll ask you about two kinds of things — stuff you're actively trying to finish (like a project with a deadline), and the ongoing parts of life you're always tending (like health or finances). First — what are you actively trying to get done right now?"
5. Ask about the ongoing areas of their life that never really finish — health, relationships, creative work, finances, learning.
6. Ask about focus capacity: roughly an hour of deep focus, or can they go longer?
7. Ask what time they wake up and wind down.
8. Close warmly: "Perfect — I've got what I need. Let me build your system." — DO NOT ask about weekly schedule or time blocks here. The next step after this chat is a dedicated weekly structure builder that will handle that conversation properly.

CRITICAL — AREAS vs PROJECTS (this is the most important distinction):

A PROJECT has a clear end state and a deadline — something that gets DONE and then is over.
  Examples: "Launch the app by June", "Move to London", "Run the Sydney Half-Marathon in October"
  Signs it's a project: You can imagine completing it. There's a finish line. It has a deadline.

An AREA is an ongoing domain of life — it never gets done, it gets maintained.
  Examples: "Health", "Relationship with family", "Financial wellbeing", "Career growth"
  Signs it's an area: There's no finish line. It's something you tend to forever.

NEVER create a project for something that has no clear end state or deadline:
  - "Get healthier" → AREA (health), not a project
  - "Be more social" → AREA (relationships), not a project
  - "Exercise more" → Area habit, suggest as a recurring routine
  - "Train for a marathon in October" → PROJECT (has deadline + end state)

When you output the JSON, every project MUST have a specific title describing a concrete end state, and every area must be a life domain, not a deliverable.

When you have enough information (after at least 6-8 exchanges), end your message with:
[ONBOARDING_COMPLETE]

Then on the VERY NEXT line output a JSON object (nothing else after it) in this exact format:
{
  "name": "string",
  "morningTime": "07:00",
  "eveningTime": "22:00",
  "deepWorkBlockLength": 60,
  "deepWorkBlocksPerWeek": 3,
  "areas": [
    { "domain": "work|health|relationships|personal|finances|learning|creativity|community", "name": "string", "description": "string" }
  ],
  "projects": [
    { "domain": "work|health|...", "title": "string (concrete end state)", "description": "string", "deadline": "YYYY-MM-DD or null" }
  ],
  "tasks": [
    { "domain": "work|health|...", "text": "string (specific, actionable — what exactly needs doing)", "projectTitle": "string or null (title of the project this belongs to, if any)", "dueDate": "today|tomorrow|YYYY-MM-DD or null", "isMIT": false, "estimatedMinutes": 60 }
  ],
  "goals": [
    { "domain": "work|health|...", "horizon": "1year|5year|10year", "text": "string" }
  ],
  "routines": {
    "morning": ["string"],
    "postWork": ["string"],
    "evening": ["string"]
  },
  "recurringCommitments": [
    { "title": "string", "frequency": "daily|weekly|monthly", "domain": "work|health|..." }
  ],
  "portrait": "A 100-150 word third-person portrait of this person synthesised from everything they shared. Cover: how they communicate and think, what motivates or blocks them, their working patterns and energy, known friction points, personality, what they are building toward. Be specific and human — not a personality test result."
}

CRITICAL GOAL WRITING RULES — read carefully:
Goals must NOT be task descriptions or objectives. They are vivid, present-tense descriptions of who the person IS and how they FEEL at that point in time, synthesised from what they shared about who they're becoming.

Write goals as if the person has already arrived there. Use "I am", "I feel", "My life is" language. Make them aspirational, emotionally resonant, and specific to what the user told you.

Example of a BAD goal: "Launch my business"
Example of a GOOD goal: "I am running a small business that gives me creative autonomy and earns enough that money is no longer the reason I say no to things"

Example of a BAD goal: "Get fit and healthy"
Example of a GOOD goal: "My body feels capable and energised — I exercise because it feels good, not out of guilt, and I wake up without dreading the day"

Generate 1-2 goals per active life domain. Spread them across all three horizons (1year, 5year, 10year) so each horizon feels like a coherent chapter of the same story.

TASK RULES — populate the tasks array with anything the user explicitly mentioned needing to do:
- Only add tasks the user actually mentioned — don't invent them
- Each task must be specific and actionable, not vague ("Finish chapter 3 draft" not "Work on dissertation")
- If a task clearly belongs to a project, set projectTitle to match that project's title exactly
- Tasks due soon (user said "this week", "soon", "by Friday") → use a real date or "tomorrow"
- Tasks they said they need to do today → dueDate: "today", isMIT: true (max 3 MIT tasks total)
- Estimate honestly: 30 min = quick task, 60 min = standard, 90-120 min = deep work
- If the user mentioned nothing specific to do, leave tasks as an empty array []`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOnboardingData(text: string) {
  try {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingChatScreen({ navigation }: any) {
  const { profile, updateProfile, addArea, addProject, addGoal, setPortrait } = useStore();
  const userAnthropicKey = profile.anthropicKey || undefined;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  // First message is hardcoded — introduces Aiteall before the LLM takes over
  const INTRO_MESSAGE: ChatMessage = {
    id: 'intro-0',
    role: 'assistant',
    content: `Welcome to Aiteall (pronounced 'AT-all').\n\nIt's an Irish word for a break in the clouds — that moment when the overcast lifts and you can finally see clearly.\n\nWhat do you want to get done today?`,
    timestamp: new Date().toISOString(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const completeBtnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Add "Skip" button to native header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleSkip} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: Colors.textTertiary, fontSize: 14 }}>Skip for now</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  function handleSkip() {
    // Jump into the main app without completing onboarding — user can finish later via Settings
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  // No auto-kick — intro message is already shown, LLM takes over on first user reply

  async function sendToLLM(history: ChatMessage[], isFirst = false) {
    setLoading(true);
    try {
      const res = await fetchAnthropic({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: 'Hello' },
          ...history.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.8,
      }, userAnthropicKey);

      const data = await res.json();

      if (!res.ok || data.error) {
        if (res.status === 401) {
          appendMessage('assistant', userAnthropicKey
            ? "Your API key was rejected. Check it in Settings → API Key."
            : "Session expired. Try closing and reopening the app.");
        } else if (res.status === 429) {
          appendMessage('assistant', "Rate limit reached — wait a moment and try again.");
        } else if (res.status >= 500) {
          appendMessage('assistant', "The AI service is having a moment. Try again shortly.");
        } else {
          const errMsg = data.error?.message ?? `Error ${res.status}`;
          appendMessage('assistant', `Something went wrong: ${errMsg}`);
        }
        setLoading(false);
        return;
      }

      const reply: string = data.content?.[0]?.text ?? "I'm having trouble connecting right now. Try again?";

      if (reply.includes('[ONBOARDING_COMPLETE]')) {
        const cleanReply = reply.replace('[ONBOARDING_COMPLETE]', '').trim();

        // Strip markdown code fences — Claude sometimes wraps the JSON in ```json ... ```
        const stripped = cleanReply
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        const jsonData = parseOnboardingData(stripped);

        // Show the friendly closing message (text before JSON)
        const friendlyText = stripped.split('{')[0].trim();
        appendMessage('assistant', friendlyText || "I've got everything I need. Let's build your system.");

        if (jsonData) {
          applyOnboardingData(jsonData);
        }
        setIsComplete(true);
        Animated.timing(completeBtnAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      } else {
        appendMessage('assistant', reply);
      }
    } catch (err: any) {
      if (err?.message?.includes('[anthropic] No valid session token')) {
        appendMessage('assistant', "Session expired — try closing and reopening the app.");
      } else if (err instanceof TypeError) {
        appendMessage('assistant', "No internet connection. Check your connection and try again.");
      } else {
        appendMessage('assistant', "Something went wrong. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function appendMessage(role: 'user' | 'assistant', content: string) {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => {
      const next = [...prev, msg];
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return next;
    });
    return msg;
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = appendMessage('user', input.trim());
    setInput('');
    await sendToLLM([...messages, userMsg]);
  }

  /** Parse a time string in any reasonable format → "HH:MM" or null */
  function sanitiseTime(t: any): string | null {
    if (typeof t !== 'string') return null;
    const s = t.trim();
    // Standard HH:MM or H:MM
    const hhmm = /^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i.exec(s);
    if (hhmm) {
      let h = Number(hhmm[1]);
      const min = Number(hhmm[2]);
      const meridiem = hhmm[3]?.toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      if (h < 0 || h > 23 || min < 0 || min > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    // "7am", "10pm", "7" (assume am if < 12)
    const bare = /^(\d{1,2})\s*(am|pm)?$/i.exec(s);
    if (bare) {
      let h = Number(bare[1]);
      const meridiem = bare[2]?.toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      if (!meridiem && h < 6) h += 12; // "9" with no meridiem → assume PM if <6
      if (h < 0 || h > 23) return null;
      return `${String(h).padStart(2, '0')}:00`;
    }
    return null;
  }

  function applyOnboardingData(data: any) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (name) updateProfile({ name });

    const morningTime = sanitiseTime(data.morningTime);
    if (morningTime) updateProfile({ morningTime });

    const eveningTime = sanitiseTime(data.eveningTime);
    if (eveningTime) updateProfile({ eveningTime });
    if (data.deepWorkBlockLength || data.deepWorkBlocksPerWeek) {
      updateProfile({
        deepWorkBlockLength: data.deepWorkBlockLength ?? 60,
        deepWorkBlocksPerWeek: data.deepWorkBlocksPerWeek ?? 2,
      });
    }
    if (data.routines) updateProfile({ routines: data.routines });
    // AI generates "recurringCommitments" — create a recurring habit for each
    const recurring = data.recurringCommitments ?? data.recurringTasks ?? [];
    if (recurring.length) {
      // Import addHabit lazily to avoid circular issues
      const { addHabit } = useStore.getState();
      recurring.forEach((t: any) => {
        if (t.domain && t.title) {
          addHabit({
            name: t.title,
            icon: '🔄',
            domain: (t.domain as DomainKey) ?? 'work',
            frequency: t.frequency === 'weekly' ? 'weekdays'
                       : t.frequency === 'daily'  ? 'daily'
                       : 'daily',
          });
        }
      });
    }

    data.areas?.forEach((a: any) => {
      addArea({ domain: a.domain as DomainKey, name: a.name, description: a.description, isActive: true });
    });

    // Create projects and build a title→id map so tasks can link to them
    const projectTitleToId: Record<string, string> = {};
    data.projects?.forEach((p: any) => {
      const id = addProject({
        domain: p.domain as DomainKey,
        title: p.title,
        description: p.description,
        deadline: p.deadline ?? undefined,
        status: 'active',
      });
      if (id && p.title) projectTitleToId[p.title] = id;
    });

    // Create tasks the user explicitly mentioned
    const { addTask } = useStore.getState();
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    data.tasks?.forEach((t: any) => {
      if (!t.text) return;
      const dueDate = t.dueDate === 'today' ? today
        : t.dueDate === 'tomorrow' ? tomorrow
        : (t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) ? t.dueDate
        : undefined;
      const linkedProjectId = t.projectTitle ? projectTitleToId[t.projectTitle] : undefined;
      addTask({
        text:             t.text,
        domain:           (t.domain ?? 'work') as DomainKey,
        projectId:        linkedProjectId,
        isMIT:            t.isMIT ?? false,
        isToday:          dueDate === today,
        date:             dueDate,
        completed:        false,
        priority:         t.isMIT ? 'high' : 'medium',
        estimatedMinutes: t.estimatedMinutes ?? 60,
      });
    });

    data.goals?.forEach((g: any) => {
      addGoal({ domain: g.domain, horizon: g.horizon, text: g.text, milestones: [] });
    });

    // Seed the portrait from onboarding — this becomes the starting memory
    if (data.portrait) setPortrait(data.portrait);
  }

  /** Let the user schedule onboarding for a better time */
  function handleRemindLater() {
    const now = new Date();
    const options: { label: string; hours: number }[] = [
      { label: 'In 1 hour',   hours: 1  },
      { label: 'This evening (7pm)', hours: -1 },  // special: use 7pm today
      { label: 'Tomorrow morning (9am)', hours: -2 }, // special: 9am tomorrow
      { label: 'Tonight before bed (9pm)', hours: -3 }, // special: 9pm today
    ];

    Alert.alert(
      'When should I remind you?',
      'I\'ll send you a notification at your chosen time so you can finish setting up Aiteall.',
      [
        ...options.map(opt => ({
          text: opt.label,
          onPress: async () => {
            let fireDate: Date;
            if (opt.hours === -1) {
              // 7pm today
              fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);
              if (fireDate <= now) fireDate.setDate(fireDate.getDate() + 1);
            } else if (opt.hours === -2) {
              // 9am tomorrow
              fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
            } else if (opt.hours === -3) {
              // 9pm today
              fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
              if (fireDate <= now) fireDate.setDate(fireDate.getDate() + 1);
            } else {
              // N hours from now
              fireDate = new Date(now.getTime() + opt.hours * 60 * 60 * 1000);
            }

            try {
              // Request permissions first (needed before scheduling)
              const { scheduleOnboardingReminder, requestPermissions } = await import('../../services/notifications');
              const granted = await requestPermissions();
              if (granted) {
                await scheduleOnboardingReminder(fireDate);
              }
            } catch (e) {
              console.warn('[onboarding] schedule reminder failed:', e);
            }

            Alert.alert(
              '✓ Reminder set',
              `I'll nudge you at ${fireDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. See you then.`,
              [{ text: 'OK', onPress: () => navigation.goBack() }],
            );
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function handleComplete() {
    // Don't mark onboardingCompleted yet — skeleton step comes next
    updateProfile({ onboardingStep: 'chat' });

    // Push what we have so far (fire and forget)
    const store = useStore.getState();
    if (store.session) {
      pushAll({
        profile:          store.profile,
        areas:            store.areas,
        projects:         store.projects,
        tasks:            store.tasks,
        habits:           store.habits,
        goals:            store.goals,
        deepWorkSessions: store.deepWorkSessions,
      }).catch(e => console.warn('[onboarding] pushAll failed:', e));
    }

    // Next: build the weekly time skeleton
    navigation.navigate('SkeletonBuilder');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>✦</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.avatarInitial}>✦</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Aiteall</Text>
            <Text style={styles.headerSub}>Setting up your system</Text>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>✦</Text>
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          </View>
        )}

        {/* Complete button */}
        {isComplete && (
          <Animated.View style={[styles.completeArea, { opacity: completeBtnAnim }]}>
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} activeOpacity={0.88}>
              <Text style={styles.completeBtnText}>Build my weekly structure →</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Input — plain View with dynamic insets so KAV lifts it correctly */}
      {!isComplete && (
        <View style={[styles.inputSafe, { paddingBottom: insets.bottom }]}>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type your reply…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>

          {/* Escape hatch — hidden while keyboard is open so it doesn't crowd the input */}
          {!keyboardVisible && (
            <TouchableOpacity
              style={styles.remindLaterBtn}
              onPress={handleRemindLater}
              activeOpacity={0.7}
            >
              <Text style={styles.remindLaterText}>⏱  Not a good time? Remind me later</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe:      { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  headerEmoji:  { fontSize: 13, fontWeight: '700', color: Colors.primary },
  headerTitle:  { ...Typography.headline, color: Colors.textPrimary },
  headerSub:    { ...Typography.footnote, color: Colors.textSecondary },

  messageList: { padding: Spacing.base, gap: 16, paddingBottom: Spacing.xl },

  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  msgRowUser:      { flexDirection: 'row-reverse' },
  msgRowAssistant: {},

  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 11, fontWeight: '900', color: Colors.primary, letterSpacing: -0.5 },

  bubble: { maxWidth: '78%', borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser:      { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4, ...Shadow.sm },
  bubbleText:      { fontSize: 16, lineHeight: 24 },
  bubbleTextUser:      { color: '#FFFFFF' },
  bubbleTextAssistant: { color: Colors.textPrimary },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: Spacing.base, paddingBottom: 8 },
  typingBubble: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 14,
    ...Shadow.sm,
  },

  completeArea: { padding: Spacing.base },
  completeBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 18, alignItems: 'center',
    ...Shadow.primary,
  },
  completeBtnText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.2 },

  inputSafe: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  inputRow:  { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },
  input: {
    flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.xl,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.textPrimary,
    maxHeight: 120, lineHeight: 22,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.primary,
  },
  sendBtnDisabled: { backgroundColor: Colors.borderLight },
  sendBtnText:     { fontSize: 20, color: '#FFFFFF', fontWeight: '700', lineHeight: 24 },

  remindLaterBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 4,
  },
  remindLaterText: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
});
