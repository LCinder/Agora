import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../providers/app-provider';
import { MAP_STYLE_URL, type MapProps } from './map-shared';

/**
 * Map for iOS and Android, on MapLibre with OpenStreetMap tiles.
 *
 * OpenStreetMap rather than Google Maps because the product has to run at a
 * few euros per municipality per month, and Google's per-load pricing does not
 * survive a procession watched by half the town. The web build uses the
 * MapLibre JS renderer instead, in map.web.tsx.
 */
export function Map({ latitude, longitude, route, live, marker = true, style }: MapProps) {
  const theme = useTheme();
  const camera = useRef<CameraRef>(null);

  useEffect(() => {
    if (!live) return;

    camera.current?.flyTo({ center: [live.longitude, live.latitude], duration: 800 });
  }, [live]);

  return (
    <View style={[styles.container, { borderRadius: theme.radius.md }, style]}>
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE_URL} attribution>
        <Camera
          ref={camera}
          initialViewState={{
            center: [live?.longitude ?? longitude, live?.latitude ?? latitude],
            zoom: route ? 14 : 15,
          }}
        />

        {route ? (
          <GeoJSONSource
            id="planned-route"
            data={{ type: 'Feature', properties: {}, geometry: route }}
          >
            <Layer
              id="planned-route-line"
              type="line"
              paint={{ 'line-color': theme.colors.primary, 'line-width': 4, 'line-opacity': 0.9 }}
            />
          </GeoJSONSource>
        ) : null}

        {marker ? (
          <Marker id="event-location" lngLat={[longitude, latitude]}>
            <View style={[styles.pin, { backgroundColor: theme.colors.primary }]} />
          </Marker>
        ) : null}

        {live ? (
          <Marker id="live-position" lngLat={[live.longitude, live.latitude]}>
            <View style={[styles.pin, { backgroundColor: theme.colors.danger }]} />
          </Marker>
        ) : null}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  pin: {
    borderColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 3,
    height: 20,
    width: 20,
  },
});
