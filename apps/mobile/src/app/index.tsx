import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_TIME_ZONE } from '@agora/core';
import { DEFAULT_LOCALE } from '@agora/i18n';

/**
 * Placeholder home screen.
 *
 * It exists to prove the workspace wiring end to end: Metro resolves and
 * bundles the shared packages. Replaced by the real calendar in step 4.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Agenda del municipio</Text>
        <Text style={styles.body}>
          Andamiaje del monorepo listo. El calendario llega en el paso 4 del plan de Fase 0.
        </Text>
        <Text style={styles.meta}>
          {DEFAULT_TIME_ZONE} · {DEFAULT_LOCALE}
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
