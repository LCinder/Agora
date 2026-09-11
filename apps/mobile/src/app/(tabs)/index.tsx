import { filterEvents, groupEvents, type Event, type EventCategory } from '@agora/core';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '../../components/event-card';
import { MonthView } from '../../components/month-view';
import { Chip, EmptyState, Loading, Screen } from '../../components/ui';
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
        <View style={[styles.row, { gap: theme.spacing(3) }]}>
          <View style={styles.grow}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              {t('calendar.municipalAgenda').toUpperCase()}
            </Text>
            <Text style={[styles.town, { color: theme.colors.text }]} numberOfLines={2}>
              {municipality.name.toUpperCase()}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/welcome')}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.changeMunicipality')}
            style={({ pressed }) => [
              styles.change,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radius.pill,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' }}>
              {t('calendar.change')}
            </Text>
          </Pressable>
        </View>

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
              <Section
                title={t('calendar.today')}
                events={groups.today}
                categories={categories}
                leads={groups.today.length > 0}
              />
              <Section
                title={t('calendar.thisWeekend')}
                events={groups.thisWeekend}
                categories={categories}
                leads={groups.today.length === 0}
              />
              <Section
                title={t('calendar.upcoming')}
                events={groups.upcoming}
                categories={categories}
                leads={groups.today.length + groups.thisWeekend.length === 0}
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

/**
 * One block of the calendar.
 *
 * `leads` marks the block that opens the screen: its first event — the
 * featured one if there is one — is drawn large. Only one block leads, so the
 * page has a single focal point rather than a row of competing ones.
 */
function Section({
  title,
  events,
  categories,
  leads = false,
}: {
  title: string;
  events: Event[];
  categories: EventCategory[];
  leads?: boolean;
}) {
  const { theme } = useApp();

  if (events.length === 0) return null;

  const featured = events.find((event) => event.isFeatured && event.status !== 'cancelled');
  const lead = leads ? (featured ?? events[0]) : undefined;
  const rest = lead ? events.filter((event) => event.id !== lead.id) : events;

  const categoryOf = (event: Event) =>
    categories.find((category) => category.id === event.categoryId);

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={[styles.row, { gap: theme.spacing(3) }]}>
        <Text style={[styles.eyebrow, { color: theme.colors.text }]}>{title.toUpperCase()}</Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.surfaceMuted }]} />
      </View>

      {lead ? <EventCard event={lead} category={categoryOf(lead)} variant="hero" /> : null}

      {rest.map((event) => (
        <EventCard key={event.id} event={event} category={categoryOf(event)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  change: {
    alignItems: 'center',
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  filters: { flexGrow: 0, flexShrink: 0 },
  grow: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  rule: { flex: 1, height: 1 },
  town: { fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 34 },
});
