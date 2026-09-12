import { minutesSince, type Event, type Route } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Map } from '../../components/map';
import { Body, Caption, Loading, Screen } from '../../components/ui';
import { dataSource } from '../../lib/data';
import { useApp } from '../../providers/app-provider';
import { FONTS } from '../../theme/theme';

/**
 * Live tracking of a procession or parade.
 *
 * Phase 0 replays the planned route as if a volunteer were walking it. The
 * real version, with a volunteer broadcasting from their phone, lands in phase
 * 2; the screen a resident sees is meant to be the same one.
 */

/** How often the simulated position advances. The real one targets 5-10 s. */
const TICK_MS = 1500;

export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { municipality, t, theme } = useApp();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [index, setIndex] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!municipality || !id) return;
    let active = true;

    async function load(municipalityId: string, eventId: string) {
      const [found, plannedRoute] = await Promise.all([
        dataSource.getEvent(municipalityId, eventId),
        dataSource.getPlannedRoute(municipalityId),
      ]);

      if (!active) return;

      setEvent(found);
      setRoute(plannedRoute);
      setLoading(false);
    }

    void load(municipality.id, id);

    return () => {
      active = false;
    };
  }, [id, municipality]);

  useEffect(() => {
    if (!route) return;

    timer.current = setInterval(() => {
      setIndex((current) => (current + 1) % route.coordinates.length);
      setUpdatedAt(new Date());
    }, TICK_MS);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [route]);

  if (loading || !municipality) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  const point = route?.coordinates[index];
  const live = point ? { longitude: point[0], latitude: point[1] } : null;
  const centre = live ?? {
    latitude: municipality.latitude,
    longitude: municipality.longitude,
  };

  return (
    <Screen edges={[]}>
      {/* The map runs the whole screen: following a procession means watching
          the map, and everything else floats over it. */}
      <View style={StyleSheet.absoluteFill}>
        {route ? (
          <Map
            latitude={centre.latitude}
            longitude={centre.longitude}
            route={route}
            live={live}
            marker={false}
            style={styles.map}
          />
        ) : (
          <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
            <Body tone="muted">{t('live.notStarted')}</Body>
          </View>
        )}
      </View>

      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.header, { gap: theme.spacing(3), padding: theme.spacing(4) }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={({ pressed }) => [
              styles.back,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.pill,
                minHeight: theme.touchTarget,
                minWidth: theme.touchTarget,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </Pressable>

          <View
            style={[
              styles.liveBadge,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.pill,
                gap: theme.spacing(2),
                paddingHorizontal: theme.spacing(3),
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: theme.colors.live }]} />
            <Text style={[styles.badgeText, { color: theme.colors.live }]}>
              {t('live.title').toUpperCase()}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.sheetHolder} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              gap: theme.spacing(3),
              padding: theme.spacing(5),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
            {event?.title ?? ''}
          </Text>
          <Caption>
            {t('live.lastUpdate', { minutes: minutesSince(updatedAt, new Date()) })}
          </Caption>
          <Caption>{t('live.plannedRoute')}</Caption>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.4 },
  centre: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  dot: { borderRadius: 999, height: 9, width: 9 },
  grabber: { alignSelf: 'center', borderRadius: 999, height: 4, width: 42 },
  grow: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  liveBadge: { alignItems: 'center', flexDirection: 'row', height: 36 },
  map: { borderRadius: 0, flex: 1 },
  overlay: { left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { borderTopWidth: 1 },
  sheetHolder: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { fontFamily: FONTS.black, fontSize: 24, letterSpacing: -0.5, lineHeight: 26 },
});
