import type { Municipality } from '@agora/core';
import type { MunicipalitySummary } from '@agora/data';
import {
  DEFAULT_LOCALE,
  createTranslator,
  resolveLocale,
  type Locale,
  type Translate,
} from '@agora/i18n';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { dataSource } from '../lib/data';
import {
  followMunicipality,
  forgetDevice,
  pushActivityInterest,
  pushInterest,
  syncInterests,
} from '../lib/devices';
import { enablePush, refreshPushToken } from '../lib/push';
import {
  activityInterestKey,
  clearAllData,
  interestKey,
  loadActiveMunicipality,
  loadAppearance,
  loadInterests,
  parseInterestKey,
  saveActiveMunicipality,
  saveAppearance,
  saveInterests,
} from '../lib/storage';
import {
  DEFAULT_APPEARANCE,
  FALLBACK_PRIMARY_COLOR,
  createTheme,
  isAppearance,
  type Appearance,
  type Theme,
} from '../theme/theme';

/**
 * Application state every screen needs: which municipality is being shown, in
 * which language, with which theme, and which events the resident marked.
 *
 * Deliberately one context rather than four. The app is small, the values
 * change rarely, and a resident switching municipality should re-render
 * everything anyway.
 */

export interface AppState {
  /** False until the app has finished its first load, whether or not it worked. */
  ready: boolean;
  /** True when that first load could not reach the API. `retry` tries again. */
  offline: boolean;
  retry: () => void;
  municipalities: MunicipalitySummary[];
  municipality: Municipality | null;
  selectMunicipality: (municipalityId: string) => Promise<void>;

  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  theme: Theme;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => Promise<void>;

  isInterested: (eventId: string) => boolean;
  toggleInterest: (eventId: string) => Promise<void>;
  interestedEventIds: string[];
  /**
   * The same pair for one line of a programme.
   *
   * A separate mark from the event's, which is the point: somebody who wants a
   * reminder about the falconry show at six on Saturday has not asked to be
   * reminded about the whole feria. Marking a line needs the event too, because
   * that is how the API finds it.
   */
  isActivityInterested: (eventId: string, activityId: string) => boolean;
  toggleActivityInterest: (eventId: string, activityId: string) => Promise<void>;
  /** Marked activities of the active municipality, as `eventId/activityId`. */
  interestedActivityIds: { eventId: string; activityId: string }[];
  forgetEverything: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();

  const [ready, setReady] = useState(false);
  /**
   * True when the first load could not reach the API.
   *
   * Kept apart from `ready`, because the two answer different questions: `ready`
   * is "has the app finished trying", and this is "did it get anything". Before
   * this existed they were the same flag, and a failed load left the app on its
   * spinner for ever (D-068).
   */
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [municipalities, setMunicipalities] = useState<MunicipalitySummary[]>([]);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const deviceLocale = resolveLocale(getLocales()[0]?.languageTag);

      // Read from the phone first, and never inside the try below: these four
      // cannot fail for a network reason, and a resident who has already chosen
      // their town keeps their marks and their settings even when nothing loads.
      const storedId = await loadActiveMunicipality();
      const storedInterests = await loadInterests();
      const storedAppearance = await loadAppearance();

      let all: MunicipalitySummary[] = [];
      let selected: Municipality | null = null;
      let failed = false;

      try {
        all = await dataSource.listMunicipalities();

        const stored = storedId === null ? null : all.find((entry) => entry.id === storedId);

        selected = stored ? await dataSource.getMunicipalityBySlug(stored.slug) : null;
      } catch {
        // A street with one bar of signal, an API that is down, or a response
        // this build is too old to read. Whichever it was, the resident gets a
        // screen that says so and a button, not a spinner that never stops.
        failed = true;
      }

      if (!active) return;

      setLocale(deviceLocale);
      setMunicipalities(all);
      setMunicipality(selected);
      setInterests(storedInterests);
      setOffline(failed);
      if (isAppearance(storedAppearance)) setAppearanceState(storedAppearance);

      // Always, and last. Whatever happened above, the app has finished trying
      // and something has to be on screen.
      setReady(true);

      // After the screen is up, never before it: the calendar must not wait for
      // the network to paint. All three are no-ops in the demo build.
      if (failed) return;

