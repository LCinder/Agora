import { SUPPORTED_LOCALES } from '@agora/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Caption, Card, Chip, Display, Screen, Subtitle } from '../../components/ui';
import { useApp } from '../../providers/app-provider';

/**
 * Settings.
 *
 * Short on purpose. The only thing a resident has to be able to do here is
 * change town, change language and delete everything the app stored, which is
 * what the privacy policy promises.
 */
export default function SettingsScreen() {
  const { forgetEverything, locale, municipality, setLocale, t, theme } = useApp();
  const router = useRouter();

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
