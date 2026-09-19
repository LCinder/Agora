import { SUPPORTED_LOCALES } from '@agora/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Caption, Card, Chip, Display, Screen, Subtitle } from '../../components/ui';
import { type PushState, disablePush, enablePush, pushState } from '../../lib/push';
import { useApp } from '../../providers/app-provider';
import { APPEARANCES, type Appearance } from '../../theme/theme';

/** Dark first: the calendar is designed for it, and light is the way out. */
const APPEARANCE_LABELS: Record<
  Appearance,
  'settings.appearanceDark' | 'settings.appearanceLight' | 'settings.appearanceSystem'
> = {
  dark: 'settings.appearanceDark',
  light: 'settings.appearanceLight',
  system: 'settings.appearanceSystem',
};

/**
 * Settings.
 *
 * Short on purpose. The only things a resident has to be able to do here are
 * change town, change language, choose light or dark, and delete everything
 * the app stored, which is what the privacy policy promises.
 */
export default function SettingsScreen() {
  const { appearance, forgetEverything, locale, municipality, setAppearance, setLocale, t, theme } =
    useApp();
  const router = useRouter();

  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    let active = true;

    void pushState().then((state) => {
      if (active) setPush(state);
    });

    return () => {
      active = false;
    };
  }, []);

  async function togglePush() {
    if (push === 'granted') {
      await disablePush();
      setPush('undetermined');

      return;
    }

    setPush(await enablePush());
  }

  async function deleteEverything() {
    await forgetEverything();
    router.replace('/welcome');
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing(4), padding: theme.spacing(5) }}>
        <Display>{t('settings.title')}</Display>

        <Card>
          <Caption>{t('settings.municipality')}</Caption>
          <Subtitle style={{ marginTop: theme.spacing(1) }}>{municipality?.name ?? '—'}</Subtitle>
          <Button
            label={t('calendar.changeMunicipality')}
            variant="secondary"
            onPress={() => router.push('/welcome')}
            style={{ marginTop: theme.spacing(3) }}
          />
        </Card>

        <Card>
          <Caption>{t('settings.language')}</Caption>
          <View
            style={{ flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(3) }}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <Chip
                key={code}
                label={code === 'es' ? 'Español' : 'English'}
                selected={locale === code}
                onPress={() => setLocale(code)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Caption>{t('settings.appearance')}</Caption>
          <View
            style={{ flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(3) }}
          >
            {APPEARANCES.map((option) => (
              <Chip
                key={option}
                label={t(APPEARANCE_LABELS[option])}
                selected={appearance === option}
                onPress={() => void setAppearance(option)}
              />
            ))}
          </View>
          <Body tone="muted" style={{ marginTop: theme.spacing(3) }}>
            {t('settings.appearanceBody')}
          </Body>
        </Card>

        <Card>
          <Caption>{t('settings.notifications')}</Caption>
          <Subtitle style={{ marginTop: theme.spacing(1) }}>
            {push === 'granted' ? t('settings.notificationsOn') : t('settings.notificationsOff')}
          </Subtitle>
          <Body tone="muted" style={{ marginTop: theme.spacing(2) }}>
            {push === 'unsupported'
              ? t('settings.notificationsUnsupported')
              : push === 'denied'
                ? t('settings.notificationsDenied')
                : t('settings.notificationsBody')}
          </Body>
          {push === 'unsupported' || push === 'denied' ? null : (
            <Button
              label={
                push === 'granted'
                  ? t('settings.notificationsDisable')
                  : t('settings.notificationsEnable')
              }
              variant="secondary"
              onPress={() => void togglePush()}
              style={{ marginTop: theme.spacing(3) }}
            />
          )}
        </Card>

        <Card>
          <Caption>{t('volunteer.title')}</Caption>
          <Body tone="muted" style={{ marginTop: theme.spacing(2) }}>
            {t('volunteer.settingsBody')}
          </Body>
          <Button
            label={t('volunteer.title')}
            variant="secondary"
            onPress={() => router.push('/volunteer')}
            style={{ marginTop: theme.spacing(3) }}
          />
        </Card>

        <Card>
          <Caption>{t('settings.privacy')}</Caption>
          <Body tone="muted" style={{ marginTop: theme.spacing(2) }}>
            {t('settings.deleteDataBody')}
          </Body>
          <Button
            label={t('settings.deleteData')}
            variant="secondary"
            onPress={() => void deleteEverything()}
            style={{ marginTop: theme.spacing(3) }}
          />
        </Card>

        <Caption>{t('settings.demoNotice')}</Caption>
      </View>
    </Screen>
  );
}
