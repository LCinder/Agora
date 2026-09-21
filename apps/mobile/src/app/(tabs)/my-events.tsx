import { byStartDate, eventEndsAt } from '@agora/core';
import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { EventCard } from '../../components/event-card';
import { CalendarSkeleton } from '../../components/skeleton';
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
  const { interestedEventIds, municipality, ready, t, theme } = useApp();
  const { loading, refreshing, refresh, events, categories } = useMunicipalityData();

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
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState title={t('myEvents.empty')} hint={t('myEvents.emptyHint')} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing(3),
            paddingBottom: theme.spacing(10),
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
            />
          ))}

          {past.length > 0 ? (
            <Subtitle style={{ marginTop: theme.spacing(4) }}>{t('myEvents.past')}</Subtitle>
          ) : null}

          {past.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              category={categories.find((category) => category.id === event.categoryId)}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
