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

You are conducting a focused onboarding conversation. Be warm but direct — a thoughtful ally, not a form.

Rules:
- Ask ONE question at a time
- Keep messages SHORT (2-3 sentences max)
- Natural conversational prose only — no bullet points or lists
- Never mention frameworks, productivity methods, or jargon
- Move with purpose — don't linger

Conversation arc (follow this order):
1. Warm greeting. Ask their name.
2. Ask: "Before we get into schedules — who are you becoming? What are you building in your life over the next few years?" Accept whatever they say. This sets the motivational frame — don't probe further or analyse their answer.
3. Ask about what they're actively working on right now — projects, things with momentum.
4. Ask about the ongoing areas of their life that never really finish — health, relationships, creative work, finances, learning.
5. Ask what a typical week looks like for them right now.
6. Ask about focus capacity: roughly an hour of deep focus, or can they go longer?
7. Ask what time they wake up and wind down.
8. Close warmly: "Perfect — I've got what I need. Let me build your system."

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
    { "domain": "work|health|...", "title": "string", "description": "string", "deadline": "YYYY-MM-DD or null" }
  ],
  "goals": [
    { "domain": "work|health|...", "horizon": "1year|5year|10year", "text": "string" }
  ],
  "routines": {
    "morning": ["string"],
    "postWork": ["string"],
    "evening": ["string"]
  },
  "recurringTasks": [
    { "title": "string", "frequency": "daily|weekly|monthly|quarterly", "domain": "work|health|..." }
  ]
}`;

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
  const { profile, updateProfile, addArea, addProject, addGoal, addChatMessage } = useStore();
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
          model: 'gpt-4o-mini',
          messages: apiMessages,
          temperature: 0.8,
          max_tokens: 300,
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
    updateProfile({ onboardingCompleted: true, onboardingStep: 'done' });

    // Push everything to Supabase (fire and forget — don't block UI)
    const store = useStore.getState();
    if (store.session) {
      pushAll({
        profile:          { ...store.profile, onboardingCompleted: true, onboardingStep: 'done' },
        areas:            store.areas,
        projects:         store.projects,
        tasks:            store.tasks,
        habits:           store.habits,
        goals:            store.goals,
        deepWorkSessions: store.deepWorkSessions,
      }).catch(e => console.warn('[onboarding] pushAll failed:', e));
    }

    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
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
    <View style={styles.container}>
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
              <Text style={styles.completeBtnText}>Enter Synapse →</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Input */}
      {!isComplete && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      )}
    </View>
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
