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
import { navigationRef, installDeepLinkListeners } from './linking';
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
  cancelAllProactive,
  schedulePauseReentry,
  cancelPauseReentry,
} from '../services/notifications';
import * as Notifications from 'expo-notifications';
import { runProactiveDecision, extractProactiveSeed } from '../services/proactivePush';
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
import CaptureToursScreen     from '../screens/CaptureToursScreen';

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
  /**
   * CP6.4 — capture-surfaces onboarding tour. Modal.
   * `initialIndex` lets Settings (CP6.5) deep-link to a specific card.
   */
  CaptureTour:      { initialIndex?: number } | undefined;
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

  // CP2.4 (softened post-regression) — in narrow/held we dim the non-focal
  // tabs visually but keep them tappable. The v1 "strip to just sparkles"
  // implementation locked the user out of Settings when they most needed
  // it (brand-new 'held' state → no way to reach the More tab). We keep
  // all affordances present; the chrome just gets quieter.
  const quietChrome =
    state.index === 0 && (uiState === 'narrow' || uiState === 'held');

  return (
    <View style={tabStyles.container}>
      {tabs.map((name, i) => {
        const focused = state.index === i;
        const iconName = focused ? TAB_ICON_ACTIVE[name] : TAB_ICON_DEFAULT[name];

        return (
          <React.Fragment key={name}>
            <TouchableOpacity
              style={[tabStyles.tab, quietChrome && !focused && tabStyles.tabQuiet]}
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

    // CP2.4 (softened) — non-focused tabs recede in narrow/held. Same
    // hitbox, same layout, just lower opacity so they don't compete with
    // whatever the user is holding. Tappable at all times.
    tabQuiet: { opacity: 0.35 },

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
    // Existing screen-based router (morning/evening/weekly etc.)
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

    // CP5.2 — proactive push tap: deep-link into Chat 'dump' with the
    // exact line from the notification pre-seeded as the assistant's
    // first turn (NOT as the user's pending input). This lands the user
    // inside a conversation already in flight, framed correctly.
    const proactiveSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response?.notification?.request?.content?.data;
      const seed = extractProactiveSeed(data);
      if (!seed) return;
      try {
        const { chatSessionKey } = await import('../lib/chatSessionKey');
        const today = format(new Date(), 'yyyy-MM-dd');
        const seedId = `proactive:${today}`;
        const sessionKey = chatSessionKey('dump', new Date());
        const { getChatSession, appendChatSessionMessage } = useStore.getState();
        const existing = getChatSession(sessionKey) ?? [];
        // De-dupe: don't double-append if the same proactive line is
        // already in today's session (notification re-tapped, etc.)
        if (!existing.some(m => m.id === seedId)) {
          appendChatSessionMessage(sessionKey, {
            id: seedId,
            role: 'assistant',
            content: seed,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // If anything in the seed-append fails, still navigate — the
        // user gets dump mode without the seed message, which is
        // strictly better than a black hole on tap.
      }
      navigation.navigate('Chat', { mode: 'dump' });
    });

    return () => {
      cleanup();
      proactiveSub.remove();
    };
  }, [navigation]);

  return null;
}

// ── Deep-link intent handler (CP4.1a) ─────────────────────────────────────────
// Consumes one-shot intents set by the deep-link listener. Lives inside
// the auth gate so we only fire these for signed-in users.
//
// Current intents:
//   'theOneDone' — toggles the-one task complete, logs a completion, fires
//                  a gentle haptic, clears the flag.

function PendingIntentHandler() {
  const intent          = useStore(s => s.pendingIntent);
  const clearIntent     = useStore(s => s.clearPendingIntent);
  const theOneForToday  = useStore(s => s.theOneForToday);
  const toggleTask      = useStore(s => s.toggleTask);

  useEffect(() => {
    if (!intent) return;
    if (intent === 'theOneDone') {
      const task = theOneForToday();
      if (task && !task.completed) {
        // toggleTask internally calls logCompletion() for us
        toggleTask(task.id);
        // Haptic lives in services/haptics; dynamic-import to avoid a cycle
        import('../services/haptics').then(h => h.done()).catch(() => {});
      }
      clearIntent();
    }
  }, [intent, theOneForToday, toggleTask, clearIntent]);

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

    // CP8.4 — Reinstall restore: merge the D30 retention entities. We always
    // assign these even when local already has copies, because chat history,
    // completion log, session memories, and themes are *additive truth*: if
    // the server has 50 chat sessions and local has 3 (fresh install), we
    // want all 50; if local has 5 and server has 4 (offline appended), the
    // server-side last-write-wins push fixes it on next sync.
    if (result.completions.length > 0) useStore.setState(s => ({
      completions: dedupeById([...s.completions, ...result.completions]).slice(-500),
    }));
    if (Object.keys(result.chatSessions).length > 0) useStore.setState(s => ({
      // Server rows replace local entries on key collision (server is canonical
      // because every append already pushed up).
      chatSessions: { ...s.chatSessions, ...result.chatSessions },
    }));
    if (Object.keys(result.sessionMemories).length > 0) useStore.setState(s => ({
      sessionMemories: { ...s.sessionMemories, ...result.sessionMemories },
    }));
    if (result.themes) useStore.setState({ themes: result.themes });

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
        // CP8.4 — first-sync uploads of D30 retention entities
        completions:      fresh.completions,
        chatSessions:     fresh.chatSessions,
        sessionMemories:  fresh.sessionMemories,
        themes:           fresh.themes,
      }).catch(e => console.warn('[nav] upload failed:', e));
    }
  } catch (e) {
    console.warn('[nav] background sync failed (will retry on next launch):', e);
  }
}

