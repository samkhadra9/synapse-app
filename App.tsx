import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParams } from './src/navigation';
import { RootNavigator } from './src/navigation';
import { addNotificationResponseListener } from './src/services/notifications';

/**
 * Notification deep-link handler — lives inside the navigator so it
 * has access to the navigation context.
 */
function NotificationHandler() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();

  useEffect(() => {
    const cleanup = addNotificationResponseListener((screen) => {
      switch (screen) {
        case 'MorningPlanning':
          navigation.navigate('Chat', { mode: 'morning' });
          break;
        case 'EveningReview':
          navigation.navigate('Chat', { mode: 'evening' });
          break;
        case 'QuickWin':
          navigation.navigate('Chat', { mode: 'quick' });
          break;
        default:
          break;
      }
    });
    return cleanup;
  }, [navigation]);

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
