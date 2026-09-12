import { findNearest, readableOn } from '@agora/core';
import type { MunicipalitySummary } from '@agora/data';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Caption, Card, Loading, Screen, Subtitle } from '../components/ui';
import { FONTS } from '../theme/theme';
import { addRequestedMunicipality } from '../lib/storage';
import { useApp } from '../providers/app-provider';

/**
 * Municipality selector: the first screen a resident ever sees.
 *
 * Location is a shortcut, never a requirement. The search list is always
 * there, the permission is asked for only when the neighbour taps the button,
 * and the position is resolved on the device and immediately forgotten. See
 * docs/decisiones.md, D-008.
 */

type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'suggested'; municipality: MunicipalitySummary }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * "La Zubia" reads as LZ, "Villa de Otura" as VO, "Cájar" as CÁ.
 *
 * Capitalised words carry the name; the lowercase joiners of a Spanish place
 * name — de, del, la — do not, and Spanish spells them lowercase inside a name
 * exactly when they are joiners.
 */
function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((word) => word !== '' && word[0] === word[0]?.toUpperCase());

  const source = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? name);

  return source.slice(0, 2).toUpperCase();
}

/** Makes "Ogíjares" findable by typing "ogijares". */
function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function WelcomeScreen() {
  const { ready, municipalities, selectMunicipality, t, theme } = useApp();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [requested, setRequested] = useState(false);

  const results = useMemo(() => {
    const needle = normalise(query);
    if (needle === '') return municipalities;

    return municipalities.filter((municipality) => normalise(municipality.name).includes(needle));
  }, [municipalities, query]);

  async function detectMunicipality() {
    setLocation({ status: 'locating' });

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocation({ status: 'denied' });
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Resolved here, on the device. Nothing is sent anywhere and nothing is
      // stored: the coordinates leave scope when this function returns.
      const nearest = findNearest(
        { latitude: position.coords.latitude, longitude: position.coords.longitude },
        municipalities,
      );

      setLocation(
        nearest ? { status: 'suggested', municipality: nearest } : { status: 'unavailable' },
      );
    } catch {
      setLocation({ status: 'unavailable' });
    }
  }

  async function choose(municipalityId: string) {
    await selectMunicipality(municipalityId);
    router.replace('/');
  }

  async function requestMunicipality() {
    await addRequestedMunicipality(query.trim());
    setRequested(true);
  }

  if (!ready) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing(3), padding: theme.spacing(5) }}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {t('calendar.municipalAgenda').toUpperCase()}
        </Text>
        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {t('welcome.title').toUpperCase()}
        </Text>
        <Body tone="muted">{t('welcome.subtitle')}</Body>

        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              minHeight: theme.touchTarget,
              paddingHorizontal: theme.spacing(3),
            },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('welcome.searchPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel={t('welcome.searchPlaceholder')}
            autoCorrect={false}
            style={{ color: theme.colors.text, flex: 1, fontSize: theme.fontSize.body }}
          />
        </View>

        <LocationBlock state={location} onDetect={detectMunicipality} onChoose={choose} />
      </View>

      <FlatList
        data={results}
        keyExtractor={(municipality) => municipality.id}
        contentContainerStyle={{
          gap: theme.spacing(2),
          paddingBottom: theme.spacing(10),
          paddingHorizontal: theme.spacing(5),
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void choose(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.province}`}
            style={({ pressed }) => [
              styles.town,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                gap: theme.spacing(4),
                minHeight: 68,
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: theme.spacing(4),
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
            ]}
          >
            <View
              style={[
                styles.stamp,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <Text style={[styles.initials, { color: theme.colors.textMuted }]}>
                {initialsOf(item.name)}
              </Text>
            </View>
            <View style={styles.grow}>
              <Text style={[styles.townName, { color: theme.colors.text }]}>{item.name}</Text>
              <Caption>
                {item.province} · {t('welcome.inhabitants', { count: item.population })}
              </Caption>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={
          <Card>
            <Subtitle>{t('welcome.notAvailableTitle')}</Subtitle>
            <Body tone="muted" style={{ marginTop: theme.spacing(2) }}>
              {t('welcome.notAvailableBody')}
            </Body>
            {requested ? (
              <Caption tone="primary" style={{ marginTop: theme.spacing(3) }}>
                {t('welcome.notifyDone')}
              </Caption>
            ) : (
              <Button
                label={t('welcome.notifyMe')}
                onPress={() => void requestMunicipality()}
                variant="secondary"
                style={{ marginTop: theme.spacing(3) }}
              />
            )}
          </Card>
        }
      />
    </Screen>
  );
}

function LocationBlock({
  state,
  onDetect,
  onChoose,
}: {
  state: LocationState;
  onDetect: () => Promise<void>;
  onChoose: (municipalityId: string) => Promise<void>;
}) {
  const { t, theme } = useApp();

  if (state.status === 'locating') {
    return <Caption>{t('welcome.locating')}</Caption>;
  }

  if (state.status === 'suggested') {
    return (
      <Card>
        <Subtitle>{t('welcome.detected', { name: state.municipality.name })}</Subtitle>
        <View style={{ flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(3) }}>
          <Button
            label={t('welcome.detectedConfirm')}
            onPress={() => void onChoose(state.municipality.id)}
            style={styles.grow}
          />
        </View>
      </Card>
    );
  }

  if (state.status === 'denied' || state.status === 'unavailable') {
    return (
      <Caption>
        {state.status === 'denied' ? t('welcome.locationDenied') : t('welcome.locationUnavailable')}
      </Caption>
    );
  }

  return (
    <Pressable
      onPress={() => void onDetect()}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.locationButton,
        { minHeight: theme.touchTarget, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons
        name="locate"
        size={20}
        color={readableOn(theme.colors.primary, theme.colors.background, 3)}
      />
      <Body tone="primary">{t('welcome.useLocation')}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.5 },
  headline: { fontFamily: FONTS.black, fontSize: 38, letterSpacing: -0.8, lineHeight: 38 },
  initials: { fontFamily: FONTS.black, fontSize: 15, letterSpacing: -0.3 },
  stamp: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  town: { alignItems: 'center', borderWidth: 1, flexDirection: 'row' },
  townName: { fontFamily: FONTS.bold, fontSize: 18, letterSpacing: -0.2 },
  grow: { flex: 1 },
  locationButton: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  searchRow: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 8 },
});
