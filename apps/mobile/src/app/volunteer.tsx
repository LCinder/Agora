import { formatTime, type Event } from '@agora/core';
import { ApiError, type VolunteerSession } from '@agora/data';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Caption, Card, Display, Loading, Screen, Subtitle } from '../components/ui';
import { dataSource, usingRealBackend } from '../lib/data';
import { createAppVolunteerClient, type DemoTarget } from '../lib/volunteer';
import { useApp } from '../providers/app-provider';
import { FONTS } from '../theme/theme';

/**
 * Volunteer mode.
 *
 * Somebody from the hermandad is handed a code and walks the whole carrera with
 * this open. That is the entire design brief: one button big enough to press
 * without looking, a state you can read at a glance in the dark, and no way to
 * broadcast by accident.
 *
 * Foreground only, as decided for the MVP (CLAUDE.md, 7.4): background location
 * means a store review conversation we do not need before the first pilot. The
 * screen is kept awake instead, and says so.
 */

/** How often a position is offered to us. The API takes one every few seconds. */
const POSITION_INTERVAL_MS = 5000;

/** Metres of movement that also trigger a reading, for a slow procession. */
const POSITION_DISTANCE_M = 5;

/** So a pause does not fight the rest of the app over the screen lock. */
const KEEP_AWAKE_TAG = 'volunteer-live';

type Phase = 'code' | 'ready' | 'broadcasting' | 'paused';

