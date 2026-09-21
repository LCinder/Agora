import {
  formatLongDate,
  formatTime,
  publicEventUrl,
  reportableCount,
  type Event,
  type EventCategory,
  type Organization,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, View } from 'react-native';

import { EventCover } from '../../components/event-cover';
import { Map } from '../../components/map';
import {
  Badge,
  Body,
  Button,
  Display,
  Loading,
  Screen,
  ScreenScroll,
  Subtitle,
} from '../../components/ui';
import { PUBLIC_SITE_URL } from '../../lib/config';
import { dataSource } from '../../lib/data';
import { recordView } from '../../lib/devices';
import { useApp } from '../../providers/app-provider';

/**
 * Event detail.
 *
 * The three actions at the bottom are the ones that matter commercially:
 * "Me interesa" feeds the reminders and the data panel, "Añadir a mi
 * calendario" makes the app useful even to someone who never opens it again,
 * and "Compartir" is how the app reaches neighbours who do not have it.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, municipality, t, theme, isInterested, toggleInterest } = useApp();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [category, setCategory] = useState<EventCategory | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const [loading, setLoading] = useState(true);
  /**
   * This phone's own effect on the count, since the page loaded.
   *
   * The number came with the event and the mark is written in the background,
   * so without this a neighbour taps "Me interesa", the heart fills and the
   * count next to it does not move — which reads as the tap not having worked.
   * Re-reading the event instead would be a round trip to say something the
   * phone already knows.
   */
  const [ownDelta, setOwnDelta] = useState(0);

  useEffect(() => {
    if (!municipality || !id) return;
    let active = true;

    async function load(municipalityId: string, eventId: string) {
      const found = await dataSource.getEvent(municipalityId, eventId);
      const categories = await dataSource.listCategories(municipalityId);
      const organizations = await dataSource.listOrganizations(municipalityId);

      if (!active) return;

      setEvent(found);
      setCategory(categories.find((entry) => entry.id === found?.categoryId));
      setOrganization(organizations.find((entry) => entry.id === found?.organizationId));
      setLoading(false);
    }

    void load(municipality.id, id);

    // Counted once per phone per day, and not awaited: the page is already on
    // screen and a statistic must never be something the neighbour waits for.
    void recordView(municipality.id, id);

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

  if (!event) {
    return (
      <Screen>
        <View style={{ padding: theme.spacing(5) }}>
          <Body>{t('event.notFound')}</Body>
        </View>
      </Screen>
    );
  }

  const context = { now: new Date(), timeZone: municipality.timeZone, locale };
  const interested = isInterested(event.id);

  async function share(current: Event) {
    const url = publicEventUrl(PUBLIC_SITE_URL, municipality!.slug, current.id);

    await Share.share({
      title: current.title,
      message: `${current.title}\n${formatLongDate(current.startAt, context)}\n${url}`,
    });
  }

  async function addToCalendar(current: Event) {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const target = calendars.find((calendar) => calendar.allowsModifications);
    if (!target) return;

    await Calendar.createEventAsync(target.id, {
      title: current.title,
      startDate: current.startAt,
      endDate: current.endAt ?? new Date(current.startAt.getTime() + 2 * 60 * 60 * 1000),
      location: current.location.name,
      notes: current.description,
      timeZone: municipality!.timeZone,
    });

    Alert.alert(current.title, t('event.addToCalendar'));
  }

  const coverWidth = Dimensions.get('window').width;

  return (
    <Screen>
      <ScreenScroll>
        {/* The cover runs full bleed: it is the poster, and a poster with a
            margin round it is a thumbnail. */}
        <View style={styles.cover}>
          <EventCover
            event={event}
            category={category}
            size="hero"
            width={coverWidth}
            height={Math.round(coverWidth * 0.92)}
            rounded={false}
          />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={({ pressed }) => [
              styles.back,
              {
                borderRadius: theme.radius.pill,
                margin: theme.spacing(3),
                minHeight: theme.touchTarget,
                minWidth: theme.touchTarget,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        <View
          style={{
            gap: theme.spacing(4),
            paddingHorizontal: theme.spacing(5),
            paddingTop: theme.spacing(5),
          }}
        >
          <View style={[styles.row, { gap: theme.spacing(2) }]}>
            {event.status === 'cancelled' ? (
              <Badge label={t('event.cancelled')} color={theme.colors.danger} />
            ) : null}
            {category ? <Badge label={category.name} color={category.color} /> : null}
          </View>

          <Display>{event.title}</Display>

          <View style={{ gap: theme.spacing(2) }}>
            <Row icon="calendar-outline" text={formatLongDate(event.startAt, context)} />
            {event.allDay ? null : (
              <Row
                icon="time-outline"
                text={
                  event.endAt
                    ? `${formatTime(event.startAt, context)} – ${formatTime(event.endAt, context)}`
                    : formatTime(event.startAt, context)
                }
              />
            )}
            <Row icon="location-outline" text={event.location.name} />
            <Row
              icon="people-outline"
              text={
                organization
                  ? t('event.organisedBy', { name: organization.name })
                  : t('event.byTownHall')
              }
            />
            <Row
              icon="pricetag-outline"
              text={event.isFree ? t('event.priceFree') : (event.priceInfo ?? '')}
            />
          </View>

          {event.description ? <Body>{event.description}</Body> : null}

          <Audience
            interested={Math.max(0, event.interestCount + ownDelta)}
            views={event.viewCount}
          />

          {/* The thumbnail is a door, not a map: at this size it cannot be
              panned or zoomed, so tapping it opens the real thing. */}
          {event.location.latitude !== null && event.location.longitude !== null ? (
            <Pressable
              onPress={() => router.push(`/map/${event.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('event.openMap', { place: event.location.name })}
              style={({ pressed }) => [styles.mapDoor, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Map
                latitude={event.location.latitude}
                longitude={event.location.longitude}
                interactive={false}
                style={styles.map}
              />
              <View
                style={[
                  styles.expand,
                  theme.elevation,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.pill,
                    margin: theme.spacing(3),
                  },
                ]}
              >
                <Ionicons name="expand" size={18} color={theme.colors.text} />
              </View>
            </Pressable>
          ) : null}

          {event.liveTrackingEnabled ? (
            <Button label={t('event.watchLive')} onPress={() => router.push(`/live/${event.id}`)} />
          ) : null}

          <View style={{ gap: theme.spacing(2) }}>
            <Button
              label={interested ? t('event.interestedDone') : t('event.interested')}
              variant={interested ? 'secondary' : 'primary'}
              onPress={() => {
                setOwnDelta((current) => current + (interested ? -1 : 1));
                void toggleInterest(event.id);
              }}
            />
            <Button
              label={t('event.addToCalendar')}
              variant="secondary"
              onPress={() => void addToCalendar(event)}
            />
            <Button
              label={t('event.share')}
              variant="secondary"
              onPress={() => void share(event)}
            />
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

/**
 * What the town thinks of this event: how many marked it, how many opened it.
 *
 * Two numbers and nothing else. Neither can be traced back to a phone, let
 * alone to a neighbour — the index that would answer it belongs to the reminder
 * job alone (D-032) — and the second is counted once per phone per day, so it
 * is openings and not taps.
 *
 * Shown to residents and not only to the town hall on purpose: a full calendar
 * is worth more when you can see which things the town is actually going to.
 * Both go through the same floor the panel applies to its own figures, so a
 * number too small to be a statistic is left out rather than printed under the
 * event for the whole town to read.
 */
function Audience({ interested, views }: { interested: number; views: number }) {
  const { t, theme } = useApp();

  const marks = reportableCount(interested);
  const opens = reportableCount(views);

  if (marks === null && opens === null) return null;

  const parts = [
    marks === null ? null : t('event.interestedCount', { count: marks }),
    opens === null ? null : t('event.viewsCount', { count: opens }),
  ].filter((part): part is string => part !== null);

  return (
    <View style={[styles.row, { gap: theme.spacing(2) }]}>
      <Ionicons name="heart-outline" size={18} color={theme.colors.textMuted} />
      <Subtitle style={styles.grow}>{parts.join(' · ')}</Subtitle>
    </View>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { theme } = useApp();

  if (!text) return null;

  return (
    <View style={[styles.row, { gap: theme.spacing(2) }]}>
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
      <Subtitle style={styles.grow}>{text}</Subtitle>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(18,18,17,0.45)',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
  },
  cover: { position: 'relative' },
  expand: {
    alignItems: 'center',
    bottom: 0,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 40,
  },
  grow: { flex: 1 },
  map: { height: 180 },
  mapDoor: { position: 'relative' },
  row: { alignItems: 'center', flexDirection: 'row' },
});
