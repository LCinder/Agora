'use client';

import type { Event, EventCategory, Municipality, Organization } from '@agora/core';
import { createSeedDataSource } from '@agora/data';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DEMO_MUNICIPALITY_ID, DEMO_MUNICIPALITY_SLUG } from './demo';

/**
 * Panel state for the demo.
 *
 * The panel has to be writable — creating and approving events is the whole
 * point of showing it — but phase 0 has no backend. So the seed is loaded once
 * into the browser and every change is kept in local storage.
 *
 * That means the demo survives a reload, which matters in a meeting, and it
 * means nothing a concejal types while trying it out is sent anywhere. In
 * phase 2 this module becomes a thin client over the real API and the screens
 * do not change. See docs/decisiones.md, D-013.
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
  municipality: Municipality | null;
  categories: EventCategory[];
  organizations: Organization[];
  events: Event[];
  notices: EventNotice[];

  createEvent: (draft: NewEvent) => Event;
  updateEvent: (id: string, changes: Partial<NewEvent>) => void;
  cancelEvent: (id: string) => void;
  approveEvent: (id: string) => void;
  rejectEvent: (id: string, reason: string) => void;
  addNotice: (notice: Omit<EventNotice, 'id' | 'createdAt'>) => void;
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

export function PanelProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notices, setNotices] = useState<EventNotice[]>([]);

  const persist = useCallback((nextEvents: Event[], nextNotices: EventNotice[]) => {
    setEvents(nextEvents);
    setNotices(nextNotices);
    writeStored({ events: nextEvents, notices: nextNotices });
  }, []);

  const load = useCallback(async (fromSeed: boolean) => {
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

  useEffect(() => {
    // The seed is an external system as far as React is concerned: the state
    // updates happen after the awaits, in a callback, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [load]);

  const createEvent = useCallback(
    (draft: NewEvent): Event => {
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
      return event;
    },
    [events, notices, persist],
  );

  const updateEvent = useCallback(
    (id: string, changes: Partial<NewEvent>) => {
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
    [events, notices, persist],
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

  const addNotice = useCallback(
    (notice: Omit<EventNotice, 'id' | 'createdAt'>) => {
      const entry: EventNotice = {
        ...notice,
        id: `notice-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      };

      persist(events, [entry, ...notices]);
    },
    [events, notices, persist],
  );

  const value = useMemo<PanelState>(
    () => ({
      loading,
      municipality,
      categories,
      organizations,
      events,
      notices,
      createEvent,
      updateEvent,
      cancelEvent: (id) => setStatus(id, 'cancelled'),
      approveEvent: (id) => setStatus(id, 'published'),
      rejectEvent: (id, reason) => setStatus(id, 'rejected', reason),
      addNotice,
      resetToSeed: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        void load(true);
      },
    }),
    [
      addNotice,
      categories,
      createEvent,
      events,
      load,
      loading,
      municipality,
      notices,
      organizations,
      setStatus,
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
