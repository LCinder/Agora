import type { Event } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Loading, Screen } from '../../components/ui';
import { Map } from '../../components/map';
import { dataSource } from '../../lib/data';
import { useApp } from '../../providers/app-provider';
import { FONTS } from '../../theme/theme';

/**
 * The location, full screen.
 *
 * A map inside a detail page is a picture of a map: it is too small to pan and
 * too small to zoom, and "where is Parque de la Encina" is a question a
 * neighbour answers by moving around the map, not by looking at a thumbnail.
 * So the thumbnail is a door, and this is the room.
 */
export default function MapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { municipality, t, theme } = useApp();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!municipality || !id) return;
    let active = true;

    async function load(municipalityId: string, eventId: string) {
      const found = await dataSource.getEvent(municipalityId, eventId);
      if (!active) return;

      setEvent(found);
      setLoading(false);
    }

    void load(municipality.id, id);

    return () => {
      active = false;
    };
  }, [id, municipality]);

  if (loading || !municipality) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  const latitude = event?.location.latitude ?? municipality.latitude;
  const longitude = event?.location.longitude ?? municipality.longitude;

  return (
    <Screen edges={[]}>
      <View style={StyleSheet.absoluteFill}>
        <Map latitude={latitude} longitude={longitude} style={styles.map} />
      </View>

      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={({ pressed }) => [
            styles.back,
            theme.elevation,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.pill,
              margin: theme.spacing(4),
              minHeight: theme.touchTarget,
              minWidth: theme.touchTarget,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.sheetHolder} pointerEvents="box-none">
        <View
          style={[
            theme.elevation,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              gap: theme.spacing(1),
              margin: theme.spacing(4),
              padding: theme.spacing(4),
            },
          ]}
        >
          <Text style={[styles.place, { color: theme.colors.text }]} numberOfLines={2}>
            {event?.location.name ?? municipality.name}
          </Text>
          <Text style={[styles.town, { color: theme.colors.textMuted }]}>{municipality.name}</Text>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center' },
  map: { borderRadius: 0, flex: 1 },
  overlay: { left: 0, position: 'absolute', right: 0, top: 0 },
  place: { fontFamily: FONTS.black, fontSize: 22, letterSpacing: -0.4, lineHeight: 25 },
  sheetHolder: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  town: { fontFamily: FONTS.regular, fontSize: 15 },
});
