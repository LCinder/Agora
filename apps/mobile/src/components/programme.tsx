import {
  activityDefaults,
  activityHasOwnLocation,
  activityPrice,
  formatLongDate,
  formatTime,
  groupActivitiesByDay,
  reportableCount,
  type Activity,
  type Event,
  type EventCategory,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useApp } from '../providers/app-provider';
import { Badge, Body, Subtitle } from './ui';
import { FONTS } from '../theme/theme';

/**
 * The programme of an event that has one.
 *
 * Laid out the way a feria is printed on a poster, because that is the thing a
 * neighbour is holding in their head when they open this: a heading per day, and
 * a time down the left. Anything cleverer — a filter, a tab per day, a search —
 * loses to the poster, which people have been reading correctly for a hundred
 * years.
 *
 * Each line can be marked on its own. That is the whole reason activities are
 * their own thing rather than a paragraph of the description: "Me interesa" on
 * the falconry show gets you a reminder about the falconry show, at six on the
 * Saturday, and not about four days of feria.
 *
 * A line only prints what it does not inherit. Twelve rows that all repeat
 * "Plaza Mayor" is how the two that are somewhere else get missed.
 */
export function Programme({
  event,
  activities,
  categories,
}: {
  event: Event;
  activities: readonly Activity[];
  categories: readonly EventCategory[];
}) {
  const { municipality, t, theme } = useApp();

  if (!municipality || activities.length === 0) return null;

  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };
  const days = groupActivitiesByDay(activities, municipality.timeZone);

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={[styles.row, { gap: theme.spacing(3) }]}>
        <Text style={[styles.eyebrow, { color: theme.colors.text }]}>
          {t('programme.title').toUpperCase()}
        </Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.surfaceMuted }]} />
        <Subtitle>{t('programme.activityCount', { count: activities.length })}</Subtitle>
      </View>

      {days.map((day) => (
        <View key={day.date.toISOString()} style={{ gap: theme.spacing(3) }}>
          <Text style={[styles.day, { color: theme.colors.textMuted }]}>
            {formatLongDate(day.date, context).toUpperCase()}
          </Text>

          {day.activities.map((activity) => (
            <ActivityRow
              key={activity.id}
              event={event}
              activity={activity}
              categories={categories}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * One line of the programme.
 *
 * Collapsed to the time, the title and whatever it does not inherit; tapping it
 * opens the description and the two actions. Collapsed by default because twenty
 * expanded rows is not a programme any more, it is a document — and the question
 * somebody scrolling a feria has is "what is on at six", which the collapsed row
 * already answers.
 */
function ActivityRow({
  event,
  activity,
  categories,
}: {
  event: Event;
  activity: Activity;
  categories: readonly EventCategory[];
}) {
  const { locale, municipality, t, theme, isActivityInterested, toggleActivityInterest } = useApp();
  const [open, setOpen] = useState(false);
  /**
   * This phone's own effect on the count, since the screen loaded.
   *
   * Same reason as on the event above: the number came down with the programme
   * and the mark is written in the background, so without this the heart fills
   * and the number beside it does not move, which reads as the tap not having
   * worked.
   */
  const [ownDelta, setOwnDelta] = useState(0);

  if (!municipality) return null;

  const context = { now: new Date(), timeZone: municipality.timeZone, locale };
  const defaults = activityDefaults(event);
  const price = activityPrice(activity, defaults);
  const cancelled = activity.status === 'cancelled';
  const marked = isActivityInterested(event.id, activity.id);

  const category =
    activity.categoryId === null
      ? undefined
      : categories.find((entry) => entry.id === activity.categoryId);

  const when =
    activity.endAt === null
      ? formatTime(activity.startAt, context)
      : `${formatTime(activity.startAt, context)}\n${formatTime(activity.endAt, context)}`;

  const meta = [
    activityHasOwnLocation(activity, defaults) ? activity.location?.name : null,
    price.isFree ? null : price.priceInfo,
  ].filter((part): part is string => part !== null && part !== undefined && part !== '');

  const marks = reportableCount(Math.max(0, activity.interestCount + ownDelta));

  async function addToCalendar() {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const target = calendars.find((calendar) => calendar.allowsModifications);
    if (!target) return;

    await Calendar.createEventAsync(target.id, {
      title: activity.title,
      startDate: activity.startAt,
      endDate: activity.endAt ?? new Date(activity.startAt.getTime() + 60 * 60 * 1000),
      // Where it actually is, which for most lines is where the event is.
      location: (activity.location ?? defaults.location).name,
      // The event's name goes in the notes: "Taller de queso curado" in a phone
      // calendar three weeks from now is a reminder about nothing in particular.
      notes: [t('programme.partOf', { event: event.title }), activity.description]
        .filter((part) => part !== '')
        .join('\n\n'),
      timeZone: municipality!.timeZone,
    });

    Alert.alert(activity.title, t('programme.addToCalendar'));
  }

  return (
    <View
      style={{
        borderTopColor: theme.colors.surfaceMuted,
        borderTopWidth: 1,
        opacity: cancelled ? 0.6 : 1,
        paddingTop: theme.spacing(3),
      }}
    >
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${activity.title}. ${when.replace('\n', ' – ')}`}
        style={({ pressed }) => [styles.row, { gap: theme.spacing(3), opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[styles.time, { color: theme.colors.primary }]}>{when}</Text>

        <View style={[styles.grow, { gap: 2 }]}>
          <Text
            style={[
              styles.title,
              { color: theme.colors.text },
              cancelled ? styles.struck : null,
            ]}
          >
            {activity.title}
          </Text>

          {meta.length > 0 ? (
            <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>
              {meta.join(' · ')}
            </Text>
          ) : null}

          <View style={[styles.row, { gap: theme.spacing(2) }]}>
            {cancelled ? (
              <Badge label={t('programme.cancelled')} color={theme.colors.danger} />
            ) : null}
            {category ? <Badge label={category.name} color={category.color} /> : null}
            {price.isFree && !cancelled ? (
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                {t('programme.free')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* The heart is the row's own control, not the disclosure: marking a
            line is the thing this screen exists for, and burying it one tap
            deep would mean nobody uses it. */}
        <Pressable
          onPress={() => {
            setOwnDelta((current) => current + (marked ? -1 : 1));
            void toggleActivityInterest(event.id, activity.id);
          }}
          disabled={cancelled}
          accessibilityRole="button"
          accessibilityState={{ selected: marked }}
          accessibilityLabel={
            marked ? t('programme.interestedDone') : t('programme.interested')
          }
          hitSlop={10}
          style={({ pressed }) => [
            styles.heart,
            { minHeight: theme.touchTarget, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons
            name={marked ? 'heart' : 'heart-outline'}
            size={20}
            color={marked ? theme.colors.primary : theme.colors.textMuted}
          />
          {marks === null ? null : (
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>{marks}</Text>
          )}
        </Pressable>
      </Pressable>

      {open ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{ gap: theme.spacing(2), paddingLeft: 64, paddingTop: theme.spacing(2) }}
        >
          {activity.description ? <Body>{activity.description}</Body> : null}

          <Pressable
            onPress={() => void addToCalendar()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              { gap: theme.spacing(2), minHeight: theme.touchTarget, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
            <Subtitle>{t('programme.addToCalendar')}</Subtitle>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: FONTS.semibold, fontSize: 13 },
  day: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2 },
  eyebrow: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.5 },
  grow: { flex: 1 },
  heart: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
  meta: { fontFamily: FONTS.regular, fontSize: 14 },
  row: { alignItems: 'center', flexDirection: 'row' },
  rule: { flex: 1, height: 1 },
  struck: { textDecorationLine: 'line-through' },
  time: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    // Fixed, so the titles line up down the page the way they do on a poster.
    // Two lines fit when an activity announces an end time.
    width: 52,
  },
  title: { fontFamily: FONTS.semibold, fontSize: 17, letterSpacing: -0.2, lineHeight: 21 },
});
