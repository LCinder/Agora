import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Everything the app remembers about a resident lives on their device.
 *
 * There is no account, no email and no identifier sent anywhere. "Me interesa"
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
} as const;

/** An interest is one event of one municipality. */
export type InterestKey = string;

export function interestKey(municipalityId: string, eventId: string): InterestKey {
  return `${municipalityId}/${eventId}`;
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