/** Keep first occurrence of each id; preserves order for stable rendering. */
function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
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
  //
  // CP5.2 — also piggy-back on the foreground transition to run the
  // proactive-push decision pass. It's cheap when already-decided-today
  // (short-circuits inside runProactiveDecision); only hits Haiku at most
  // once per ~6h of JS-lifetime per device.
  useEffect(() => {
    clearBadge();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        clearBadge();
        if (session) {
          // CP9.5 — Re-entry script. If a pause window has expired, clear it
          // and reschedule the dailies that we tore down at pause-start. The
          // re-entry notification itself was scheduled in advance for the
          // exact moment of expiry (handled in the pause useEffect below);
          // here we just restore the steady state.
          const p = useStore.getState().profile;
          if (p.pauseModeUntil) {
            const until = Date.parse(p.pauseModeUntil);
            if (Number.isFinite(until) && until <= Date.now()) {
              useStore.getState().setPauseMode(null);
              scheduleDailyNotifications(p.morningTime, p.eveningTime).catch(() => {});
              scheduleWeeklyReview(p.weeklyReviewDay, p.weeklyReviewTime).catch(() => {});
            }
          }
          runProactiveDecision().catch(() => { /* silent */ });
        }
      }
    });
    return () => sub.remove();
  }, [session]);

  // CP9.1 — When the user toggles pause on/off, sync notification schedule.
  // Entering pause: tear down recurring + queue the re-entry notification.
  // Lifting pause: cancel the queued re-entry + re-schedule the dailies.
  // Watching `pauseModeUntil` directly so any surface that flips it (Settings,
  // HomeNarrow, AmbientChatStrip) drives the side-effect through one funnel.
  useEffect(() => {
    if (!session) return;
    const until = profile.pauseModeUntil ? Date.parse(profile.pauseModeUntil) : 0;
    const isPaused = Number.isFinite(until) && until > Date.now();

    if (isPaused) {
      cancelAllProactive().catch(() => {});
      schedulePauseReentry(new Date(until)).catch(() => {});
    } else {
      cancelPauseReentry().catch(() => {});
      // Lifted (manually or expired) — re-arm the steady state.
      scheduleDailyNotifications(profile.morningTime, profile.eveningTime).catch(() => {});
      scheduleWeeklyReview(profile.weeklyReviewDay, profile.weeklyReviewTime).catch(() => {});
    }
  }, [session, profile.pauseModeUntil, profile.morningTime, profile.eveningTime, profile.weeklyReviewDay, profile.weeklyReviewTime]);

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
        // CP5.2 — first proactive-push decision once permission is granted.
        // Cheap if already-decided-today; runs at most once per ~6h.
        runProactiveDecision().catch(() => { /* silent */ });
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
    <PendingIntentHandler />
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
      {/* CP6.4 — capture-surfaces onboarding tour. Modal, gesture-dismissable. */}
      <Stack.Screen
        name="CaptureTour"
        component={CaptureToursScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
    </Stack.Navigator>
    </>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────

export function RootNavigator() {
  // CP4.1a — mount the deep-link URL listener once the navigator is live.
  // installDeepLinkListeners() wires Linking.addEventListener('url', …) and
  // consumes Linking.getInitialURL() for cold-start cases (widget tap,
  // Siri, share sheet). navigationRef is populated by NavigationContainer
  // below; the listener retries dispatches until it's ready.
  useEffect(() => {
    const cleanup = installDeepLinkListeners();
    return cleanup;
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  );
}

export default RootNavigator;
