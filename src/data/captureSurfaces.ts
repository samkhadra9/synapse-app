/**
 * Single source of truth for the five fast-capture paths.
 *
 * Consumed by:
 *   - CaptureToursScreen  (CP6.4 onboarding tour)
 *   - SettingsScreen      (CP6.5 status panel + re-trigger)
 *
 * If we add a sixth capture surface, we update it here and both
 * screens pick it up. Keeping copy + icon together prevents drift.
 */
import type { Ionicons } from '@expo/vector-icons';

export type CaptureSurface = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  /** Concrete one-liner — how to actually use it. */
  howTo: string;
};

export const CAPTURE_SURFACES: CaptureSurface[] = [
  {
    id: 'widget',
    icon: 'apps-outline',
    title: 'Lock-screen widget',
    body: "Add Aiteall to your Lock Screen so a thought never lives more than a second in your head before it lands somewhere.",
    howTo: 'Long-press your Lock Screen → Customise → Lock Screen → + → Aiteall.',
  },
  {
    id: 'share',
    icon: 'share-outline',
    title: 'Share to Aiteall',
    body: "Found something on the train you want to come back to? Share it from anywhere — Safari, Messages, your inbox — straight into a dump chat.",
    howTo: 'Use the share sheet in any app → scroll across → tap Aiteall.',
  },
  {
    id: 'siri',
    icon: 'mic-circle-outline',
    title: 'Hands-free with Siri',
    body: "Driving, walking, in the kitchen — say it instead of typing. Aiteall captures it as a dump and you sort it later.",
    howTo: 'Try: "Hey Siri, tell Aiteall I forgot to email Tom."',
  },
  {
    id: 'long-press',
    icon: 'flash-outline',
    title: 'Long-press the app icon',
    body: "Three quick paths under the icon — dump, done, or stuck — without opening the app first.",
    howTo: 'Press and hold the Aiteall icon on your Home Screen.',
  },
  {
    id: 'paperclip',
    icon: 'attach-outline',
    title: 'Paperclip in chat',
    body: "Got a PDF or a screenshot? Send it in. The AI reads it and helps you act on it instead of you re-typing the gist.",
    howTo: 'Inside any chat: tap the paperclip → PDF or photo. Or paste from your clipboard.',
  },
];
