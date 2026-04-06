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
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { pullAll } from '../services/sync';

// Screens
import LoginScreen              from '../screens/auth/LoginScreen';
import WelcomeScreen            from '../screens/onboarding/WelcomeScreen';
import OnboardingChatScreen     from '../screens/onboarding/OnboardingChatScreen';
import SkeletonBuilderScreen    from '../screens/onboarding/SkeletonBuilderScreen';
import CalendarExportScreen     from '../screens/onboarding/CalendarExportScreen';
import DashboardScreen          from '../screens/DashboardScreen';
import ChatScreen             from '../screens/ChatScreen';
import ProjectsScreen         from '../screens/ProjectsScreen';
import ProjectDetailScreen    from '../screens/ProjectDetailScreen';
import GoalsScreen            from '../screens/GoalsScreen';
import AreasScreen            from '../screens/AreasScreen';
import SettingsScreen         from '../screens/SettingsScreen';
import DeepWorkScreen         from '../screens/DeepWorkScreen';

// ── Param types ───────────────────────────────────────────────────────────────

export type RootStackParams = {
  Welcome:          undefined;
  OnboardingChat:   undefined;
  SkeletonBuilder:  undefined;
  CalendarExport:   undefined;
  Settings:         undefined;
  Main:             undefined;
  Chat:             { mode: 'dump' | 'morning' | 'project' | 'evening' | 'weekly' | 'monthly' | 'yearly' | 'quick' };
  DeepWork:         undefined;
  ProjectDetail:    { projectId: string };
};

export type TabParams = {
  Dashboard: undefined;
  Projects:  undefined;
  Areas:     undefined;
  Settings:  undefined;
};

// ── Navigators ────────────────────────────────────────────────────────────────

type AuthStackParams = { Login: undefined };

const Stack     = createNativeStackNavigator<RootStackParams>();
const AuthStack = createNativeStackNavigator<AuthStackParams>();
const Tab       = createBottomTabNavigator<TabParams>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICON_DEFAULT: Record<string, IoniconName> = {
  Dashboard: 'home-outline',
  Projects:  'folder-outline',
  Areas:     'layers-outline',
  Settings:  'ellipsis-horizontal-circle-outline',
};
const TAB_ICON_ACTIVE: Record<string, IoniconName> = {
  Dashboard: 'home',
  Projects:  'folder',
  Areas:     'layers',
  Settings:  'ellipsis-horizontal-circle',
};
const TAB_LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Projects:  'Projects',
  Areas:     'Areas',
  Settings:  'Settings',
};

// Custom tab bar — Ionicons + floating Synapse button
function CustomTabBar({ state, navigation }: any) {
  const tabs = ['Dashboard', 'Projects', 'Areas', 'Settings'];

  return (
    <View style={tabStyles.container}>
      {tabs.map((name, i) => {
        const focused = state.index === i;
        const iconName = focused ? TAB_ICON_ACTIVE[name] : TAB_ICON_DEFAULT[name];

        return (
          <React.Fragment key={name}>
            {/* Synapse centre button sits between Projects and Areas */}
            {i === 2 && (
              <TouchableOpacity
                style={tabStyles.centerWrap}
                onPress={() => navigation.navigate('Chat', { mode: 'dump' })}
                activeOpacity={0.82}
              >
                {/* Outer amber ring */}
                <View style={tabStyles.centerRing}>
                  <View style={tabStyles.centerBtn}>
                    <Text style={tabStyles.centerLetter}>S</Text>
                  </View>
                </View>
                <Text style={tabStyles.centerLabel}>Synapse</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={tabStyles.tab}
              onPress={() => navigation.navigate(name)}
              activeOpacity={0.65}
            >
              <Ionicons
                name={iconName}
                size={22}
                color={focused ? Colors.primary : Colors.textTertiary}
              />
              <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                {TAB_LABELS[name]}
              </Text>
              {focused && <View style={tabStyles.activeDot} />}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
    paddingBottom: 26,
    paddingTop: 8,
    paddingHorizontal: 4,
  },

  // Regular tab
  tab:         { flex: 1, alignItems: 'center', gap: 3 },
  label:       { fontSize: 10, color: Colors.textTertiary, fontWeight: '400', letterSpacing: 0.2 },
  labelActive: { color: Colors.primary, fontWeight: '600' },
  activeDot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.primary, marginTop: 1 },

  // Synapse centre button — solid amber ring, dark core, white separator
  centerWrap: { alignItems: 'center', gap: 3, marginBottom: 2, paddingHorizontal: 2 },

  // Outer amber ring with glow
  centerRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2,
    borderColor: '#D4621A',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#D4621A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginBottom: 2,
  },

  // Inner dark button with white gap ring
  centerBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#0D0D0D',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.background,   // white gap between ring and button
  },

  centerLetter: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  centerLabel: { fontSize: 10, color: Colors.textTertiary, fontWeight: '500', letterSpacing: 0.2 },
});

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Projects"  component={ProjectsScreen} />
      <Tab.Screen name="Areas"     component={AreasScreen} />
      <Tab.Screen name="Settings"  component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Auth-gated app navigator ──────────────────────────────────────────────────

/** Background sync — runs after login without blocking the UI */
async function backgroundSync() {
  try {
    const result = await pullAll();
    console.log('[nav] sync complete:', { tasks: result.tasks.length, habits: result.habits.length });

    const local = useStore.getState();

    // Merge server data into store (server wins if it has records)
    if (result.profile) local.updateProfile(result.profile);
    if (result.areas.length > 0)            useStore.setState({ areas: result.areas });
    if (result.projects.length > 0)         useStore.setState({ projects: result.projects });
    if (result.tasks.length > 0)            useStore.setState({ tasks: result.tasks });
    if (result.habits.length > 0)           useStore.setState({ habits: result.habits });
    if (result.goals.length > 0)            useStore.setState({ goals: result.goals });
    if (result.deepWorkSessions.length > 0) useStore.setState({ deepWorkSessions: result.deepWorkSessions });

    // If server is empty but local has data → upload (first sync after auth was set up)
    const { pushAll } = await import('../services/sync');
    const fresh = useStore.getState();
    const serverEmpty = result.tasks.length === 0 && result.projects.length === 0;
    if (serverEmpty && (fresh.tasks.length > 0 || fresh.projects.length > 0)) {
      console.log('[nav] uploading local data to server');
      pushAll({
        profile:          fresh.profile,
        areas:            fresh.areas,
        projects:         fresh.projects,
        tasks:            fresh.tasks,
        habits:           fresh.habits,
        goals:            fresh.goals,
        deepWorkSessions: fresh.deepWorkSessions,
      }).catch(e => console.warn('[nav] upload failed:', e));
    }
  } catch (e) {
    console.warn('[nav] background sync failed (will retry on next launch):', e);
  }
}

function AppNavigator() {
  const { profile, session, setSession } = useStore();

  // Listen for Supabase auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) setSession(s);
    });

    // Subscribe to future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        console.log('[nav] auth event:', _event, 'session:', !!s);
        setSession(s);

        // Only sync on actual sign-in — not on token refresh (which fires every hour)
        if (s && _event === 'SIGNED_IN') {
          backgroundSync();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
      <Stack.Screen
        name="SkeletonBuilder"
        component={SkeletonBuilderScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="CalendarExport"
        component={CalendarExportScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: false,
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
