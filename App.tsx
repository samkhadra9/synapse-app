import React, { useEffect } from 'react';
import { View, InteractionManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import FifteenBanner from './src/components/FifteenBanner';
import UndoSnackbar from './src/components/UndoSnackbar';
import { installSharedStateSync } from './src/services/sharedState';
import { installQuickActions } from './src/services/quickActions';
// CP10.1 — Crash-free session audit
import ErrorBoundary from './src/components/ErrorBoundary';
import { installGlobalErrorHandler } from './src/services/diagnostics';
// NotificationHandler is wired inside RootNavigator (needs NavigationContainer context)

// CP10.1 — install at module-eval so unhandled errors during the very first
// render tick are still captured. Idempotent; safe to call again.
installGlobalErrorHandler();

/**
 * CP2.0 / CP2 hotfix — splash minimization.
 *
 * Aiteall has no logo. The splash screen is a purely mechanical concession
 * to native bundle-load time. We prevent the system from auto-hiding it
 * (so we control the moment it disappears) and then hide it as soon as
 * the root component mounts — the earliest possible moment JS is ready.
 *
 * The result: a 1x1 transparent PNG on a theme-matched background, visible
 * for only the time it takes the JS bundle to evaluate. No branding. No
 * "app load" moment. Closest thing to instant the framework allows.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden or not supported — either way, proceed */
});

export default function App() {
  useEffect(() => {
    // Hide on the first render tick. The native layer keeps the splash
    // drawn until we release it; release it now that React is painting.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // CP4.1b — mirror theOne to the App Group shared container so the
  // home-screen widget can read it. First write happens immediately;
  // subsequent writes fire whenever tasks change.
  //
  // CP10.2 — Cold-start latency budget: defer both side-effect installers
  // until after the first interaction frame. Neither blocks the user from
  // seeing/tapping the home screen, and pushing them past
  // InteractionManager.runAfterInteractions trims a measurable slice off
  // time-to-interactive on cold launch.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      unsub = installSharedStateSync();
    });
    return () => {
      handle.cancel?.();
      unsub?.();
    };
  }, []);

  // CP4.1d — register long-press app-icon quick actions and route any
  // taps (including the one that cold-launched the app) into the
  // matching deep link.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      cleanup = installQuickActions();
    });
    return () => {
      handle.cancel?.();
      cleanup?.();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {/* CP10.1 — Wrap the entire app shell in an error boundary so a render
            crash anywhere in the tree falls back to a calm "try again" screen
            rather than a white screen. The boundary records the error to the
            on-device diagnostics buffer (no network). */}
        <ErrorBoundary label="root">
          <View style={{ flex: 1 }}>
            <RootNavigator />
            {/* Floats above the active screen while a 15-min session is live.
                Renders nothing when inactive. */}
            <FifteenBanner />
            {/* CP3.4 — 10-second undo window for destructive actions. Renders
                nothing when the queue is empty. Wrapped inside SafeAreaProvider
                so it can pull correct bottom-inset padding on devices with
                home indicators. */}
            <UndoSnackbar />
          </View>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
