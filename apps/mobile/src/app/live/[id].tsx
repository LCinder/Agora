import { isPositionStale, minutesSince, type Event, type Route } from '@agora/core';
import type { LiveView } from '@agora/data';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Map } from '../../components/map';
import { Body, Caption, Loading, Screen } from '../../components/ui';
import { dataSource } from '../../lib/data';
import { liveClient } from '../../lib/live';
import { useApp } from '../../providers/app-provider';
import { FONTS } from '../../theme/theme';

/**
 * Live tracking of a procession or parade.
 *
 * One screen, two sources. Against a real API it polls the last position the
 * volunteer sent; in the demo it replays the planned route as if somebody were
 * walking it. What a resident sees is the same either way, which is the point:
 * the version shown in a town hall meeting is the version that ships.
 */

/** How often the simulated position advances. */
const SIMULATION_TICK_MS = 1500;

/**
 * How often the real position is asked for. The API caches it for five seconds,
 * so asking faster would only return the same answer.
 */
const POLL_MS = 5000;

/** Replays the recorded route. Does nothing when there is an API to ask. */
function useSimulatedLive(route: Route | null): { point: [number, number]; at: Date } | null {
  const [index, setIndex] = useState(0);
  const [at, setAt] = useState(() => new Date());

  useEffect(() => {
    if (liveClient !== null || route === null) return;

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % route.coordinates.length);
      setAt(new Date());
    }, SIMULATION_TICK_MS);

    return () => clearInterval(timer);
  }, [route]);

  if (liveClient === null && route !== null) {
    const point = route.coordinates[index];

    if (point !== undefined) return { point, at };
  }

  return null;
}

/**
 * The live session as the API tells it, refreshed every few seconds.
 *
 * A poll that fails changes nothing on purpose: the previous position stays on
 * the map and its own timestamp ages, which is exactly what the screen says out
 * loud. Coverage dies in a street full of people, and that is not an error state.
 */
function useRemoteLive(eventId: string | undefined): LiveView | null {
  const [view, setView] = useState<LiveView | null>(null);

  useEffect(() => {
    const client = liveClient;

    if (client === null || eventId === undefined) return;

    let active = true;

    // An arrow rather than a declaration so `client` stays narrowed inside it.
    const poll = async (id: string) => {
      try {
        const fresh = await client.view(id);

        if (active && fresh !== null) setView(fresh);
      } catch {
        // Keep whatever is on the map and let the timestamp speak.
      }
    };

    void poll(eventId);

    const timer = setInterval(() => void poll(eventId), POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId]);

  return view;
}

export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { municipality, t, theme } = useApp();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [seedRoute, setSeedRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useRef(new Date());

  const remote = useRemoteLive(id);

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
      setSeedRoute(plannedRoute);
      setLoading(false);
    }

    void load(municipality.id, id);

    return () => {
      active = false;
    };
  }, [id, municipality]);

  // The route the map draws: what the town hall planned, what is left of the
  // session once it ended, or the recorded one the demo replays.
  const route = remote?.plannedRoute ?? remote?.simplifiedRoute ?? seedRoute;
  const simulated = useSimulatedLive(route);

  if (loading || !municipality) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  const position = remote?.position ?? null;
  const live =
    position !== null
      ? { latitude: position.latitude, longitude: position.longitude }
      : simulated !== null
        ? { longitude: simulated.point[0], latitude: simulated.point[1] }
        : null;

  const centre = live ?? {
    latitude: municipality.latitude,
    longitude: municipality.longitude,
  };

  // Recomputed on every render, which happens on every poll and every tick.
  now.current = new Date();
  const updatedAt = position?.recordedAt ?? simulated?.at ?? null;
  const stale = position !== null && isPositionStale(position, now.current);

  function statusLine(): string {
    if (remote?.status === 'scheduled') return t('live.notStarted');
    if (remote?.status === 'ended') return t('live.finished');
    if (updatedAt === null) return t('live.notStarted');

    const minutes = minutesSince(updatedAt, now.current);

    return stale ? t('live.stale', { minutes }) : t('live.lastUpdate', { minutes });
  }

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
            {/* Grey when the dot on the map is older than the domain's threshold:
                a four-minute-old position presented as live is worse than one
                that admits it. */}
            <View
              style={[
                styles.dot,
                { backgroundColor: stale ? theme.colors.textMuted : theme.colors.live },
              ]}
            />
            <Text
              style={[
                styles.badgeText,
                { color: stale ? theme.colors.textMuted : theme.colors.live },
              ]}
            >
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
          <Caption>{statusLine()}</Caption>
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
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  liveBadge: { alignItems: 'center', flexDirection: 'row', height: 36 },
  map: { borderRadius: 0, flex: 1 },
  overlay: { left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { borderTopWidth: 1 },
  sheetHolder: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { fontFamily: FONTS.black, fontSize: 24, letterSpacing: -0.5, lineHeight: 26 },
});
