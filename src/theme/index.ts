// Synapse Design System — v3
// Aesthetic: Editorial · Deep forest teal · Warm amber orb · Pure white · Near-black type
// Blend: Abby Health clarity × C.Lab warmth and organic softness

// ── Theme-aware hook ─────────────────────────────────────────────────────────
// Usage: const C = useColors();  — returns the active theme's colour tokens.
// Falls back to the static Colors export for screens that haven't migrated yet.
import { THEMES, DEFAULT_THEME } from './themes';
export type { ThemeName } from './themes';
export { THEMES, DEFAULT_THEME } from './themes';

/** Returns active theme colour tokens — reactive to theme changes in store. */
export function useColors() {
  // Lazy import to avoid circular deps with store
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const useStore = require('../store/useStore').useStore;
  const themeName = useStore((s: { appTheme: import('./themes').ThemeName }) => s.appTheme) ?? DEFAULT_THEME;
  return THEMES[themeName]?.tokens ?? THEMES[DEFAULT_THEME].tokens;
}

export const Colors = {
  // ── Primary — deep forest teal ─────────────────────────────────────────────
  primary:      '#1A5C4A',   // Abby-style deep teal
  primaryLight: '#E8F5F0',   // very light teal tint (chip bg, hover)
  primaryMid:   '#A7D7C5',   // mid teal (borders, dividers)
  primaryDark:  '#134539',   // darker teal (pressed state)

  // ── Warm accent — amber / sunset (C.Lab-inspired) ─────────────────────────
  accent:      '#D4621A',   // warm amber-orange
  accentLight: '#FEF3E8',   // pale amber tint (chip bg)
  accentMid:   '#F4A96A',   // mid amber (progress fills, highlights)

  // ── Surfaces — pure white foundation ──────────────────────────────────────
  background:       '#FFFFFF',   // pure white — like Abby
  surface:          '#FFFFFF',   // cards sit on white too (border differentiates)
  surfaceSecondary: '#F8F7F4',   // barely-there warm off-white (input bg, alt rows)
  surfaceElevated:  '#FFFFFF',   // elevated modals/sheets
  surfaceWarm:      '#FFFBF7',   // very warm near-white for blob-area backgrounds

  // ── Type — near-black editorial scale ─────────────────────────────────────
  textPrimary:   '#0D0D0D',   // near-black, not pure black — easier on eyes
  textSecondary: '#6B7280',   // medium gray
  textTertiary:  '#9CA3AF',   // lighter gray (placeholders, captions)
  textInverse:   '#FFFFFF',
  textAccent:    '#1A5C4A',   // teal for highlighted text

  // ── Semantic ──────────────────────────────────────────────────────────────
  success:      '#1A5C4A',   // use teal for success (consistent)
  successLight: '#E8F5F0',
  warning:      '#D97706',
  warningLight: '#FEF3C7',
  error:        '#DC2626',
  errorLight:   '#FEE2E2',

  // ── UI Chrome ─────────────────────────────────────────────────────────────
  border:      '#E8E8E6',   // warm light gray
  borderLight: '#F2F2F0',   // barely visible dividers
  divider:     '#F2F2F0',

  // ── Black — for primary buttons (Abby pill style) ─────────────────────────
  ink:         '#0D0D0D',   // near-black for pill buttons, logo text

  // ── Legacy aliases ────────────────────────────────────────────────────────
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

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium:  'System',
    bold:    'System',
  },
  size: {
    xs:    11,
    sm:    13,
    base:  15,
    md:    17,
    lg:    20,
    xl:    26,
    '2xl': 32,
    '3xl': 42,   // editorial hero size
    '4xl': 52,
  },
  weight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
    heavy:    '800' as const,
  },
  // Semantic text styles — editorial scale
  hero:       { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1.5, lineHeight: 48 },
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -1.0, lineHeight: 38 },
  title1:     { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.7, lineHeight: 33 },
  title2:     { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.4, lineHeight: 28 },
  title3:     { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 24 },
  headline:   { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body:       { fontSize: 16, fontWeight: '400' as const, lineHeight: 26 },
  callout:    { fontSize: 15, fontWeight: '400' as const, lineHeight: 24 },
  subhead:    { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  footnote:   { fontSize: 12, fontWeight: '400' as const, lineHeight: 18 },
  label:      { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export const Spacing = {
  xxs:  2,
  xs:   4,
  sm:   8,
  md:   12,
  base: 20,   // bumped from 16 — more breathing room (Abby-style)
  lg:   28,
  xl:   40,
  '2xl':56,
  '3xl':72,
};

export const Radius = {
  xs:   8,
  sm:   12,
  md:   16,
  lg:   20,
  xl:   28,
  xxl:  36,
  full: 9999,  // pill buttons
};

export const Shadow = {
  none: {},
  sm: {
    // Almost invisible — Abby uses very subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 10,
  },
  primary: {
    shadowColor: '#1A5C4A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 6,
  },
};

// Domain colour mapping — restrained palette, teal for work
export const DomainColors: Record<string, { bg: string; text: string; border: string }> = {
  work:          { bg: '#E8F5F0', text: '#1A5C4A', border: '#A7D7C5' },
  health:        { bg: '#F0FDF4', text: '#15803D', border: '#86EFAC' },
  relationships: { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  personal:      { bg: '#F5F3FF', text: '#7C3AED', border: '#C4B5FD' },
  finances:      { bg: '#F0F9FF', text: '#0369A1', border: '#7DD3FC' },
  learning:      { bg: '#FFF1F2', text: '#BE123C', border: '#FDA4AF' },
  creativity:    { bg: '#FFFBEB', text: '#B45309', border: '#FCD34D' },
  community:     { bg: '#FDF4FF', text: '#7E22CE', border: '#E879F9' },
};

export const DomainIcons: Record<string, string> = {
  work:          '💼',
  health:        '💪',
  relationships: '❤️',
  personal:      '🌱',
  finances:      '💰',
  learning:      '📚',
  creativity:    '🎨',
  community:     '🤝',
};
