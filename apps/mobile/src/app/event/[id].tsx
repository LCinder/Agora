import {
  formatLongDate,
  formatTime,
  publicEventUrl,
  type Event,
  type EventCategory,
  type Organization,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

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

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        style={[styles.back, { margin: theme.spacing(3), minHeight: theme.touchTarget }]}
      >
        <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
      </Pressable>

      <ScreenScroll>
        <View style={{ gap: theme.spacing(4), paddingHorizontal: theme.spacing(5) }}>
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

          {event.location.latitude !== null && event.location.longitude !== null ? (
            <Map
              latitude={event.location.latitude}
              longitude={event.location.longitude}
              style={styles.map}
            />
          ) : null}

          {event.liveTrackingEnabled ? (
            <Button label={t('event.watchLive')} onPress={() => router.push(`/live/${event.id}`)} />
          ) : null}

          <View style={{ gap: theme.spacing(2) }}>
            <Button
              label={interested ? t('event.interestedDone') : t('event.interested')}
              variant={interested ? 'secondary' : 'primary'}
              onPress={() => void toggleInterest(event.id)}
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
  back: { alignSelf: 'flex-start', justifyContent: 'center' },
  grow: { flex: 1 },
  map: { height: 180 },
  row: { alignItems: 'center', flexDirection: 'row' },
});
