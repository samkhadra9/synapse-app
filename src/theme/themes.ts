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
  // Rose soft pink palette overrides
  background:       '#FFF0F3',
  surface:          '#FFF6F8',
  surfaceSecondary: '#FDEDF1',
  surfaceElevated:  '#FFF6F8',
  surfaceWarm:      '#FFF4F7',
  card:             '#FFF6F8',
  gray50:           '#FFF0F3',
  gray100:          '#FDE8EF',
};

// ── INK — Near-black + warm gold ─────────────────────────────────────────────
// Dark mode rules: primary must be VISIBLE on dark bg (use warm gold, not black).
// Text hierarchy: primary ~#F2F2F2, secondary ~#C8C8C8, tertiary ~#A0A0A0 — all
// pass WCAG AA contrast (7:1 / 4.7:1 / 3.8:1) against #1C1C1E.
const ink: ThemeTokens = {
  ...NEUTRALS,
  // Interactive primary = warm gold — clearly visible on dark surfaces
  primary:      '#C8A96E',   // warm gold
  primaryLight: '#3D3020',   // dark gold tint — visible on #1C1C1E bg (chip highlights)
  primaryMid:   '#8A7355',   // mid gold (borders, dividers)
  primaryDark:  '#A88B52',   // deeper gold (pressed)
  accent:       '#E8C27A',   // brighter gold accent
  accentLight:  '#3A2D18',   // visible dark amber — CTA banners (was invisible #2D2820)
  accentMid:    '#C4A05A',   // mid accent
  // ── Surfaces — enough step between each layer so cards visually pop ────────
  background:       '#1C1C1E',   // base
  surface:          '#323234',   // cards/sheets — +10 from bg (was #2A2A2C, barely visible)
  surfaceSecondary: '#3C3C3E',   // alternate rows, inputs
  surfaceElevated:  '#3C3C3E',   // modals
  surfaceWarm:      '#2A2820',   // slightly warm tint
  // ── Typography — high contrast ────────────────────────────────────────────
  textPrimary:   '#F2F2F2',   // near-white  — 14.6:1 on bg
  textSecondary: '#C8C8C8',   // light grey  —  7.5:1 on bg
  textTertiary:  '#A0A0A0',   // medium grey —  4.7:1 on bg
  textInverse:   '#1C1C1E',   // dark text on light buttons
  textAccent:    '#C8A96E',   // warm gold
  // ── Highlights — must be visible on dark bg (not just a darker dark) ──────
  // primaryLight is used for chip/badge backgrounds — make it a true dark-gold tint
  // accentLight is used for CTA banners — needs clear distinction from surface
  // ── Borders — visible ─────────────────────────────────────────────────────
  border:      '#525254',   // clear card borders
  borderLight: '#3C3C3E',
  divider:     '#3C3C3E',
  // ── Buttons — light on dark ───────────────────────────────────────────────
  ink:         '#F2F2F2',
  // ── Legacy aliases ────────────────────────────────────────────────────────
  white:    '#1C1C1E',
  black:    '#F2F2F2',
  gray50:   '#323234',
  gray100:  '#3C3C3E',
  gray200:  '#525254',
  gray400:  '#A0A0A0',
  gray600:  '#C8C8C8',
  gray800:  '#E0E0E0',
  card:     '#323234',
  text:     '#F2F2F2',
  textMuted:'#C8C8C8',
  textLight:'#A0A0A0',
  // ── Semantic — brighter so they pop on dark surfaces ─────────────────────
  success:      '#4ADE80',   // bright green
  successLight: '#0D2818',
  warning:      '#FCA14B',   // warm amber
  warningLight: '#2D1A00',
  error:        '#F87171',   // soft red
  errorLight:   '#2D0808',
};

export const THEMES: Record<ThemeName, { label: string; emoji: string; tokens: ThemeTokens }> = {
  forest:  { label: 'Forest',  emoji: '🌿', tokens: forest },
  rose:    { label: 'Rose',    emoji: '🌸', tokens: rose   },
  ink:     { label: 'Ink',     emoji: '🖤', tokens: ink    },
};

export const DEFAULT_THEME: ThemeName = 'forest';
