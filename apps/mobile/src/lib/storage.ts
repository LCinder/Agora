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
