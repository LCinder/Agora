import { type DeviceClient, createDeviceClient } from '@agora/data';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { DEFAULT_TIME_ZONE, dayKeyInZone } from '@agora/core';

import { apiBaseUrl, usingRealBackend } from './data';
import {
  activityInterestKey,
  interestKey,
  loadDeviceRegistration,
  loadViewedToday,
  parseInterestKey,
  saveDeviceRegistration,
  saveViewedToday,
} from './storage';

/**
 * The one thing this app writes to the API: that an event interests this phone.
 *
 * Null in the demo build, which is what every caller checks. The demo keeps the
 * marks on the device and nowhere else — a phone on a table in a meeting room
 * with bad wifi has to work — so the sync below is a no-op there.
 *
 * The local list is the authority. There is one registration per install, so
 * there is no second device to disagree with: if the phone says it marked three
 * events, the API is wrong and gets corrected.
 */
const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

export const deviceClient: DeviceClient | null = usingRealBackend
  ? createDeviceClient({
      baseUrl: apiBaseUrl,
      storage: { read: loadDeviceRegistration, write: saveDeviceRegistration },
      platform,
      // The language of the phone, which is the language its reminders arrive in.
      locale: getLocales()[0]?.languageTag ?? 'es',
    })
  : null;

/** The key of one remote mark, in the form the phone stores it. */
function keyOf(mark: {
  municipalityId: string;
  eventId: string;
  activityId: string | null;
}): string {
  return mark.activityId === null
    ? interestKey(mark.municipalityId, mark.eventId)
    : activityInterestKey(mark.municipalityId, mark.eventId, mark.activityId);
}

/**
 * Says this phone follows a municipality.
 *
 * Called when a resident picks a town and on every launch for the one they are
 * looking at. It is what lets a town hall be told how many of their neighbours
 * have the app — the number on the panel's first screen — and it is the only thing
 * the app sends about somebody who has not marked anything yet: a row saying a
 * phone follows a town, with no name, email or telephone attached to it (D-029).
 *
 * Following twice counts once, so calling it on every launch is free.
 */
export async function followMunicipality(municipalityId: string): Promise<void> {
  if (deviceClient === null) return;

  try {
    await deviceClient.follow(municipalityId);
  } catch {
    // No coverage. Tried again on the next launch.
  }
}

/**
 * Tells the API about one mark, or one unmark.
 *
 * A failure is swallowed on purpose: the neighbour already sees the heart filled
 * in, the mark is saved on the phone, and the next launch reconciles. Marking an
 * event in a street with no coverage is the normal case, not an error.
 */
export async function pushInterest(
  municipalityId: string,
  eventId: string,
  interested: boolean,
): Promise<void> {
  if (deviceClient === null) return;

  try {
    if (interested) await deviceClient.mark(municipalityId, eventId);
    else await deviceClient.unmark(municipalityId, eventId);
  } catch {
    // Reconciled on the next launch.
  }
}

/** The same, for one line of a programme. Same silence on failure, same reason. */
export async function pushActivityInterest(
  municipalityId: string,
  eventId: string,
  activityId: string,
  interested: boolean,
): Promise<void> {
  if (deviceClient === null) return;

  try {
    if (interested) await deviceClient.markActivity(municipalityId, eventId, activityId);
    else await deviceClient.unmarkActivity(municipalityId, eventId, activityId);
  } catch {
    // Reconciled on the next launch.
  }
}

/**
 * Counts that this phone opened an event, at most once a day.
 *
 * What the town hall's "vistas" is made of, and the argument that comes right
 * after "Me interesa" in a meeting: a councillor can see that four hundred
 * people looked at the concert and eleven marked it, which is a different and
 * more useful fact than either number alone.
 *
 * The day is a day in Spain, not a UTC one, so an event opened at half past
 * midnight counts for the night it belongs to. Failure is swallowed: this is a
 * statistic, and nothing the neighbour is doing depends on it.
 */
export async function recordView(municipalityId: string, eventId: string): Promise<void> {
  if (deviceClient === null) return;

  const day = dayKeyInZone(new Date(), DEFAULT_TIME_ZONE);
  const key = interestKey(municipalityId, eventId);
  const seen = await loadViewedToday(day);

  if (seen.includes(key)) return;

  // Written before the request and not after: if it fails, the phone has still
  // made its one attempt for today, and the number is not worth a retry that
  // arrives every time the neighbour reopens the page in a street with no
  // coverage.
  await saveViewedToday(day, [...seen, key]);

  try {
    await deviceClient.view(municipalityId, eventId);
  } catch {
    // A statistic, not the neighbour's business.
  }
}

/**
 * Makes the API's list of marks match the phone's.
 *
 * Called once on launch. This is what turns "Me interesa" into a reminder: the
 * notification job reads the marks, so a mark that never reached the API is a
 * reminder that never arrives.
 */
export async function syncInterests(local: readonly string[]): Promise<void> {
  if (deviceClient === null) return;

  try {
    const remote = await deviceClient.listInterests();
    const remoteKeys = remote.map(keyOf);

    for (const key of local) {
      if (remoteKeys.includes(key)) continue;

      const parts = parseInterestKey(key);

      if (parts === null) continue;

      if (parts.activityId === null) {
        await deviceClient.mark(parts.municipalityId, parts.eventId);
      } else {
        await deviceClient.markActivity(parts.municipalityId, parts.eventId, parts.activityId);
      }
    }

    for (const mark of remote) {
      if (local.includes(keyOf(mark))) continue;

      if (mark.activityId === null) {
        await deviceClient.unmark(mark.municipalityId, mark.eventId);
      } else {
        await deviceClient.unmarkActivity(mark.municipalityId, mark.eventId, mark.activityId);
      }
    }
  } catch {
    // No coverage on launch. Tried again next time.
  }
}

/**
 * Asks the API to forget this phone, before the phone forgets itself.
 *
 * Called by "borrar mis datos" in Settings. Best effort, like everything else
 * here: the local wipe happens either way, and a device nobody marks anything
 * with stops being sent anything.
 */
export async function forgetDevice(): Promise<void> {
  if (deviceClient === null) return;

  try {
    await deviceClient.forget();
  } catch {
    // Nothing else to try. The marks stay until the next launch reconciles them
    // against an empty local list, which unmarks every one of them.
  }
}
