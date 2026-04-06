/**
 * OnboardingChatScreen — Synapse V2
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
  ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { useStore, ChatMessage, DomainKey } from '../../store/useStore';
import { pushAll } from '../../services/sync';

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Synapse — a personal operating system for people who want to build a life with intention rather than just manage a schedule.

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
1. Open with: "So what brings you to Synapse?" — warm, casual, genuinely curious. Let them tell you what's going on.
2. From their answer, pick up on who they are. Then ask their name naturally ("By the way, I don't think I caught your name?") if it hasn't come up.
3. Ask: "Before we get into the practical stuff — what are you building toward? Like, where do you actually want to be in a few years?" This sets the motivational frame. Accept whatever they say without probing.
4. Transition naturally into asking about what they're actively working on. When you do, briefly explain the two types of things Synapse tracks — keep it to 2 sentences, conversational, not a lecture: something like "I'll ask you about two kinds of things — stuff you're actively trying to finish (like a project with a deadline), and the ongoing parts of life you're always tending (like health or finances). First — what are you actively trying to get done right now?"
5. Ask about the ongoing areas of their life that never really finish — health, relationships, creative work, finances, learning.
6. Ask what a typical week looks like for them right now.
7. Ask about focus capacity: roughly an hour of deep focus, or can they go longer?
8. Ask what time they wake up and wind down.
9. Close warmly: "Perfect — I've got what I need. Let me build your system."

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
  "morningTime": "HH:MM",
  "eveningTime": "HH:MM",
  "deepWorkBlockLength": 60,
  "deepWorkBlocksPerWeek": 3,
  "areas": [
    { "domain": "work|health|relationships|personal|finances|learning|creativity|community", "name": "string", "description": "string" }
  ],
  "projects": [
    { "domain": "work|health|...", "title": "string (concrete end state)", "description": "string", "deadline": "YYYY-MM-DD or null" }
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
  ]
}

CRITICAL GOAL WRITING RULES — read carefully:
Goals must NOT be task descriptions or objectives. They are vivid, present-tense descriptions of who the person IS and how they FEEL at that point in time, synthesised from what they shared about who they're becoming.

Write goals as if the person has already arrived there. Use "I am", "I feel", "My life is" language. Make them aspirational, emotionally resonant, and specific to what the user told you.

Example of a BAD goal: "Launch my business"
Example of a GOOD goal: "I am running a small business that gives me creative autonomy and earns enough that money is no longer the reason I say no to things"

Example of a BAD goal: "Get fit and healthy"
Example of a GOOD goal: "My body feels capable and energised — I exercise because it feels good, not out of guilt, and I wake up without dreading the day"

Generate 1-2 goals per active life domain. Spread them across all three horizons (1year, 5year, 10year) so each horizon feels like a coherent chapter of the same story.`;

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

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

export default function OnboardingChatScreen({ navigation }: any) {
  const { profile, updateProfile, addArea, addProject, addGoal } = useStore();
  const apiKey = profile.openAiKey || ENV_API_KEY;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const completeBtnAnim = useRef(new Animated.Value(0)).current;

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

  // Kick off the conversation
  useEffect(() => {
    sendToLLM([], true);
  }, []);

  async function sendToLLM(history: ChatMessage[], isFirst = false) {
    if (!apiKey) {
      appendMessage('assistant', "To get started, I'll need an OpenAI API key. You can add it in the Settings tab, then come back here.");
      return;
    }

    setLoading(true);
    try {
      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: apiMessages,
          temperature: 0.8,
          max_tokens: 600,
        }),
      });

      const data = await res.json();

      // Show actual API error so we can debug
      if (!res.ok || data.error) {
        const errMsg = data.error?.message ?? `API error ${res.status}`;
        appendMessage('assistant', `API error: ${errMsg}`);
        setLoading(false);
        return;
      }

      const reply: string = data.choices?.[0]?.message?.content ?? "I'm having trouble connecting right now. Try again?";

      if (reply.includes('[ONBOARDING_COMPLETE]')) {
        const cleanReply = reply.replace('[ONBOARDING_COMPLETE]', '').trim();
        const jsonData = parseOnboardingData(cleanReply);

        // Show the friendly closing message (text before JSON)
        const friendlyText = cleanReply.split('{')[0].trim();
        appendMessage('assistant', friendlyText || "I've got everything I need. Let's build your system.");

        if (jsonData) {
          applyOnboardingData(jsonData);
        }
        setIsComplete(true);
        Animated.timing(completeBtnAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      } else {
        appendMessage('assistant', reply);
      }
    } catch (err) {
      appendMessage('assistant', "Something went wrong. Check your API key in Settings and try again.");
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

  function applyOnboardingData(data: any) {
    if (data.name) updateProfile({ name: data.name });
    if (data.morningTime) updateProfile({ morningTime: data.morningTime });
    if (data.eveningTime) updateProfile({ eveningTime: data.eveningTime });
    if (data.deepWorkBlockLength || data.deepWorkBlocksPerWeek) {
      updateProfile({
        deepWorkBlockLength: data.deepWorkBlockLength ?? 60,
        deepWorkBlocksPerWeek: data.deepWorkBlocksPerWeek ?? 2,
      });
    }
    if (data.routines) updateProfile({ routines: data.routines });
    if (data.recurringTasks?.length) {
      data.recurringTasks.forEach((t: any) => {
        addProject({
          domain: t.domain as DomainKey,
          title: t.title,
          description: `Recurring: ${t.frequency}`,
          status: 'active',
        });
      });
    }

    data.areas?.forEach((a: any) => {
      addArea({ domain: a.domain as DomainKey, name: a.name, description: a.description, isActive: true });
    });

    data.projects?.forEach((p: any) => {
      addProject({
        domain: p.domain as DomainKey,
        title: p.title,
        description: p.description,
        deadline: p.deadline ?? undefined,
        status: 'active',
      });
    });

    data.goals?.forEach((g: any) => {
      addGoal({ domain: g.domain, horizon: g.horizon, text: g.text, milestones: [] });
    });
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
            <Text style={styles.avatarInitial}>S</Text>
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
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.avatarInitial}>S</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Synapse</Text>
            <Text style={styles.headerSub}>Setting up your life</Text>
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
              <Text style={styles.avatarInitial}>S</Text>
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

      {/* Input — outside SafeAreaView so KAV lifts it correctly */}
      {!isComplete && (
        <SafeAreaView edges={['bottom']} style={styles.inputSafe}>
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
        </SafeAreaView>
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
  avatarInitial: { fontSize: 13, fontWeight: '700', color: Colors.primary },

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
});
