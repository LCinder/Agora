import { formatWhen, type Event, type EventCategory } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../providers/app-provider';
import { Badge, Body, Caption, Card, Subtitle } from './ui';

/**
 * One event in a list.
 *
 * A cancelled event keeps its place with a clear badge rather than
 * disappearing: a neighbour who planned their evening around it needs to find
 * out, and an event that silently vanishes reads as a bug.
 */
export function EventCard({
  event,
  category,
}: {
  event: Event;
  category: EventCategory | undefined;
}) {
  const { locale, municipality, t, theme, isInterested } = useApp();
  const router = useRouter();

  if (!municipality) return null;

  const when = formatWhen(event, {
    now: new Date(),
    timeZone: municipality.timeZone,
    locale,
  });

  const cancelled = event.status === 'cancelled';

  return (
    <Card
      onPress={() => router.push(`/event/${event.id}`)}
      accessibilityLabel={`${event.title}. ${when}. ${event.location.name}`}
      style={cancelled ? styles.cancelled : undefined}
    >
      <View style={{ gap: theme.spacing(2) }}>
        <View style={[styles.row, { gap: theme.spacing(2) }]}>
          {cancelled ? <Badge label={t('event.cancelled')} color={theme.colors.danger} /> : null}
          {event.isFeatured && !cancelled ? (
            <Badge label={t('calendar.featured')} color={theme.colors.primary} />
          ) : null}
          {category ? <Badge label={category.name} color={category.color} /> : null}
        </View>

        <Subtitle numberOfLines={2}>{event.title}</Subtitle>

        <View style={[styles.row, { gap: theme.spacing(2) }]}>
          <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
          <Caption>{when}</Caption>
        </View>

        <View style={[styles.row, { gap: theme.spacing(2) }]}>
          <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
          <Caption numberOfLines={1} style={styles.grow}>
            {event.location.name}
          </Caption>
        </View>

        <View style={[styles.row, { gap: theme.spacing(3) }]}>
          {event.isFree ? <Body tone="primary">{t('common.free')}</Body> : null}
          {!event.isFree && event.priceInfo ? <Body tone="muted">{event.priceInfo}</Body> : null}
          <View style={styles.grow} />
          {isInterested(event.id) ? (
            <Ionicons name="heart" size={18} color={theme.colors.primary} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cancelled: { opacity: 0.7 },
  grow: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row' },
});
