import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParams } from '../../navigation';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { useStore } from '../../store/useStore';
import { requestPermissions, scheduleDailyNotifications, sendTestNotification } from '../../services/notifications';

type Props = { navigation: NativeStackNavigationProp<RootStackParams, any> };

const TIME_PRESETS = [
  { label: '6:00 AM', value: '06:00' },
  { label: '7:00 AM', value: '07:00' },
  { label: '7:30 AM', value: '07:30' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
];

const EVENING_PRESETS = [
  { label: '8:00 PM', value: '20:00' },
  { label: '8:30 PM', value: '20:30' },
  { label: '9:00 PM', value: '21:00' },
  { label: '9:30 PM', value: '21:30' },
  { label: '10:00 PM', value: '22:00' },
];

export default function SMSSetupScreen({ navigation }: Props) {
  const updateProfile = useStore(s => s.updateProfile);
  const profile = useStore(s => s.profile);

  const [phone, setPhone] = useState(profile.phone ?? '');
  const [morningTime, setMorningTime] = useState(profile.morningTime ?? '07:30');
  const [eveningTime, setEveningTime] = useState(profile.eveningTime ?? '21:00');
  const [anthropicKey, setAnthropicKey] = useState(profile.anthropicKey ?? '');
  const [backendUrl, setBackendUrl] = useState(profile.backendUrl ?? '');
  const [notifGranted, setNotifGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatPhone = (text: string) => {
    // Strip non-digits, keep + prefix
    const stripped = text.replace(/[^\d+]/g, '');
    setPhone(stripped);
  };

  const enableNotifications = async () => {
    const granted = await requestPermissions();
    if (granted) {
      await scheduleDailyNotifications(morningTime, eveningTime);
      setNotifGranted(true);
      await sendTestNotification();
      Alert.alert(
        '🔔 Notifications enabled!',
        "You'll get a test notification in 2 seconds. Morning planning, midday check-in, and evening review are all set."
      );
    } else {
      Alert.alert(
        'Notifications blocked',
        'To get SMS-style reminders, go to Settings > Aiteall > Notifications and enable them.'
      );
    }
  };

  const finish = async () => {
    setLoading(true);
    try {
      updateProfile({
        phone: phone.trim(),
        morningTime,
        eveningTime,
        anthropicKey: anthropicKey.trim(),
        backendUrl: backendUrl.trim(),
      });

      if (notifGranted) {
        await scheduleDailyNotifications(morningTime, eveningTime);
      }

      updateProfile({ onboardingCompleted: true });
      // Navigation to Main handled automatically by onboarding gate in navigator
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={20}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.step}>Step 3 of 3</Text>
            <Text style={styles.title}>Set up your reminders</Text>
            <Text style={styles.sub}>
              Aiteall works best when you start and end each day intentionally. Set your planning windows and we'll nudge you at the right time.
            </Text>
          </View>

          {/* Morning time */}
          <View style={[styles.section, Shadow.sm]}>
            <Text style={styles.sectionTitle}>🌅  Morning planning time</Text>
            <Text style={styles.sectionSub}>When should we prompt you to plan your day?</Text>
            <View style={styles.presets}>
              {TIME_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.preset, morningTime === p.value && styles.presetActive]}
                  onPress={() => setMorningTime(p.value)}
                >
                  <Text style={[styles.presetText, morningTime === p.value && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Evening time */}
          <View style={[styles.section, Shadow.sm]}>
            <Text style={styles.sectionTitle}>🌙  Evening review time</Text>
            <Text style={styles.sectionSub}>When should we prompt your end-of-day reflection?</Text>
            <View style={styles.presets}>
              {EVENING_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.preset, eveningTime === p.value && styles.presetActive]}
                  onPress={() => setEveningTime(p.value)}
                >
                  <Text style={[styles.presetText, eveningTime === p.value && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notifications CTA */}
          <TouchableOpacity
            style={[styles.notifBtn, notifGranted && styles.notifGranted]}
            onPress={enableNotifications}
            activeOpacity={0.85}
          >
            <Text style={styles.notifBtnText}>
              {notifGranted ? '✅  Notifications enabled' : '🔔  Enable push notifications'}
            </Text>
          </TouchableOpacity>

          {/* Phone for SMS */}
          <View style={[styles.section, Shadow.sm]}>
            <Text style={styles.sectionTitle}>📱  SMS text reminders (optional)</Text>
            <Text style={styles.sectionSub}>
              Get a morning text you can reply to — Aiteall will structure your reply and add it to your plan. Requires the Aiteall backend to be set up (see README).
            </Text>
            <TextInput
              style={styles.input}
              placeholder="+44 7700 900000"
              placeholderTextColor={Colors.textLight}
              value={phone}
              onChangeText={formatPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </View>

          {/* API keys */}
          <View style={[styles.section, Shadow.sm]}>
            <Text style={styles.sectionTitle}>🤖  AI assistant</Text>
            <Text style={styles.sectionSub}>
              Add your Anthropic API key to unlock Claude-powered planning and project breakdown. Get yours at console.anthropic.com. Stored only on your device.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="sk-ant-..."
              placeholderTextColor={Colors.textLight}
              value={anthropicKey}
              onChangeText={setAnthropicKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.sectionSub, { marginTop: 12 }]}>
              Backend URL (for SMS features):
            </Text>
            <TextInput
              style={styles.input}
              placeholder="https://your-backend.railway.app"
              placeholderTextColor={Colors.textLight}
              value={backendUrl}
              onChangeText={setBackendUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={finish}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? 'Setting up…' : "Let's go →"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerNote}>
              You can change all of this in Settings anytime
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.xl, paddingBottom: Spacing['3xl'] },
  header: { marginBottom: Spacing.xl },
  step: { fontSize: Typography.size.sm, color: Colors.primary, fontWeight: Typography.weight.semibold, marginBottom: 8 },
  title: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.heavy, color: Colors.textPrimary, marginBottom: 10 },
  sub: { fontSize: Typography.size.base, color: Colors.textMuted, lineHeight: 22 },
  section: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  sectionTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: Colors.textPrimary, marginBottom: 4 },
  sectionSub: { fontSize: Typography.size.sm, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.gray100,
  },
  presetActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  presetText: { fontSize: Typography.size.sm, color: Colors.gray600, fontWeight: Typography.weight.medium },
  presetTextActive: { color: Colors.white, fontWeight: Typography.weight.bold },
  notifBtn: {
    backgroundColor: Colors.textPrimary, borderRadius: Radius.lg,
    paddingVertical: 16, alignItems: 'center', marginBottom: Spacing.base,
  },
  notifGranted: { backgroundColor: Colors.success },
  notifBtnText: { color: Colors.white, fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.size.base, color: Colors.text,
    backgroundColor: Colors.background,
  },
  footer: { alignItems: 'center', marginTop: Spacing.sm },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 18, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  btnText: { color: Colors.white, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },
  footerNote: { fontSize: Typography.size.xs, color: Colors.textLight, textAlign: 'center' },
});
