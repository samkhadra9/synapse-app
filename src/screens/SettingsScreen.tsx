/**
 * SettingsScreen — Synapse V2
 * API key, notification times, profile, reset.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Switch, KeyboardAvoidingView, Platform,
  Modal, FlatList, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { useStore } from '../store/useStore';
import { listWritableCalendars, DeviceCalendar } from '../services/calendar';
import {
  scheduleDailyNotifications,
  sendTestNotification,
  requestPermissions,
} from '../services/notifications';

const ENV_ANTHROPIC_KEY = (process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '').trim();
const ENV_OPENAI_KEY    = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { profile, updateProfile, resetOnboarding, wipeAllData, signOut } = useStore();

  const [name,           setName]           = useState(profile.name);
  const [newAnthropicKey,setNewAnthropicKey] = useState('');
  const [editingAI,      setEditingAI]       = useState(false);
  const [newOpenAiKey,   setNewOpenAiKey]    = useState('');
  const [editingVoice,   setEditingVoice]    = useState(false);
  const [morning,        setMorning]         = useState(profile.morningTime);
  const [evening,        setEvening]         = useState(profile.eveningTime);
  const [saved,          setSaved]           = useState(false);

  // Calendar picker
  const [calendarList,    setCalendarList]    = useState<DeviceCalendar[]>([]);
  const [showCalPicker,   setShowCalPicker]   = useState(false);
  const [loadingCals,     setLoadingCals]     = useState(false);

  async function openCalendarPicker() {
    setLoadingCals(true);
    try {
      const cals = await listWritableCalendars();
      setCalendarList(cals);
      setShowCalPicker(true);
    } catch (e: any) {
      Alert.alert('Calendar access', e.message ?? 'Could not read calendars. Check permissions in iPhone Settings → Privacy → Calendars.');
    } finally {
      setLoadingCals(false);
    }
  }

  function selectCalendar(cal: DeviceCalendar) {
    updateProfile({ synapseCalendarId: cal.id, selectedCalendarName: cal.title });
    setShowCalPicker(false);
  }

  // Anthropic key (main AI)
  const activeAnthropicKey  = profile.anthropicKey || ENV_ANTHROPIC_KEY;
  const usingEnvAnthropic   = !!ENV_ANTHROPIC_KEY && !profile.anthropicKey;
  const maskedAnthropicKey  = activeAnthropicKey.length > 8
    ? `sk-ant-...${activeAnthropicKey.slice(-4)}`
    : activeAnthropicKey ? '••••••••' : '';

  // OpenAI key (voice / Whisper only)
  const activeOpenAiKey = profile.openAiKey || ENV_OPENAI_KEY;
  const maskedOpenAiKey = activeOpenAiKey.length > 8
    ? `sk-...${activeOpenAiKey.slice(-4)}`
    : activeOpenAiKey ? '••••••••' : '';

  function handleSave() {
    updateProfile({
      name,
      ...(editingAI    && newAnthropicKey.trim() ? { anthropicKey: newAnthropicKey.trim() } : {}),
      ...(editingVoice && newOpenAiKey.trim()    ? { openAiKey:    newOpenAiKey.trim()    } : {}),
      morningTime: morning,
      eveningTime: evening,
    });
    setEditingAI(false);
    setEditingVoice(false);
    setNewAnthropicKey('');
    setNewOpenAiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Reschedule notifications with updated times
    requestPermissions().then(granted => {
      if (granted) scheduleDailyNotifications(morning, evening);
    });
  }

  async function handleTestNotification() {
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert(
        'Notifications blocked',
        'Go to iPhone Settings → Synapse → Notifications and enable them.',
      );
      return;
    }
    await sendTestNotification();
    Alert.alert('On its way', 'You\'ll get a test notification in about 2 seconds.');
  }

  function handleRemoveAnthropicKey() {
    Alert.alert('Remove Anthropic key', "You won't be able to use Synapse AI without it.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        updateProfile({ anthropicKey: '' });
        setEditingAI(false);
        setNewAnthropicKey('');
      }},
    ]);
  }

  function handleRemoveOpenAiKey() {
    Alert.alert('Remove OpenAI key', "Voice transcription (Whisper) will be disabled.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        updateProfile({ openAiKey: '' });
        setEditingVoice(false);
        setNewOpenAiKey('');
      }},
    ]);
  }

  function handleBugReport() {
    const subject = encodeURIComponent('Synapse Bug Report');
    const body = encodeURIComponent(
      `Hi — something went wrong in Synapse.\n\n` +
      `What happened:\n[describe the bug here]\n\n` +
      `Steps to reproduce:\n1.\n2.\n3.\n\n` +
      `Expected:\n\nActual:\n\n` +
      `— Sent from Synapse beta`
    );
    Linking.openURL(`mailto:samkhadra9@gmail.com?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert('Could not open email', 'Please email samkhadra9@gmail.com directly.')
    );
  }

  function handleReset() {
    Alert.alert(
      'Reset onboarding',
      'This will take you back to the welcome screen. Your data will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => {
            resetOnboarding();
            navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
          }},
      ]
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          <Text style={styles.pageTitle}>Settings</Text>

          {/* Profile */}
          <SectionLabel label="PROFILE" />
          <View style={styles.card}>
            <SettingRow label="Your name">
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Sam"
                placeholderTextColor={Colors.textTertiary}
              />
            </SettingRow>
          </View>

          {/* API */}
          <SectionLabel label="AI CONNECTION" />
          <View style={styles.card}>
            {/* ── Anthropic key (main AI) ── */}
            {usingEnvAnthropic ? (
              <View style={styles.envKeyBanner}>
                <Text style={styles.envKeyIcon}>✓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.envKeyTitle}>Anthropic key loaded from config</Text>
                  <Text style={styles.envKeySubtitle}>Set via EXPO_PUBLIC_ANTHROPIC_KEY in .env</Text>
                </View>
              </View>
            ) : activeAnthropicKey && !editingAI ? (
              <View style={styles.keyMaskedRow}>
                <View style={styles.keyMaskedLeft}>
                  <Text style={styles.keyMaskedLabel}>Anthropic API key (AI)</Text>
                  <Text style={styles.keyMaskedValue}>{maskedAnthropicKey}</Text>
                </View>
                <View style={styles.keyMaskedActions}>
                  <TouchableOpacity onPress={() => setEditingAI(true)} style={styles.keyChangeBtn}>
                    <Text style={styles.keyChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRemoveAnthropicKey} style={styles.keyRemoveBtn}>
                    <Text style={styles.keyRemoveBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <SettingRow label="Anthropic API key">
                  <View style={styles.keyInputRow}>
                    <TextInput
                      style={[styles.input, styles.keyInput]}
                      value={newAnthropicKey}
                      onChangeText={setNewAnthropicKey}
                      placeholder="sk-ant-..."
                      placeholderTextColor={Colors.textTertiary}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {editingAI && (
                      <TouchableOpacity onPress={() => { setEditingAI(false); setNewAnthropicKey(''); }} style={styles.showBtn}>
                        <Text style={styles.showBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </SettingRow>
                <Text style={styles.keyHint}>
                  Get your key at console.anthropic.com → API Keys.{'\n'}
                  Stored on-device only — never leaves your phone except to Anthropic directly.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* ── OpenAI key (voice / Whisper only) ── */}
            {activeOpenAiKey && !editingVoice ? (
              <View style={styles.keyMaskedRow}>
                <View style={styles.keyMaskedLeft}>
                  <Text style={styles.keyMaskedLabel}>OpenAI key (voice only)</Text>
                  <Text style={styles.keyMaskedValue}>{maskedOpenAiKey}</Text>
                </View>
                <View style={styles.keyMaskedActions}>
                  <TouchableOpacity onPress={() => setEditingVoice(true)} style={styles.keyChangeBtn}>
                    <Text style={styles.keyChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRemoveOpenAiKey} style={styles.keyRemoveBtn}>
                    <Text style={styles.keyRemoveBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <SettingRow label="OpenAI key (optional)">
                  <View style={styles.keyInputRow}>
                    <TextInput
                      style={[styles.input, styles.keyInput]}
                      value={newOpenAiKey}
                      onChangeText={setNewOpenAiKey}
                      placeholder="sk-... (for voice)"
                      placeholderTextColor={Colors.textTertiary}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {editingVoice && (
                      <TouchableOpacity onPress={() => { setEditingVoice(false); setNewOpenAiKey(''); }} style={styles.showBtn}>
                        <Text style={styles.showBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </SettingRow>
                <Text style={styles.keyHint}>
                  Only needed for voice input (Whisper transcription).{'\n'}
                  platform.openai.com → API Keys
                </Text>
              </View>
            )}
          </View>

          {/* Reminders */}
          <SectionLabel label="DAILY REMINDERS" />
          <View style={styles.card}>
            <SettingRow label="Morning check-in">
              <TextInput
                style={styles.input}
                value={morning}
                onChangeText={setMorning}
                placeholder="07:30"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numbers-and-punctuation"
              />
            </SettingRow>
            <View style={styles.divider} />
            <SettingRow label="Evening review">
              <TextInput
                style={styles.input}
                value={evening}
                onChangeText={setEvening}
                placeholder="21:00"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numbers-and-punctuation"
              />
            </SettingRow>
            <View style={styles.divider} />
            <Text style={styles.keyHint}>
              You also get a midday check-in at 12:30 — tap it to open Decision Fatigue mode with one clear next action.
            </Text>
            <TouchableOpacity style={styles.testNotifBtn} onPress={handleTestNotification} activeOpacity={0.75}>
              <Text style={styles.testNotifBtnText}>Send test notification</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar Sync */}
          <SectionLabel label="CALENDAR SYNC" />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.calRow}
              onPress={openCalendarPicker}
              activeOpacity={0.75}
              disabled={loadingCals}
            >
              <View style={styles.calLeft}>
                <View style={[styles.calDot, { backgroundColor: profile.synapseCalendarId ? Colors.primary : Colors.border }]} />
                <View>
                  <Text style={styles.calTitle}>
                    {profile.selectedCalendarName ?? (profile.synapseCalendarId ? 'Calendar selected' : 'Choose a calendar')}
                  </Text>
                  <Text style={styles.calSub}>
                    {profile.synapseCalendarId
                      ? 'Project deadlines sync here'
                      : 'Tap to pick where deadlines appear'}
                  </Text>
                </View>
              </View>
              {loadingCals
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.resetArrow}>›</Text>}
            </TouchableOpacity>
            {profile.synapseCalendarId && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.calRow}
                  onPress={() => updateProfile({ synapseCalendarId: undefined, selectedCalendarName: undefined })}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.calTitle, { color: Colors.error }]}>Remove calendar link</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save changes'}</Text>
          </TouchableOpacity>

          {/* Calendar picker modal */}
          <Modal
            visible={showCalPicker}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowCalPicker(false)}
          >
            <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
              <View style={styles.calModalHeader}>
                <Text style={styles.calModalTitle}>Choose calendar</Text>
                <TouchableOpacity onPress={() => setShowCalPicker(false)} style={styles.calModalClose}>
                  <Text style={styles.calModalCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.calModalSub}>
                Synapse will add your project deadlines to this calendar. Pick any calendar on your device — Apple, Google, iCloud, all work.
              </Text>
              <FlatList
                data={calendarList}
                keyExtractor={c => c.id}
                contentContainerStyle={{ padding: Spacing.base, paddingBottom: 60 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                ListEmptyComponent={
                  <View style={styles.calEmpty}>
                    <Text style={styles.calEmptyText}>No writable calendars found.</Text>
                    <Text style={styles.calEmptySub}>Make sure you have at least one calendar app installed and have granted Synapse calendar access in iPhone Settings → Privacy → Calendars.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isSelected = profile.synapseCalendarId === item.id;
                  return (
                    <TouchableOpacity
                      style={[styles.calPickerRow, isSelected && styles.calPickerRowSelected]}
                      onPress={() => selectCalendar(item)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.calPickerDot, { backgroundColor: item.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calPickerTitle}>{item.title}</Text>
                        <Text style={styles.calPickerType}>{item.type}</Text>
                      </View>
                      {isSelected && <Text style={styles.calPickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            </SafeAreaView>
          </Modal>

          {/* System phase */}
          <SectionLabel label="SYSTEM PHASE" />
          <View style={styles.card}>
            <View style={styles.phaseRow}>
              {([1, 2, 3] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.phaseBtn, profile.systemPhase === p && styles.phaseBtnActive]}
                  onPress={() => updateProfile({ systemPhase: p })}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.phaseBtnNum, profile.systemPhase === p && styles.phaseBtnNumActive]}>
                    {p}
                  </Text>
                  <Text style={[styles.phaseBtnLabel, profile.systemPhase === p && styles.phaseBtnLabelActive]}>
                    {p === 1 ? 'Routine' : p === 2 ? 'Output' : 'Full OS'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.phaseHint}>
              {profile.systemPhase === 1 && 'Phase 1: Lock your morning & evening routines. Nothing else yet.'}
              {profile.systemPhase === 2 && 'Phase 2: Add deep work sessions and start tracking output.'}
              {profile.systemPhase === 3 && 'Phase 3: Full system — weekly reviews, all features active.'}
            </Text>
          </View>

          {/* Onboarding */}
          <SectionLabel label="SETUP" />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.resumeRow}
              onPress={() => navigation.navigate('OnboardingChat')}
            >
              <View>
                <Text style={styles.resumeText}>Resume setup chat</Text>
                <Text style={styles.resumeSub}>Pick up where you left off</Text>
              </View>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Week skeleton */}
          <SectionLabel label="WEEKLY STRUCTURE" />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.resetRow}
              onPress={() => Alert.alert(
                'Rebuild weekly skeleton',
                'This lets you redesign your weekly time blocks from scratch — useful if your schedule has changed. Your existing tasks and projects are not affected.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Rebuild', onPress: () => (navigation as any).navigate('SkeletonBuilder') },
                ]
              )}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.resetText, { color: Colors.text, fontWeight: '600' }]}>Rebuild weekly skeleton</Text>
                <Text style={[styles.settingLabel, { marginTop: 2, color: Colors.textMuted }]}>Redesign your time blocks when your week changes</Text>
              </View>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Beta feedback */}
          <SectionLabel label="BETA" />
          <View style={styles.card}>
            <TouchableOpacity style={styles.resetRow} onPress={handleBugReport} activeOpacity={0.75}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resetText, { color: Colors.primary, fontWeight: '600' }]}>Report a bug or give feedback</Text>
                <Text style={[styles.settingLabel, { marginTop: 2, color: Colors.textMuted }]}>Opens your email — goes straight to Sam</Text>
              </View>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Danger zone */}
          <SectionLabel label="ACCOUNT" />
          <View style={styles.card}>
            <TouchableOpacity style={styles.resetRow} onPress={handleReset}>
              <Text style={styles.resetText}>Restart onboarding</Text>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.resetRow}
              onPress={() => Alert.alert(
                'Sign out',
                'You\'ll be taken back to the login screen. Your data is saved in the cloud.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: async () => {
                    await signOut();
                    // Navigation resets automatically when session becomes null
                  }},
                ]
              )}
            >
              <Text style={[styles.resetText, { color: Colors.textSecondary }]}>Sign out</Text>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.resetRow}
              onPress={() => Alert.alert(
                '⚠️ Wipe all data',
                'This deletes everything — your profile, projects, tasks, goals, habits, and sessions. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete everything', style: 'destructive', onPress: async () => {
                    await wipeAllData();
                    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                  }},
                ]
              )}
            >
              <Text style={[styles.resetText, { color: '#DC2626' }]}>Wipe all data</Text>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.base, paddingTop: Spacing.base },

  pageTitle: {
    fontSize: 38, fontWeight: '800', color: Colors.textPrimary,
    letterSpacing: -1.5, marginBottom: Spacing.lg, lineHeight: 40,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textTertiary,
    letterSpacing: 1.2, marginBottom: 8, marginTop: Spacing.base,
    marginLeft: 2, textTransform: 'uppercase',
  },

  // Cards — bordered, no heavy shadow
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.border,
  },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: Spacing.base },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 16,
  },
  settingLabel:   { fontSize: 16, color: Colors.textPrimary, fontWeight: '500' },
  settingControl: { flex: 1, alignItems: 'flex-end' },

  input: {
    fontSize: 15, color: Colors.textPrimary, textAlign: 'right',
    backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8, minWidth: 120,
    borderWidth: 1, borderColor: Colors.border,
  },

  keyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyInput:    { maxWidth: 160, textAlign: 'left' },
  showBtn:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  showBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  keyHint: {
    fontSize: 12, color: Colors.textTertiary, lineHeight: 18,
    paddingHorizontal: Spacing.base, paddingBottom: 14, marginTop: -4,
  },

  testNotifBtn: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.base,
    paddingVertical: 10, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center',
  },
  testNotifBtnText: {
    fontSize: 13, color: Colors.textSecondary, fontWeight: '500',
  },

  // Masked key display
  keyMaskedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 16,
  },
  keyMaskedLeft:    { gap: 4 },
  keyMaskedLabel:   { fontSize: 16, color: Colors.textPrimary, fontWeight: '500' },
  keyMaskedValue:   { fontSize: 13, color: Colors.textTertiary, fontFamily: 'monospace' },
  keyMaskedActions: { flexDirection: 'row', gap: 8 },
  keyChangeBtn:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.primaryLight, borderRadius: Radius.full },
  keyChangeBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  keyRemoveBtn:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full },
  keyRemoveBtnText: { fontSize: 13, color: Colors.error, fontWeight: '600' },

  envKeyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: Spacing.base,
  },
  envKeyIcon:     { fontSize: 20, color: Colors.success },
  envKeyTitle:    { fontSize: 15, fontWeight: '700', color: Colors.success },
  envKeySubtitle: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  // Black pill save button
  saveBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.full,
    paddingVertical: 18, alignItems: 'center', marginTop: Spacing.lg,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },

  resumeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: 16,
  },
  resumeText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  resumeSub:  { fontSize: 12, color: Colors.textTertiary, marginTop: 3 },

  // Phase selector — editorial pill tabs
  phaseRow: { flexDirection: 'row', gap: 8, padding: Spacing.base, paddingBottom: 0 },
  phaseBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  phaseBtnActive:      { borderColor: Colors.ink, backgroundColor: Colors.ink },
  phaseBtnNum:         { fontSize: 22, fontWeight: '800', color: Colors.textTertiary, letterSpacing: -0.5 },
  phaseBtnNumActive:   { color: '#FFFFFF' },
  phaseBtnLabel:       { fontSize: 11, color: Colors.textTertiary, marginTop: 4, fontWeight: '500' },
  phaseBtnLabelActive: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  phaseHint: {
    fontSize: 12, color: Colors.textTertiary, lineHeight: 18,
    padding: Spacing.base, paddingTop: 12,
  },

  resetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 17,
  },
  resetText:  { fontSize: 16, color: Colors.error, fontWeight: '500' },
  resetArrow: { fontSize: 20, color: Colors.textTertiary },

  // Calendar sync section
  calRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 16,
  },
  calLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  calDot:   { width: 12, height: 12, borderRadius: 6 },
  calTitle: { fontSize: 16, color: Colors.textPrimary, fontWeight: '500' },
  calSub:   { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  // Calendar picker modal
  calModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: 8,
  },
  calModalTitle:     { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8 },
  calModalClose:     { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.ink, borderRadius: Radius.full },
  calModalCloseText: { fontSize: 14, color: '#FFF', fontWeight: '700' },
  calModalSub: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 21,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.base,
  },
  calPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 16, borderWidth: 1.5, borderColor: Colors.border,
  },
  calPickerRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  calPickerDot:         { width: 14, height: 14, borderRadius: 7 },
  calPickerTitle:       { fontSize: 16, color: Colors.textPrimary, fontWeight: '600' },
  calPickerType:        { fontSize: 12, color: Colors.textTertiary, marginTop: 2, textTransform: 'capitalize' },
  calPickerCheck:       { fontSize: 18, color: Colors.primary, fontWeight: '700' },
  calEmpty:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  calEmptyText: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  calEmptySub:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
