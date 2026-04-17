/**
 * Solas V2 Navigation
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

import React, { useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, useColors } from '../theme';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { pullAll } from '../services/sync';
import {
  requestPermissions,
  scheduleDailyNotifications,
  scheduleWeeklyReview,
  addNotificationResponseListener,
} from '../services/notifications';

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
import AreaDetailScreen       from '../screens/AreaDetailScreen';
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
  Projects:         undefined;
  Areas:            undefined;
  Chat:             { mode: 'dump' | 'morning' | 'project' | 'evening' | 'weekly' | 'monthly' | 'yearly' | 'quick' | 'fatigue' };
  DeepWork:         undefined;
  ProjectDetail:    { projectId: string };
  AreaDetail:       { areaId: string };
};

export type TabParams = {
  Dashboard: undefined;
  More:      undefined;
};

// ── Navigators ────────────────────────────────────────────────────────────────

type AuthStackParams = { Login: undefined };

const Stack     = createNativeStackNavigator<RootStackParams>();
const AuthStack = createNativeStackNavigator<AuthStackParams>();
const Tab       = createBottomTabNavigator<TabParams>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICON_DEFAULT: Record<string, IoniconName> = {
  Dashboard: 'home-outline',
  More:      'ellipsis-horizontal-outline',
};
const TAB_ICON_ACTIVE: Record<string, IoniconName> = {
  Dashboard: 'home',
  More:      'ellipsis-horizontal',
};
const TAB_LABELS: Record<string, string> = {
  Dashboard: 'Home',
  More:      'More',
};

// Custom tab bar — Ionicons + floating Solas button
function CustomTabBar({ state, navigation }: any) {
  const C = useColors();
  const tabStyles = useMemo(() => makeTabStyles(C), [C]);
  const tabs = ['Dashboard', 'More'];

  return (
    <View style={tabStyles.container}>
      {tabs.map((name, i) => {
        const focused = state.index === i;
        const iconName = focused ? TAB_ICON_ACTIVE[name] : TAB_ICON_DEFAULT[name];

        return (
          <React.Fragment key={name}>
            {/* Solas centre button sits between Dashboard and More */}
            {i === 1 && (
              <TouchableOpacity
                style={tabStyles.centerWrap}
                onPress={() => {
                  const h = new Date().getHours();
                  const dow = new Date().getDay();
                  // Time-aware routing: morning plan / evening wind-down / weekly / brain dump
                  let mode: 'morning' | 'evening' | 'weekly' | 'dump';
                  if (dow === 0) mode = 'weekly';
                  else if (h >= 20) mode = 'dump';      // late night → brain dump / capture
                  else if (h >= 17) mode = 'evening';   // 5–8pm → wind down
                  else mode = 'morning';                 // daytime → plan
                  navigation.navigate('Chat', { mode });
                }}
                activeOpacity={0.82}
              >
                {/* Outer amber ring */}
                <View style={tabStyles.centerRing}>
                  <View style={tabStyles.centerBtn}>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  </View>
                </View>
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
                color={focused ? C.primary : C.textTertiary}
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

function makeTabStyles(C: any) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: C.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingBottom: 26,
      paddingTop: 8,
      paddingHorizontal: 4,
    },

    // Regular tab
    tab:         { flex: 1, alignItems: 'center', gap: 3 },
    label:       { fontSize: 10, color: C.textTertiary, fontWeight: '400', letterSpacing: 0.2 },
    labelActive: { color: C.primary, fontWeight: '600' },
    activeDot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.primary, marginTop: 1 },

    // Solas centre button — solid amber ring, dark core, white separator
    centerWrap: { alignItems: 'center', gap: 3, marginBottom: 2, paddingHorizontal: 2 },

    // Outer amber ring with glow
    centerRing: {
      width: 64, height: 64, borderRadius: 32,
      borderWidth: 2,
      borderColor: C.accent,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      marginBottom: 2,
    },

    // Inner dark button with theme-bg gap ring
    centerBtn: {
      width: 54, height: 54, borderRadius: 27,
      backgroundColor: C.ink,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: C.background,
    },

    centerLetter: {
      fontSize: 19,
      fontWeight: '700',
      color: C.textInverse,   // dark on light button (light on dark button in ink mode)
      letterSpacing: -0.3,
    },
    centerLabel: { fontSize: 10, color: C.textTertiary, fontWeight: '500', letterSpacing: 0.2 },
  });
}