export default function VolunteerScreen() {
  const { locale, municipality, t, theme } = useApp();
  const router = useRouter();

  const [demoTarget, setDemoTarget] = useState<DemoTarget | null>(null);
  const [session, setSession] = useState<VolunteerSession | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [phase, setPhase] = useState<Phase>('code');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  const watcher = useRef<Location.LocationSubscription | null>(null);

  const ready = usingRealBackend || demoTarget !== null;
  const client = useMemo(() => createAppVolunteerClient(demoTarget), [demoTarget]);

  // The demo has no API, so the code opens the live event of the seed. Resolved
  // here and not in the client because only a screen knows which town is shown.
  useEffect(() => {
    if (usingRealBackend || !municipality) return;
    let active = true;

    async function resolve(municipalityId: string) {
      const events = await dataSource.listEvents(municipalityId);
      const live = events.find((candidate) => candidate.liveTrackingEnabled);

      if (!active) return;

      setDemoTarget({ municipalityId, eventId: live?.id ?? '' });
    }

    void resolve(municipality.id);

    return () => {
      active = false;
    };
  }, [municipality]);

  // A phone that died halfway down the route comes back to the same session.
  useEffect(() => {
    let active = true;

    async function resume() {
      const stored = await client.resume();

      if (!active || stored === null) return;

      setSession(stored);
      setPhase('ready');
    }

    void resume();

    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (session === null) {
      setEvent(null);
      return;
    }

    let active = true;

    async function load(current: VolunteerSession) {
      const found = await dataSource.getEvent(current.municipalityId, current.eventId);

      if (active) setEvent(found);
    }

    void load(session);

    return () => {
      active = false;
    };
  }, [session]);

  // The screen stays on while broadcasting, and only while broadcasting.
  useEffect(() => {
    if (phase !== 'broadcasting') return;

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);

    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [phase]);

  const stopWatching = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
  }, []);

  // Leaving the screen has to stop the phone being a beacon, whatever the reason.
  useEffect(() => stopWatching, [stopWatching]);

  const onPosition = useCallback(
    async (reading: Location.LocationObject) => {
      try {
        const at = await client.send({
          latitude: reading.coords.latitude,
          longitude: reading.coords.longitude,
          accuracyMeters: reading.coords.accuracy ?? null,
        });

        setLastSentAt(at);
        setNotice(null);
      } catch (thrown) {
        if (thrown instanceof ApiError && thrown.failure.kind === 'status') {
          // The token is gone: the client already forgot it, so ask for a code.
          if (thrown.failure.status === 401) {
            stopWatching();
            setSession(null);
            setPhase('code');
            setNotice(t('volunteer.expired'));

            return;
          }

          // The town hall paused the live session. Keep the code and keep asking:
          // when they resume it, the next reading lands without anyone's help.
          if (thrown.failure.status === 403) {
            setNotice(t('volunteer.notActive'));

            return;
          }
        }

        // No coverage in a street full of people is the normal case, not a fault.
        setNotice(t('volunteer.offline'));
      }
    },
    [client, stopWatching, t],
  );

  async function enter() {
    setBusy(true);
    setNotice(null);

    try {
      const opened = await client.redeem(code);

      setSession(opened);
      setPhase('ready');
      setCode('');
    } catch {
      setNotice(t('volunteer.badCode'));
    } finally {
      setBusy(false);
    }
  }

  async function startBroadcasting() {
    setNotice(null);

    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      setNotice(t('volunteer.permissionDenied'));

      return;
    }

    stopWatching();
    watcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: POSITION_INTERVAL_MS,
        distanceInterval: POSITION_DISTANCE_M,
      },
      (reading) => void onPosition(reading),
    );

    setPhase('broadcasting');
  }

  function pause() {
    // Nothing is told to the API: it stops receiving, and the neighbours' map
    // says how long ago the last position arrived, which is the honest answer.
    stopWatching();
    setPhase('paused');
    setNotice(null);
  }

  async function finish() {
    stopWatching();
    await client.forget();

    setSession(null);
    setPhase('code');
    setLastSentAt(null);
    setNotice(null);
  }

  if (!ready) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  const broadcasting = phase === 'broadcasting';
  const context = {
    now: new Date(),
    timeZone: municipality?.timeZone ?? 'Europe/Madrid',
    locale,
  };

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing(4), padding: theme.spacing(5) }}>
        <View style={[styles.header, { gap: theme.spacing(3) }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={({ pressed }) => [
              styles.back,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radius.pill,
                minHeight: theme.touchTarget,
                minWidth: theme.touchTarget,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </Pressable>
          <Display style={styles.grow}>{t('volunteer.title')}</Display>
        </View>

        {phase === 'code' ? (
          <>
            <Body tone="muted">{t('volunteer.intro')}</Body>

            <Card>
              <Caption>{t('volunteer.codeLabel')}</Caption>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder={t('volunteer.codePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel={t('volunteer.codeLabel')}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={16}
                onSubmitEditing={() => void enter()}
                style={[
                  styles.code,
                  {
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    color: theme.colors.text,
                    marginTop: theme.spacing(3),
                    minHeight: theme.touchTarget,
                    paddingHorizontal: theme.spacing(4),
                  },
                ]}
              />
              <Button
                label={busy ? t('volunteer.checking') : t('volunteer.enter')}
                onPress={() => void enter()}
                disabled={busy || code.trim().length === 0}
                style={{ marginTop: theme.spacing(3) }}
              />
            </Card>
          </>
        ) : (
          <>
            <Card>
              <View style={[styles.status, { gap: theme.spacing(2) }]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: broadcasting ? theme.colors.live : theme.colors.textMuted },
                  ]}
                />
                <Subtitle>
                  {broadcasting
                    ? t('volunteer.broadcasting')
                    : phase === 'paused'
                      ? t('volunteer.paused')
                      : t('volunteer.ready')}
                </Subtitle>
              </View>
              {event ? (
                <Body style={{ marginTop: theme.spacing(2) }} numberOfLines={2}>
                  {event.title}
                </Body>
              ) : null}
              <Caption style={{ marginTop: theme.spacing(2) }}>
                {lastSentAt === null
                  ? t('volunteer.noneSent')
                  : t('volunteer.lastSent', { time: formatTime(lastSentAt, context) })}
              </Caption>
            </Card>

            <Pressable
              onPress={() => (broadcasting ? pause() : void startBroadcasting())}
              accessibilityRole="button"
              accessibilityLabel={
                broadcasting
                  ? t('volunteer.pause')
                  : phase === 'paused'
                    ? t('volunteer.resume')
                    : t('volunteer.start')
              }
              style={({ pressed }) => [
                styles.bigButton,
                {
                  backgroundColor: broadcasting ? theme.colors.surface : theme.colors.live,
                  borderColor: broadcasting ? theme.colors.live : theme.colors.live,
                  borderRadius: theme.radius.lg,
                  gap: theme.spacing(3),
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name={broadcasting ? 'pause' : 'radio-outline'}
                size={64}
                color={broadcasting ? theme.colors.live : theme.colors.background}
              />
              <Text
                style={[
                  styles.bigLabel,
                  { color: broadcasting ? theme.colors.live : theme.colors.background },
                ]}
              >
                {broadcasting
                  ? t('volunteer.pause')
                  : phase === 'paused'
                    ? t('volunteer.resume')
                    : t('volunteer.start')}
              </Text>
            </Pressable>

            <Button
              label={t('volunteer.finish')}
              variant="secondary"
              onPress={() => void finish()}
            />
            <Caption>{t('volunteer.keepOpen')}</Caption>
          </>
        )}

        {notice === null ? null : <Body tone="danger">{notice}</Body>}

        <View style={styles.grow} />

        <Caption>{t('volunteer.privacy')}</Caption>
        {usingRealBackend ? null : <Caption>{t('volunteer.demoNotice')}</Caption>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  bigButton: {
    alignItems: 'center',
    borderWidth: 2,
    flexDirection: 'column',
    justifyContent: 'center',
    // Big enough to find without looking, on a phone held at waist height in a
    // crowd. This is the whole interface for the next three hours.
    minHeight: 200,
  },
  bigLabel: { fontFamily: FONTS.black, fontSize: 22, letterSpacing: -0.4 },
  code: { borderWidth: 1, fontFamily: FONTS.bold, fontSize: 28, letterSpacing: 6 },
  dot: { borderRadius: 999, height: 12, width: 12 },
  grow: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row' },
  status: { alignItems: 'center', flexDirection: 'row' },
});
