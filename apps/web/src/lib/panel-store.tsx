'use client';

import type {
  Event,
  EventCategory,
  Municipality,
  Organization,
  OrganizationStatus,
  OrganizationType,
} from '@agora/core';
import {
  type AuditEntry,
  type LiveSession,
  type Membership,
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
  /** Added later than the rest, so a stored state without it is still valid. */
  organizations?: Organization[];
  /** The demo's activity log. Also added later, also optional. */
  audit?: AuditEntry[];
}

/**
 * A volunteer code, for the demo.
 *
 * The real one is minted by the API, from an alphabet without O, 0, I or 1
 * because it gets read out over the phone. This mirrors it so what a councillor
 * sees in a meeting looks like what they would get.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function demoVolunteerCode(): string {
  return Array.from(
    { length: 8 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');
}

export type PanelRole = Membership['role'];

export interface PanelState {
  loading: boolean;
  /** True when this build runs on the seed in the browser, with no API. */
  demo: boolean;
  /** Who is signed in. Always null in the demo, which has no accounts. */
  identity: PanelIdentity | null;
  /**
   * What this person may do, read from the membership and never from the token
   * (D-029). The demo shows the town hall's panel, so it is an administrator.
   *
   * The API checks it again on every request: this is here so an association is
   * not shown buttons that would be refused, not to enforce anything.
   */
  role: PanelRole;
  /** The association this person speaks for, when they are an `org_editor`. */
  organizationId: string | null;
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

  /**
   * Answers the same two things as an edit: it is in, or it is waiting.
   *
   * An association that is not trusted cannot publish, whatever it asks for — the
   * API decides the state from who is calling — so the screen has to be able to
   * say "sent to the town hall" instead of "published".
   */
  createEvent: (draft: NewEvent) => Promise<'applied' | 'queued'>;
  /**
   * Answers what became of the edit: applied, or waiting for the town hall.
   *
   * An untrusted association editing a published event does not change what the
   * neighbours see — the change goes to review — and the person doing it has to be
   * told, or they will edit it again tomorrow (project document, 7.2).
   */
  updateEvent: (id: string, changes: Partial<NewEvent>) => Promise<'applied' | 'queued'>;
  cancelEvent: (id: string) => Promise<void>;
  approveEvent: (id: string) => Promise<void>;
  rejectEvent: (id: string, reason: string) => Promise<void>;
  addNotice: (notice: Omit<EventNotice, 'id' | 'createdAt'>) => Promise<void>;
  /** Loads the notices of one event. A no-op in the demo, which holds them all. */
  refreshNotices: (eventId: string) => Promise<void>;

  // --- associations --------------------------------------------------------
  createOrganization: (input: {
    name: string;
    type: OrganizationType;
    contactEmail: string | null;
  }) => Promise<void>;
  /** Trusted associations publish without going through the review queue. */
  setOrganizationTrusted: (organizationId: string, isTrusted: boolean) => Promise<void>;
  setOrganizationStatus: (organizationId: string, status: OrganizationStatus) => Promise<void>;

  /**
   * Who did what in this municipality, newest first. Administrators only.
   *
   * In the demo it is this session's own writes rather than invented rows: a
   * councillor who has just approved a verbena in the meeting should see that
   * line, and a log of things nobody did teaches them nothing.
   */
  auditLog: () => Promise<AuditEntry[]>;

  // --- the people with access ----------------------------------------------
  listStaff: () => Promise<Membership[]>;
  /** Creates the account and the membership. Municipal administrators only. */
  invite: (input: {
    email: string;
    role: PanelRole;
    fullName?: string;
    organizationId?: string | null;
  }) => Promise<void>;
  revokeStaff: (authUserId: string) => Promise<void>;

  // --- live tracking -------------------------------------------------------
  getLive: (eventId: string) => Promise<LiveSession | null>;
  /** Creates the session and mints the code the volunteer types. */
  scheduleLive: (eventId: string) => Promise<LiveSession>;
  runLive: (eventId: string, action: 'start' | 'pause' | 'end') => Promise<LiveSession>;
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

    return {
      events: parsed.events.map(reviveEvent),
      notices: parsed.notices,
      ...(parsed.organizations === undefined ? {} : { organizations: parsed.organizations }),
      audit: (parsed.audit ?? []).map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
      })),
    };
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
  const [membership, setMembership] = useState<Membership | null>(null);
  const [client, setClient] = useState<PanelClient | null>(null);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notices, setNotices] = useState<EventNotice[]>([]);
  const [stats, setStats] = useState<PanelStats | null>(null);
  const [demoAudit, setDemoAudit] = useState<AuditEntry[]>([]);

  /** The demo's own store: whatever a councillor changed, kept across reloads. */
  const persist = useCallback(
    (nextEvents: Event[], nextNotices: EventNotice[], nextOrganizations?: Organization[]) => {
      setEvents(nextEvents);
      setNotices(nextNotices);

      if (nextOrganizations !== undefined) setOrganizations(nextOrganizations);

      writeStored({
        events: nextEvents,
        notices: nextNotices,
        organizations: nextOrganizations ?? organizations,
        audit: readStored()?.audit ?? [],
      });
    },
    [organizations],
  );

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

    const stored = fromSeed ? null : readStored();
    const nextEvents = stored?.events ?? seedEvents;
    const nextNotices = stored?.notices ?? [];
    const nextOrganizations = stored?.organizations ?? loadedOrganizations;

    setEvents(nextEvents);
    setNotices(nextNotices);
    setOrganizations(nextOrganizations);
    setDemoAudit(stored?.audit ?? []);

    if (!stored) {
      writeStored({
        events: nextEvents,
        notices: nextNotices,
        organizations: nextOrganizations,
        audit: [],
      });
    }

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

    setMembership(membership);
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

  /**
   * Notes one write in the demo's own log.
   *
   * Newest first, like the API's, and capped: the demo is reset between meetings
   * but a browser tab that never is would otherwise grow for ever.
   */
  const noteDemo = useCallback(
    (action: string, entity: string, entityId: string) => {
      setDemoAudit((current) => {
        const next = [
          {
            id: `audit-${Date.now().toString(36)}-${current.length}`,
            municipalityId: DEMO_MUNICIPALITY_ID,
            actorId: 'demo',
            action,
            entity,
            entityId,
            createdAt: new Date(),
          },
          ...current,
        ].slice(0, 200);

        // Written straight through rather than in an effect: the screen that reads
        // it is reached by a full page load, and a log that empties when you
        // navigate to it is worse than no log at all.
        writeStored({ ...(readStored() ?? { events, notices }), audit: next });

        return next;
      });
    },
    [events, notices],
  );

  const createEvent = useCallback(
    async (draft: NewEvent) => {
      if (client !== null) {
        const created = await client.createEvent(toApiInput(draft, municipality));

        await reload(client);

        return created.status === 'pending_review' ? 'queued' : 'applied';
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

      return 'applied';
    },
    [client, events, municipality, notices, persist, reload],
  );

  const updateEvent = useCallback(
    async (id: string, changes: Partial<NewEvent>) => {
      if (client !== null) {
        // Only the fields the API takes, named as it names them: the form's shape
        // is older than the API's, and `organizationId` is not something an edit
        // may change at all.
        const result = await client.updateEvent(id, {
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

        return result.kind === 'queued' ? 'queued' : 'applied';
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

      return 'applied';
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
        noteDemo('event.cancel', 'event', id);

        return;
      }

      await client.cancelEvent(id);
      await reload(client);
    },
    [client, noteDemo, reload, setStatus],
  );

  const approveEvent = useCallback(
    async (id: string) => {
      if (client === null) {
        setStatus(id, 'published');
        noteDemo('event.approve', 'event', id);

        return;
      }

      await client.approveEvent(id);
      await reload(client);
    },
    [client, noteDemo, reload, setStatus],
  );

  const rejectEvent = useCallback(
    async (id: string, reason: string) => {
      if (client === null) {
        setStatus(id, 'rejected', reason);
        noteDemo('event.reject', 'event', id);

        return;
      }

      await client.rejectEvent(id, reason);
      await reload(client);
    },
    [client, noteDemo, reload, setStatus],
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

  // -------------------------------------------------------------------------
  // Associations
  // -------------------------------------------------------------------------

  const createOrganization = useCallback(
    async (input: { name: string; type: OrganizationType; contactEmail: string | null }) => {
      if (client !== null) {
        await client.createOrganization(input);
        setOrganizations(await client.listOrganizations());

        return;
      }

      const created: Organization = {
        id: `org-${Date.now().toString(36)}`,
        municipalityId: DEMO_MUNICIPALITY_ID,
        name: input.name,
        type: input.type,
        contactEmail: input.contactEmail,
        // New associations are reviewed until the town hall says otherwise, which
        // is the whole point of the collaborative calendar.
        isTrusted: false,
        status: 'invited',
        logoUrl: null,
      };

      persist(events, notices, [...organizations, created]);
    },
    [client, events, notices, organizations, persist],
  );

  const setOrganizationTrusted = useCallback(
    async (organizationId: string, isTrusted: boolean) => {
      if (client !== null) {
        await client.setOrganizationTrusted(organizationId, isTrusted);
        setOrganizations(await client.listOrganizations());

        return;
      }

      persist(
        events,
        notices,
        organizations.map((organization) =>
          organization.id === organizationId ? { ...organization, isTrusted } : organization,
        ),
      );
    },
    [client, events, notices, organizations, persist],
  );

  const setOrganizationStatus = useCallback(
    async (organizationId: string, status: OrganizationStatus) => {
      if (client !== null) {
        await client.setOrganizationStatus(organizationId, status);
        setOrganizations(await client.listOrganizations());

        return;
      }

      persist(
        events,
        notices,
        organizations.map((organization) =>
          organization.id === organizationId ? { ...organization, status } : organization,
        ),
      );
    },
    [client, events, notices, organizations, persist],
  );

  // -------------------------------------------------------------------------
  // The people with access
  //
  // The demo has no accounts at all, so it keeps the invitations in memory and
  // the screen says as much. Nothing is sent anywhere.
  // -------------------------------------------------------------------------

  const [demoStaff, setDemoStaff] = useState<Membership[]>([]);

  const auditLog = useCallback(async () => {
    if (client === null) return demoAudit;

    return client.auditLog();
  }, [client, demoAudit]);

  const listStaff = useCallback(async () => {
    if (client === null) return demoStaff;

    return client.listStaff();
  }, [client, demoStaff]);

  const invite = useCallback(
    async (input: {
      email: string;
      role: PanelRole;
      fullName?: string;
      organizationId?: string | null;
    }) => {
      if (client !== null) {
        await client.invite(input);

        return;
      }

      setDemoStaff((current) => [
        ...current,
        {
          authUserId: `auth-${Date.now().toString(36)}`,
          municipalityId: DEMO_MUNICIPALITY_ID,
          role: input.role,
          organizationId: input.organizationId ?? null,
          email: input.email,
          fullName: input.fullName ?? '',
          createdAt: new Date(),
        },
      ]);
    },
    [client],
  );

  const revokeStaff = useCallback(
    async (authUserId: string) => {
      if (client !== null) {
        await client.revoke(authUserId);

        return;
      }

      setDemoStaff((current) => current.filter((member) => member.authUserId !== authUserId));
    },
    [client],
  );

  // -------------------------------------------------------------------------
  // Live tracking
  //
  // The demo keeps its sessions in memory: the point of showing this in a meeting
  // is the flow — schedule, read the code out, start, end — and no position is
  // broadcast either way.
  // -------------------------------------------------------------------------

  const [demoSessions, setDemoSessions] = useState<Record<string, LiveSession>>({});

  const getLive = useCallback(
    async (eventId: string) => {
      if (client === null) return demoSessions[eventId] ?? null;

      return client.getLiveSession(eventId);
    },
    [client, demoSessions],
  );

  const scheduleLive = useCallback(
    async (eventId: string) => {
      if (client !== null) {
        const session = await client.scheduleLiveSession(eventId);

        await reload(client);

        return session;
      }

      const session: LiveSession = {
        id: `live-${eventId}`,
        eventId,
        municipalityId: DEMO_MUNICIPALITY_ID,
        status: 'scheduled',
        plannedRoute: null,
        startedAt: null,
        endedAt: null,
        volunteerCode: demoVolunteerCode(),
        simplifiedRoute: null,
        lastPositionAt: null,
      };

      setDemoSessions((current) => ({ ...current, [eventId]: session }));
      persist(
        events.map((event) =>
          event.id === eventId ? { ...event, liveTrackingEnabled: true } : event,
        ),
        notices,
      );

      return session;
    },
    [client, events, notices, persist, reload],
  );

  const runLive = useCallback(
    async (eventId: string, action: 'start' | 'pause' | 'end') => {
      if (client !== null) return client.runLiveSession(eventId, action);

      const current = demoSessions[eventId];

      if (current === undefined) throw new Error('Ese evento no tiene directo.');

      const next: LiveSession = {
        ...current,
        status: action === 'start' ? 'active' : action === 'pause' ? 'paused' : 'ended',
        startedAt: action === 'start' ? new Date() : current.startedAt,
        endedAt: action === 'end' ? new Date() : current.endedAt,
        volunteerCode: action === 'end' ? null : current.volunteerCode,
      };

      setDemoSessions((sessions) => ({ ...sessions, [eventId]: next }));

      return next;
    },
    [client, demoSessions],
  );

  const value = useMemo<PanelState>(
    () => ({
      loading,
      demo,
      identity,
      // The demo is the town hall's panel: that is what gets shown in a meeting.
      role: membership?.role ?? 'municipal_admin',
      organizationId: membership?.organizationId ?? null,
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
      createOrganization,
      setOrganizationTrusted,
      setOrganizationStatus,
      auditLog,
      listStaff,
      invite,
      revokeStaff,
      getLive,
      scheduleLive,
      runLive,
      refreshIdentity: async () => {
        setLoading(true);
        await loadRemote();
      },
      leave: () => {
        signOut();
        setIdentity(null);
        setMembership(null);
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
      createOrganization,
      demo,
      events,
      getLive,
      identity,
      invite,
      auditLog,
      listStaff,
      loadRemote,
      loadSeed,
      loading,
      membership,
      municipality,
      notices,
      organizations,
      refreshNotices,
      rejectEvent,
      revokeStaff,
      runLive,
      scheduleLive,
      setOrganizationStatus,
      setOrganizationTrusted,
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
