import {
  activitiesWithin,
  dayRange,
  formatRelativeDay,
  formatTime,
  formatWhen,
  readableOn,
  reportableCount,
  type Activity,
  type Event,
  type EventCategory,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../providers/app-provider';
import { EventCover } from './event-cover';
import { FONTS } from '../theme/theme';

/**
 * One event in a list.
 *
 * Two shapes, because the rhythm of the calendar is a large one leading and
 * smaller ones under it: the town hall has something it wants pushed, and a
 * grid of equals cannot say so.
 *
 * A cancelled event keeps its place with a clear badge rather than
 * disappearing: a neighbour who planned their evening around it needs to find
 * out, and an event that silently vanishes reads as a bug.
 */

const SCREEN_PADDING = 20;
const STAMP = 92;
const HERO_HEIGHT = 264;

export function EventCard({
  event,
  category,
  activities = [],
  matching,
  variant = 'row',
}: {
  event: Event;
  category: EventCategory | undefined;
  /** This event's programme, when it has one. The card only counts it. */
  activities?: readonly Activity[];
  /**
   * Why this card is in a filtered list, when the reason is inside it.
   *
   * Tapping "Infantil" and getting a four-day feria back is confusing until the
   * card says "3 actividades de Infantil", which is the true and useful answer.
   */
  matching?: { count: number; category: string };
  variant?: 'hero' | 'row';
}) {
  const { locale, municipality, t, theme, isInterested } = useApp();
  const router = useRouter();

  if (!municipality) return null;

  const context = { now: new Date(), timeZone: municipality.timeZone, locale };
  const when = formatWhen(event, context);
  const cancelled = event.status === 'cancelled';
  const saved = isInterested(event.id);

  /**
   * What the card says about the programme, if there is one.
   *
   * Three answers in order of how much the reader needs them. Why this card is
   * in a filtered list beats everything: they asked a question and this is the
   * answer. Then what is on **today**, which is what somebody has on the
   * Saturday morning of a four-day feria. Then how big the thing is, which is
   * what makes them tap on the days before.
   */
  const today = dayRange(context.now, municipality.timeZone);
  const onToday = activitiesWithin(activities, today);
  const programmeLabel =
    matching !== undefined && matching.count > 0
      ? t('programme.matchingCount', { count: matching.count, category: matching.category })
      : activities.length === 0
        ? null
        : onToday.length > 0
          ? t('programme.todayCount', { count: onToday.length })
          : t('programme.activityCount', { count: activities.length });

  // The category colour is authored for print; on this ground it has to be
  // lifted to stay legible as a label (see `readableOn`).
  const label = readableOn(category?.color ?? theme.colors.primary, theme.colors.background);

  const eyebrow = (
    <View style={[styles.row, { gap: theme.spacing(2) }]}>
      {cancelled ? (
        <Text style={[styles.eyebrow, { color: theme.colors.danger }]}>
          {t('event.cancelled').toUpperCase()}
        </Text>
      ) : null}
      {category ? (
        <Text style={[styles.eyebrow, { color: label }]}>{category.name.toUpperCase()}</Text>
      ) : null}
    </View>
  );

  if (variant === 'hero') {
    const width = Dimensions.get('window').width - SCREEN_PADDING * 2;

    return (
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        accessibilityRole="button"
        accessibilityLabel={[event.title, when, event.location.name, programmeLabel]
          .filter((part): part is string => part !== null)
          .join('. ')}
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.92 : cancelled ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <View style={{ borderRadius: theme.radius.lg, overflow: 'hidden' }}>
          <EventCover
            event={event}
            category={category}
            size="hero"
            width={width}
            height={HERO_HEIGHT}
          />

          {/* A gradient, not a slab: a hard-edged panel over a poster reads
              like a sticker stuck on top of it. */}
          <LinearGradient
            colors={['rgba(18,18,17,0)', 'rgba(18,18,17,0.72)', 'rgba(18,18,17,0.94)']}
            locations={[0, 0.55, 1]}
            style={[styles.heroText, { padding: theme.spacing(4), paddingTop: theme.spacing(10) }]}
          >
            <View style={[styles.row, { gap: theme.spacing(2), marginBottom: theme.spacing(2) }]}>
              {event.isFeatured && !cancelled ? (
                <View
                  style={[
                    styles.featured,
                    { backgroundColor: theme.colors.contrast, borderRadius: theme.radius.pill },
                  ]}
                >
                  <Text style={[styles.eyebrow, { color: theme.colors.onContrast }]}>
                    {t('calendar.featured').toUpperCase()}
                  </Text>
                </View>
              ) : null}
              {cancelled ? (
                <Text style={[styles.eyebrow, { color: theme.colors.danger }]}>
                  {t('event.cancelled').toUpperCase()}
                </Text>
              ) : null}
              {category ? (
                <Text style={[styles.eyebrow, styles.onCover]}>{category.name.toUpperCase()}</Text>
              ) : null}
            </View>

            <Text numberOfLines={2} style={styles.heroTitle}>
              {event.title}
            </Text>

            {programmeLabel === null ? null : (
              <Text style={[styles.heroMeta, styles.programme, { marginTop: theme.spacing(1) }]}>
                {programmeLabel}
              </Text>
            )}

            <View style={[styles.row, { gap: theme.spacing(2), marginTop: theme.spacing(2) }]}>
              <Text style={styles.heroMeta}>{formatTime(event.startAt, context)}</Text>
              <Text style={styles.heroDot}>·</Text>
              <Text numberOfLines={1} style={[styles.heroMeta, styles.grow]}>
                {event.location.name}
              </Text>
              {event.isFree ? (
                <Text style={[styles.heroMeta, styles.free]}>{t('common.free')}</Text>
              ) : null}
              <Interest event={event} saved={saved} onCover />
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      accessibilityRole="button"
      accessibilityLabel={[event.title, when, event.location.name, programmeLabel]
        .filter((part): part is string => part !== null)
        .join('. ')}
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.spacing(4),
          opacity: pressed ? 0.75 : cancelled ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <EventCover event={event} category={category} size="stamp" width={STAMP} height={STAMP} />

      <View style={[styles.grow, { gap: theme.spacing(1) }]}>
        {eyebrow}
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.colors.text }]}>
          {event.title}
        </Text>
        {/* Start time only: a row that spells out the end as well pushes the
            place off the edge, and the place is what a neighbour scans for. */}
        <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
          {formatRelativeDay(event.startAt, context)} · {formatTime(event.startAt, context)} ·{' '}
          {event.location.name}
        </Text>
        {programmeLabel === null ? null : (
          <Text
            numberOfLines={1}
            style={[styles.rowMeta, styles.programme, { color: theme.colors.primary }]}
          >
            {programmeLabel}
          </Text>
        )}
      </View>

      <Interest event={event} saved={saved} />
    </Pressable>
  );
}

