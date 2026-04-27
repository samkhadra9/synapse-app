/**
 * CP10.1 — Crash-free session audit.
 *
 * A lightweight, privacy-respecting error boundary. We deliberately do
 * *not* ship a full crash SDK (Sentry, Crashlytics) for v1: the bundle
 * cost, runtime cost, and privacy footprint don't pay back in the closed
 * TestFlight wave. Apple's TestFlight crash reporter catches native +
 * unhandled JS exceptions for free; this component catches the *handled*
 * case where a render throws and we'd otherwise show a white screen.
 *
 * What it does:
 *   - Catches render-time errors anywhere in the tree below it.
 *   - Renders a calm fallback ("Something stumbled. Try again, or restart
 *     the app.") instead of a white screen.
 *   - Logs the error to the in-memory diagnostics buffer (see
 *     services/diagnostics.ts) so we have the last few errors available
 *     if the user opens Settings → Send feedback.
 *   - Provides a "Try again" reset that clears the error and re-renders.
 *
 * What it does NOT do:
 *   - It does not phone home. No network calls. No PII leaves the device.
 *   - It does not log message contents — only stack frames + a short
 *     anonymised string of the error message.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { recordRuntimeError } from '../services/diagnostics';

interface Props {
  children: React.ReactNode;
  /** Optional label to identify which boundary tripped (e.g. 'root', 'chat'). */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    // Local-only — no network, no third-party SDK.
    recordRuntimeError({
      label: this.props.label ?? 'unlabeled',
      message: this.state.message ?? String(err),
      componentStack: info?.componentStack,
    });
  }

  reset = () => {
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something stumbled.</Text>
        <Text style={styles.body}>
          Aiteall hit a snag. Your data is fine — it lives on your phone.
          Try again, or close and reopen the app.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={this.reset}
          activeOpacity={0.8}
          accessibilityLabel="Try again"
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#FFFDF8',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
  },
  btn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 999,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
