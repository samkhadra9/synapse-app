/**
 * WelcomeScreen — Synapse v3
 * Aesthetic: editorial, pure white, Abby Health-inspired.
 * Large near-black heading · teal accent line · black pill button
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../../theme';

const ENV_API_KEY = (process.env.EXPO_PUBLIC_OPENAI_KEY ?? '').trim();

export default function WelcomeScreen({ navigation }: any) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const btnAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
      Animated.timing(btnAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={s.safe}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <Animated.View style={[s.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={s.wordmark}>Synapse</Text>

          {/* Abby-style two-line heading — black + teal */}
          <Text style={s.heading}>Build the life{'\n'}you mean to live.</Text>
          <Text style={s.headingAccent}>Intentionally.</Text>

          <Text style={s.sub}>
            A personal operating system for people who want{'\n'}
            momentum, not just a to-do list.
          </Text>
        </Animated.View>

        {/* ── CTA area ─────────────────────────────────────────────────── */}
        <Animated.View style={[s.cta, { opacity: btnAnim }]}>
          {/* Black pill — primary action */}
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => navigation.navigate('OnboardingChat')}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Get started</Text>
          </TouchableOpacity>

          {/* Ghost / text secondary actions */}
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

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safe: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 12,
  },

  // Hero
  hero: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  wordmark: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 32,
  },
  heading: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 50,
    color: Colors.textPrimary,
    marginBottom: 0,
  },
  headingAccent: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 54,
    color: Colors.primary,
    marginBottom: 24,
  },
  sub: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 26,
    fontWeight: '400',
  },

  // CTA
  cta: { paddingBottom: Spacing.lg, gap: 12 },
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
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  settingsLink:     { alignItems: 'center', paddingVertical: 8 },
  settingsLinkText: { fontSize: 13, color: Colors.textTertiary, fontWeight: '500' },
});
