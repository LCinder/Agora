import { filterEvents, groupEvents, type Event, type EventCategory } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EventCard } from '../../components/event-card';
import { MonthView } from '../../components/month-view';
import { Caption, Chip, Display, EmptyState, Loading, Screen, Subtitle } from '../../components/ui';
import { useMunicipalityData } from '../../hooks/use-municipality-data';
import { useApp } from '../../providers/app-provider';

/**
 * The calendar: the screen the whole product is judged on.
 *
 * Three blocks in the order a neighbour cares about them, no login, and the
 * filters sit above the list so they never push the events off the screen.
 */
export default function CalendarScreen() {
  const { municipality, ready, t, theme } = useApp();
  const { loading, events, categories } = useMunicipalityData();
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [view, setView] = useState<'list' | 'month'>('list');

  const filtered = useMemo(
    () =>
      filterEvents(events, {
        ...(selectedCategory ? { categoryIds: [selectedCategory] } : {}),
        freeOnly,
      }),
    [events, freeOnly, selectedCategory],
  );

  const groups = useMemo(
    () =>
      groupEvents(filtered, {
        now: new Date(),
        timeZone: municipality?.timeZone ?? 'Europe/Madrid',
      }),
    [filtered, municipality],
  );

  if (!ready) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  if (!municipality) {
    return <Redirect href="/welcome" />;
  }

  const categoriesInUse = categories.filter((category) =>
    events.some((event) => event.categoryId === category.id),
  );

  const hasAnything = groups.today.length + groups.thisWeekend.length + groups.upcoming.length > 0;
  const isFiltered = selectedCategory !== null || freeOnly;

  return (
    <Screen>
      <View style={{ gap: theme.spacing(1), paddingHorizontal: theme.spacing(5) }}>
        <Display>{municipality.name}</Display>
        <Pressable
          onPress={() => router.push('/welcome')}
          accessibilityRole="button"
          style={[styles.row, { minHeight: 32 }]}
        >
          <Caption tone="primary">{t('calendar.changeMunicipality')}</Caption>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
        </Pressable>

        <View style={{ flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(2) }}>
          <Chip
            label={t('calendar.viewList')}
            selected={view === 'list'}
            onPress={() => setView('list')}
          />
          <Chip
            label={t('calendar.viewMonth')}
            selected={view === 'month'}
            onPress={() => setView('month')}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Without this the filter row stretches to fill whatever space the
        // content below leaves, and the chips come out as tall ovals.
        style={styles.filters}
        contentContainerStyle={{
          gap: theme.spacing(2),
          paddingHorizontal: theme.spacing(5),
          paddingVertical: theme.spacing(3),
        }}
      >
        <Chip
          label={t('calendar.allCategories')}
          selected={selectedCategory === null && !freeOnly}
          onPress={() => {
            setSelectedCategory(null);
            setFreeOnly(false);
          }}
        />
        <Chip
          label={t('calendar.onlyFree')}
          selected={freeOnly}
          onPress={() => setFreeOnly(!freeOnly)}
        />
        {categoriesInUse.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            color={category.color}
            selected={selectedCategory === category.id}
            onPress={() =>
              setSelectedCategory(selectedCategory === category.id ? null : category.id)
            }
          />
        ))}
      </ScrollView>

      {loading ? (
        <Loading label={t('common.loading')} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing(4),
            paddingBottom: theme.spacing(10),
            // The grid wants the wider canvas; the list reads better inset.
            paddingHorizontal: theme.spacing(view === 'month' ? 3 : 5),
          }}
        >
          {view === 'month' ? (
            <MonthView events={filtered} categories={categories} />
          ) : (
            <>
              <Section title={t('calendar.today')} events={groups.today} categories={categories} />
              <Section
                title={t('calendar.thisWeekend')}
                events={groups.thisWeekend}
                categories={categories}
              />
              <Section
                title={t('calendar.upcoming')}
                events={groups.upcoming}
                categories={categories}
              />

              {hasAnything ? null : (
                <EmptyState
                  title={isFiltered ? t('calendar.emptyFiltered') : t('calendar.empty')}
                />
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function Section({
  title,
  events,
  categories,
}: {
  title: string;
  events: Event[];
  categories: EventCategory[];
}) {
  const { theme } = useApp();

  if (events.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Subtitle>{title}</Subtitle>
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          category={categories.find((category) => category.id === event.categoryId)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexGrow: 0, flexShrink: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
});
