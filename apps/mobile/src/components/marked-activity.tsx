import {
  activityDefaults,
  activityLocation,
  formatRelativeDay,
  formatTime,
  type Activity,
  type Event,
} from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../providers/app-provider';
import { FONTS } from '../theme/theme';

/**
 * One marked line of a programme, on "Mis eventos".
 *
 * Deliberately not an `EventCard`. What a neighbour marked here is the falconry
 * show, not the feria, so the falconry show is what the row says first — and the
 * feria goes underneath, because "Taller de queso curado" on its own tells
 * nobody where to be. Tapping opens the event, which is where the programme and
 * the map are.
 *
 * No cover image, on purpose: an activity has no poster of its own, and
 * borrowing the event's would make ten lines of one feria look like ten copies
 * of the same thing.
 */
export function MarkedActivity({ activity, event }: { activity: Activity; event: Event }) {
  const { locale, municipality, t, theme, toggleActivityInterest } = useApp();
  const router = useRouter();

  if (!municipality) return null;

  const context = { now: new Date(), timeZone: municipality.timeZone, locale };
  const cancelled = activity.status === 'cancelled';
  const where = activityLocation(activity, activityDefaults(event)).name;

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}. ${t('programme.partOf', { event: event.title })}`}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          gap: theme.spacing(3),
          opacity: pressed ? 0.75 : cancelled ? 0.6 : 1,
          padding: theme.spacing(3),
        },
      ]}
    >
      <View style={[styles.stamp, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Text style={[styles.stampDay, { color: theme.colors.textMuted }]}>
          {formatRelativeDay(activity.startAt, context)}
        </Text>
        <Text style={[styles.stampTime, { color: theme.colors.primary }]}>
          {formatTime(activity.startAt, context)}
        </Text>
      </View>

      <View style={[styles.grow, { gap: 2 }]}>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: theme.colors.text }, cancelled ? styles.struck : null]}
        >
          {activity.title}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>
          {t('programme.partOf', { event: event.title })}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>
          {cancelled ? `${t('programme.cancelled')} · ${where}` : where}
        </Text>
      </View>

      {/* Unmarking from here, which is the one thing this screen is for besides
          reading: a list you cannot take things off stops being a list. */}
      <Pressable
        onPress={() => void toggleActivityInterest(event.id, activity.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        accessibilityLabel={t('programme.attendingDone')}
        hitSlop={10}
        style={({ pressed }) => [
          styles.heart,
          { minHeight: theme.touchTarget, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Ionicons name="heart" size={20} color={theme.colors.primary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  heart: { alignItems: 'center', justifyContent: 'center', minWidth: 32 },
  meta: { fontFamily: FONTS.regular, fontSize: 14 },
  row: { alignItems: 'center', flexDirection: 'row' },
  stamp: {
    alignItems: 'center',
    borderRadius: 10,
    gap: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 68,
  },
  stampDay: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 0.3 },
  stampTime: { fontFamily: FONTS.bold, fontSize: 16 },
  struck: { textDecorationLine: 'line-through' },
  title: { fontFamily: FONTS.bold, fontSize: 17, letterSpacing: -0.2, lineHeight: 21 },
});