function MoreScreen({ navigation }: any) {
  const C = useColors();
  const insets = useSafeAreaInsets();

  const items = [
    { icon: 'briefcase-outline' as const, label: 'Projects', screen: 'Projects' },
    { icon: 'layers-outline' as const, label: 'Areas', screen: 'Areas' },
    { icon: 'settings-outline' as const, label: 'Settings', screen: 'Settings' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.background, paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.textPrimary, letterSpacing: -1, marginBottom: 24 }}>
        More
      </Text>
      {items.map(item => (
        <TouchableOpacity
          key={item.screen}
          onPress={() => navigation.navigate(item.screen)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: C.surface,
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 16,
            marginBottom: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: C.border,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={item.icon} size={22} color={C.primary} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '500', color: C.textPrimary }}>
            {item.label}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      id="MainTabs"
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

// ── Notification deep-link handler ────────────────────────────────────────────
// Must live inside NavigationContainer to use useNavigation()

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
        case 'Fatigue':
          navigation.navigate('Chat', { mode: 'fatigue' });
          break;
        case 'QuickWin':
          navigation.navigate('Chat', { mode: 'quick' });
          break;
        case 'WeeklyReview':
          navigation.navigate('Chat', { mode: 'weekly' });
          break;
        default:
          break;
      }
    });
    return cleanup;
  }, [navigation]);

  return null;
}

// ── Auth-gated app navigator ──────────────────────────────────────────────────

/** Prevent syncRemindersToTasks running more than once per app session */
let reminderSyncDone = false;

/** Import any iOS Reminders that aren't yet in the task store */
async function syncRemindersToTasks() {
  if (reminderSyncDone) return;
  reminderSyncDone = true;
  try {
    const { getUnimportedReminders } = await import('../services/calendar');
    const { tasks, addTask }         = useStore.getState();

    // Guard 1: match by reminderId (fast path)
    const existingReminderIds = new Set(
      tasks.map(t => t.reminderId).filter((id): id is string => Boolean(id))
    );
    // Guard 2: match by normalised text — prevents re-import when reminderId was
    // lost after a server sync overwrote local tasks (the common duplicate cause)
    const existingTexts = new Set(
      tasks.map(t => t.text.trim().toLowerCase())
    );

    const newReminders = await getUnimportedReminders([...existingReminderIds]);
    if (!newReminders.length) return;

    // Filter out anything whose text already exists in the store
    // Filter against local tasks AND dedup within the new-reminders batch
    // itself (defensive — getUnimportedReminders already dedups at source)
    const batchSeen = new Set<string>();
    const truly_new = newReminders.filter(r => {
      const key = r.text.trim().toLowerCase();
      if (!key) return false;
      if (existingTexts.has(key)) return false;
      if (batchSeen.has(key)) return false;
      batchSeen.add(key);
      return true;
    });
    if (!truly_new.length) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    for (const r of truly_new) {
      addTask({
        text:        r.text,
        completed:   false,
        date:        r.date ?? today,
        isToday:     !r.date || r.date === today,
        isMIT:       false,
        priority:    'medium',
        reminderId:  r.reminderId,
        isInbox:     true,   // surface in Inbox, not silently on Today
      });
    }
    console.log(`[nav] imported ${truly_new.length} reminder(s) as tasks`);

    // Final safety net: collapse any residual duplicates. Cheap when clean.
    useStore.getState().dedupeTasks();
  } catch (e) {
    console.warn('[nav] reminder sync failed:', e);
  }
}

