/**
 * SettingsScreen — Solas V2
 * API key, notification times, profile, reset.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Switch, KeyboardAvoidingView, Platform,
  Modal, FlatList, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow, THEMES, useColors } from '../theme';
import type { ThemeName } from '../theme';
import { useStore } from '../store/useStore';
import { enqueueUndo } from '../services/undo';
import { listWritableCalendars, DeviceCalendar } from '../services/calendar';
import { CAPTURE_SURFACES } from '../data/captureSurfaces';
import {
  scheduleDailyNotifications,
  scheduleWeeklyReview,
  sendTestNotification,
  requestPermissions,
  DEFAULT_WEEKLY_REVIEW_DAY,
  DEFAULT_WEEKLY_REVIEW_TIME,
} from '../services/notifications';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ENV_OPENAI_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

function SectionLabel({ label }: { label: string }) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  return <Text style={s.sectionLabel}>{label}</Text>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.settingRow}>
      <Text style={s.settingLabel}>{label}</Text>
      <View style={s.settingControl}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { profile, updateProfile, wipeAllData, signOut, appTheme, setTheme, autoDark, setAutoDark } = useStore();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [name,           setName]           = useState(profile.name);
  const [newAnthropicKey,setNewAnthropicKey] = useState('');
  const [editingAI,      setEditingAI]       = useState(false);
  const [newOpenAiKey,   setNewOpenAiKey]    = useState('');
  const [editingVoice,   setEditingVoice]    = useState(false);
  const [morning,        setMorning]         = useState(profile.morningTime);
  const [evening,        setEvening]         = useState(profile.eveningTime);
  const [weeklyDay,      setWeeklyDay]       = useState<number>(profile.weeklyReviewDay ?? DEFAULT_WEEKLY_REVIEW_DAY);
  const [weeklyTime,     setWeeklyTime]      = useState(profile.weeklyReviewTime ?? DEFAULT_WEEKLY_REVIEW_TIME);
  const [saved,          setSaved]           = useState(false);
  const [showPrivacy,    setShowPrivacy]     = useState(false);

  // Auto-clear the "Saved" confirmation after 2 s, with cleanup to avoid state updates on unmounted component
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

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
  // If user has their own key it's used directly; otherwise the secure server proxy is used.
  const activeAnthropicKey  = profile.anthropicKey ?? '';
  const usingProxy          = !activeAnthropicKey;
  const maskedAnthropicKey  = activeAnthropicKey.length > 8
    ? `sk-ant-...${activeAnthropicKey.slice(-4)}`
    : activeAnthropicKey ? '••••••••' : '';

  // OpenAI key (voice / Whisper only)
  const activeOpenAiKey = profile.openAiKey || ENV_OPENAI_KEY;
  const maskedOpenAiKey = activeOpenAiKey.length > 8
    ? `sk-...${activeOpenAiKey.slice(-4)}`
    : activeOpenAiKey ? '••••••••' : '';

  function isValidTime(t: string) {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return false;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    return h >= 0 && h <= 23 && min >= 0 && min <= 59;
  }

  function handleSave() {
    if (!isValidTime(morning) || !isValidTime(evening) || !isValidTime(weeklyTime)) {
      Alert.alert('Invalid time', 'Please enter times in HH:MM format, e.g. 07:30');
      return;
    }
    updateProfile({
      name,
      ...(newAnthropicKey.trim() ? { anthropicKey: newAnthropicKey.trim() } : {}),
      ...(newOpenAiKey.trim()    ? { openAiKey:    newOpenAiKey.trim()    } : {}),
      morningTime:      morning,
      eveningTime:      evening,
      weeklyReviewDay:  weeklyDay,
      weeklyReviewTime: weeklyTime,
    });
    setEditingAI(false);
    setEditingVoice(false);
    setNewAnthropicKey('');
    setNewOpenAiKey('');
    setSaved(true);

    // Reschedule notifications with updated times
    requestPermissions().then(granted => {
      if (granted) {
        scheduleDailyNotifications(morning, evening);
        scheduleWeeklyReview(weeklyDay, weeklyTime);
      }
    });
  }

  async function handleTestNotification() {
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert(
        'Notifications blocked',
        'Go to iPhone Settings → Aiteall → Notifications and enable them.',
      );
      return;
    }
    await sendTestNotification();
    Alert.alert('On its way', 'You\'ll get a test notification in about 2 seconds.');
  }

  function handleRemoveAnthropicKey() {
    // CP3.4 — no confirm. Removing a key is a single-command action with a
    // 10-second undo window. The key is still in memory until undo expires.
    const prevKey = profile.anthropicKey;
    updateProfile({ anthropicKey: '' });
    setEditingAI(false);
    setNewAnthropicKey('');
    enqueueUndo({
      label: 'Removed Anthropic key',
      undo: () => updateProfile({ anthropicKey: prevKey }),
    });
  }

  function handleRemoveOpenAiKey() {
    const prevKey = profile.openAiKey;
    updateProfile({ openAiKey: '' });
    setEditingVoice(false);
    setNewOpenAiKey('');
    enqueueUndo({
      label: 'Removed OpenAI key',
      undo: () => updateProfile({ openAiKey: prevKey }),
    });
  }

  function handleBugReport() {
    const subject = encodeURIComponent('Aiteall Bug Report');
    const body = encodeURIComponent(
      `Hi — something went wrong in Aiteall.\n\n` +
      `What happened:\n[describe the bug here]\n\n` +
      `Steps to reproduce:\n1.\n2.\n3.\n\n` +
      `Expected:\n\nActual:\n\n` +
      `— Sent from Aiteall beta`
    );
    Linking.openURL(`mailto:samkhadra9@gmail.com?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert('Could not open email', 'Please email samkhadra9@gmail.com directly.')
    );
  }

  function handleWipeData() {
    // CP3.4 exception — account-wipe is the one place where a confirm earns
    // its keep. It is truly unrecoverable (data deleted on servers, user
    // signed out) and an undo snackbar can't bring it back. Even here, we
    // consolidate to a single confirm — no nested "are you really sure?"
    // chain. One brake, no double-tax.
    //
    // CP8.5 — App Store guideline 5.1.1(v) compliance: this also nukes the
    // auth.users row via the delete-account edge function. If the function
    // isn't deployed yet (or unreachable), we fall back to the legacy wipe
    // + sign-out path so the user is never blocked from leaving.
    Alert.alert(
      'Delete account & all data?',
      'This permanently removes your account, profile, projects, tasks, goals, and habits — from this device and our servers. You will be signed out. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: async () => {
            // 1. Try the full account-deletion edge function path
            let fullDeleteOk = false;
            try {
              const { requestAccountDeletion } = await import('../services/sync');
              const r = await requestAccountDeletion();
              fullDeleteOk = !!r.ok;
            } catch (e) {
              console.warn('[Settings] requestAccountDeletion error:', e);
            }
            // 2. Always wipe the local store + AsyncStorage. If the edge
            //    function path failed (delete-account not deployed yet, or
            //    network blip), this still leaves the device clean and
            //    Supabase rows already deleted via deleteAllUserData().
            try {
              await wipeAllData();
            } catch (e) {
              console.warn('[Settings] wipeAllData error:', e);
            }
            // 3. Sign out so no background sync with the current session
            //    can resurrect data. The nav guard will route to Login.
            try {
              await signOut();
            } catch (e) {
              console.warn('[Settings] signOut error:', e);
            }
            if (!fullDeleteOk) {
              // Soft notice — the user is signed out and their data is gone,
              // we just couldn't get the auth row scrubbed automatically.
              // Surface a recourse path so they don't feel stranded.
              setTimeout(() => Alert.alert(
                'Mostly done',
                'Your data is deleted and you are signed out. To remove the auth record itself, email samkhadra9@gmail.com and we will scrub it manually within 24h.',
              ), 250);
            }
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
                placeholderTextColor={C.textTertiary}
              />
            </SettingRow>
          </View>

          {/* API */}
          <SectionLabel label="AI CONNECTION" />
          <View style={styles.card}>
            {/* ── Anthropic key (main AI) ── */}
            {usingProxy ? (
              <View style={styles.envKeyBanner}>
                <Text style={styles.envKeyIcon}>✓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.envKeyTitle}>AI powered by Anthropic</Text>
                  <Text style={styles.envKeySubtitle}>No key needed — tap below to use your own instead</Text>
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
                      placeholderTextColor={C.textTertiary}
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
                      placeholderTextColor={C.textTertiary}
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

          {/* Appearance */}
          <SectionLabel label="APPEARANCE" />
          <View style={styles.themeRow}>
            {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([key, theme]) => {
              const active = (appTheme ?? 'forest') === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.themeSwatch, active && styles.themeSwatchActive]}
                  onPress={() => setTheme(key)}
                  activeOpacity={0.78}
                >
                  {/* Left half: background colour */}
                  <View style={[styles.themeSwatchHalf, { backgroundColor: theme.tokens.background, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 }]} />
                  {/* Right half: primary / accent colour */}
                  <View style={[styles.themeSwatchHalf, { backgroundColor: theme.tokens.primary, borderTopRightRadius: 20, borderBottomRightRadius: 20 }]} />
                  {active && (
                    <View style={styles.themeSwatchCheck}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CP2.3 — adaptive theme: lets the OS handle sunset. */}
          <View style={styles.card}>
            <SettingRow label="Match system dark mode">
              <Switch
                value={!!autoDark}
                onValueChange={setAutoDark}
                trackColor={{ false: C.borderLight, true: C.primary }}
                thumbColor="#fff"
              />
            </SettingRow>
            <Text style={styles.keyHint}>
              When your phone goes dark, the app goes dark too. Your colour theme returns in the morning.
            </Text>
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
                placeholderTextColor={C.textTertiary}
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
                placeholderTextColor={C.textTertiary}
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

          {/* CP5.2 — Proactive note opt-out */}
          <SectionLabel label="PROACTIVE NOTES" />
          <View style={styles.card}>
            <SettingRow label="Quiet check-in (max once a day)">
              <Switch
                value={profile.proactivePushEnabled !== false}
                onValueChange={(v) => {
                  updateProfile({ proactivePushEnabled: v });
                  if (!v) {
                    import('../services/proactivePush')
                      .then(m => m.cancelProactivePush())
                      .catch(() => {});
                  }
                }}
                trackColor={{ false: C.borderLight, true: C.primary }}
                thumbColor="#fff"
              />
            </SettingRow>
            <Text style={styles.keyHint}>
              At most one short note a day, written by your assistant. Skips itself when there's nothing real to say. Turn off any time.
            </Text>
          </View>

          {/* Weekly Review */}
          <SectionLabel label="WEEKLY REVIEW" />
          <View style={styles.card}>
            <View style={{ paddingHorizontal: Spacing.base, paddingTop: 14 }}>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 18 }}>
                One short strategic reset each week. Audit projects and areas, name what moved, set next week's non-negotiables.
              </Text>
            </View>
            <View style={styles.weeklyDayRow}>
              {DAY_LABELS.map((label, idx) => {
                const selected = weeklyDay === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setWeeklyDay(idx)}
                    activeOpacity={0.8}
                    style={[
                      styles.weeklyDayChip,
                      selected && { backgroundColor: C.primary, borderColor: C.primary },
                    ]}
                  >
                    <Text style={[
                      styles.weeklyDayChipText,
                      selected && { color: C.textInverse ?? '#fff' },
                    ]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.divider} />
            <SettingRow label="Time">
              <TextInput
                style={styles.input}
                value={weeklyTime}
                onChangeText={setWeeklyTime}
                placeholder="10:00"
                placeholderTextColor={C.textTertiary}
                keyboardType="numbers-and-punctuation"
              />
            </SettingRow>
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
                <View style={[styles.calDot, { backgroundColor: profile.synapseCalendarId ? C.primary : C.border }]} />
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
                ? <ActivityIndicator size="small" color={C.primary} />
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
                  <Text style={[styles.calTitle, { color: C.error }]}>Remove calendar link</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* CP6.5 — Capture surfaces. iOS won't tell us whether the user
              has actually added the widget / configured the Siri shortcut
              etc. — so we don't fake a status. We list the five paths,
              each tappable to re-open that card from the tour, plus a
              full-walkthrough button at the bottom. */}
          <SectionLabel label="CAPTURE SURFACES" />
          <View style={styles.card}>
            {CAPTURE_SURFACES.map((surface, i) => {
              const isLast = i === CAPTURE_SURFACES.length - 1;
              return (
                <React.Fragment key={surface.id}>
                  <TouchableOpacity
                    style={styles.captureRow}
                    onPress={() => navigation.navigate('CaptureTour', { initialIndex: i })}
                    activeOpacity={0.75}
                  >
                    <View style={styles.captureIconWrap}>
                      <Ionicons name={surface.icon} size={20} color={C.primary} />
                    </View>
                    <View style={styles.captureBody}>
                      <Text style={styles.captureTitle}>{surface.title}</Text>
                      <Text style={styles.captureHowTo} numberOfLines={2}>{surface.howTo}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
                  </TouchableOpacity>
                  {!isLast && <View style={styles.divider} />}
                </React.Fragment>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.captureWalkthroughBtn}
            onPress={() => navigation.navigate('CaptureTour', { initialIndex: 0 })}
            activeOpacity={0.85}
          >
            <Ionicons name="compass-outline" size={16} color={C.textSecondary} />
            <Text style={styles.captureWalkthroughBtnText}>Walk me through these again</Text>
          </TouchableOpacity>

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
            <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
              <View style={styles.calModalHeader}>
                <Text style={styles.calModalTitle}>Choose calendar</Text>
                <TouchableOpacity onPress={() => setShowCalPicker(false)} style={styles.calModalClose}>
                  <Text style={styles.calModalCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.calModalSub}>
                Aiteall will add your project dates to this calendar. Pick any calendar on your device — Apple, Google, iCloud, all work.
              </Text>
              <FlatList
                data={calendarList}
                keyExtractor={c => c.id}
                contentContainerStyle={{ padding: Spacing.base, paddingBottom: 60 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                ListEmptyComponent={
                  <View style={styles.calEmpty}>
                    <Text style={styles.calEmptyText}>No writable calendars found.</Text>
                    <Text style={styles.calEmptySub}>Make sure you have at least one calendar app installed and have granted Aiteall calendar access in iPhone Settings → Privacy → Calendars.</Text>
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
                <Text style={[styles.resetText, { color: C.text, fontWeight: '600' }]}>Rebuild weekly skeleton</Text>
                <Text style={[styles.settingLabel, { marginTop: 2, color: C.textMuted }]}>Redesign your time blocks when your week changes</Text>
              </View>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Beta feedback */}
          <SectionLabel label="BETA" />
          <View style={styles.card}>
            <TouchableOpacity style={styles.resetRow} onPress={handleBugReport} activeOpacity={0.75}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resetText, { color: C.primary, fontWeight: '600' }]}>Report a bug or give feedback</Text>
                <Text style={[styles.settingLabel, { marginTop: 2, color: C.textMuted }]}>Opens your email — goes straight to Sam</Text>
              </View>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Legal */}
          <SectionLabel label="LEGAL" />
          <TouchableOpacity
            style={styles.privacyBtn}
            onPress={() => setShowPrivacy(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.privacyBtnText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
          </TouchableOpacity>

          {/* Account */}
          <SectionLabel label="ACCOUNT" />
          <View style={styles.card}>
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
              <Text style={[styles.resetText, { color: C.textSecondary }]}>Sign out</Text>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.resetRow}
              onPress={handleWipeData}
            >
              <Text style={[styles.resetText, { color: '#DC2626' }]}>Delete account</Text>
              <Text style={styles.resetArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        <Modal visible={showPrivacy} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPrivacy(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            <View style={styles.privacyHeader}>
              <Text style={styles.privacyTitle}>Privacy Policy</Text>
              <TouchableOpacity onPress={() => setShowPrivacy(false)} style={styles.privacyClose}>
                <Text style={{ fontSize: 15, color: C.textSecondary, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.privacyScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.privacySection}>Your data, simply explained</Text>

              <Text style={styles.privacyHeading}>What stays on your device</Text>
              <Text style={styles.privacyBody}>
                Your tasks, habits, areas, goals, and daily logs are stored locally on your device using encrypted storage. You own this data entirely.
              </Text>

              <Text style={styles.privacyHeading}>What's stored in the cloud</Text>
              <Text style={styles.privacyBody}>
                If you're signed in, your data syncs to a secure database (Supabase) so it persists across devices. This database is private to you — no one else can access it.
              </Text>

              <Text style={styles.privacyHeading}>AI features and Anthropic</Text>
              <Text style={styles.privacyBody}>
                When you use AI features (morning planning, project breakdown, chat), the content of that conversation is sent to the Anthropic API to generate a response. This is a one-time processing call — Anthropic does not store your prompts or responses beyond 7 days, and your data is never used to train AI models.
              </Text>
              <Text style={styles.privacyBody}>
                Anthropic's API terms explicitly exclude API usage from model training. Your personal context (tasks, goals, areas) is included in prompts to make the AI useful, but it is not retained by Anthropic after the 7-day automatic deletion window.
              </Text>

              <Text style={styles.privacyHeading}>No advertising, no selling data</Text>
              <Text style={styles.privacyBody}>
                Aiteall has no advertisers and does not sell, share, or monetise your personal data in any way. The app is a tool for you.
              </Text>

              <Text style={styles.privacyHeading}>Your rights</Text>
              <Text style={styles.privacyBody}>
                You can delete all your data at any time from Settings → Danger Zone → Wipe all data. Signing out removes your session. You may request full data deletion by contacting us.
              </Text>

              <Text style={[styles.privacyBody, { color: C.textTertiary, marginTop: 24 }]}>
                For Anthropic's full API privacy policy, visit anthropic.com/privacy
              </Text>

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    content:   { padding: Spacing.base, paddingTop: Spacing.base },

    pageTitle: {
      fontSize: 38, fontWeight: '800', color: C.textPrimary,
      letterSpacing: -1.5, marginBottom: Spacing.lg, lineHeight: 40,
    },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.textTertiary,
      letterSpacing: 1.2, marginBottom: 8, marginTop: Spacing.base,
      marginLeft: 2, textTransform: 'uppercase',
    },

    // Cards — bordered, no heavy shadow
    card: {
      backgroundColor: C.surface, borderRadius: Radius.xl,
      overflow: 'hidden', borderWidth: 1, borderColor: C.border,
    },
    divider: { height: 1, backgroundColor: C.borderLight, marginHorizontal: Spacing.base },

    settingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.base, paddingVertical: 16,
    },
    settingLabel:   { fontSize: 16, color: C.textPrimary, fontWeight: '500' },
    settingControl: { flex: 1, alignItems: 'flex-end' },

    input: {
      fontSize: 15, color: C.textPrimary, textAlign: 'right',
      backgroundColor: C.surfaceSecondary, borderRadius: Radius.sm,
      paddingHorizontal: 12, paddingVertical: 8, minWidth: 120,
      borderWidth: 1, borderColor: C.border,
    },

    keyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    keyInput:    { maxWidth: 160, textAlign: 'left' },
    showBtn:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.surfaceSecondary, borderRadius: Radius.full, borderWidth: 1, borderColor: C.border },
    showBtnText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },

    keyHint: {
      fontSize: 12, color: C.textTertiary, lineHeight: 18,
      paddingHorizontal: Spacing.base, paddingBottom: 14, marginTop: -4,
    },

    testNotifBtn: {
      marginHorizontal: Spacing.base, marginBottom: Spacing.base,
      paddingVertical: 10, borderRadius: Radius.sm,
      borderWidth: 1.5, borderColor: C.border,
      alignItems: 'center',
    },
    testNotifBtnText: {
      fontSize: 13, color: C.textSecondary, fontWeight: '500',
    },

    // ── Weekly review day picker ──────────────────────────────────────────
    weeklyDayRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
    },
    weeklyDayChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceSecondary,
      minWidth: 46,
      alignItems: 'center',
    },
    weeklyDayChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textSecondary,
      letterSpacing: 0.3,
    },

    // Masked key display
    keyMaskedRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.base, paddingVertical: 16,
    },
    keyMaskedLeft:    { gap: 4 },
    keyMaskedLabel:   { fontSize: 16, color: C.textPrimary, fontWeight: '500' },
    keyMaskedValue:   { fontSize: 13, color: C.textTertiary, fontFamily: 'monospace' },
    keyMaskedActions: { flexDirection: 'row', gap: 8 },
    keyChangeBtn:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.primaryLight, borderRadius: Radius.full },
    keyChangeBtnText: { fontSize: 13, color: C.primary, fontWeight: '600' },
    keyRemoveBtn:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.surfaceSecondary, borderRadius: Radius.full },
    keyRemoveBtnText: { fontSize: 13, color: C.error, fontWeight: '600' },

    envKeyBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      padding: Spacing.base,
    },
    envKeyIcon:     { fontSize: 20, color: C.success },
    envKeyTitle:    { fontSize: 15, fontWeight: '700', color: C.success },
    envKeySubtitle: { fontSize: 12, color: C.textTertiary, marginTop: 2 },

    // Black pill save button
    saveBtn: {
      backgroundColor: C.ink, borderRadius: Radius.full,
      paddingVertical: 18, alignItems: 'center', marginTop: Spacing.lg,
    },
    saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },

    resumeRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.base, paddingVertical: 16,
    },
    resumeText: { fontSize: 16, color: C.primary, fontWeight: '600' },
    resumeSub:  { fontSize: 12, color: C.textTertiary, marginTop: 3 },

    resetRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.base, paddingVertical: 17,
    },
    resetText:  { fontSize: 16, color: C.error, fontWeight: '500' },
    resetArrow: { fontSize: 20, color: C.textTertiary },

    // Calendar sync section
    calRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.base, paddingVertical: 16,
    },
    calLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    calDot:   { width: 12, height: 12, borderRadius: 6 },
    calTitle: { fontSize: 16, color: C.textPrimary, fontWeight: '500' },
    calSub:   { fontSize: 12, color: C.textTertiary, marginTop: 2 },

    // Calendar picker modal
    calModalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: 8,
    },
    calModalTitle:     { fontSize: 28, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.8 },
    calModalClose:     { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.ink, borderRadius: Radius.full },
    calModalCloseText: { fontSize: 14, color: '#FFF', fontWeight: '700' },
    calModalSub: {
      fontSize: 14, color: C.textSecondary, lineHeight: 21,
      paddingHorizontal: Spacing.base, paddingBottom: Spacing.base,
    },
    calPickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderRadius: Radius.xl,
      padding: 16, borderWidth: 1.5, borderColor: C.border,
    },
    calPickerRowSelected: { borderColor: C.primary, backgroundColor: C.primaryLight },
    calPickerDot:         { width: 14, height: 14, borderRadius: 7 },
    calPickerTitle:       { fontSize: 16, color: C.textPrimary, fontWeight: '600' },
    calPickerType:        { fontSize: 12, color: C.textTertiary, marginTop: 2, textTransform: 'capitalize' },
    calPickerCheck:       { fontSize: 18, color: C.primary, fontWeight: '700' },
    calEmpty:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    calEmptyText: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 10 },
    calEmptySub:  { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },

    // CP6.5 — capture surfaces panel
    captureRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: Spacing.base, paddingVertical: 14,
    },
    captureIconWrap: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.primaryLight ?? C.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
    },
    captureBody:  { flex: 1, gap: 2 },
    captureTitle: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
    captureHowTo: { fontSize: 12, color: C.textTertiary, lineHeight: 17 },

    captureWalkthroughBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 10,
      paddingVertical: 13, paddingHorizontal: Spacing.base,
      backgroundColor: C.surfaceSecondary,
      borderRadius: Radius.full,
      borderWidth: 1, borderColor: C.border,
    },
    captureWalkthroughBtnText: {
      fontSize: 14, fontWeight: '600', color: C.textSecondary,
    },

    // Theme picker
    themeRow: { flexDirection: 'row', gap: 12 },
    themeSwatch: {
      width: 56, height: 40,
      borderRadius: 20, overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: 2, borderColor: C.border,
    },
    themeSwatchActive: { borderColor: C.primary, borderWidth: 2.5 },
    themeSwatchHalf:   { flex: 1 },
    themeSwatchCheck:  {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    // Legacy — kept to avoid TS errors if referenced elsewhere
    themeChip: { flex: 1 },
    themePreviewBox: {},
    themePreviewBg: {},
    themePreviewPrimary: {},
    themeChipLabel: {},
    themeActive: {},

    // Privacy policy
    privacyBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: 14, backgroundColor: C.surface, borderRadius: Radius.md, marginHorizontal: Spacing.base, marginBottom: 8, borderWidth: 1, borderColor: C.border },
    privacyBtnText:{ fontSize: 15, color: C.textPrimary, fontWeight: '500' },
    privacyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight },
    privacyTitle:  { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    privacyClose:  { padding: 4 },
    privacyScroll: { padding: Spacing.lg },
    privacySection:{ fontSize: 24, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.5, marginBottom: Spacing.lg },
    privacyHeading:{ fontSize: 15, fontWeight: '700', color: C.textPrimary, marginTop: Spacing.lg, marginBottom: 6 },
    privacyBody:   { fontSize: 14, color: C.textSecondary, lineHeight: 22 },
  });
}
