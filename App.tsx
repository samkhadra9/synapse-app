import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation';
import FifteenBanner from './src/components/FifteenBanner';
// NotificationHandler is wired inside RootNavigator (needs NavigationContainer context)

export default function App() {
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
