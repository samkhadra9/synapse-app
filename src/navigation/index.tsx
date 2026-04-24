/**
 * Aiteall Navigation
 *
 * Auth flow:
 *   No session  → LoginScreen
 *   Has session → Main app (chat-first; no up-front onboarding)
 *
 * Main app flow:
 *   Tabs: Home (chat) | You (portrait) | More
 *   Modal stack: DeepWork, ProjectDetail, AreaDetail
 *   Power-user tools reachable from Settings: SkeletonBuilder, CalendarExport
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
  clearBadge,
} from '../services/notifications';
import { AppState } from 'react-native';

// Screens
import LoginScreen              from '../screens/auth/LoginScreen';
import SkeletonBuilderScreen    from '../screens/onboarding/SkeletonBuilderScreen';
import CalendarExportScreen     from '../screens/onboarding/CalendarExportScreen';
import HomeAdaptive           from '../screens/HomeAdaptive';
import PortraitScreen         from '../screens/PortraitScreen';
import ChatScreen             from '../screens/ChatScreen';
import ProjectsScreen         from '../screens/ProjectsScreen';
import ProjectDetailScreen    from '../screens/ProjectDetailScreen';
import AreasScreen            from '../screens/AreasScreen';
import AreaDetailScreen       from '../screens/AreaDetailScreen';
import SettingsScreen         from '../screens/SettingsScreen';
import DeepWorkScreen         from '../screens/DeepWorkScreen';

// ── Param types ───────────────────────────────────────────────────────────────

/**
 * Chat modes collapsed to three (Phase 2):
 *   'dump'    — the default. Capture / reflect / talk it out. Time of day
 *               changes the system prompt's opener (morning: "what's
 *               today about?", late: "anything you're carrying home?"),
 *               but the mode is the same underlying conversation.
 *   'ritual'  — the weekly/monthly/yearly strategic reset. Structured
 *               5-step prompt. One session per ISO week / month / year.
 *   'project' — deep dive on a single project. Scoped, referential.
 *
 * The old 'morning' | 'evening' | 'quick' | 'fatigue' folded into 'dump'.
 * The old 'weekly' | 'monthly' | 'yearly' folded into 'ritual'.
 */
export type ChatModeV2 = 'dump' | 'ritual' | 'project';

export type RootStackParams = {
  SkeletonBuilder:  undefined;
  CalendarExport:   undefined;
  Settings:         undefined;
  Main:             undefined;
  Projects:         undefined;
  Areas:            { editAreaId?: string } | undefined;
  Chat:             { mode: ChatModeV2; initialMessage?: string; projectId?: string };
  DeepWork:         undefined;
  ProjectDetail:    { projectId: string };
  AreaDetail:       { areaId: string };
};

export type TabParams = {
  Dashboard: undefined;
  Portrait:  undefined;
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
  Portrait:  'person-circle-outline',
  More:      'ellipsis-horizontal-outline',
};
const TAB_ICON_ACTIVE: Record<string, IoniconName> = {
  Dashboard: 'home',
  Portrait:  'person-circle',
  More:      'ellipsis-horizontal',
};
const TAB_LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Portrait:  'You',
  More:      'More',
};

/**
 * Tab order: Home | You | [Sparkles centre button] | More
 *
 * The Sparkles button is the main chat entry. It's not a tab — it
 * opens the Chat modal directly. We render it in position index=2
 * so it sits between the "You" tab and "More".
 */
function CustomTabBar({ state, navigation }: any) {
  const C = useColors();
  const tabStyles = useMemo(() => makeTabStyles(C), [C]);
  const uiState = useStore(s => s.uiState);
  const tabs = ['Dashboard', 'Portrait', 'More'];

  // Split point: Sparkles sits between Portrait (i=1) and More (i=2).
  const SPARKLES_AFTER = 1;

  // CP2.4 — when the classifier says the user is focused (narrow) or being
  // held gently (held), the tab bar should get out of the way. We keep just
  // the sparkles orb so chat is always one tap away — on completion the
  // next focus will re-classify to 'open' and full chrome returns.
  // Only applies on the Dashboard tab (index 0); on Portrait/More the user
  // has explicitly navigated and deserves the full bar.
  const strippedChrome =
    state.index === 0 && (uiState === 'narrow' || uiState === 'held');

  if (strippedChrome) {
    const dow = new Date().getDay();
    const mode: ChatModeV2 = dow === 0 ? 'ritual' : 'dump';
    return (
      <View style={tabStyles.strippedContainer}>
        <TouchableOpacity
          style={tabStyles.centerWrap}
          onPress={() => navigation.navigate('Chat', { mode })}
          activeOpacity={0.82}
        >
          <View style={tabStyles.centerRing}>
            <View style={tabStyles.centerBtn}>
              <Ionicons name="sparkles" size={18} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={tabStyles.container}>
      {tabs.map((name, i) => {
        const focused = state.index === i;
        const iconName = focused ? TAB_ICON_ACTIVE[name] : TAB_ICON_DEFAULT[name];

        return (
          <React.Fragment key={name}>
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

            {i === SPARKLES_AFTER && (
              <TouchableOpacity
                style={tabStyles.centerWrap}
                onPress={() => {
                  // Zero-config: Sunday is the one day we bias toward the
                  // ritual (weekly reset); every other tap just opens dump.
                  // The system prompt inside 'dump' reads time-of-day and
                  // adapts its opener, so we don't need 4 different modes.
                  const dow = new Date().getDay();
                  const mode: ChatModeV2 = dow === 0 ? 'ritual' : 'dump';
                  navigation.navigate('Chat', { mode });
                }}
                activeOpacity={0.82}
              >
                <View style={tabStyles.centerRing}>
                  <View style={tabStyles.centerBtn}>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
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

    // CP2.4: stripped-chrome variant — no divider, no background, just the
    // sparkles orb so nothing loud is competing with whatever the user is
    // holding on screen. The orb stays because chat is the one affordance
    // that's always welcome.
    strippedContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 22,
      paddingTop: 6,
      backgroundColor: 'transparent',
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
      <Tab.Screen name="Dashboard" component={HomeAdaptive} />
      <Tab.Screen name="Portrait" component={PortraitScreen} />
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
      // All morning/evening/fatigue/quick notifications now land in the
      // same 'dump' chat — the system prompt reads the clock and adjusts.
      // Weekly review keeps its own 'ritual' mode.
      switch (screen) {
        case 'MorningPlanning':
        case 'EveningReview':
        case 'Fatigue':
        case 'QuickWin':
          navigation.navigate('Chat', { mode: 'dump' });
          break;
        case 'WeeklyReview':
          navigation.navigate('Chat', { mode: 'ritual' });
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

  // CP2.6 — clear any lingering app-icon badge on mount and whenever the app
  // returns to the foreground. The badge count is a "you owe me" signal and
  // we explicitly refuse to carry one.
  useEffect(() => {
    clearBadge();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') clearBadge();
    });
    return () => sub.remove();
  }, []);

  // Zero-config entry: the moment we have a session, schedule notifications and
  // pull iOS Reminders. No onboarding gate — the user landed in the app and
  // starts talking immediately; everything else happens in the background.
  useEffect(() => {
    if (!session) return;

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
  }, [session, profile.morningTime, profile.eveningTime]);

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

  return (
    <>
    <NotificationHandler />
    <Stack.Navigator
      id="RootStack"
      initialRouteName="Main"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {/* Power-user tools (reachable from Settings) */}
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

      {/* Settings */}
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
