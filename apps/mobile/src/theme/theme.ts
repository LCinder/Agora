import type { ColorSchemeName } from 'react-native';

/**
 * Design tokens.
 *
 * Two constraints shape them. The app is used by older neighbours, so text is
 * large, contrast is high and touch targets are generous. And it is sold to
 * public administrations, which means RD 1112/2018 and WCAG 2.1 AA: every
 * colour pair here is meant to clear 4.5:1, and nothing relies on colour alone
 * to carry meaning.
 */

export interface Theme {
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
    onPrimary: string;
    danger: string;
    onDanger: string;
  };
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

const LIGHT = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#EEEEEA',
  border: '#D6D6D0',
  text: '#1A1A17',
  textMuted: '#5C5C55',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
};

const DARK = {
  background: '#131313',
  surface: '#1E1E1C',
  surfaceMuted: '#2A2A27',
  border: '#3C3C38',
  text: '#F2F2EF',
  textMuted: '#B0B0A8',
  danger: '#F2B8B5',
  onDanger: '#3B0907',
};

/** Relative luminance, per the WCAG definition. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Black or white text on the municipality colour, whichever reads better.
 *
 * The colour comes from the town hall and cannot be assumed to be dark: a
 * fixed white label would disappear on a yellow or light blue brand.
 */
export function readableTextOn(backgroundHex: string): string {
  return luminance(backgroundHex) > 0.45 ? '#1A1A17' : '#FFFFFF';
}

export function createTheme(primaryColor: string, scheme: ColorSchemeName): Theme {
  const palette = scheme === 'dark' ? DARK : LIGHT;

  return {
    colors: {
      ...palette,
      primary: primaryColor,
      onPrimary: readableTextOn(primaryColor),
    },
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

/** Used before a municipality is chosen, and as a fallback. */
export const FALLBACK_PRIMARY_COLOR = '#1B5E20';
