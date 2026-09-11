import {
  coverTreatmentFor,
  toLocalParts,
  tones,
  type Event,
  type EventCategory,
} from '@agora/core';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../providers/app-provider';
import { FONTS } from '../theme/theme';

/**
 * The poster, drawn by the app.
 *
 * Almost no event arrives with an image — an association's talk, a council
 * workshop, a league match — and a calendar of grey rectangles is exactly the
 * "looks like a form" problem this design set out to fix. So the cover is made
 * from the two things every event does have: its category's colour and its
 * date. Which treatment a category gets is decided in `@agora/core`, so it is
 * the same on the phone, on the web and in any future screen.
 *
 * When the event does bring a real poster, it wins and the drawing steps
 * aside.
 */

const MONTHS_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export type CoverSize = 'hero' | 'stamp';

const LATTICE_CELL = { hero: 44, stamp: 26 } as const;

/**
 * The lattice, drawn as rotated squares rather than an SVG pattern.
 *
 * A diamond grid is a handful of Views; pulling in a native SVG renderer for
 * it would cost a dependency and a rebuild for every municipality that never
 * asked for one.
 */
function Lattice({ size, width, height }: { size: CoverSize; width: number; height: number }) {
  const cell = LATTICE_CELL[size];
  const columns = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={styles.latticeRow}>
          {Array.from({ length: columns }, (_, column) => (
            <View
              key={column}
              style={{
                borderColor: 'rgba(255,255,255,0.17)',
                borderWidth: size === 'hero' ? 2 : 1.5,
                height: cell * 0.72,
                margin: cell * 0.14,
                transform: [{ rotate: '45deg' }],
                width: cell * 0.72,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function EventCover({
  event,
  category,
  size,
  width,
  height,
  rounded = true,
}: {
  event: Event;
  category: EventCategory | undefined;
  size: CoverSize;
  width: number;
  height: number;
  /** Off for a cover that runs to the edge of the screen. */
  rounded?: boolean;
}) {
  const { municipality, theme } = useApp();

  const color = category?.color ?? theme.colors.primary;
  const treatment = category ? coverTreatmentFor(category) : 'date';
  const hero = size === 'hero';

  const { date } = toLocalParts(event.startAt, municipality?.timeZone ?? 'Europe/Madrid');
  const [, month, day] = date.split('-');
  const dayLabel = String(Number(day));
  const monthLabel = MONTHS_ES[Number(month) - 1] ?? '';

  const frame = {
    backgroundColor: color,
    borderRadius: rounded ? (hero ? theme.radius.lg : theme.radius.md) : 0,
    height,
    overflow: 'hidden' as const,
    width,
  };

  // A real poster always wins: it is what the town hall actually published.
  if (event.imageUrl) {
    return (
      <View style={frame}>
        <Image source={event.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
    );
  }

  if (treatment === 'bands') {
    return (
      <View style={frame}>
        {tones(color, 4).map((tone) => (
          <View key={tone} style={{ backgroundColor: tone, flex: 1 }} />
        ))}
        <View style={[StyleSheet.absoluteFill, styles.end, { padding: hero ? 16 : 8 }]}>
          <Text style={[styles.day, { fontSize: hero ? 56 : 30 }]}>{dayLabel}</Text>
          <Text style={[styles.month, { fontSize: hero ? 13 : 10 }]}>{monthLabel}</Text>
        </View>
      </View>
    );
  }

  if (treatment === 'typographic') {
    return (
      <View style={[frame, styles.end, { padding: hero ? 16 : 8 }]}>
        <Text
          numberOfLines={hero ? 4 : 3}
          style={[styles.shout, { fontSize: hero ? 52 : 19, lineHeight: hero ? 46 : 18 }]}
        >
          {event.title.toUpperCase()}
        </Text>
      </View>
    );
  }

  if (treatment === 'lattice') {
    return (
      <View style={[frame, styles.end, { padding: hero ? 16 : 8 }]}>
        <Lattice size={size} width={width} height={height} />
        <Text style={[styles.day, { fontSize: hero ? 44 : 26 }]}>{dayLabel}</Text>
        <Text style={[styles.month, { fontSize: hero ? 13 : 10 }]}>{monthLabel}</Text>
      </View>
    );
  }

  // 'date': the day of the month is the graphic. On the hero it sits top right,
  // clear of the title panel that covers the bottom of the cover.
  return (
    <View style={[frame, hero ? styles.topEnd : styles.middle, { padding: hero ? 16 : 8 }]}>
      <Lattice size={size} width={width} height={height} />
      <Text style={[styles.day, { fontSize: hero ? 72 : 34, lineHeight: hero ? 66 : 32 }]}>
        {dayLabel}
      </Text>
      <Text style={[styles.month, { fontSize: hero ? 14 : 10 }]}>{monthLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    color: '#FFFFFF',
    fontFamily: FONTS.black,
    letterSpacing: -1.5,
  },
  end: { alignItems: 'flex-start', justifyContent: 'flex-end' },
  latticeRow: { flexDirection: 'row' },
  middle: { alignItems: 'center', justifyContent: 'center' },
  month: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FONTS.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  shout: {
    color: '#FFFFFF',
    fontFamily: FONTS.black,
    letterSpacing: -1.4,
  },
  topEnd: { alignItems: 'flex-end', justifyContent: 'flex-start' },
});
