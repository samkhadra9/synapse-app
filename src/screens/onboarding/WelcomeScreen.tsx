/**
 * WelcomeScreen — Solas v3
 *
 * Explains what Solas is before asking anything of the user.
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

const ENV_API_KEY = (process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '').trim();

const PILLARS = [
  { label: 'CAPTURE', body: 'Brain-dump into chat. Aiteall sorts it.' },
  { label: 'PLAN',    body: 'Three priorities. Time-blocked. Every morning.' },
  { label: 'BUILD',   body: 'Tasks → projects → the life you want.' },
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
            <Text style={s.wordmark}>Aiteall</Text>
            <Text style={s.heading}>A calmer way{'\n'}to run your life.</Text>
            <Text style={s.sub}>
              Chat with an AI that helps you plan, focus, and
              follow through — built for ADHD brains.
            </Text>
          </Animated.View>

          {/* ── Pillars ───────────────────────────────────────────────── */}
          <Animated.View style={[s.pillars, { opacity: fadeAnim }]}>
            {PILLARS.map((p, i) => (
              <View key={i} style={s.pillar}>
                <Text style={s.pillarLabel}>{p.label}</Text>
                <Text style={s.pillarText}>{p.body}</Text>
              </View>
            ))}
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
  pillars: { gap: 14, marginBottom: 32 },
  pillar: {
    gap: 4,
    paddingVertical: 4,
  },
  pillarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pillarText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
    fontWeight: '500',
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
