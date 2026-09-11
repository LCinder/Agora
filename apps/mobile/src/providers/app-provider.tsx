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
  clearAllData,
  interestKey,
  loadActiveMunicipality,
  loadAppearance,
  loadInterests,
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
  /** False until the stored preferences have been read. */
  ready: boolean;
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
  forgetEverything: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();

  const [ready, setReady] = useState(false);
  const [municipalities, setMunicipalities] = useState<MunicipalitySummary[]>([]);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const deviceLocale = resolveLocale(getLocales()[0]?.languageTag);
      const all = await dataSource.listMunicipalities();
      const storedId = await loadActiveMunicipality();
      const storedInterests = await loadInterests();
      const storedAppearance = await loadAppearance();

      const stored = storedId === null ? null : all.find((entry) => entry.id === storedId);
      const selected = stored ? await dataSource.getMunicipalityBySlug(stored.slug) : null;

      if (!active) return;

      setLocale(deviceLocale);
      setMunicipalities(all);
      setMunicipality(selected);
      setInterests(storedInterests);
      if (isAppearance(storedAppearance)) setAppearanceState(storedAppearance);
      setReady(true);
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const selectMunicipality = useCallback(
    async (municipalityId: string) => {
      const summary = municipalities.find((entry) => entry.id === municipalityId);
      if (!summary) return;

      const selected = await dataSource.getMunicipalityBySlug(summary.slug);
      if (!selected) return;

      await saveActiveMunicipality(municipalityId);
      setMunicipality(selected);
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
    },
    [interests, municipality],
  );

  const forgetEverything = useCallback(async () => {
    await clearAllData();
    setInterests([]);
    setMunicipality(null);
    setAppearanceState(DEFAULT_APPEARANCE);
  }, []);

  const interestedEventIds = useMemo(() => {
    if (!municipality) return [];

    const prefix = `${municipality.id}/`;
    return interests
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length));
  }, [interests, municipality]);

  const value = useMemo<AppState>(
    () => ({
      ready,
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
      forgetEverything,
    }),
    [
      appearance,
      setAppearance,
      forgetEverything,
      interestedEventIds,
      isInterested,
      locale,
      municipalities,
      municipality,
      ready,
      scheme,
      selectMunicipality,
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