/**
 * How many neighbours marked this one, next to whether you did.
 *
 * A count and never a list: this is the same number the town hall sees, and the
 * only thing anybody ever learns about who marked an event (D-029). A filled
 * heart is yours, an outline is the town's.
 *
 * Hidden below five, and the threshold is the product's, not this screen's
 * (`MINIMUM_AUDIENCE`): three marks in a village are three neighbours somebody
 * could name, and the town hall is not shown that number either. It also spares
 * the calendar the worst thing it could say on the morning a programme goes up,
 * which is "a 1 vecino le interesa" under every event.
 */
function Interest({
  event,
  saved,
  onCover = false,
}: {
  event: Event;
  saved: boolean;
  onCover?: boolean;
}) {
  const { t, theme } = useApp();

  const shown = reportableCount(event.interestCount);

  if (!saved && shown === null) return null;

  const tint = onCover ? '#FFFFFF' : theme.colors.text;

  return (
    <View
      style={[styles.row, { gap: 4 }]}
      accessible
      accessibilityLabel={shown === null ? undefined : t('event.interestedCount', { count: shown })}
    >
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={17} color={tint} />
      {shown === null ? null : (
        <Text
          style={[
            styles.count,
            { color: onCover ? 'rgba(255,255,255,0.92)' : theme.colors.textMuted },
          ]}
        >
          {shown}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: FONTS.semibold, fontSize: 14 },
  eyebrow: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.4 },
  featured: { paddingHorizontal: 9, paddingVertical: 3 },
  free: { color: '#A7F3B4', fontFamily: FONTS.bold },
  grow: { flex: 1 },
  heroDot: { color: 'rgba(255,255,255,0.55)', fontFamily: FONTS.regular, fontSize: 15 },
  heroMeta: { color: 'rgba(255,255,255,0.92)', fontFamily: FONTS.regular, fontSize: 15 },
  heroText: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontFamily: FONTS.black,
    letterSpacing: -0.7,
    lineHeight: 29,
  },
  onCover: { color: 'rgba(255,255,255,0.85)' },
  programme: { fontFamily: FONTS.semibold },
  row: { alignItems: 'center', flexDirection: 'row' },
  rowMeta: { fontFamily: FONTS.regular, fontSize: 15 },
  rowTitle: { fontFamily: FONTS.bold, fontSize: 19, letterSpacing: -0.3, lineHeight: 22 },
});
