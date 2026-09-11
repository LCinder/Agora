import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../providers/app-provider';
import { MAP_STYLE_URL, type MapProps } from './map-shared';

/**
 * Map for the web build, on the MapLibre JS renderer.
 *
 * The native module in map.tsx cannot run in a browser, and the web build is
 * what lets the demo be shown from a laptop in a meeting room.
 */
export function Map({ latitude, longitude, route, live, marker = true, style }: MapProps) {
  const theme = useTheme();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const liveMarker = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [longitude, latitude],
      zoom: route ? 13 : 15,
      attributionControl: { compact: true },
    });

    instance.on('load', () => {
      if (route) {
        instance.addSource('planned-route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: route },
        });
        instance.addLayer({
          id: 'planned-route-line',
          type: 'line',
          source: 'planned-route',
          paint: {
            'line-color': theme.colors.primary,
            'line-width': 4,
            'line-opacity': 0.9,
          },
        });
      }

      if (marker) {
        new maplibregl.Marker({ color: theme.colors.primary })
          .setLngLat([longitude, latitude])
          .addTo(instance);
      }
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
    // The map is created once; later prop changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !live) return;

    if (!liveMarker.current) {
      liveMarker.current = new maplibregl.Marker({ color: '#B3261E' });
      liveMarker.current.addTo(instance);
    }

    liveMarker.current.setLngLat([live.longitude, live.latitude]);
    instance.easeTo({ center: [live.longitude, live.latitude], duration: 800 });
  }, [live]);

  return (
    <View style={[styles.container, { borderRadius: theme.radius.md }, style]}>
      <div ref={container} style={{ height: '100%', width: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
