'use client';

import type { Event, EventCategory, Municipality, Organization } from '@agora/core';
import {
  type NewEventInput,
  type PanelClient,
  type PanelStats,
  createHttpDataSource,
  createPanelClient,
  createSeedDataSource,
  fetchPanelSession,
} from '@agora/data';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { type PanelIdentity, currentIdToken, currentIdentity, panelConfig, signOut } from './auth';
import { DEMO_MUNICIPALITY_ID, DEMO_MUNICIPALITY_SLUG } from './demo';

/**
 * Panel state, over whichever backend this build has.
 *
 * Two implementations behind one interface, chosen by the same rule as the app
 * (D-042): with `NEXT_PUBLIC_API_BASE_URL` and the Cognito ids set, the panel
 * talks to the API as whoever signed in; without them it loads the seed into the
 * browser and keeps every change in local storage.
 *
 * The demo path is not a leftover. A councillor has to be able to create an event
 * on a laptop in a meeting room with bad wifi, and nothing typed there should be
 * sent anywhere. See docs/decisiones.md, D-013 and D-048.
 *
 * Every mutation is asynchronous, in both. It has to be for the real one, and
 * making the demo pretend otherwise would mean two different sets of screens.
 */

const STORAGE_KEY = 'agora.panel.state';

export interface EventNotice {
  id: string;
  eventId: string;
  type: 'time_change' | 'location_change' | 'cancelled' | 'notice';
  message: string;
  createdAt: string;
}

interface StoredState {
  events: Event[];
  notices: EventNotice[];
}

export interface PanelState {
  loading: boolean;
  /** True when this build runs on the seed in the browser, with no API. */
  demo: boolean;
  /** Who is signed in. Always null in the demo, which has no accounts. */
  identity: PanelIdentity | null;
  municipality: Municipality | null;
  categories: EventCategory[];
  organizations: Organization[];
  events: Event[];
  notices: EventNotice[];
  /**
   * The aggregate numbers, from the API. Null in the demo, which invents its own
   * from the seed so the charts have something to show in a meeting.
   */
  stats: PanelStats | null;

  createEvent: (draft: NewEvent) => Promise<void>;
  updateEvent: (id: string, changes: Partial<NewEvent>) => Promise<void>;
  cancelEvent: (id: string) => Promise<void>;
  approveEvent: (id: string) => Promise<void>;
  rejectEvent: (id: string, reason: string) => Promise<void>;
  addNotice: (notice: Omit<EventNotice, 'id' | 'createdAt'>) => Promise<void>;
  /** Loads the notices of one event. A no-op in the demo, which holds them all. */
  refreshNotices: (eventId: string) => Promise<void>;
  /** Re-reads who is signed in, and loads their municipality. */
  refreshIdentity: () => Promise<void>;
  leave: () => void;
  resetToSeed: () => void;
}

export interface NewEvent {
  title: string;
  description: string;
  categoryId: string;
  startAt: Date;
  endAt: Date | null;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  isFree: boolean;
  priceInfo: string | null;
  isFeatured: boolean;
  organizationId: string | null;
}

const PanelContext = createContext<PanelState | null>(null);

/** Dates survive a round trip through local storage as ISO strings. */
function reviveEvent(raw: Event): Event {
  return {
    ...raw,
    startAt: new Date(raw.startAt),
    endAt: raw.endAt === null ? null : new Date(raw.endAt),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    publishedAt: raw.publishedAt === null ? null : new Date(raw.publishedAt),
  };
}

function readStored(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredState;
    return { events: parsed.events.map(reviveEvent), notices: parsed.notices };
  } catch {
    return null;
  }
}

function writeStored(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota; the demo still works in memory.
  }
}

