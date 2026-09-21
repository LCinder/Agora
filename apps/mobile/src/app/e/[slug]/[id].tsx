import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Body, Loading, Screen, Subtitle } from '../../../components/ui';
import { useApp } from '../../../providers/app-provider';

/**
 * Where a shared link lands.
 *
 * The path is the same one the public web page uses — `/e/:slug/:id` — because
 * a link on WhatsApp has to work for everybody: with the app installed the
 * system hands it to this screen, and without it, it opens the web page. One
 * link, not two, and nobody has to think about which they are sending.
 *
 * The slug carries the municipality, which matters more than it looks: the link
 * that spreads through a town is usually sent to somebody who has never opened
 * the app, so arriving here means selecting a municipality on their behalf
 * before the event can be shown at all.
 *
 * This screen is never navigated to from inside the app. It resolves and
 * redirects, so it does not appear in the back stack.
 */
export default function SharedEventScreen() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { ready, municipalities, municipality, selectMunicipality, t } = useApp();
  const [failed, setFailed] = useState(false);

  const target = municipalities.find((entry) => entry.slug === slug);
  const needsSwitch = target !== undefined && target.id !== municipality?.id;

  useEffect(() => {
    if (!ready) return;

    if (target === undefined) {
      setFailed(true);
      return;
    }

    if (needsSwitch) void selectMunicipality(target.id);
  }, [ready, target, needsSwitch, selectMunicipality]);

  // A link for a municipality this build does not know about. It is not an
  // error worth a dialog: the event exists, it is just somewhere else, and the
  // web page the link came from is the one that can show it.
  if (failed) {
    return (
      <Screen>
        <Subtitle>{t('shared.unknownMunicipality')}</Subtitle>
        <Body>{t('shared.openInBrowser')}</Body>
      </Screen>
    );
  }

  if (!ready || needsSwitch) return <Loading label={t('common.loading')} />;

  return <Redirect href={`/event/${id}`} />;
}
