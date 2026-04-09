/**
 * Synapse App — Colour Themes
 *
 * Each theme swaps out the brand/accent palette while keeping the
 * neutral foundation (grays, borders, backgrounds) mostly intact.
 *
 * Adding a new theme: duplicate an entry, pick a primary + accent,
 * adjust primaryLight/Mid/Dark and accentLight/Mid to match.
 */

export type ThemeName = 'forest' | 'rose' | 'ink';

export interface ThemeTokens {
  // Brand primary
  primary:      string;
  primaryLight: string;
  primaryMid:   string;
  primaryDark:  string;

  // Accent
  accent:      string;
  accentLight: string;
  accentMid:   string;

  // Surfaces
  background:       string;
  surface:          string;
  surfaceSecondary: string;
  surfaceElevated:  string;
  surfaceWarm:      string;

  // Typography
  textPrimary:   string;
  textSecondary: string;
  textTertiary:  string;
  textInverse:   string;
  textAccent:    string;

  // Semantic
  success:      string;
  successLight: string;
  warning:      string;
  warningLight: string;
  error:        string;
  errorLight:   string;

  // Chrome
  border:      string;
  borderLight: string;
  divider:     string;
  ink:         string;

  // Legacy aliases
  white:    string;
  black:    string;
  gray50:   string;
  gray100:  string;
  gray200:  string;
  gray400:  string;
  gray600:  string;
  gray800:  string;
  card:     string;
  text:     string;
  textMuted:string;
  textLight:string;
}

// ── Shared neutrals (same across all light themes) ──────────────────────────
const NEUTRALS = {
  background:       '#FFFFFF',
  surface:          '#FFFFFF',
  surfaceSecondary: '#F8F7F4',
  surfaceElevated:  '#FFFFFF',
  surfaceWarm:      '#FFFBF7',

  textPrimary:   '#0D0D0D',
  textSecondary: '#6B7280',
  textTertiary:  '#9CA3AF',
  textInverse:   '#FFFFFF',

  warning:      '#D97706',
  warningLight: '#FEF3C7',
  error:        '#DC2626',
  errorLight:   '#FEE2E2',

  border:      '#E8E8E6',
  borderLight: '#F2F2F0',
  divider:     '#F2F2F0',
  ink:         '#0D0D0D',

  white:    '#FFFFFF',
  black:    '#0D0D0D',
  gray50:   '#F7F7F5',
  gray100:  '#F2F2F0',
  gray200:  '#E8E8E6',
  gray400:  '#9CA3AF',
  gray600:  '#6B7280',
  gray800:  '#374151',
  card:     '#FFFFFF',
  text:     '#0D0D0D',
  textMuted:'#6B7280',
  textLight:'#9CA3AF',
};

// ── FOREST (default) — Deep teal + warm amber ────────────────────────────────
const forest: ThemeTokens = {
  ...NEUTRALS,
  primary:      '#1A5C4A',
  primaryLight: '#E8F5F0',
  primaryMid:   '#A7D7C5',
  primaryDark:  '#134539',
  accent:       '#D4621A',
  accentLight:  '#FEF3E8',
  accentMid:    '#F4A96A',
  textAccent:   '#1A5C4A',
  success:      '#1A5C4A',
  successLight: '#E8F5F0',
};

// ── ROSE — Dusty rose + warm peach ──────────────────────────────────────────
const rose: ThemeTokens = {
  ...NEUTRALS,
  primary:      '#B5476A',   // dusty deep rose
  primaryLight: '#FDE8EF',   // blush blush
  primaryMid:   '#F4AABF',   // mid pink
  primaryDark:  '#8C3352',   // pressed/dark
  accent:       '#E8845E',   // warm peachy-orange
  accentLight:  '#FEF0EB',   // pale peach
  accentMid:    '#F4B99A',   // mid peach
  textAccent:   '#B5476A',
  success:      '#B5476A',
  successLight: '#FDE8EF',
};

// ── INK — Near-black + golden cream ─────────────────────────────────────────
const ink: ThemeTokens = {
  ...NEUTRALS,
  primary:      '#1C1C1E',   // near-black
  primaryLight: '#F2F2F0',   // very light grey
  primaryMid:   '#C0BEB8',   // warm grey
  primaryDark:  '#0A0A0A',   // pure black
  accent:       '#B89B6A',   // warm gold
  accentLight:  '#FAF5EC',   // cream
  accentMid:    '#D4BF97',   // mid gold
  textAccent:   '#1C1C1E',
  success:      '#1C1C1E',
  successLight: '#F2F2F0',
};

export const THEMES: Record<ThemeName, { label: string; emoji: string; tokens: ThemeTokens }> = {
  forest:  { label: 'Forest',  emoji: '🌿', tokens: forest },
  rose:    { label: 'Rose',    emoji: '🌸', tokens: rose   },
  ink:     { label: 'Ink',     emoji: '🖤', tokens: ink    },
};

export const DEFAULT_THEME: ThemeName = 'forest';
