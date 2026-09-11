import { minutesSince, type Event, type Route } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Map } from '../../components/map';
import { Badge, Body, Caption, Display, Loading, Screen, Subtitle } from '../../components/ui';
import { dataSource } from '../../lib/data';
import { useApp } from '../../providers/app-provider';

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
    <Screen>
      <View
        style={[
          styles.header,
          {
            gap: theme.spacing(2),
            paddingHorizontal: theme.spacing(5),
            paddingTop: theme.spacing(2),
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={{ justifyContent: 'center', minHeight: theme.touchTarget, width: 40 }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
        <View style={styles.grow}>
          <Display>{t('live.title')}</Display>
        </View>
        <Badge label={t('live.title')} color={theme.colors.danger} />
      </View>

      <View style={{ gap: theme.spacing(2), padding: theme.spacing(5) }}>
        <Subtitle>{event?.title ?? ''}</Subtitle>
        <Caption>{t('live.lastUpdate', { minutes: minutesSince(updatedAt, new Date()) })}</Caption>
      </View>

      <View style={{ flex: 1, paddingHorizontal: theme.spacing(5) }}>
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
          <Body tone="muted">{t('live.notStarted')}</Body>
        )}
      </View>

      <View style={{ padding: theme.spacing(5) }}>
        <Caption>{t('live.plannedRoute')}</Caption>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row' },
  map: { flex: 1 },
});
