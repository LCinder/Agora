import {
  buildMonthGrid,
  formatLongDate,
  monthDays,
  readableOn,
  shiftMonth,
  type Event,
  type EventCategory,
  type MonthDay,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../providers/app-provider';
import { FONTS } from '../theme/theme';
import { EventCard } from './event-card';
import { Caption, Subtitle } from './ui';

/**
 * The month grid.
 *
 * The list view answers "what is on soon". This one answers "what is on when I
 * am free", which is the question somebody planning a weekend asks, and it is
 * the shape every town hall already publishes its programme in — so it is also
 * the view a councillor recognises on sight.
 *
 * A day is a dot, not a number badge: at a glance a resident wants to know
 * whether something is on, and counting comes after. The dots carry the
 * category colours, and every day still states its count out loud for screen
 * readers, so nothing here depends on colour alone (RD 1112/2018).
 */

const MAX_DOTS = 3;

export function MonthView({
  events,
  categories,
}: {
  events: Event[];
  categories: EventCategory[];
}) {
  const { municipality, t, theme } = useApp();
  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => shiftMonth(now, 0, timeZone));
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(
    () => buildMonthGrid(events, { now, timeZone, month }),
    [events, month, now, timeZone],
  );

  // The chosen day, or today when it is on screen, or the first day with
  // something on it. Opening a month to an empty list would waste the screen.
  const days = monthDays(grid);
  const chosen =
    days.find((day) => day.date.toISOString() === selected) ??
    days.find((day) => day.isToday && day.inMonth) ??
    days.find((day) => day.inMonth && day.events.length > 0) ??
    days.find((day) => day.inMonth);

  const monthLabel = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(month);

  const isThisMonth = shiftMonth(now, 0, timeZone).getTime() === month.getTime();

  function step(offset: number) {
    setMonth(shiftMonth(month, offset, timeZone));
    setSelected(null);
  }

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={styles.header}>
        <Arrow direction="back" label={t('calendar.previousMonth')} onPress={() => step(-1)} />

        <Subtitle style={styles.monthName}>
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </Subtitle>

        <Arrow direction="forward" label={t('calendar.nextMonth')} onPress={() => step(1)} />
      </View>

      {isThisMonth ? null : (
        <Pressable
          onPress={() => {
            setMonth(shiftMonth(now, 0, timeZone));
            setSelected(null);
          }}
          accessibilityRole="button"
          style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}
        >
          <Caption tone="primary">{t('calendar.backToThisMonth')}</Caption>
        </Pressable>
      )}

      <View>
        <View style={styles.week}>
          {t('calendar.weekdayInitials')
            .split(' ')
            .map((initial, index) => (
              <View key={index} style={styles.cell}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.caption,
                    fontFamily: FONTS.bold,
                    textAlign: 'center',
                  }}
                >
                  {initial}
                </Text>
              </View>
            ))}
        </View>

        {grid.weeks.map((week, index) => (
          <View key={index} style={styles.week}>
            {week.map((day) => (
              <Day
                key={day.date.toISOString()}
                day={day}
                categories={categories}
                selected={chosen?.date.getTime() === day.date.getTime()}
                onPress={() => setSelected(day.date.toISOString())}
              />
            ))}
          </View>
        ))}
      </View>

      {chosen ? (
        <View style={{ gap: theme.spacing(3) }}>
          <Subtitle>
            {capitalise(formatLongDate(chosen.date, { now, timeZone, locale: 'es' }))}
          </Subtitle>

          {chosen.events.length === 0 ? (
            <Caption>{t('calendar.nothingOnThisDay')}</Caption>
          ) : (
            chosen.events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                category={categories.find((category) => category.id === event.categoryId)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function Arrow({
  direction,
  label,
  onPress,
}: {
  direction: 'back' | 'forward';
  label: string;
  onPress: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        alignItems: 'center',
        borderRadius: theme.radius.pill,
        height: theme.touchTarget,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
        width: theme.touchTarget,
      })}
    >
      <Ionicons
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={22}
        color={theme.colors.text}
      />
    </Pressable>
  );
}

function Day({
  day,
  categories,
  selected,
  onPress,
}: {
  day: MonthDay;
  categories: EventCategory[];
  selected: boolean;
  onPress: () => void;
}) {
  const { municipality, t, theme } = useApp();
  const timeZone = municipality?.timeZone ?? 'Europe/Madrid';

  const date = formatLongDate(day.date, { now: day.date, timeZone, locale: 'es' });
  const label =
    day.events.length > 0
      ? t('calendar.dayWithEvents', { date, count: day.events.length })
      : t('calendar.dayWithoutEvents', { date });

  const dots = day.events.slice(0, MAX_DOTS).map((event, index) => ({
    key: `${event.id}-${index}`,
    color: readableOn(
      categories.find((category) => category.id === event.categoryId)?.color ??
        theme.colors.primary,
      theme.colors.background,
      // A dot carries no text: 3:1 is the bar WCAG sets for graphical objects.
      3,
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.cell,
        {
          backgroundColor: selected ? theme.colors.contrast : 'transparent',
          borderColor: day.isToday && !selected ? theme.colors.contrast : 'transparent',
          borderRadius: theme.radius.md,
          borderWidth: 2,
          minHeight: theme.touchTarget,
          opacity: pressed ? 0.7 : 1,
          paddingVertical: theme.spacing(1),
        },
      ]}
    >
      <Text
        style={{
          color: selected
            ? theme.colors.onContrast
            : day.inMonth
              ? theme.colors.text
              : theme.colors.textMuted,
          fontSize: theme.fontSize.body,
          fontFamily: day.isToday || selected ? FONTS.black : FONTS.medium,
          textAlign: 'center',
        }}
      >
        {day.dayOfMonth}
      </Text>

      <View style={styles.dots}>
        {dots.map((dot) => (
          <View
            key={dot.key}
            style={{
              backgroundColor: selected ? theme.colors.onContrast : dot.color,
              borderRadius: 3,
              height: 6,
              width: 6,
            }}
          />
        ))}
      </View>
    </Pressable>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  cell: { alignItems: 'center', flex: 1, justifyContent: 'flex-start' },
  dots: { flexDirection: 'row', gap: 3, height: 8, marginTop: 2 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  monthName: { flex: 1, textAlign: 'center' },
  week: { flexDirection: 'row', gap: 2, marginBottom: 2 },
});
