import { readableTextOn } from '@agora/core';
import type { ColorSchemeName, ViewStyle } from 'react-native';

/**
 * Design tokens.
 *
 * Three constraints shape them. The app is used by older neighbours, so text
 * is large, contrast is high and touch targets are generous. It is sold to
 * public administrations, which means RD 1112/2018 and WCAG 2.1 AA: every
 * colour pair here clears 4.5:1, and nothing relies on colour alone to carry
 * meaning. And it has to look like a poster rather than a form, which is where
 * the ink-dark ground and the flat category colour come from.
 *
 * Dark is the default. Light is an option in Settings, not an accident of what
 * the phone happens to be set to — a calendar read outdoors in August wants
 * the choice to be the resident's.
 */

export const APPEARANCES = ['dark', 'light', 'system'] as const;

export type Appearance = (typeof APPEARANCES)[number];

export const DEFAULT_APPEARANCE: Appearance = 'dark';

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value);
}

/**
 * One family, five weights.
 *
 * React Native does not synthesise weights for a bundled face, so every
 * weight is its own family name and `fontWeight` is never used with them —
 * setting it would silently fall back to the system font on Android.
 *
 * Archivo is a grotesque with a very heavy black cut: it holds a poster
 * headline and still sets a 15px line of detail underneath. Loaded from the
 * bundle rather than a font service, so the app works with no network.
 */
export const FONTS = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  black: 'Archivo_900Black',
} as const;

export type Fonts = typeof FONTS;

export interface Theme {
  /** Which palette is actually painted, once `system` has been resolved. */
  scheme: 'dark' | 'light';
  fonts: Fonts;
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    /** The municipality's colour, used sparingly: the poster covers carry the category. */
    primary: string;
    onPrimary: string;
    /** Reversed out of the ground: the app's own emphasis, independent of the town's colour. */
    contrast: string;
    onContrast: string;
    danger: string;
    onDanger: string;
    live: string;
  };
  /**
   * Card elevation. On the ink theme a card is told apart by its border; on a
   * white one it needs a shadow, because white on white is nothing.
   */
  elevation: ViewStyle;
  spacing: (steps: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  fontSize: {
    caption: number;
    body: number;
    subtitle: number;
    title: number;
    display: number;
  };
  /** Minimum touch target. 48dp is the accessibility floor, not a suggestion. */
  touchTarget: number;
}

const SPACING_UNIT = 4;

const DARK = {
  background: '#121211',
  surface: '#1A1A17',
  surfaceMuted: '#26251F',
  border: '#35342F',
  text: '#F4F3F0',
  textMuted: '#8A867A',
  contrast: '#F4F3F0',
  onContrast: '#121211',
  danger: '#F2B8B5',
  onDanger: '#3B0907',
  live: '#EF4444',
};

/**
 * White, with the faintest violet in the greys so the light theme belongs to
 * the same product as the dark one rather than reading as a second app.
 */
const LIGHT = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F2F8',
  border: '#E7E5F0',
  text: '#15141B',
  textMuted: '#66647A',
  contrast: '#15141B',
  onContrast: '#FFFFFF',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  live: '#C81E1E',
};

export function resolveScheme(appearance: Appearance, device: ColorSchemeName): 'dark' | 'light' {
  if (appearance === 'system') return device === 'light' ? 'light' : 'dark';
  return appearance;
}

export function createTheme(
  primaryColor: string,
  appearance: Appearance,
  device: ColorSchemeName,
): Theme {
  const scheme = resolveScheme(appearance, device);
  const palette = scheme === 'dark' ? DARK : LIGHT;

  return {
    scheme,
    fonts: FONTS,
    colors: {
      ...palette,
      primary: primaryColor,
      onPrimary: readableTextOn(primaryColor),
    },
    elevation:
      scheme === 'light'
        ? {
            elevation: 3,
            shadowColor: '#15141B',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.07,
            shadowRadius: 12,
          }
        : {},
    spacing: (steps: number) => steps * SPACING_UNIT,
    radius: { sm: 6, md: 12, lg: 20, pill: 999 },
    fontSize: {
      caption: 13,
      body: 16,
      subtitle: 18,
      title: 22,
      display: 30,
    },
    touchTarget: 48,
  };
}

/**
 * Used before a municipality is chosen, and as a fallback.
 *
 * A placeholder until La Zubia sends its real colour: theirs is what a town
 * puts on its letterhead, and no app gets to choose it for them.
 */
export const FALLBACK_PRIMARY_COLOR = '#4F46E5';
