/**
 * SkeletonBuilderScreen — Synapse V2 Onboarding Step 2
 *
 * Dark teal aesthetic. Conversational AI builds a weekly time template
 * by asking about the user's natural rhythms and sacred commitments.
 *
 * When done, shows a 7-day visual grid of the skeleton and saves
 * the weekTemplate to the user profile.
 *
 * Then navigates to CalendarExportScreen (Step 3).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, StatusBar, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, TimeBlock, TimeBlockType } from '../../store/useStore';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Design tokens — dark teal palette ─────────────────────────────────────────

const TEAL = {
  bg:         '#0D1F1E',   // very dark teal
  surface:    '#162B29',
  surfaceAlt: '#1D3532',
  border:     '#274845',
  text:       '#E8F4F3',
  textDim:    '#8BBAB6',
  textFaint:  '#4A7A77',
  accent:     '#2EC4A9',   // bright teal
  accentDim:  '#1D8C7A',
  amber:      '#D4821A',   // warm accent for contrast
};

// ── Block type colours ────────────────────────────────────────────────────────

const BLOCK_COLORS: Record<TimeBlockType, string> = {
  deep_work: '#2EC4A9',
  area_work: '#D4821A',
  social:    '#8B5CF6',
  admin:     '#64748B',
  protected: '#EF4444',
  personal:  '#3B82F6',
};

const BLOCK_LABELS: Record<TimeBlockType, string> = {
  deep_work: 'Deep work',
  area_work: 'Area work',
  social:    'Social',
  admin:     'Admin',
  protected: 'Protected',
  personal:  'Personal',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// JS getDay() → 0=Sun, but we want Mon=0 in our grid
const JS_DAY_TO_GRID: Record<number, number> = { 1:0,2:1,3:2,4:3,5:4,6:5,0:6 };

// ── System prompt ─────────────────────────────────────────────────────────────

const uid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

function buildSkeletonPrompt(name: string, areas: string[]): string {
  return `You are Synapse, helping ${name || 'the user'} design their weekly time skeleton.

A time skeleton is NOT a rigid schedule. It's the recurring structure of a week — when the person naturally thinks best, what time is already claimed, and where deep work slots should live. It becomes the template that syncs to their calendar.

The user has these life areas: ${areas.length > 0 ? areas.join(', ') : 'work, health, relationships, personal'}.

Rules:
- Ask ONE question at a time
- Keep messages to 2-3 sentences
- No bullet points, no jargon
- Be warm and practical

Conversation arc:
1. Brief orientation: "Now let's figure out your weekly structure — when you do your best thinking, what's already claimed, and where to protect your deep work time."
2. Ask: when do they do their best thinking / feel most focused in the day?
3. Ask: what times are already claimed in a typical week — recurring meetings, workouts, commitments that don't move?
4. Ask: how many days a week can they realistically do deep work?
5. Ask: is there anything that's absolutely off-limits — time they need to protect no matter what?
6. Ask: do they want weekend blocks or keep weekends completely free?
7. Close: "Perfect — I've got enough to sketch your skeleton."

When you have enough (after 5-7 exchanges), output:
[SKELETON_COMPLETE]

Then immediately output a JSON array of time blocks (nothing else):
[
  {
    "label": "string (descriptive name)",
    "type": "deep_work|area_work|social|admin|protected|personal",
    "dayOfWeek": [1,2,3,4,5],
    "startTime": "HH:MM",
    "durationMinutes": 90,
    "isProtected": true|false
  }
]

dayOfWeek uses JS day numbers: 0=Sunday, 1=Monday … 6=Saturday.

TYPE GUIDE:
- deep_work: uninterrupted focus blocks, the person at their best
- area_work: softer work on a life area (writing, exercise, reading)
- social: meetings, calls, family time
- admin: email, errands, low-energy tasks
- protected: non-negotiable commitments (school run, therapy, etc.)
- personal: exercise, hobbies, self-care

Generate a realistic 5-7 block skeleton. Don't overcrowd. Gaps are good — they give the person room to breathe.

IMPORTANT: every block must have a startTime in HH:MM format and a realistic durationMinutes (min 30, max 240).`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSkeletonBlocks(text: string): TimeBlock[] | null {
  try {
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    const raw: any[] = JSON.parse(text.slice(start, end + 1));
    return raw.map(b => ({
      id:              uid(),
      label:           b.label ?? 'Block',
      type:            (b.type as TimeBlockType) ?? 'personal',
      dayOfWeek:       Array.isArray(b.dayOfWeek) ? b.dayOfWeek : [1,2,3,4,5],
      startTime:       b.startTime ?? '09:00',
      durationMinutes: b.durationMinutes ?? 60,
      isProtected:     b.isProtected ?? false,
    }));
  } catch {
    return null;
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}${m > 0 ? `:${m.toString().padStart(2, '0')}` : ''} ${ampm}`;
}

// ── 7-day grid preview ────────────────────────────────────────────────────────

const GRID_START = 7 * 60;   // 7:00 am
const GRID_END   = 22 * 60;  // 10:00 pm
const GRID_SPAN  = GRID_END - GRID_START;
const GRID_H     = 200;       // px height of grid
const GRID_COL_W = (SCREEN_W - 48 - 28) / 7; // 7 equal columns with padding

function SkeletonGrid({ blocks }: { blocks: TimeBlock[] }) {
  return (
    <View style={grid.container}>
      {/* Day labels */}
      <View style={grid.dayRow}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={grid.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Grid body */}
      <View style={[grid.body, { height: GRID_H }]}>
        {/* Hour lines */}
        {[8, 10, 12, 14, 16, 18, 20].map(h => {
          const top = ((h * 60 - GRID_START) / GRID_SPAN) * GRID_H;
          return (
            <View key={h} style={[grid.hourLine, { top }]}>
              <Text style={grid.hourLabel}>{h > 12 ? `${h-12}p` : `${h}a`}</Text>
            </View>
          );
        })}

        {/* Blocks */}
        {blocks.map(block => {
          const startMins = timeToMinutes(block.startTime);
          const top    = Math.max(0, ((startMins - GRID_START) / GRID_SPAN) * GRID_H);
          const height = Math.min(
            (block.durationMinutes / GRID_SPAN) * GRID_H,
            GRID_H - top,
          );
          const color = BLOCK_COLORS[block.type];

          return block.dayOfWeek.map(d => {
            const gridCol = JS_DAY_TO_GRID[d] ?? 0;
            const left    = gridCol * GRID_COL_W;
            return (
              <View
                key={`${block.id}-${d}`}
                style={[
                  grid.block,
                  { top, left, width: GRID_COL_W - 2, height: Math.max(height, 10), backgroundColor: color + 'CC' },
                ]}
              />
            );
          });
        })}
      </View>

      {/* Legend */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={grid.legend}
      >
        {(Object.keys(BLOCK_LABELS) as TimeBlockType[])
          .filter(t => blocks.some(b => b.type === t))
          .map(t => (
            <View key={t} style={grid.legendItem}>
              <View style={[grid.legendDot, { backgroundColor: BLOCK_COLORS[t] }]} />
              <Text style={grid.legendText}>{BLOCK_LABELS[t]}</Text>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

const grid = StyleSheet.create({
  container: { marginTop: 16 },
  dayRow: {
    flexDirection: 'row', paddingBottom: 6,
    paddingHorizontal: 28,
  },
  dayLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 10, fontWeight: '700',
    color: TEAL.textDim, letterSpacing: 0.4,
  },
  body: {
    marginHorizontal: 24,
    borderWidth: 1, borderColor: TEAL.border,
    borderRadius: 8, overflow: 'hidden',
    backgroundColor: TEAL.surfaceAlt,
    position: 'relative',
  },
  hourLine: {
    position: 'absolute', left: 0, right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: TEAL.border,
  },
  hourLabel: {
    position: 'absolute', left: 2, top: -8,
    fontSize: 8, color: TEAL.textFaint, fontWeight: '500',
  },
  block: {
    position: 'absolute',
    borderRadius: 2,
    marginHorizontal: 1,
  },
  legend: {
    paddingHorizontal: 24, paddingTop: 10, gap: 12, flexDirection: 'row',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: TEAL.textDim, fontWeight: '500' },
});

// ── Chat message types ────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ── Main Screen ────────────────────────────────────────────────────────────────

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

export default function SkeletonBuilderScreen({ navigation }: any) {
  const { profile, areas, setWeekTemplate } = useStore();
  const apiKey = profile.openAiKey || ENV_API_KEY;

  const [messages,    setMessages]    = useState<Msg[]>([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [isComplete,  setIsComplete]  = useState(false);
  const [blocks,      setBlocks]      = useState<TimeBlock[]>([]);
  const [showGrid,    setShowGrid]    = useState(false);

  const listRef  = useRef<FlatList>(null);
  const btnAnim  = useRef(new Animated.Value(0)).current;
  const gridAnim = useRef(new Animated.Value(0)).current;

  const systemPrompt = buildSkeletonPrompt(
    profile.name,
    areas.map(a => a.name),
  );

  useEffect(() => {
    sendToLLM([], true);
  }, []);

  function appendMessage(role: 'user' | 'assistant', content: string): Msg {
    const msg: Msg = { id: uid(), role, content };
    setMessages(prev => {
      const next = [...prev, msg];
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return next;
    });
    return msg;
  }

  async function sendToLLM(history: Msg[], isFirst = false) {
    if (!apiKey) {
      appendMessage('assistant', "I need an OpenAI API key to work. Add it in Settings and come back.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.75,
          max_tokens: 700,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        appendMessage('assistant', `API error: ${data.error?.message ?? res.status}`);
        setLoading(false);
        return;
      }

      const reply: string = data.choices?.[0]?.message?.content ?? "Something went wrong.";

      if (reply.includes('[SKELETON_COMPLETE]')) {
        const friendlyPart = reply.replace('[SKELETON_COMPLETE]', '').split('[')[0].trim();
        appendMessage('assistant', friendlyPart || "Your skeleton is ready. Here's how your week looks:");

        const parsed = parseSkeletonBlocks(reply);
        if (parsed && parsed.length > 0) {
          setBlocks(parsed);
          setWeekTemplate(parsed);
          setIsComplete(true);
          setTimeout(() => {
            setShowGrid(true);
            Animated.parallel([
              Animated.timing(btnAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
              Animated.timing(gridAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            ]).start();
          }, 400);
        } else {
          appendMessage('assistant', "I had trouble building the skeleton. Let me try again — can you tell me a bit more about your ideal week?");
        }
      } else {
        appendMessage('assistant', reply);
      }
    } catch (err) {
      appendMessage('assistant', "Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = appendMessage('user', input.trim());
    setInput('');
    await sendToLLM([...messages, userMsg]);
  }

  function handleSkip() {
    // Skip skeleton — go straight to calendar export or main app
    navigation.navigate('CalendarExport');
  }

  function handleContinue() {
    navigation.navigate('CalendarExport');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.stepBadge}>
            <Text style={s.stepText}>STEP 2 OF 3</Text>
          </View>
          <Text style={s.headerTitle}>Weekly structure</Text>
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.skipLink}>Skip</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={[s.msgRow, isUser && s.msgRowUser]}>
                {!isUser && (
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>S</Text>
                  </View>
                )}
                <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}>
                  <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={() => (
            <>
              {/* Typing indicator */}
              {loading && (
                <View style={s.msgRow}>
                  <View style={s.avatar}><Text style={s.avatarText}>S</Text></View>
                  <View style={s.typingBubble}>
                    <ActivityIndicator size="small" color={TEAL.accent} />
                  </View>
                </View>
              )}

              {/* Grid preview */}
              {showGrid && blocks.length > 0 && (
                <Animated.View style={[s.gridCard, { opacity: gridAnim }]}>
                  <Text style={s.gridTitle}>Your week skeleton</Text>
                  <SkeletonGrid blocks={blocks} />
                </Animated.View>
              )}

              {/* Block list */}
              {isComplete && blocks.length > 0 && (
                <View style={s.blockList}>
                  {blocks.map(b => (
                    <View key={b.id} style={s.blockRow}>
                      <View style={[s.blockDot, { backgroundColor: BLOCK_COLORS[b.type] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.blockLabel}>{b.label}</Text>
                        <Text style={s.blockMeta}>
                          {formatTime(b.startTime)} · {b.durationMinutes} min ·{' '}
                          {b.dayOfWeek.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                        </Text>
                      </View>
                      {b.isProtected && (
                        <Text style={s.protectedBadge}>protected</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Continue button */}
              {isComplete && (
                <Animated.View style={[s.ctaWrap, { opacity: btnAnim }]}>
                  <TouchableOpacity style={s.ctaBtn} onPress={handleContinue} activeOpacity={0.88}>
                    <Text style={s.ctaBtnText}>Sync to my calendar →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={() => {
                    // Go to main app, skip calendar export
                    const { updateProfile } = useStore.getState();
                    updateProfile({ onboardingCompleted: true, onboardingStep: 'done', skeletonBuilt: true });
                    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
                  }}>
                    <Text style={s.skipBtnText}>Skip — enter Synapse now</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              <View style={{ height: 40 }} />
            </>
          )}
        />

      </SafeAreaView>

      {/* Input — sibling to SafeAreaView so outer KAV lifts it cleanly */}
      {!isComplete && (
        <SafeAreaView edges={['bottom']} style={s.inputSafe}>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type your reply…"
              placeholderTextColor={TEAL.textFaint}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!loading}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnOff]}
              onPress={handleSend}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              <Text style={s.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: TEAL.bg },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    gap: 12,
  },
  stepBadge: {
    backgroundColor: TEAL.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  stepText:    { fontSize: 10, fontWeight: '700', color: TEAL.accent, letterSpacing: 1 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: TEAL.text },
  skipLink:    { fontSize: 14, color: TEAL.textFaint },

  list: { padding: 20, gap: 12, paddingBottom: 20 },

  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  msgRowUser: { flexDirection: 'row-reverse' },

  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: TEAL.accentDim,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  bubble:          { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleUser:      { backgroundColor: TEAL.accent, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: TEAL.surface, borderBottomLeftRadius: 4 },
  bubbleText:      { fontSize: 15, lineHeight: 23, color: TEAL.text },
  bubbleTextUser:  { color: '#000' },

  typingBubble: {
    backgroundColor: TEAL.surface, borderRadius: 16, padding: 14,
  },

  // Grid card
  gridCard: {
    backgroundColor: TEAL.surface, borderRadius: 16,
    marginHorizontal: 0, marginTop: 12, marginBottom: 4,
    paddingVertical: 16, overflow: 'hidden',
  },
  gridTitle: {
    fontSize: 13, fontWeight: '700', color: TEAL.textDim,
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 24, marginBottom: 4,
  },

  // Block list
  blockList: { gap: 0, marginTop: 8 },
  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: TEAL.border,
  },
  blockDot:   { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  blockLabel: { fontSize: 14, fontWeight: '600', color: TEAL.text },
  blockMeta:  { fontSize: 12, color: TEAL.textDim, marginTop: 1 },
  protectedBadge: {
    fontSize: 10, color: TEAL.accent, fontWeight: '700',
    backgroundColor: TEAL.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3, letterSpacing: 0.5,
  },

  // CTA
  ctaWrap: { marginTop: 24, gap: 10 },
  ctaBtn: {
    backgroundColor: TEAL.accent, borderRadius: 100,
    paddingVertical: 18, alignItems: 'center',
  },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#000', letterSpacing: -0.2 },
  skipBtn:    { alignItems: 'center', paddingVertical: 10 },
  skipBtnText:{ fontSize: 14, color: TEAL.textFaint },

  // Input
  inputSafe: {
    backgroundColor: TEAL.surface,
    borderTopWidth: 1, borderTopColor: TEAL.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },
  input: {
    flex: 1, backgroundColor: TEAL.surfaceAlt, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 16, color: TEAL.text, maxHeight: 120, lineHeight: 22,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: TEAL.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: TEAL.surfaceAlt },
  sendBtnText: { fontSize: 20, color: '#000', fontWeight: '700', lineHeight: 24 },
});