/** Background sync — runs after login without blocking the UI */
async function backgroundSync() {
  try {
    const result = await pullAll();
    console.log('[nav] sync complete:', { tasks: result.tasks.length, habits: result.habits.length });

    // Merge server data into store (server wins if it has records).
    // Use setState directly for profile so we don't re-trigger a Supabase push
    // (updateProfile calls syncIfAuthed, which would immediately write back the
    // profile we just pulled — a pointless circular write on every login).
    if (result.profile) {
      useStore.setState(s => ({
        profile: { ...s.profile, ...result.profile },
      }));
    }
    if (result.areas.length > 0)            useStore.setState({ areas: result.areas });
    if (result.projects.length > 0)         useStore.setState({ projects: result.projects });
    if (result.tasks.length > 0)            useStore.setState({ tasks: result.tasks });
    if (result.habits.length > 0)           useStore.setState({ habits: result.habits });
    if (result.goals.length > 0)            useStore.setState({ goals: result.goals });
    if (result.deepWorkSessions.length > 0) useStore.setState({ deepWorkSessions: result.deepWorkSessions });

    // Scrub any leftover duplicate tasks after server replace (can happen if a
    // prior session imported iOS reminders and they got replayed). Safe no-op
    // when there's nothing to dedup.
    try { useStore.getState().dedupeTasks(); } catch {}

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
  const C = useColors();
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

        // Sync on first load (INITIAL_SESSION) and on new sign-in.
        // Skip TOKEN_REFRESHED (fires every hour) and USER_UPDATED.
        if (s && (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION')) {
          backgroundSync();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Schedule onboarding welcome notification for new users who haven't completed onboarding
  useEffect(() => {
    if (session && !profile.onboardingCompleted) {
      // New user — fire a gentle nudge 30 min after install in case they close the app
      requestPermissions().then(granted => {
        if (granted) {
          import('../services/notifications')
            .then(n => n.scheduleOnboardingWelcome())
            .catch(() => {});
        }
      });
    }
  }, [session, profile.onboardingCompleted]);

  // Request all permissions and schedule notifications once user is onboarded
  useEffect(() => {
    if (session && profile.onboardingCompleted) {
      // Cancel the onboarding welcome/reminder — they're done
      import('../services/notifications').then(n => {
        n.cancelOnboardingWelcome().catch(() => {});
        n.cancelOnboardingReminder().catch(() => {});
      });

      // Notifications
      requestPermissions().then(granted => {
        if (granted) {
          scheduleDailyNotifications(profile.morningTime, profile.eveningTime);
          // Weekly strategic reset — defaults to Sunday 10:00 until user picks
          // their own day/time in Settings.
          scheduleWeeklyReview(profile.weeklyReviewDay, profile.weeklyReviewTime);
        }
      });

      // Calendar + Reminders — request together so both prompts appear on first launch
      import('../services/calendar').then(cal => {
        cal.requestAllCalendarPermissions().catch(() => {});
      });

      // Pull any iOS Reminders into the task list (fire-and-forget)
      syncRemindersToTasks();
    }
  }, [session, profile.onboardingCompleted, profile.morningTime, profile.eveningTime]);

  // Not logged in — show auth screen
  if (!session) {
    return (
      <AuthStack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
      </AuthStack.Navigator>
    );
  }

  // Notification tap handler — mounted once user is in the app
  // (needs NavigationContainer context, so must be here not in App.tsx)

  const isOnboarded = profile.onboardingCompleted;

  return (
    <>
    <NotificationHandler />
    <Stack.Navigator
      id="RootStack"
      initialRouteName={isOnboarded ? 'Main' : 'OnboardingChat'}
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
          headerTintColor: C.primary,
          headerStyle: { backgroundColor: C.surface },
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
          headerTintColor: C.primary,
          headerStyle: { backgroundColor: C.surface },
          headerShadowVisible: false,
        }}
      />

      {/* Main app */}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Projects',
          headerBackTitle: 'Back',
          headerTintColor: C.primary,
          headerStyle: { backgroundColor: C.surface },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Areas"
        component={AreasScreen}
        options={{
          headerShown: true,
          headerTitle: 'Areas',
          headerBackTitle: 'Back',
          headerTintColor: C.primary,
          headerStyle: { backgroundColor: C.surface },
          headerShadowVisible: false,
        }}
      />
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
          headerTintColor: C.primary,
          headerStyle: { backgroundColor: C.surface },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="AreaDetail"
        component={AreaDetailScreen}
        options={{
          headerShown: false,
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
    </>
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
