/**
 * WelcomeScreen — Synapse v3
 *
 * Explains what Synapse is before asking anything of the user.
 * Three concrete value props + clear onboarding CTA.
 * Aesthetic: editorial, pure white, Abby Health-inspired.
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, StatusBar, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../../theme';

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

const PILLARS = [
  {
    label: 'CAPTURE',
    title: 'Brain dump, structured.',
    body: "Talk or type anything on your mind. Synapse sorts it into projects, tasks, and priorities — so nothing gets lost and nothing takes up mental space unnecessarily.",
  },
  {
    label: 'PLAN',
    title: 'A real plan for today.',
    body: "Every morning, Synapse pulls your overdue tasks, active projects, and goals into a time-blocked sequence. Three priorities. Realistic timing. A day you can actually execute.",
  },
  {
    label: 'BUILD',
    title: 'Toward the life you mean to live.',
    body: "Your tasks connect to your projects. Your projects connect to your goals. Over time, you can see whether what you're doing daily is actually building what you want long-term.",
  },
];

export default function WelcomeScreen({ navigation }: any) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(btnAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <Animated.View style={[s.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={s.wordmark}>Synapse</Text>
            <Text style={s.heading}>Build the life{'\n'}you mean to live.</Text>
            <Text style={s.headingAccent}>Intentionally.</Text>
            <Text style={s.sub}>
              A personal operating system for people who want
              momentum — not just another to-do list.
            </Text>
          </Animated.View>

          {/* ── Pillars ───────────────────────────────────────────────── */}
          <Animated.View style={[s.pillars, { opacity: fadeAnim }]}>
            {PILLARS.map((p, i) => (
              <View key={i} style={s.pillar}>
                <View style={s.pillarAccent} />
                <View style={s.pillarBody}>
                  <Text style={s.pillarLabel}>{p.label}</Text>
                  <Text style={s.pillarTitle}>{p.title}</Text>
                  <Text style={s.pillarText}>{p.body}</Text>
                </View>
              </View>
            ))}
          </Animated.View>

          {/* ── How it works note ─────────────────────────────────────── */}
          <Animated.View style={[s.howItWorks, { opacity: fadeAnim }]}>
            <Text style={s.howItWorksText}>
              Setup takes about 5 minutes. Synapse will ask you about your life, build your Areas and Projects, then help you design a weekly time structure that actually fits how you work.
            </Text>
          </Animated.View>

          {/* ── CTA area ─────────────────────────────────────────────── */}
          <Animated.View style={[s.cta, { opacity: btnAnim }]}>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.navigate('OnboardingChat')}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Set up my system →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryBtnText}>Explore first</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={s.settingsLink}
            >
              <Text style={s.settingsLinkText}>
                {ENV_API_KEY ? '✓ API key loaded' : 'Settings & API key'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe:      { flex: 1 },
  scroll:    {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: { paddingBottom: 36 },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 28,
  },
  heading: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.6,
    lineHeight: 46,
    color: Colors.textPrimary,
  },
  headingAccent: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.6,
    lineHeight: 50,
    color: Colors.primary,
    marginBottom: 20,
  },
  sub: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 26,
    fontWeight: '400',
  },

  // ── Pillars ───────────────────────────────────────────────────────────────
  pillars: { gap: 12, marginBottom: 28 },
  pillar: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  pillarAccent: {
    width: 3,
    backgroundColor: Colors.primary,
  },
  pillarBody: { flex: 1, padding: 16, gap: 4 },
  pillarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pillarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  pillarText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // ── How it works ──────────────────────────────────────────────────────────
  howItWorks: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  howItWorksText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  cta: { gap: 12 },
  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.full,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  settingsLink:     { alignItems: 'center', paddingVertical: 8 },
  settingsLinkText: { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },
});