      if (selected !== null) void followMunicipality(selected.id);
      void syncInterests(storedInterests);
      void refreshPushToken();
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [attempt]);

  /** What the button on the offline screen does. */
  const retry = useCallback(() => {
    setReady(false);
    setOffline(false);
    setAttempt((value) => value + 1);
  }, []);

  const selectMunicipality = useCallback(
    async (municipalityId: string) => {
      const summary = municipalities.find((entry) => entry.id === municipalityId);
      if (!summary) return;

      const selected = await dataSource.getMunicipalityBySlug(summary.slug);
      if (!selected) return;

      await saveActiveMunicipality(municipalityId);
      setMunicipality(selected);

      // A resident who picks their town is a resident that town can be told about,
      // counted and never named.
      void followMunicipality(municipalityId);
    },
    [municipalities],
  );

  const setAppearance = useCallback(async (next: Appearance) => {
    setAppearanceState(next);
    await saveAppearance(next);
  }, []);

  const isInterested = useCallback(
    (eventId: string) =>
      municipality !== null && interests.includes(interestKey(municipality.id, eventId)),
    [interests, municipality],
  );

  const toggleInterest = useCallback(
    async (eventId: string) => {
      if (!municipality) return;

      const key = interestKey(municipality.id, eventId);
      const next = interests.includes(key)
        ? interests.filter((entry) => entry !== key)
        : [...interests, key];

      setInterests(next);
      await saveInterests(next);

      const interested = !interests.includes(key);

      void pushInterest(municipality.id, eventId, interested);

      // The first mark is the moment asking for notifications makes sense: the
      // neighbour has just said they care about something that has a date. Asking
      // on the welcome screen, before they have seen a single event, is how an app
      // gets its notifications turned off for ever.
      if (interested) void enablePush();
    },
    [interests, municipality],
  );

  const forgetEverything = useCallback(async () => {
    // The server first: clearing the phone's storage on its own would leave the
    // marks and the push token behind, and the reminders would keep arriving.
    await forgetDevice();
    await clearAllData();
    setInterests([]);
    setMunicipality(null);
    setAppearanceState(DEFAULT_APPEARANCE);
  }, []);

  const isActivityInterested = useCallback(
    (eventId: string, activityId: string) =>
      municipality !== null &&
      interests.includes(activityInterestKey(municipality.id, eventId, activityId)),
    [interests, municipality],
  );

  const toggleActivityInterest = useCallback(
    async (eventId: string, activityId: string) => {
      if (!municipality) return;

      const key = activityInterestKey(municipality.id, eventId, activityId);
      const interested = !interests.includes(key);
      const next = interested ? [...interests, key] : interests.filter((entry) => entry !== key);

      setInterests(next);
      await saveInterests(next);

      void pushActivityInterest(municipality.id, eventId, activityId, interested);

      // Same moment, same argument as on an event: somebody has just said they
      // care about a thing with a time on it, which is when asking to notify
      // them makes sense.
      if (interested) void enablePush();
    },
    [interests, municipality],
  );

  /**
   * The marks of the active municipality, split by what they are about.
   *
   * One pass over one list, because the two shapes live in the same stored list:
   * a key with two segments is an event, one with three is a line of a
   * programme.
   */
  const { interestedEventIds, interestedActivityIds } = useMemo(() => {
    const events: string[] = [];
    const activities: { eventId: string; activityId: string }[] = [];

    if (!municipality) return { interestedEventIds: events, interestedActivityIds: activities };

    for (const entry of interests) {
      const parsed = parseInterestKey(entry);

      if (parsed === null || parsed.municipalityId !== municipality.id) continue;

      if (parsed.activityId === null) events.push(parsed.eventId);
      else activities.push({ eventId: parsed.eventId, activityId: parsed.activityId });
    }

    return { interestedEventIds: events, interestedActivityIds: activities };
  }, [interests, municipality]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      offline,
      retry,
      municipalities,
      municipality,
      selectMunicipality,
      locale,
      setLocale,
      t: createTranslator(locale),
      theme: createTheme(
        municipality?.branding.primaryColor ?? FALLBACK_PRIMARY_COLOR,
        appearance,
        scheme,
      ),
      appearance,
      setAppearance,
      isInterested,
      toggleInterest,
      interestedEventIds,
      isActivityInterested,
      toggleActivityInterest,
      interestedActivityIds,
      forgetEverything,
    }),
    [
      appearance,
      setAppearance,
      forgetEverything,
      interestedActivityIds,
      interestedEventIds,
      isActivityInterested,
      isInterested,
      locale,
      municipalities,
      municipality,
      ready,
      offline,
      retry,
      scheme,
      selectMunicipality,
      toggleActivityInterest,
      toggleInterest,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}

/** Shortcut for the common case of only needing copy and colours. */
export function useTheme(): Theme {
  return useApp().theme;
}
