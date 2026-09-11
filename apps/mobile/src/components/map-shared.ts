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
 * Free raster style backed by OpenStreetMap.
 *
 * A demo-grade choice: for production the tiles should be served from a
 * provider with a usage agreement, since a procession watched by thousands at
 * once is exactly the traffic the OSM foundation asks people not to send.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
