import {
  activitiesOf,
  filterEvents,
  groupEvents,
  matchingActivities,
  type Activity,
  type Event,
  type EventCategory,
} from '@agora/core';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EventCard } from '../../components/event-card';
import { MonthView } from '../../components/month-view';
import { CalendarSkeleton } from '../../components/skeleton';
import { useTabBarClearance } from '../../components/tab-bar';
import { Chip, EmptyState, Loading, Screen } from '../../components/ui';
import { useMunicipalityData } from '../../hooks/use-municipality-data';
import { useApp } from '../../providers/app-provider';
import { FONTS } from '../../theme/theme';

/**
 * The calendar: the screen the whole product is judged on.
 *
 * Three blocks in the order a neighbour cares about them, no login, and the
 * filters sit above the list so they never push the events off the screen.
 */
export default function CalendarScreen() {
  const { municipality, ready, t, theme } = useApp();
  const { loading, refreshing, refresh, events, activities, categories } = useMunicipalityData();
  const clearance = useTabBarClearance(theme.spacing);
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [view, setView] = useState<'list' | 'month'>('list');

  const filtered = useMemo(
    () =>
      filterEvents(
        events,
        {
          ...(selectedCategory ? { categoryIds: [selectedCategory] } : {}),
          freeOnly,
        },
        // A feria whose puppet show is filed under "Infantil" comes back when a
        // parent taps that chip, even though the feria itself is under
        // "Fiestas". What they are looking for is in there.
        activities,
      ),
    [activities, events, freeOnly, selectedCategory],
  );

  const groups = useMemo(
    () =>
      groupEvents(filtered, {
        now: new Date(),
        timeZone: municipality?.timeZone ?? 'Europe/Madrid',
        // Without these a four-day feria drops out of "Hoy" on its first
        // evening and is never seen again while its programme is still to come.
        activities,
      }),
    [activities, filtered, municipality],
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

  // A category earns a chip if anything in the town is filed under it —
  // including one line of a programme. A chip that returns nothing is worse than
  // no chip, and so is a missing one for the only puppet show of the year.
  const categoriesInUse = categories.filter(
    (category) =>
      events.some((event) => event.categoryId === category.id) ||
      activities.some((activity) => activity.categoryId === category.id),
  );

  const hasAnything = groups.today.length + groups.thisWeekend.length + groups.upcoming.length > 0;
  const isFiltered = selectedCategory !== null || freeOnly;

  /**
   * Why a card is in the list, when the reason is one of its activities.
   *
   * Only while a category chip is on. An event that matches on its own gets
   * nothing: the chip already explains it, and a line saying "1 actividad de
   * Cultura" under a concert is noise.
   */
  const chosenCategory = categories.find((entry) => entry.id === selectedCategory);

  const matchingFor = (event: Event) => {
    if (chosenCategory === undefined || event.categoryId === chosenCategory.id) return undefined;

    const inside = matchingActivities(event, activities, { categoryIds: [chosenCategory.id] });

    return inside.length === 0
      ? undefined
      : { count: inside.length, category: chosenCategory.name };
  };

  return (
    <Screen>
      {/* Masthead. The town name is the control that changes town, the way a
          location picker is its own title in every app that has one — a
          separate "Cambiar" button was a second row for nothing. */}
      <View
        style={{
          gap: theme.spacing(3),
          paddingHorizontal: theme.spacing(5),
          // Above the safe area, not instead of it: on a phone with no notch the
          // town name otherwise starts flush against the status bar, and the
          // screen opens looking cramped.
          paddingTop: theme.spacing(4),
        }}
      >
        <View style={[styles.row, { gap: theme.spacing(3) }]}>
          <Pressable
            onPress={() => router.push('/welcome')}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.changeMunicipality')}
            style={({ pressed }) => [styles.grow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              {t('calendar.municipalAgenda').toUpperCase()}
            </Text>
            <View style={styles.row}>
              <Text style={[styles.town, { color: theme.colors.text }]} numberOfLines={1}>
                {municipality.name.toUpperCase()}
              </Text>
              <Ionicons
                name="chevron-down"
                size={22}
                color={theme.colors.textMuted}
                style={{ marginLeft: theme.spacing(1), marginTop: theme.spacing(1) }}
              />
            </View>
          </Pressable>

          <SegmentedView value={view} onChange={setView} />
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
        <CalendarSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing(4),
            paddingBottom: clearance,
            // The grid wants the wider canvas; the list reads better inset.
            paddingHorizontal: theme.spacing(view === 'month' ? 3 : 5),
          }}
          // Pull down to read the calendar again. The town hall changes the
          // time of a verbena an hour before it starts, and a neighbour who
          // already has the screen open should not have to close the app to
          // find out.
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
          {view === 'month' ? (
            <Animated.View key="month" entering={FadeIn.duration(220)}>
              <MonthView events={filtered} categories={categories} activities={activities} />
            </Animated.View>
          ) : (
            <Animated.View
              key="list"
              entering={FadeIn.duration(220)}
              style={{ gap: theme.spacing(6) }}
            >
              <Section
                title={t('calendar.today')}
                events={groups.today}
                categories={categories}
                activities={activities}
                matchingFor={matchingFor}
                leads={groups.today.length > 0}
              />
              <Section
                title={t('calendar.thisWeekend')}
                events={groups.thisWeekend}
                categories={categories}
                activities={activities}
                matchingFor={matchingFor}
                leads={groups.today.length === 0}
              />
              <Section
                title={t('calendar.upcoming')}
                events={groups.upcoming}
                categories={categories}
                activities={activities}
                matchingFor={matchingFor}
                leads={groups.today.length + groups.thisWeekend.length === 0}
              />

              {hasAnything ? null : (
                <EmptyState
                  title={isFiltered ? t('calendar.emptyFiltered') : t('calendar.empty')}
                />
              )}
            </Animated.View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

/**
 * List or month.
 *
 * A segmented control rather than two more pills: the screen already has a row
 * of pill-shaped filters under it, and two rows of the same shape make neither
 * of them read as a choice.
 */
function SegmentedView({
  value,
  onChange,
}: {
  value: 'list' | 'month';
  onChange: (next: 'list' | 'month') => void;
}) {
  const { t, theme } = useApp();

  const options: { id: 'list' | 'month'; label: string }[] = [
    { id: 'list', label: t('calendar.viewList') },
    { id: 'month', label: t('calendar.viewMonth') },
  ];

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.radius.pill,
        flexDirection: 'row',
        padding: 3,
      }}
    >
      {options.map((option) => {
        const selected = value === option.id;

        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              backgroundColor: selected ? theme.colors.contrast : 'transparent',
              borderRadius: theme.radius.pill,
              justifyContent: 'center',
              minHeight: 38,
              paddingHorizontal: theme.spacing(4),
            }}
          >
            <Text
              style={{
                color: selected ? theme.colors.onContrast : theme.colors.textMuted,
                fontFamily: selected ? FONTS.bold : FONTS.semibold,
                fontSize: 14,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  activities,
  matchingFor,
  leads = false,
}: {
  title: string;
  events: Event[];
  categories: EventCategory[];
  /** Every programme in the town; each card takes its own out of it. */
  activities: Activity[];
  /** Why a card is here, when the reason is inside it rather than on it. */
  matchingFor: (event: Event) => { count: number; category: string } | undefined;
  leads?: boolean;
}) {
  const { theme } = useApp();

  if (events.length === 0) return null;

  const featured = events.find((event) => event.isFeatured && event.status !== 'cancelled');
  const lead = leads ? (featured ?? events[0]) : undefined;
  const rest = lead ? events.filter((event) => event.id !== lead.id) : events;

  const categoryOf = (event: Event) =>
    categories.find((category) => category.id === event.categoryId);
  const programmeOf = (event: Event) => activitiesOf(activities, event.id);

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={[styles.row, { gap: theme.spacing(3) }]}>
        <Text style={[styles.eyebrow, { color: theme.colors.text }]}>{title.toUpperCase()}</Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.surfaceMuted }]} />
      </View>

      {lead ? (
        <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
          <EventCard
            event={lead}
            category={categoryOf(lead)}
            activities={programmeOf(lead)}
            matching={matchingFor(lead)}
            variant="hero"
          />
        </Animated.View>
      ) : null}

      {rest.map((event, index) => (
        <Animated.View
          key={event.id}
          // Staggered, briefly: the list arrives in reading order instead of
          // all at once, and 40ms apart is felt rather than watched.
          entering={FadeInDown.delay(60 + index * 40)
            .duration(320)
            .springify()
            .damping(18)}
          style={
            index === 0 && !lead
              ? undefined
              : {
                  borderTopColor: theme.colors.surfaceMuted,
                  borderTopWidth: 1,
                  paddingTop: theme.spacing(4),
                }
          }
        >
          <EventCard
            event={event}
            category={categoryOf(event)}
            activities={programmeOf(event)}
            matching={matchingFor(event)}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.5 },
  filters: { flexGrow: 0, flexShrink: 0 },
  grow: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  rule: { flex: 1, height: 1 },
  // Archivo Black is tight enough on its own; any more and a two-word name
  // closes up into one.
  town: { fontFamily: FONTS.black, fontSize: 30, letterSpacing: -0.3, lineHeight: 32 },
});