/** A draft as the API takes it. The panel's form shape is older than the API's. */
function toApiInput(draft: NewEvent, municipality: Municipality | null): NewEventInput {
  return {
    title: draft.title,
    description: draft.description,
    categoryId: draft.categoryId,
    startAt: draft.startAt,
    endAt: draft.endAt,
    location: {
      name: draft.locationName,
      latitude: draft.latitude ?? municipality?.latitude ?? null,
      longitude: draft.longitude ?? municipality?.longitude ?? null,
    },
    priceInfo: draft.priceInfo,
    isFree: draft.isFree,
    isFeatured: draft.isFeatured,
    status: 'published',
  };
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const config = panelConfig();
  const demo = config === null;

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<PanelIdentity | null>(null);
  const [client, setClient] = useState<PanelClient | null>(null);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notices, setNotices] = useState<EventNotice[]>([]);
  const [stats, setStats] = useState<PanelStats | null>(null);

  const persist = useCallback((nextEvents: Event[], nextNotices: EventNotice[]) => {
    setEvents(nextEvents);
    setNotices(nextNotices);
    writeStored({ events: nextEvents, notices: nextNotices });
  }, []);

  // -------------------------------------------------------------------------
  // The demo: the seed, in the browser
  // -------------------------------------------------------------------------

  const loadSeed = useCallback(async (fromSeed: boolean) => {
    const source = createSeedDataSource();

    const [loadedMunicipality, loadedCategories, loadedOrganizations, seedEvents] =
      await Promise.all([
        source.getMunicipalityBySlug(DEMO_MUNICIPALITY_SLUG),
        source.listCategories(DEMO_MUNICIPALITY_ID),
        source.listOrganizations(DEMO_MUNICIPALITY_ID),
        source.listEvents(DEMO_MUNICIPALITY_ID),
      ]);

    setMunicipality(loadedMunicipality);
    setCategories(loadedCategories);
    setOrganizations(loadedOrganizations);

    const stored = fromSeed ? null : readStored();
    const nextEvents = stored?.events ?? seedEvents;
    const nextNotices = stored?.notices ?? [];

    setEvents(nextEvents);
    setNotices(nextNotices);
    if (!stored) writeStored({ events: nextEvents, notices: nextNotices });

    setLoading(false);
  }, []);

  // -------------------------------------------------------------------------
  // The real one: the API, as whoever signed in
  // -------------------------------------------------------------------------

  const loadRemote = useCallback(async () => {
    if (config === null) return;

    const who = await currentIdentity();

    setIdentity(who);

    if (who === null) {
      setLoading(false);

      return;
    }

    const options = { baseUrl: config.apiBaseUrl, token: currentIdToken };
    const session = await fetchPanelSession(options);
    const membership = session.memberships[0];

    // Signed in, with no municipality: somebody whose access was revoked while
    // they had the panel open, or an account invited and never granted anything.
    if (membership === undefined) {
      setLoading(false);

      return;
    }

    const panel = createPanelClient({ ...options, municipalityId: membership.municipalityId });
    const publicData = createHttpDataSource({ baseUrl: config.apiBaseUrl });

    const [loadedMunicipality, loadedCategories, loadedOrganizations, loadedEvents, loadedStats] =
      await Promise.all([
        panel.getMunicipality(),
        publicData.listCategories(membership.municipalityId),
        panel.listOrganizations(),
        panel.listEvents(),
        // An association gets a refusal here, and that is not a failure: it sees
        // its own events' numbers and not the municipality's.
        panel.stats().catch(() => null),
      ]);

    setClient(panel);
    setMunicipality(loadedMunicipality);
    setCategories(loadedCategories);
    setOrganizations(loadedOrganizations);
    setEvents(loadedEvents);
    setNotices([]);
    setStats(loadedStats);
    setLoading(false);
  }, [config]);

  useEffect(() => {
    // The seed and the API are both external systems as far as React is
    // concerned: the state updates happen after the awaits, in a callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (demo) void loadSeed(false);
    else void loadRemote();
  }, [demo, loadRemote, loadSeed]);

  /** After every write: the list the API holds, which may differ from ours. */
  const reload = useCallback(async (panel: PanelClient) => {
    setEvents(await panel.listEvents());
  }, []);

  const createEvent = useCallback(
    async (draft: NewEvent) => {
      if (client !== null) {
        await client.createEvent(toApiInput(draft, municipality));
        await reload(client);

        return;
      }

      const now = new Date();
      const event: Event = {
        id: `evt-${now.getTime().toString(36)}`,
        municipalityId: DEMO_MUNICIPALITY_ID,
        organizationId: draft.organizationId,
        title: draft.title,
        description: draft.description,
        categoryId: draft.categoryId,
        startAt: draft.startAt,
        endAt: draft.endAt,
        allDay: false,
        location: {
          name: draft.locationName,
          latitude: draft.latitude,
          longitude: draft.longitude,
        },
        imageUrl: null,
        priceInfo: draft.priceInfo,
        isFree: draft.isFree,
        audienceTags: [],
        status: 'published',
        rejectionReason: null,
        isFeatured: draft.isFeatured,
        liveTrackingEnabled: false,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      };

      persist([event, ...events], notices);
    },
    [client, events, municipality, notices, persist, reload],
  );

  const updateEvent = useCallback(
    async (id: string, changes: Partial<NewEvent>) => {
      if (client !== null) {
        // Only the fields the API takes, named as it names them: the form's shape
        // is older than the API's, and `organizationId` is not something an edit
        // may change at all.
        await client.updateEvent(id, {
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.description === undefined ? {} : { description: changes.description }),
          ...(changes.categoryId === undefined ? {} : { categoryId: changes.categoryId }),
          ...(changes.startAt === undefined ? {} : { startAt: changes.startAt }),
          ...(changes.endAt === undefined ? {} : { endAt: changes.endAt }),
          ...(changes.isFree === undefined ? {} : { isFree: changes.isFree }),
          ...(changes.priceInfo === undefined ? {} : { priceInfo: changes.priceInfo }),
          ...(changes.isFeatured === undefined ? {} : { isFeatured: changes.isFeatured }),
          ...(changes.locationName === undefined
            ? {}
            : {
                location: {
                  name: changes.locationName,
                  latitude: changes.latitude ?? null,
                  longitude: changes.longitude ?? null,
                },
              }),
        });
        await reload(client);

        return;
      }

      persist(
        events.map((event) =>
          event.id === id
            ? {
                ...event,
                ...(changes.title === undefined ? {} : { title: changes.title }),
                ...(changes.description === undefined ? {} : { description: changes.description }),
                ...(changes.categoryId === undefined ? {} : { categoryId: changes.categoryId }),
                ...(changes.startAt === undefined ? {} : { startAt: changes.startAt }),
                ...(changes.endAt === undefined ? {} : { endAt: changes.endAt }),
                ...(changes.isFree === undefined ? {} : { isFree: changes.isFree }),
                ...(changes.priceInfo === undefined ? {} : { priceInfo: changes.priceInfo }),
                ...(changes.isFeatured === undefined ? {} : { isFeatured: changes.isFeatured }),
                ...(changes.locationName === undefined
                  ? {}
                  : {
                      location: {
                        name: changes.locationName,
                        latitude: changes.latitude ?? event.location.latitude,
                        longitude: changes.longitude ?? event.location.longitude,
                      },
                    }),
                updatedAt: new Date(),
              }
            : event,
        ),
        notices,
      );
    },
    [client, events, notices, persist, reload],
  );

  const setStatus = useCallback(
    (id: string, status: Event['status'], reason: string | null = null) => {
      persist(
        events.map((event) =>
          event.id === id
            ? {
                ...event,
                status,
                rejectionReason: reason,
                updatedAt: new Date(),
                publishedAt: status === 'published' ? new Date() : event.publishedAt,
              }
            : event,
        ),
        notices,
      );
    },
    [events, notices, persist],
  );

  const cancelEvent = useCallback(
    async (id: string) => {
      if (client === null) {
        setStatus(id, 'cancelled');

        return;
      }

      await client.cancelEvent(id);
      await reload(client);
    },
    [client, reload, setStatus],
  );

  const approveEvent = useCallback(
    async (id: string) => {
      if (client === null) {
        setStatus(id, 'published');

        return;
      }

      await client.approveEvent(id);
      await reload(client);
    },
    [client, reload, setStatus],
  );

  const rejectEvent = useCallback(
    async (id: string, reason: string) => {
      if (client === null) {
        setStatus(id, 'rejected', reason);

        return;
      }

      await client.rejectEvent(id, reason);
      await reload(client);
    },
    [client, reload, setStatus],
  );

  const refreshNotices = useCallback(
    async (eventId: string) => {
      if (client === null) return;

      const sent = await client.listNotices(eventId);

      setNotices(
        sent.map((notice) => ({
          id: notice.id,
          eventId: notice.eventId,
          type: notice.type,
          message: notice.message,
          createdAt: notice.createdAt.toISOString(),
        })),
      );
    },
    [client],
  );

  const addNotice = useCallback(
    async (notice: Omit<EventNotice, 'id' | 'createdAt'>) => {
      if (client !== null) {
        await client.sendNotice(notice.eventId, notice.type, notice.message);
        await refreshNotices(notice.eventId);

        return;
      }

      const entry: EventNotice = {
        ...notice,
        id: `notice-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      };

      persist(events, [entry, ...notices]);
    },
    [client, events, notices, persist, refreshNotices],
  );

  const value = useMemo<PanelState>(
    () => ({
      loading,
      demo,
      identity,
      municipality,
      categories,
      organizations,
      events,
      notices,
      stats,
      createEvent,
      updateEvent,
      cancelEvent,
      approveEvent,
      rejectEvent,
      addNotice,
      refreshNotices,
      refreshIdentity: async () => {
        setLoading(true);
        await loadRemote();
      },
      leave: () => {
        signOut();
        setIdentity(null);
        setClient(null);
        setEvents([]);
        setStats(null);
      },
      resetToSeed: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        void loadSeed(true);
      },
    }),
    [
      addNotice,
      approveEvent,
      cancelEvent,
      categories,
      createEvent,
      demo,
      events,
      identity,
      loadRemote,
      loadSeed,
      loading,
      municipality,
      notices,
      organizations,
      refreshNotices,
      rejectEvent,
      stats,
      updateEvent,
    ],
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelState {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanel must be used inside PanelProvider');
  }
  return context;
}
