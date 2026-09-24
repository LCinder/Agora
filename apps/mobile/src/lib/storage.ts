import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Everything the app remembers about a resident lives on their device.
 *
 * There is no account, no email and no identifier sent anywhere. "Asistiré"
 * and the chosen municipality are the only things stored, and Settings can
 * wipe both. See the privacy requirements in CLAUDE.md, section 10.
 */

const KEYS = {
  municipalities: 'agora.municipalities',
  activeMunicipality: 'agora.municipality.active',
  interests: 'agora.interests',
  requestedMunicipalities: 'agora.municipality.requested',
  appearance: 'agora.appearance',
  volunteerSession: 'agora.volunteer.session',
  deviceRegistration: 'agora.device.registration',
  viewedToday: 'agora.views.today',
  pushAsked: 'agora.push.asked',
} as const;

/** An interest is one event of one municipality. */
export type InterestKey = string;

export function interestKey(municipalityId: string, eventId: string): InterestKey {
  return `${municipalityId}/${eventId}`;
}

/**
 * A mark on one line of a programme.
 *
 * Kept in the same list as the events' marks, told apart by a third segment.
 * One list rather than two because everything that touches it — saving,
 * syncing, "borrar mis datos" — would otherwise have to do everything twice,
 * and the one that gets forgotten is the wipe.
 *
 * The event is in the key because the API needs it to find the line: an
 * activity is not addressable without its programme.
 */
export function activityInterestKey(
  municipalityId: string,
  eventId: string,
  activityId: string,
): InterestKey {
  return `${municipalityId}/${eventId}/${activityId}`;
}

/** What a stored key refers to, or null when it is not one of ours. */
export function parseInterestKey(
  key: InterestKey,
): { municipalityId: string; eventId: string; activityId: string | null } | null {
  const parts = key.split('/');
  const [municipalityId, eventId, activityId] = parts;

  if (municipalityId === undefined || municipalityId === '') return null;
  if (eventId === undefined || eventId === '') return null;
  if (parts.length === 2) return { municipalityId, eventId, activityId: null };
  if (parts.length === 3 && activityId !== undefined && activityId !== '') {
    return { municipalityId, eventId, activityId };
  }

  return null;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // A corrupted value must never stop the app from opening.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage being full is not worth interrupting the neighbour for.
  }
}

/** Dark, light or follow the phone. Dark until the resident says otherwise. */
export async function loadAppearance(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.appearance);
  } catch {
    return null;
  }
}

export async function saveAppearance(appearance: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.appearance, appearance);
  } catch {
    // Not worth interrupting the neighbour for.
  }
}

/** Municipalities the resident follows, most recently chosen first. */
export async function loadFollowedMunicipalities(): Promise<string[]> {
  return readJson<string[]>(KEYS.municipalities, []);
}

export async function loadActiveMunicipality(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.activeMunicipality);
  } catch {
    return null;
  }
}

export async function saveActiveMunicipality(municipalityId: string): Promise<void> {
  const followed = await loadFollowedMunicipalities();
  const next = [municipalityId, ...followed.filter((id) => id !== municipalityId)];

  await writeJson(KEYS.municipalities, next);
  try {
    await AsyncStorage.setItem(KEYS.activeMunicipality, municipalityId);
  } catch {
    // Ignored for the same reason as above.
  }
}

export async function loadInterests(): Promise<InterestKey[]> {
  return readJson<InterestKey[]>(KEYS.interests, []);
}

export async function saveInterests(interests: readonly InterestKey[]): Promise<void> {
  await writeJson(KEYS.interests, interests);
}

/**
 * The events this phone has already been counted as opening today.
 *
 * It exists to not make a request the API would refuse: a view counts once per
 * phone per day, and a neighbour checking the time of the procession four times
 * would otherwise send four of them. The whole record is replaced when the day
 * changes, so there is nothing to prune and no history of what was read — only
 * today's list, and only until midnight.
 */
interface ViewedToday {
  day: string;
  keys: InterestKey[];
}

export async function loadViewedToday(day: string): Promise<InterestKey[]> {
  const stored = await readJson<ViewedToday | null>(KEYS.viewedToday, null);

  return stored !== null && stored.day === day ? stored.keys : [];
}

export async function saveViewedToday(day: string, keys: readonly InterestKey[]): Promise<void> {
  await writeJson(KEYS.viewedToday, { day, keys });
}

/**
 * Municipalities a resident asked for that are not on the platform yet.
 *
 * Kept on the device in phase 0. In phase 2 it becomes an anonymous counter
 * per municipality, which is what lets us walk into a town hall and say how
 * many of their neighbours already asked for the app.
 */
export async function loadRequestedMunicipalities(): Promise<string[]> {
  return readJson<string[]>(KEYS.requestedMunicipalities, []);
}

export async function addRequestedMunicipality(name: string): Promise<void> {
  const requested = await loadRequestedMunicipalities();
  if (requested.includes(name)) return;

  await writeJson(KEYS.requestedMunicipalities, [...requested, name]);
}

/** Wipes everything this app stored. Offered in Settings. */
export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch {
    // Nothing useful to do; the next read falls back to empty anyway.
  }
}

/**
 * Whether this phone has ever been shown the notifications prompt.
 *
 * Android cannot answer this. `shouldShowRequestPermissionRationale` — which is
 * what `canAskAgain` comes from — returns false both when the resident has
 * refused for good and when nobody has ever asked, and those two need opposite
 * treatment: one is a dead end, the other is the normal state of a fresh
 * install. So the app remembers it itself.
 */
export async function loadPushAsked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEYS.pushAsked)) === 'yes';
  } catch {
    // Better to offer the button again than to hide it forever.
    return false;
  }
}

export async function savePushAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.pushAsked, 'yes');
  } catch {
    // Storage being full is not worth interrupting the neighbour for.
  }
}

/**
 * The live tracking session of a volunteer, kept so a phone that dies halfway
 * down the route comes back to the same broadcast instead of needing another
 * code. It holds a token bound to one event and nothing about the person.
 */
export interface StoredVolunteerSession {
  eventId: string;
  municipalityId: string;
  token: string;
}

export async function loadVolunteerSession(): Promise<StoredVolunteerSession | null> {
  return readJson<StoredVolunteerSession | null>(KEYS.volunteerSession, null);
}

export async function saveVolunteerSession(session: StoredVolunteerSession): Promise<void> {
  await writeJson(KEYS.volunteerSession, session);
}

export async function clearVolunteerSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.volunteerSession);
  } catch {
    // Same as above: the next read falls back to "no session".
  }
}

/**
 * The identity the API knows this phone by: an id we invented and a signature.
 *
 * No account, no email, nothing asked of the person holding it (D-029). It is
 * kept so the same phone keeps the same marks between launches, and "borrar mis
 * datos" drops it — after which the phone is a different, equally anonymous one.
 */
export interface StoredDeviceRegistration {
  deviceId: string;
  token: string;
}

export async function loadDeviceRegistration(): Promise<StoredDeviceRegistration | null> {
  return readJson<StoredDeviceRegistration | null>(KEYS.deviceRegistration, null);
}

export async function saveDeviceRegistration(
  registration: StoredDeviceRegistration,
): Promise<void> {
  await writeJson(KEYS.deviceRegistration, registration);
}
