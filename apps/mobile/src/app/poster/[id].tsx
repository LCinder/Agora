import type { Event } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Loading, Screen } from '../../components/ui';
import { dataSource } from '../../lib/data';
import { useApp } from '../../providers/app-provider';

/**
 * The poster, whole.
 *
 * The cover on the detail page is a header: it is as wide as the screen and
 * about as tall as it is wide, and a poster is portrait, so the bottom of it is
 * cropped — which is precisely where a poster puts the date, the place and who
 * organises it. A neighbour who wants to read the small print at the bottom of
 * the programme had no way to.
 *
 * So the cover is a door, like the map thumbnail next to it, and this is the
 * room: the same image on black, scaled to fit rather than to fill, with
 * nothing cropped off any edge.
 */
export default function PosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { municipality, t, theme } = useApp();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!municipality || !id) return;
    let active = true;

    async function load(municipalityId: string, eventId: string) {
      const found = await dataSource.getEvent(municipalityId, eventId);

      if (!active) return;

      setEvent(found);
      setLoading(false);
    }

    void load(municipality.id, id);

    return () => {
      active = false;
    };
  }, [id, municipality]);

  if (loading) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {/* Black rather than the app's ground: a poster is looked at, and
          anything else around it competes with it. */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        style={styles.backdrop}
      >
        {event?.imageUrl ? (
          <Image
            source={event.imageUrl}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessibilityLabel={t('event.posterOf', { title: event.title })}
          />
        ) : (
          <View style={styles.missing}>
            <Body tone="muted">{t('event.notFound')}</Body>
          </View>
        )}
      </Pressable>

      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={({ pressed }) => [
            styles.close,
            {
              borderRadius: theme.radius.pill,
              margin: theme.spacing(4),
              minHeight: theme.touchTarget,
              minWidth: theme.touchTarget,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000', flex: 1 },
  close: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(18,18,17,0.55)',
    justifyContent: 'center',
  },
  missing: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  overlay: { left: 0, position: 'absolute', right: 0, top: 0 },
});
