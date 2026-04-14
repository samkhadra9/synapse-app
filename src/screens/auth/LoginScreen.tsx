/**
 * LoginScreen — Synapse v3
 * Aesthetic: editorial, clean, Abby Health-inspired.
 * Pure white · near-black headings · deep teal accent · pill buttons
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../theme';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store/useStore';

export default function LoginScreen() {
  const { setSession } = useStore();

  const [mode,     setMode]     = useState<'login' | 'signup'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleAuth() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: password.trim(),
        });
        if (error) throw error;
        setSession(data.session);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password: password.trim(),
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation required — loading will be cleared by finally block
          Alert.alert(
            'Check your email',
            'We sent you a confirmation link. Click it then come back to sign in.',
            [{ text: 'OK', onPress: () => setMode('login') }]
          );
        } else {
          setSession(data.session);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Enter your email first');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Email sent', 'Check your inbox for a password reset link.');
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Hero heading ─────────────────────────────────────────────── */}
          <View style={s.hero}>
            <Text style={s.wordmark}>Synapse</Text>
            <Text style={s.heroHeading}>
              {mode === 'login' ? 'Welcome\nback.' : 'Get\nstarted.'}
            </Text>
            <Text style={s.heroSub}>
              {mode === 'login'
                ? 'Your operating system\nfor intentional living.'
                : 'Build the life you mean to live.'}
            </Text>
          </View>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <View style={s.form}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>

            <View style={[s.fieldWrap, { marginTop: 16 }]}>
              <Text style={s.fieldLabel}>Password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onSubmitEditing={handleAuth}
                returnKeyType="go"
              />
            </View>

            {mode === 'login' && (
              <TouchableOpacity onPress={handleForgotPassword} style={s.forgotRow}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Primary pill button — near-black like Abby */}
            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* ── Toggle ───────────────────────────────────────────────────── */}
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>
              {mode === 'login' ? "Don't have an account?" : 'Already have one?'}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              <Text style={s.toggleLink}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={s.privacy}>Your data is encrypted and only accessible to you.</Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  kav:    { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 48 },

  // Hero
  hero:        { marginBottom: 48, marginTop: 16 },
  wordmark: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 24,
  },
  heroHeading: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 54,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  heroSub: {
    fontSize: 18,
    color: Colors.textSecondary,
    lineHeight: 27,
    fontWeight: '400',
  },

  // Form
  form:       { marginBottom: 32 },
  fieldWrap:  {},
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  forgotRow: { alignSelf: 'flex-end', marginTop: 12, marginBottom: 4 },
  forgotText: { fontSize: 14, color: Colors.primary, fontWeight: '500' },

  // Pill button — near-black (Abby style)
  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.full,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 28,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Toggle
  toggleRow:   { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
  toggleLabel: { fontSize: 14, color: Colors.textSecondary },
  toggleLink:  { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // Privacy
  privacy: { textAlign: 'center', fontSize: 12, color: Colors.textTertiary },
});
