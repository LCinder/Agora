'use client';

import type {
  Activity,
  Event,
  EventCategory,
  Municipality,
  Organization,
  OrganizationStatus,
  OrganizationType,
} from '@agora/core';
import {
  type ActivityPatchInput,
  type AuditEntry,
  type LiveSession,
  type Membership,
  type NewActivityInput,
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

/** Which town hall this browser was last working in. */
const MUNICIPALITY_KEY = 'agora.panel.municipality';

function rememberedMunicipality(): string | null {
  try {
    return window.localStorage.getItem(MUNICIPALITY_KEY);
  } catch {
    // Private browsing. The panel opens on the first membership instead.
    return null;
  }
}

function rememberMunicipality(municipalityId: string): void {
  try {
    window.localStorage.setItem(MUNICIPALITY_KEY, municipalityId);
  } catch {
    // Not worth interrupting anybody for: the choice lasts the session.
  }
}

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
  /** The demo's audit trail. Also added later, also optional. */
  audit?: AuditEntry[];
  /** The programmes. Newer still, and absent in a browser that has an older state. */
  activities?: Activity[];
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
  /**
   * Why the panel could not load, if it could not.
   *
   * It exists because the alternative is what happened the first time this was
   * deployed: the API refused the browser's origin, every call was blocked
   * before it left, `loadRemote` threw on the way to `setLoading(false)`, and
   * the panel sat on "Cargando…" for ever with nothing anywhere saying why. A
   * spinner that never stops is the worst failure mode available here.
   */
  loadError: string | null;
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
  /**
   * Every municipality this person may work in, newest membership last.
   *
   * One entry for almost everybody. More than one for a technician who works
   * for two neighbouring town halls, for a provincial officer at the
   * Diputación, and for us.
   */
  memberships: Membership[];
  /** Municipality id to name, for the switcher. Empty when there is nothing to switch. */
  municipalityNames: Record<string, string>;
  /**
   * Changes which municipality the panel is working in.
   *
   * It reloads everything, because the panel client is built around one
   * municipality and every path it calls is under it — which is the same
   * property that makes a request unable to reach another town's data. The
   * choice is remembered, so a reload does not drop somebody back into the
   * first town on their list.
   */
  switchMunicipality: (municipalityId: string) => Promise<void>;
  municipality: Municipality | null;
  categories: EventCategory[];
  organizations: Organization[];
  events: Event[];
  /**
   * Every programme in the municipality, flat.
   *
   * One list rather than a field on each event, because that is how the API
   * answers and how the table keeps them: an activity is its own row, with its
   * own state, its own review and its own count of interested neighbours. The
   * screens take one event's lines out of it with `activitiesOf`.
   */
  activities: Activity[];
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
  /**
   * Deletes an event outright. Nothing comes back.
   *
   * Cancelling is what a town hall almost always wants — the neighbours who
   * marked it have to be told — so the screens ask twice before calling this
   * and say which of the two they are doing.
   */
  deleteEvent: (id: string) => Promise<void>;
  /**
   * Puts the poster on an event, or takes it off.
   *
   * The image goes to a bucket and the event keeps a URL, so this is the one
   * call in the panel that sends a megabyte. It answers like any other edit:
   * an association without trust gets "queued", because the poster is the first
   * thing a neighbour looks at and swapping it on a published event is not a
   * small change.
   *
   * In the demo there is no bucket, so the image stays in the browser as a data
   * URL. That is also what makes the demo's poster survive a reload in a meeting
   * room with no wifi.
   */
  setEventImage: (
    id: string,
    image: { mimeType: string; data: string },
  ) => Promise<'applied' | 'queued'>;
  removeEventImage: (id: string) => Promise<'applied' | 'queued'>;
  approveEvent: (id: string) => Promise<void>;
  rejectEvent: (id: string, reason: string) => Promise<void>;
  addNotice: (notice: Omit<EventNotice, 'id' | 'createdAt'>) => Promise<void>;
  /**
   * Pushes a published event to every phone following the municipality.
   *
   * The widest thing this panel can do, and the only one that reaches somebody
   * who never marked anything. Queued rather than sent: the panel is not allowed
   * to know who follows the town (D-062).
   */
  featureEvent: (eventId: string, message: string) => Promise<void>;
  /** Loads the notices of one event. A no-op in the demo, which holds them all. */
  refreshNotices: (eventId: string) => Promise<void>;

  // --- programmes ----------------------------------------------------------
  //
  // Every one of these names the event as well as the activity, because that is
  // what the API asks for and because it is true: a line of a programme is not
  // reachable, or refusable, without knowing whose programme it is.

  createActivity: (eventId: string, draft: NewActivityInput) => Promise<void>;
  updateActivity: (
    eventId: string,
    activityId: string,
    patch: ActivityPatchInput,
  ) => Promise<void>;
  /** Struck through on the programme rather than gone: the rain got that one. */
  cancelActivity: (eventId: string, activityId: string) => Promise<void>;
  /** Off the programme for good. For the line typed into the wrong feria. */
  deleteActivity: (eventId: string, activityId: string) => Promise<void>;
  /** Publishes a line waiting for review, or applies the edit waiting on one. */
  approveActivity: (eventId: string, activityId: string) => Promise<void>;
  rejectActivity: (eventId: string, activityId: string, reason: string) => Promise<void>;

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
  /**
   * Chosen by the form when it creates one, so the poster can be attached in the
   * same breath. The API accepts it and invents one when it is missing, which is
   * what every other caller relies on.
   */
  id?: string;
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
  /** Set by `setEventImage`, not typed into the form. */
  imageUrl?: string | null;
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

function reviveActivity(raw: Activity): Activity {
  return {
    ...raw,
    startAt: new Date(raw.startAt),
    endAt: raw.endAt === null ? null : new Date(raw.endAt),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
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
      // Absent stays absent, like the associations above: a browser holding a
      // state written before programmes existed has to fall back to the seed's,
      // and an empty list here would mean a feria with no programme for ever.
      ...(parsed.activities === undefined
        ? {}
        : { activities: parsed.activities.map(reviveActivity) }),
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
    ...(draft.id === undefined ? {} : { id: draft.id }),
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
  // Memoised, and that one word is load-bearing. `panelConfig()` builds a new
  // object every call, so calling it in the render body gave every callback
  // below a new identity on every render, which made the effect that loads the
  // panel re-run on every render, which called the API again, which set state,
  // which rendered. It only showed up once the API started refusing requests:
  // the retries went out fast enough to trip the gateway's own rate limit.
  //
  // The values come from the build, so reading them once is all there is to do.
  const config = useMemo(() => panelConfig(), []);
  const demo = config === null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<PanelIdentity | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  /**
   * Every municipality this person may work in, not just the one on screen.
   *
   * Until this existed the panel read `memberships[0]` and ignored the rest, so
   * somebody with access to four town halls saw one of them, always the same,
   * with no way to reach the others. Granting the access worked; using it did
   * not.
   */
  const [memberships, setMemberships] = useState<Membership[]>([]);
  /**
   * Names for the switcher, because a membership carries an id and `la-zubia`
   * is not what anybody calls their town.
   *
   * From the public list of municipalities, which is public precisely because
   * the app's welcome screen needs it, and only fetched when there is more than
   * one membership — which is almost nobody.
   */
  const [municipalityNames, setMunicipalityNames] = useState<Record<string, string>>({});
  const [client, setClient] = useState<PanelClient | null>(null);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notices, setNotices] = useState<EventNotice[]>([]);
  const [stats, setStats] = useState<PanelStats | null>(null);
  const [demoAudit, setDemoAudit] = useState<AuditEntry[]>([]);

  /**
   * The demo's own store: whatever a councillor changed, kept across reloads.
   *
   * A patch rather than a positional list, because there are now four things it
   * can hold and "the third argument is the associations" was already a comment
   * waiting to be wrong. What is left out is left alone.
   */
  const persist = useCallback(
    (patch: {
      events?: Event[];
      notices?: EventNotice[];
      organizations?: Organization[];
      activities?: Activity[];
    }) => {
      const next = {
        events: patch.events ?? events,
        notices: patch.notices ?? notices,
        organizations: patch.organizations ?? organizations,
        activities: patch.activities ?? activities,
      };

      setEvents(next.events);
      setNotices(next.notices);
      setOrganizations(next.organizations);
      setActivities(next.activities);

      writeStored({ ...next, audit: readStored()?.audit ?? [] });
    },
    [activities, events, notices, organizations],
  );

  // -------------------------------------------------------------------------
  // The demo: the seed, in the browser
  // -------------------------------------------------------------------------

  const loadSeed = useCallback(async (fromSeed: boolean) => {
    const source = createSeedDataSource();

    const [
      loadedMunicipality,
      loadedCategories,
      loadedOrganizations,
      seedEvents,
      seedActivities,
    ] = await Promise.all([
      source.getMunicipalityBySlug(DEMO_MUNICIPALITY_SLUG),
      source.listCategories(DEMO_MUNICIPALITY_ID),
      source.listOrganizations(DEMO_MUNICIPALITY_ID),
      source.listEvents(DEMO_MUNICIPALITY_ID),
      source.listActivities(DEMO_MUNICIPALITY_ID),
    ]);

    setMunicipality(loadedMunicipality);
    setCategories(loadedCategories);

    const stored = fromSeed ? null : readStored();
    const nextEvents = stored?.events ?? seedEvents;
    const nextNotices = stored?.notices ?? [];
    const nextOrganizations = stored?.organizations ?? loadedOrganizations;
    const nextActivities = stored?.activities ?? seedActivities;

    setEvents(nextEvents);
    setActivities(nextActivities);
    setNotices(nextNotices);
    setOrganizations(nextOrganizations);
    setDemoAudit(stored?.audit ?? []);

    if (!stored) {
      writeStored({
        events: nextEvents,
        notices: nextNotices,
        organizations: nextOrganizations,
        activities: nextActivities,
        audit: [],
      });
    }

    setLoading(false);
  }, []);

  // -------------------------------------------------------------------------
  // The real one: the API, as whoever signed in
  // -------------------------------------------------------------------------

  const loadRemoteOrThrow = useCallback(
    async (wanted?: string) => {
      if (config === null) return;

      const who = await currentIdentity();

      setIdentity(who);

      if (who === null) {
        setLoading(false);

        return;
      }

      const options = { baseUrl: config.apiBaseUrl, token: currentIdToken };
      const session = await fetchPanelSession(options);

      setMemberships(session.memberships);

      // The one asked for, the one this browser was last in, or the first. The
      // middle case is what stops a reload dropping somebody who works in four
      // town halls back into whichever one the API happened to list first.
      const asked = wanted ?? rememberedMunicipality();
      const membership =
        session.memberships.find((entry) => entry.municipalityId === asked) ??
        session.memberships[0];

      // Signed in, with no municipality: somebody whose access was revoked while
      // they had the panel open, or an account invited and never granted anything.
      if (membership === undefined) {
        setLoading(false);

        return;
      }

      const panel = createPanelClient({ ...options, municipalityId: membership.municipalityId });

      setMembership(membership);
      rememberMunicipality(membership.municipalityId);

      if (session.memberships.length > 1) {
        // Names for the switcher. Swallowed on purpose: a switcher that says
        // `la-zubia` is worse than one that says La Zubia and better than a panel
        // that did not load.
        void createHttpDataSource({ baseUrl: config.apiBaseUrl })
          .listMunicipalities()
          .then((all) => {
            setMunicipalityNames(Object.fromEntries(all.map((town) => [town.id, town.name])));
          })
          .catch(() => undefined);
      }
      const publicData = createHttpDataSource({ baseUrl: config.apiBaseUrl });

      const [
        loadedMunicipality,
        loadedCategories,
        loadedOrganizations,
        loadedEvents,
        loadedActivities,
        loadedStats,
      ] = await Promise.all([
        panel.getMunicipality(),
        publicData.listCategories(membership.municipalityId),
        panel.listOrganizations(),
        panel.listEvents(),
        panel.listActivities(),
        // An association gets a refusal here, and that is not a failure: it sees
        // its own events' numbers and not the municipality's.
        panel.stats().catch(() => null),
      ]);

      setClient(panel);
      setMunicipality(loadedMunicipality);
      setCategories(loadedCategories);
      setOrganizations(loadedOrganizations);
      setEvents(loadedEvents);
      setActivities(loadedActivities);
      setNotices([]);
      setStats(loadedStats);
      setLoading(false);
    },
    [config],
  );

  const loadRemote = useCallback(
    async (wanted?: string) => {
      if (config === null) return;

      try {
        await loadRemoteOrThrow(wanted);
        setLoadError(null);
      } catch (error) {
        // Whatever went wrong, the one thing that must not happen is staying on
        // the spinner. Say something and stop.
        setLoadError(
          error instanceof Error && error.message !== ''
            ? error.message
            : 'No hemos podido conectar con el servidor.',
        );
        setLoading(false);
      }
    },
    [config, loadRemoteOrThrow],
  );

  const switchMunicipality = useCallback(
    async (municipalityId: string) => {
      if (demo) return;

      setLoading(true);
      await loadRemote(municipalityId);
    },
    [demo, loadRemote],
  );

  useEffect(() => {
    // The seed and the API are both external systems as far as React is
    // concerned: the state updates happen after the awaits, in a callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (demo) void loadSeed(false);
    else void loadRemote();
  }, [demo, loadRemote, loadSeed]);

  /** After every write: the lists the API holds, which may differ from ours. */
  const reload = useCallback(async (panel: PanelClient) => {
    const [freshEvents, freshActivities] = await Promise.all([
      panel.listEvents(),
      panel.listActivities(),
    ]);

    setEvents(freshEvents);
    setActivities(freshActivities);
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
        writeStored({ ...(readStored() ?? { events, notices, activities }), audit: next });

        return next;
      });
    },
    [activities, events, notices],
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
        id: draft.id ?? `evt-${now.getTime().toString(36)}`,
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
        // Typed into the demo a minute ago: nobody has seen it, let alone
        // marked it. The seed's events carry invented tallies so the calendar
        // looks alive; this one honestly has none.
        interestCount: 0,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      };

      persist({ events: [event, ...events] });

      return 'applied';
    },
    [client, events, municipality, persist, reload],
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
          ...(changes.imageUrl === undefined ? {} : { imageUrl: changes.imageUrl }),
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

      persist({
        events: events.map((event) =>
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
                ...(changes.imageUrl === undefined ? {} : { imageUrl: changes.imageUrl }),
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
      });

      return 'applied';
    },
    [client, events, persist, reload],
  );

  const setStatus = useCallback(
    (id: string, status: Event['status'], reason: string | null = null) => {
      persist({
        events: events.map((event) =>
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
      });
    },
    [events, persist],
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

  const deleteEvent = useCallback(
    async (id: string) => {
      if (client === null) {
        persist({
          events: events.filter((entry) => entry.id !== id),
          notices: notices.filter((notice) => notice.eventId !== id),
          // The programme goes with the event, the way the store does it: a line
          // left behind would sit in "Mis eventos" on a phone pointing at
          // nothing.
          activities: activities.filter((entry) => entry.eventId !== id),
        });
        noteDemo('event.delete', 'event', id);

        return;
      }

      await client.deleteEvent(id);
      await reload(client);
    },
    [activities, client, events, noteDemo, notices, persist, reload],
  );

  /** The demo's poster, and the real one's, through one shape. */
  const putImage = useCallback(
    (id: string, imageUrl: string | null) => {
      persist({
        events: events.map((event) =>
          event.id === id ? { ...event, imageUrl, updatedAt: new Date() } : event,
        ),
      });
    },
    [events, persist],
  );

  const setEventImage = useCallback(
    async (id: string, image: { mimeType: string; data: string }) => {
      if (client === null) {
        putImage(id, `data:${image.mimeType};base64,${image.data}`);
        noteDemo('event.image', 'event', id);

        return 'applied' as const;
      }

      const result = await client.setEventImage(id, image);

      await reload(client);

      return result.kind === 'queued' ? ('queued' as const) : ('applied' as const);
    },
    [client, noteDemo, putImage, reload],
  );

  const removeEventImage = useCallback(
    async (id: string) => {
      if (client === null) {
        putImage(id, null);
        noteDemo('event.image_removed', 'event', id);

        return 'applied' as const;
      }

      const result = await client.removeEventImage(id);

      await reload(client);

      return result.kind === 'queued' ? ('queued' as const) : ('applied' as const);
    },
    [client, noteDemo, putImage, reload],
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

      persist({ notices: [entry, ...notices] });
    },
    [client, notices, persist, refreshNotices],
  );

  // -------------------------------------------------------------------------
  // Programmes
  //
  // The demo writes them into the same local state as everything else, and the
  // real one goes through the API and re-reads. Both answer the same two
  // outcomes as an event's edit, because the rule is the same: an association
  // without trust does not change a published programme under the neighbours
  // reading it.
  // -------------------------------------------------------------------------

  const createActivity = useCallback(
    async (eventId: string, draft: NewActivityInput) => {
      if (client !== null) {
        await client.createActivity(eventId, draft);
        await reload(client);

        return;
      }

      const now = new Date();
      const created: Activity = {
        id: draft.id ?? `act-${now.getTime().toString(36)}`,
        municipalityId: DEMO_MUNICIPALITY_ID,
        eventId,
        title: draft.title,
        description: draft.description ?? '',
        categoryId: draft.categoryId ?? null,
        startAt: draft.startAt,
        endAt: draft.endAt ?? null,
        location: draft.location ?? null,
        isFree: draft.isFree ?? null,
        priceInfo: draft.priceInfo ?? null,
        status: 'published',
        rejectionReason: null,
        pendingPatch: null,
        // Typed into the demo a minute ago. The seed's lines carry invented
        // tallies so a feria looks alive; this one honestly has none.
        interestCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      persist({ activities: [...activities, created] });
      noteDemo('activity.create', 'activity', created.id);
    },
    [activities, client, noteDemo, persist, reload],
  );

  const updateActivity = useCallback(
    async (eventId: string, activityId: string, patch: ActivityPatchInput) => {
      if (client !== null) {
        await client.updateActivity(eventId, activityId, patch);
        await reload(client);

        return;
      }

      persist({
        activities: activities.map((activity) =>
          activity.id === activityId
            ? {
                ...activity,
                ...(patch.title === undefined ? {} : { title: patch.title }),
                ...(patch.description === undefined ? {} : { description: patch.description }),
                ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId }),
                ...(patch.startAt === undefined ? {} : { startAt: patch.startAt }),
                ...(patch.endAt === undefined ? {} : { endAt: patch.endAt }),
                ...(patch.location === undefined ? {} : { location: patch.location }),
                ...(patch.isFree === undefined ? {} : { isFree: patch.isFree }),
                ...(patch.priceInfo === undefined ? {} : { priceInfo: patch.priceInfo }),
                updatedAt: new Date(),
              }
            : activity,
        ),
      });
      noteDemo('activity.update', 'activity', activityId);
    },
    [activities, client, noteDemo, persist, reload],
  );

  const setActivityStatus = useCallback(
    (activityId: string, status: Activity['status'], reason: string | null = null) => {
      persist({
        activities: activities.map((activity) =>
          activity.id === activityId
            ? {
                ...activity,
                status,
                rejectionReason: reason,
                pendingPatch: null,
                updatedAt: new Date(),
              }
            : activity,
        ),
      });
    },
    [activities, persist],
  );

  const cancelActivity = useCallback(
    async (eventId: string, activityId: string) => {
      if (client === null) {
        setActivityStatus(activityId, 'cancelled');
        noteDemo('activity.cancel', 'activity', activityId);

        return;
      }

      await client.cancelActivity(eventId, activityId);
      await reload(client);
    },
    [client, noteDemo, reload, setActivityStatus],
  );

  const approveActivity = useCallback(
    async (eventId: string, activityId: string) => {
      if (client === null) {
        setActivityStatus(activityId, 'published');
        noteDemo('activity.approve', 'activity', activityId);

        return;
      }

      await client.approveActivity(eventId, activityId);
      await reload(client);
    },
    [client, noteDemo, reload, setActivityStatus],
  );

  const rejectActivity = useCallback(
    async (eventId: string, activityId: string, reason: string) => {
      if (client === null) {
        setActivityStatus(activityId, 'rejected', reason);
        noteDemo('activity.reject', 'activity', activityId);

        return;
      }

      await client.rejectActivity(eventId, activityId, reason);
      await reload(client);
    },
    [client, noteDemo, reload, setActivityStatus],
  );

  const deleteActivity = useCallback(
    async (eventId: string, activityId: string) => {
      if (client === null) {
        persist({ activities: activities.filter((entry) => entry.id !== activityId) });
        noteDemo('activity.delete', 'activity', activityId);

        return;
      }

      await client.deleteActivity(eventId, activityId);
      await reload(client);
    },
    [activities, client, noteDemo, persist, reload],
  );

  const featureEvent = useCallback(
    async (eventId: string, message: string) => {
      if (client !== null) {
        await client.featureEvent(eventId, message);

        return;
      }

      // Nothing to send in the demo, and nothing to fake: what it can do
      // honestly is leave the line in the activity log, which is where somebody
      // would later look to see that it happened.
      noteDemo('event.featured', 'event', eventId);
    },
    [client, noteDemo],
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

      persist({ organizations: [...organizations, created] });
    },
    [client, organizations, persist],
  );

  const setOrganizationTrusted = useCallback(
    async (organizationId: string, isTrusted: boolean) => {
      if (client !== null) {
        await client.setOrganizationTrusted(organizationId, isTrusted);
        setOrganizations(await client.listOrganizations());

        return;
      }

      persist({
        organizations: organizations.map((organization) =>
          organization.id === organizationId ? { ...organization, isTrusted } : organization,
        ),
      });
    },
    [client, organizations, persist],
  );

  const setOrganizationStatus = useCallback(
    async (organizationId: string, status: OrganizationStatus) => {
      if (client !== null) {
        await client.setOrganizationStatus(organizationId, status);
        setOrganizations(await client.listOrganizations());

        return;
      }

      persist({
        organizations: organizations.map((organization) =>
          organization.id === organizationId ? { ...organization, status } : organization,
        ),
      });
    },
    [client, organizations, persist],
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
      persist({
        events: events.map((event) =>
          event.id === eventId ? { ...event, liveTrackingEnabled: true } : event,
        ),
      });

      return session;
    },
    [client, events, persist, reload],
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
      loadError,
      demo,
      identity,
      // The demo is the town hall's panel: that is what gets shown in a meeting.
      role: membership?.role ?? 'municipal_admin',
      organizationId: membership?.organizationId ?? null,
      memberships,
      municipalityNames,
      switchMunicipality,
      municipality,
      categories,
      organizations,
      events,
      activities,
      notices,
      stats,
      createEvent,
      updateEvent,
      cancelEvent,
      deleteEvent,
      createActivity,
      updateActivity,
      cancelActivity,
      deleteActivity,
      approveActivity,
      rejectActivity,
      setEventImage,
      removeEventImage,
      approveEvent,
      rejectEvent,
      addNotice,
      refreshNotices,
      createOrganization,
      setOrganizationTrusted,
      setOrganizationStatus,
      auditLog,
      featureEvent,
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
        setActivities([]);
        setStats(null);
      },
      resetToSeed: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        void loadSeed(true);
      },
    }),
    [
      activities,
      addNotice,
      approveActivity,
      approveEvent,
      cancelActivity,
      cancelEvent,
      categories,
      createActivity,
      createEvent,
      createOrganization,
      deleteActivity,
      deleteEvent,
      demo,
      events,
      getLive,
      identity,
      invite,
      auditLog,
      featureEvent,
      listStaff,
      loadRemote,
      loadSeed,
      loading,
      loadError,
      membership,
      memberships,
      municipality,
      municipalityNames,
      switchMunicipality,
      notices,
      organizations,
      refreshNotices,
      rejectActivity,
      rejectEvent,
      removeEventImage,
      revokeStaff,
      setEventImage,
      runLive,
      scheduleLive,
      setOrganizationStatus,
      setOrganizationTrusted,
      stats,
      updateActivity,
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
