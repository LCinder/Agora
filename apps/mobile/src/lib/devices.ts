import { type DeviceClient, createDeviceClient } from '@agora/data';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { apiBaseUrl, usingRealBackend } from './data';
import { interestKey, loadDeviceRegistration, saveDeviceRegistration } from './storage';

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

function split(key: string): { municipalityId: string; eventId: string } | null {
  const slash = key.indexOf('/');

  if (slash <= 0) return null;

  return { municipalityId: key.slice(0, slash), eventId: key.slice(slash + 1) };
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
    const remoteKeys = remote.map((mark) => interestKey(mark.municipalityId, mark.eventId));

    for (const key of local) {
      if (remoteKeys.includes(key)) continue;

      const parts = split(key);

      if (parts !== null) await deviceClient.mark(parts.municipalityId, parts.eventId);
    }

    for (const mark of remote) {
      if (local.includes(interestKey(mark.municipalityId, mark.eventId))) continue;

      await deviceClient.unmark(mark.municipalityId, mark.eventId);
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
