import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import FifteenBanner from './src/components/FifteenBanner';
// NotificationHandler is wired inside RootNavigator (needs NavigationContainer context)

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        <RootNavigator />
        {/* Floats above the active screen while a 15-min session is live.
            Renders nothing when inactive. */}
        <FifteenBanner />
      </View>
    </GestureHandlerRootView>
  );
}
