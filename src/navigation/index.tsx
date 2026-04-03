/**
 * Synapse V2 Navigation
 *
 * Auth flow:
 *   No session  → LoginScreen
 *   Has session → Onboarding OR Main app
 *
 * Main app flow:
 *   Onboarding: Welcome → OnboardingChat
 *   Main App:   Tab navigator (Dashboard | Projects | Goals | Settings)
 *               + Modal stack for Chat, DeepWork, ProjectDetail
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, ActivityIndicator, View } from 'react-native';
import { Colors } from '../theme';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { pullAll } from '../services/sync';

// Screens
import LoginScreen            from '../screens/auth/LoginScreen';
import WelcomeScreen          from '../screens/onboarding/WelcomeScreen';
import OnboardingChatScreen   from '../screens/onboarding/OnboardingChatScreen';
import DashboardScreen        from '../screens/DashboardScreen';
import ChatScreen             from '../screens/ChatScreen';
import ProjectsScreen         from '../screens/ProjectsScreen';
import ProjectDetailScreen    from '../screens/ProjectDetailScreen';
import GoalsScreen            from '../screens/GoalsScreen';
import SettingsScreen         from '../screens/SettingsScreen';
import DeepWorkScreen         from '../screens/DeepWorkScreen';

// ── Param types ───────────────────────────────────────────────────────────────

export type RootStackParams = {
  Welcome:         undefined;
  OnboardingChat:  undefined;
  Settings:        undefined;
  Main:            undefined;
  Chat:            { mode: 'dump' | 'morning' | 'project' | 'evening' | 'weeklyReview' };
  DeepWork:        undefined;
  ProjectDetail:   { projectId: string };
};

export type TabParams = {
  Dashboard: undefined;
  Projects:  undefined;
  Goals:     undefined;
  Settings:  undefined;
};

// ── Navigators ────────────────────────────────────────────────────────────────

type AuthStackParams = { Login: undefined };

const Stack     = createNativeStackNavigator<RootStackParams>();
const AuthStack = createNativeStackNavigator<AuthStackParams>();
const Tab       = createBottomTabNavigator<TabParams>();

// Tab icons
const TAB_ICONS: Record<string, string> = {
  Dashboard: '⚡',
  Projects:  '📁',
  Goals:     '🎯',
  Settings:  '⚙️',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.borderLight,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabel: ({ focused, color }) => (
          <Text style={{ fontSize: 11, color, fontWeight: focused ? '600' : '400', marginBottom: 2 }}>
            {route.name}
          </Text>
        ),
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 20 }}>{TAB_ICONS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Projects"  component={ProjectsScreen} />
      <Tab.Screen name="Goals"     component={GoalsScreen} />
      <Tab.Screen name="Settings"  component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Auth-gated app navigator ──────────────────────────────────────────────────

function AppNavigator() {
  const { profile, session, setSession, updateProfile, areas, projects, tasks, habits, goals, deepWorkSessions } = useStore();
  const [hydrating, setHydrating] = React.useState(false);

  // Listen for Supabase auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) setSession(s);
    });

    // Subscribe to future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);

        // On login: pull data from Supabase and hydrate store
        if (s) {
          setHydrating(true);
          try {
            const result = await pullAll();
            // Only hydrate if server has data (non-empty profile means returning user)
            if (result.profile) {
              updateProfile(result.profile);
            }
            if (result.areas.length > 0) {
              useStore.setState({ areas: result.areas });
            }
            if (result.projects.length > 0) {
              useStore.setState({ projects: result.projects });
            }
            if (result.tasks.length > 0) {
              useStore.setState({ tasks: result.tasks });
            }
            if (result.habits.length > 0) {
              useStore.setState({ habits: result.habits });
            }
            if (result.goals.length > 0) {
              useStore.setState({ goals: result.goals });
            }
            if (result.deepWorkSessions.length > 0) {
              useStore.setState({ deepWorkSessions: result.deepWorkSessions });
            }
          } catch (e) {
            console.warn('[nav] pullAll failed:', e);
          } finally {
            setHydrating(false);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Show spinner while pulling data after login
  if (hydrating) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // Not logged in — show auth screen
  if (!session) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
      </AuthStack.Navigator>
    );
  }

  const isOnboarded = profile.onboardingCompleted;

  return (
    <Stack.Navigator
      initialRouteName={isOnboarded ? 'Main' : 'Welcome'}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {/* Onboarding */}
      <Stack.Screen name="Welcome"        component={WelcomeScreen} />
      <Stack.Screen
        name="OnboardingChat"
        component={OnboardingChatScreen}
        options={{
          headerShown: true,
          headerTitle: '',
          headerBackTitle: 'Back',
          headerTintColor: Colors.primary,
          headerStyle: { backgroundColor: Colors.surface },
          headerShadowVisible: false,
        }}
      />

      {/* Settings accessible before and after onboarding */}
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerBackTitle: 'Back',
          headerTintColor: Colors.primary,
          headerStyle: { backgroundColor: Colors.surface },
          headerShadowVisible: false,
        }}
      />

      {/* Main app */}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{
          headerShown: true,
          headerTitle: 'Project',
          headerBackTitle: 'Back',
          headerTintColor: Colors.primary,
          headerStyle: { backgroundColor: Colors.surface },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="DeepWork"
        component={DeepWorkScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          headerShown: false,
          gestureEnabled: false,   // must tap End Session — no swipe away
        }}
      />
    </Stack.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────

export function RootNavigator() {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}

export default RootNavigator;
