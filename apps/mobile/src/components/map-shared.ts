import type { Route } from '@agora/core';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Everything both map implementations agree on.
 *
 * Kept in its own module so `map.tsx` and `map.web.tsx` cannot drift apart,
 * and so the tile source is decided in exactly one place.
 */

export interface MapProps {
  latitude: number;
  longitude: number;
  /** Planned route of a live event, drawn as a line. */
  route?: Route | null;
  /** Live position of the volunteer, drawn on top of the route. */
  live?: { latitude: number; longitude: number } | null;
  marker?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Map styles, one per theme.
 *
 * A bright map inside a dark app is a hole punched in the screen, and at night
 * it is the brightest thing a neighbour following a procession will be looking
 * at. Both are demo-grade choices: for production the tiles should come from a
 * provider with a usage agreement, since a procession watched by thousands at
 * once is exactly the traffic the OSM foundation asks people not to send.
 */
const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

export function mapStyleUrl(scheme: 'dark' | 'light'): string {
  return MAP_STYLES[scheme];
}
