import {
  activitiesOf,
  activityEndsAt,
  byStartDate,
  eventEndsAt,
  type Activity,
  type Event,
} from '@agora/core';
import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { EventCard } from '../../components/event-card';
import { MarkedActivity } from '../../components/marked-activity';
import { CalendarSkeleton } from '../../components/skeleton';
import { useTabBarClearance } from '../../components/tab-bar';
import { Display, EmptyState, Loading, Screen, Subtitle } from '../../components/ui';
import { useMunicipalityData } from '../../hooks/use-municipality-data';
import { useApp } from '../../providers/app-provider';

/**
 * The events the resident marked as interesting.
 *
 * Nothing here left the device: the marks live in local storage and are tied
 * to no identity at all.
 */
export default function MyEventsScreen() {
  const { interestedActivityIds, interestedEventIds, municipality, ready, t, theme } = useApp();
  const { loading, refreshing, refresh, events, activities, categories } = useMunicipalityData();
  const clearance = useTabBarClearance(theme.spacing);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const marked = events.filter((event) => interestedEventIds.includes(event.id));

    return {
      upcoming: marked.filter((event) => eventEndsAt(event).getTime() >= now).sort(byStartDate),
      past: marked
        .filter((event) => eventEndsAt(event).getTime() < now)
        .sort((a, b) => byStartDate(b, a)),
    };
  }, [events, interestedEventIds]);

  /**
   * Activities marked without their event.
   *
   * Only those: somebody who marked the feria as well already has a card for it,
   * and printing the falconry show twice — once on its own and once inside
   * something they also marked — makes the screen read as a mistake. What this
   * section is for is the one line of a programme somebody picked out.
   */
  const markedActivities = useMemo(() => {
    const now = Date.now();

    return interestedActivityIds
      .filter((mark) => !interestedEventIds.includes(mark.eventId))
      .map((mark) => {
        const activity = activitiesOf(activities, mark.eventId).find(
          (entry) => entry.id === mark.activityId,
        );
        const event = events.find((entry) => entry.id === mark.eventId);

        return activity === undefined || event === undefined ? null : { activity, event };
      })
      .filter((entry): entry is { activity: Activity; event: Event } => entry !== null)
      .filter((entry) => activityEndsAt(entry.activity).getTime() >= now)
      .sort((left, right) => left.activity.startAt.getTime() - right.activity.startAt.getTime());
  }, [activities, events, interestedActivityIds, interestedEventIds]);

  if (!ready) {
    return (
      <Screen>
        <CalendarSkeleton />
      </Screen>
    );
  }

  if (!municipality) {
    return <Redirect href="/welcome" />;
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: theme.spacing(5), paddingTop: theme.spacing(4) }}>
        <Display>{t('myEvents.title')}</Display>
      </View>

      {loading ? (
        <Loading label={t('common.loading')} />
      ) : upcoming.length === 0 && past.length === 0 && markedActivities.length === 0 ? (
        <EmptyState title={t('myEvents.empty')} hint={t('myEvents.emptyHint')} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing(3),
            // Room for the floating tab bar. It was 40 against a bar 64 tall,
            // so the last event sat behind it with nowhere to scroll to — which
            // is what "no se puede hacer scroll" turned out to mean.
            paddingBottom: clearance,
            paddingHorizontal: theme.spacing(5),
            paddingTop: theme.spacing(4),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={theme.colors.textMuted}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surface}
            />
          }
        >
          {upcoming.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              category={categories.find((category) => category.id === event.categoryId)}
              activities={activitiesOf(activities, event.id)}
            />
          ))}

          {markedActivities.length > 0 ? (
            <Subtitle style={{ marginTop: theme.spacing(4) }}>{t('myEvents.activities')}</Subtitle>
          ) : null}

          {markedActivities.map(({ activity, event }) => (
            <MarkedActivity key={activity.id} activity={activity} event={event} />
          ))}

          {past.length > 0 ? (
            <Subtitle style={{ marginTop: theme.spacing(4) }}>{t('myEvents.past')}</Subtitle>
          ) : null}

          {past.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              category={categories.find((category) => category.id === event.categoryId)}
              activities={activitiesOf(activities, event.id)}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
