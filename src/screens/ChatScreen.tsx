/**
 * ChatScreen — Synapse V2
 * Three modes: dump | morning | project | evening
 * Supports text input + voice recording (transcribed via Whisper)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { format } from 'date-fns';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { useStore, ChatMessage, DomainKey } from '../store/useStore';

type ChatMode = 'dump' | 'morning' | 'project' | 'evening' | 'weeklyReview';

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

const MODE_CONFIG: Record<ChatMode, { title: string; subtitle: string; systemPrompt: string }> = {
  dump: {
    title: 'Brain dump',
    subtitle: "What's on your mind?",
    systemPrompt: `You are Synapse, an ADHD productivity coach. The user is doing a brain dump.
Your job: let them dump freely, ask ONE clarifying question at a time to get deadlines/priorities, then produce a structured plan.
When ready, say "Got it — here's what I'm adding:" then output:
[TASKS_READY]
{"tasks":[{"text":"string","domain":"work|health|relationships|personal|finances|learning","isMIT":true|false,"estimatedMinutes":null,"dueDate":"YYYY-MM-DD|null"}]}
Keep messages short and warm. No bullet points.`,
  },
  morning: {
    title: 'Morning planning',
    subtitle: "Let's set up your day",
    systemPrompt: `You are Synapse. It's morning. Help the user identify their 3 Most Important Tasks.
After 3-4 exchanges output:
[TASKS_READY]
{"tasks":[{"text":"string","domain":"work|health|relationships|personal|finances|learning","isMIT":true,"estimatedMinutes":null,"dueDate":"today"}],"morningNote":"string"}
One question at a time. Warm and focused.`,
  },
  project: {
    title: 'New project',
    subtitle: 'Tell me what you\'re working on',
    systemPrompt: `You are Synapse. Help the user plan a project. Get curious — what is it, when is it due, what are the steps?
After 5-8 exchanges output:
[PROJECT_READY]
{"title":"string","description":"string","domain":"work|health|relationships|personal|finances|learning","deadline":"YYYY-MM-DD|null","tasks":[{"text":"string","estimatedMinutes":30}]}
Be encouraging and practical.`,
  },
  evening: {
    title: 'Evening review',
    subtitle: "Let's wind down",
    systemPrompt: `You are Synapse. It's evening. Help the user review their day and set up tomorrow.
Ask what went well, what's unfinished, what's on their mind for tomorrow. Help them feel done.
After capturing tomorrow's priorities output:
[TASKS_READY]
{"tasks":[{"text":"string","domain":"work|health|relationships|personal|finances|learning","isMIT":false,"dueDate":"tomorrow"}],"eveningNote":"string"}
Be warm and closing.`,
  },
  weeklyReview: {
    title: 'Weekly review',
    subtitle: 'Recalibrate. Realign. Redesign.',
    systemPrompt: `You are Synapse acting as a Reflector — your job is to run a rigorous but warm weekly review.

Core belief: You don't drift into a good life. You recalibrate into it weekly.

Run the review in this exact sequence, one question at a time:

1. WHAT ACTUALLY HAPPENED: "Walk me through last week. What did you actually do — not what you planned, what actually happened?"
2. VALUE AUDIT: "What produced real value? What moved something forward that matters?"
3. TIME LEAKS: "Where did time go that you didn't want it to? What drained you without giving anything back?"
4. ALIGNMENT CHECK: "Are you building toward the things that actually matter to you right now — or has drift crept in?"
5. SYSTEM FRICTION: "What about your setup — your routine, your environment, your system — caused the most friction this week?"
6. NEXT WEEK DESIGN: "Let's design next week. Where are your deep work blocks going? What are the 3 things that absolutely must move forward?"

Be direct. Don't just validate. If there's drift, name it. If they're doing well, confirm it clearly.
After the design conversation output:
[TASKS_READY]
{"tasks":[{"text":"string","domain":"work|health|relationships|personal|finances|learning","isMIT":true,"dueDate":"next week"}],"weeklyNote":"string"}

Keep each message SHORT — 2-3 sentences. No lists in your responses.`,
  },
};

function parseStructuredData(text: string, token: string) {
  try {
    const idx = text.indexOf(token);
    if (idx === -1) return null;
    const after = text.slice(idx + token.length).trim();
    const start = after.indexOf('{');
    const end = after.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(after.slice(start, end + 1));
  } catch { return null; }
}

export default function ChatScreen({ navigation, route }: any) {
  const mode: ChatMode = route?.params?.mode ?? 'dump';
  const config = MODE_CONFIG[mode];
  const { profile, addTask, addProject, updateTodayLog } = useStore();
  const apiKey = profile.openAiKey || ENV_API_KEY;

  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [actionTaken, setActionTaken] = useState(false);
  const [recording,   setRecording]   = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const listRef   = useRef<FlatList>(null);

  useEffect(() => { startConversation(); }, []);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  async function startConversation() {
    await sendToLLM([]);
  }

  function appendMessage(role: 'user' | 'assistant', content: string): ChatMessage {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return [...prev, msg];
    });
    return msg;
  }

  async function sendToLLM(history: ChatMessage[]) {
    if (!apiKey) {
      appendMessage('assistant', "I need an OpenAI API key to work. Add it in the Settings tab.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: config.systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.75,
          max_tokens: 350,
        }),
      });
      const data = await res.json();
      const reply: string = data.choices?.[0]?.message?.content ?? "Something went wrong. Try again?";

      if (reply.includes('[TASKS_READY]')) {
        const taskData = parseStructuredData(reply, '[TASKS_READY]');
        appendMessage('assistant', reply.split('[TASKS_READY]')[0].trim() || "Added to your list.");
        if (taskData?.tasks) applyTasks(taskData);
        if (taskData?.eveningNote) updateTodayLog({ eveningCompleted: true, eveningNote: taskData.eveningNote });
        if (taskData?.morningNote) updateTodayLog({ morningCompleted: true });
        setActionTaken(true);
      } else if (reply.includes('[PROJECT_READY]')) {
        const projectData = parseStructuredData(reply, '[PROJECT_READY]');
        appendMessage('assistant', reply.split('[PROJECT_READY]')[0].trim() || "Project added.");
        if (projectData) applyProject(projectData);
        setActionTaken(true);
      } else {
        appendMessage('assistant', reply);
      }
    } catch {
      appendMessage('assistant', "Connection issue. Check your API key in Settings.");
    } finally {
      setLoading(false);
    }
  }

  function applyTasks(data: any) {
    const today    = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    data.tasks?.forEach((t: any) => {
      addTask({
        text: t.text,
        domain: (t.domain ?? 'work') as DomainKey,
        isMIT: t.isMIT ?? false,
        isToday: t.dueDate === 'today' || t.dueDate === today,
        date: t.dueDate === 'tomorrow' ? tomorrow : today,
        completed: false,
        priority: t.isMIT ? 'high' : 'medium',
        estimatedMinutes: t.estimatedMinutes ?? undefined,
      });
    });
  }

  function applyProject(data: any) {
    addProject({
      domain: (data.domain ?? 'work') as DomainKey,
      title: data.title,
      description: data.description,
      deadline: data.deadline ?? undefined,
      status: 'active',
    });
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = appendMessage('user', input.trim());
    setInput('');
    await sendToLLM([...messages, userMsg]);
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        appendMessage('assistant', "Microphone permission is needed for voice input. Enable it in your iPhone Settings.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      appendMessage('assistant', "Couldn't start recording. Try again.");
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) { setTranscribing(false); return; }

      // Transcribe with Whisper
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
      const data = await res.json();
      const transcript: string = data.text ?? '';

      if (transcript.trim()) {
        setInput(transcript.trim());
      } else {
        appendMessage('assistant', "I couldn't make out what you said. Try again?");
      }
    } catch {
      appendMessage('assistant', "Transcription failed. Check your connection and try again.");
    } finally {
      setTranscribing(false);
    }
  }

  function handleMicPress() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{config.title}</Text>
            <Text style={styles.headerSub}>{config.subtitle}</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        {/* Messages — flex: 1 so it shrinks when keyboard opens */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        />

        {(loading || transcribing) && (
          <View style={styles.typingRow}>
            <View style={styles.avatar}><Text style={styles.avatarInitial}>S</Text></View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={Colors.primary} />
              {transcribing && <Text style={styles.transcribingText}>Transcribing…</Text>}
            </View>
          </View>
        )}

        {actionTaken && (
          <View style={styles.doneBar}>
            <Text style={styles.doneText}>Added to your list</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.doneAction}>Back to dashboard →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar — sits inside the KeyboardAvoidingView so it rises with keyboard */}
        <View style={styles.inputSafe}>
          <View style={styles.inputRow}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.micBtn, isRecording && styles.micBtnActive]}
                onPress={handleMicPress}
                activeOpacity={0.8}
              >
                <Text style={styles.micLabel}>{isRecording ? '■' : 'mic'}</Text>
              </TouchableOpacity>
            </Animated.View>

            <TextInput
              style={styles.input}
              value={input}
              onChangeText={(text) => {
                // Enter key sends — intercept trailing newline
                if (text.endsWith('\n')) {
                  const trimmed = text.replace(/\n+$/, '').trim();
                  if (trimmed && !loading) {
                    const userMsg = appendMessage('user', trimmed);
                    setInput('');
                    sendToLLM([...messages, userMsg]);
                  }
                } else {
                  setInput(text);
                }
              }}
              placeholder={isRecording ? 'Recording…' : 'Message…'}
              placeholderTextColor={Colors.textTertiary}
              multiline
              returnKeyType="send"
              blurOnSubmit={false}
              editable={!loading && !isRecording}
            />

            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe:      { flex: 1 },

  // Header — minimal, editorial
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn:  { width: 60 },
  backText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  headerSub:    { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  messageList: { padding: Spacing.base, gap: 14, paddingBottom: Spacing.xl },

  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  msgRowUser:      { flexDirection: 'row-reverse' },
  msgRowAssistant: {},

  // Avatar — clean teal circle with initial
  avatar:        { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primaryMid },
  avatarInitial: { fontSize: 13, fontWeight: '700', color: Colors.primary, letterSpacing: 0 },

  // Bubbles — rounder, cleaner
  bubble:              { maxWidth: '78%', borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser:          { backgroundColor: Colors.ink, borderBottomRightRadius: 6 },
  bubbleAssistant:     { backgroundColor: Colors.surfaceSecondary, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.border },
  bubbleText:          { fontSize: 16, lineHeight: 25 },
  bubbleTextUser:      { color: '#FFFFFF' },
  bubbleTextAssistant: { color: Colors.textPrimary },

  typingRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingBottom: 8 },
  typingBubble:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.xl, padding: 12, borderWidth: 1, borderColor: Colors.border },
  transcribingText: { fontSize: 13, color: Colors.textSecondary },

  // Done bar — teal success strip
  doneBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, backgroundColor: Colors.primaryLight,
    borderTopWidth: 1, borderTopColor: Colors.primaryMid,
  },
  doneText:   { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  doneAction: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // Input bar — clean white bar
  inputSafe: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  inputRow:  { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },

  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  micBtnActive: { backgroundColor: '#FEE2E2', borderColor: Colors.error },
  micLabel:     { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.3 },

  input: {
    flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.xxl,
    paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: Colors.textPrimary,
    maxHeight: 120, lineHeight: 22, borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText:     { fontSize: 20, color: '#FFFFFF', fontWeight: '700', lineHeight: 24 },
});
