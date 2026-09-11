import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { groupEvents, residentVisibleEvents, type EventGroups } from '@agora/core';
import { createSeedDataSource } from '@agora/data';

/**
 * Placeholder home screen.
 *
 * It reads the seed through the data source, which proves Metro bundles the
 * shared packages and the content files. Replaced by the real calendar in
 * step 4.
 */
export default function HomeScreen() {
  const [groups, setGroups] = useState<EventGroups | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const source = createSeedDataSource();
      const municipality = await source.getMunicipalityBySlug('la-zubia');
      if (!municipality) return;

      const events = residentVisibleEvents(await source.listEvents(municipality.id));
      const grouped = groupEvents(events, {
        now: new Date(),
        timeZone: municipality.timeZone,
      });

      if (active) setGroups(grouped);
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>La Zubia</Text>
        <Text style={styles.body}>
          Andamiaje del monorepo listo. El calendario llega en el paso 4 del plan de Fase 0.
        </Text>
        <Text style={styles.meta}>
          {groups
            ? `Hoy ${groups.today.length} · Este finde ${groups.thisWeekend.length} · Próximos ${groups.upcoming.length}`
            : 'Cargando eventos…'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  meta: {
    fontSize: 13,
    opacity: 0.6,
  },
});
