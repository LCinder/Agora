import {
  type DeviceRegistration,
  type VolunteerSession,
  createDeviceClient,
  createHttpDataSource,
  createLiveClient,
  createPanelClient,
  createVolunteerClient,
} from '@agora/data';
import {
  type StoreClient,
  createLiveReader,
  createLiveStore,
  createMembershipStore,
  createNotificationStore,
  createPublicStore,
  createStoreClient,
  createVolunteerStore,
} from '@agora/store';
import {
  EVENTS,
  LOCAL_CREDENTIALS,
  type LocalDynamo,
  ZUBIA,
  createTable,
  dropTable,
  seed,
  startDynamoLocal,
} from '@agora/store/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mintDeviceToken, verifyDeviceToken } from '../lib/device-token';
import type { ApiEvent, ApiResult } from '../lib/http';
import { route as deviceRoute } from './device-api';
import { route as panelRoute } from './panel-api';
import { route as publicRoute } from './public-api';
import { route as volunteerRoute } from './volunteer';

/**
 * The app's client against the real handlers, with no network in between.
 *
 * Both sides of the contract are tested on their own: the handlers in
 * `handlers.test.ts`, the client's parsing in `@agora/data`. What neither of them
 * can catch is the two disagreeing — a path the client builds and the API does not
 * declare, a field the API renames, a body shape one side sends and the other does
 * not read. That class of bug bit this project once already today, so it gets a
 * test: `fetch` is replaced by a function that dispatches into the handlers over a
 * real DynamoDB.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-contract-${process.pid}`;
const SECRET = 'contract-signing-secret';
const BASE = 'https://api.test';

/** The technician who schedules the live session and reads out the code. */
const EDITOR = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor' as const,
  organizationId: null,
};

/** The routes the HTTP API declares, matched the way API Gateway matches them. */
const ROUTES: { method: string; pattern: RegExp; routeKey: string; names: string[] }[] = [
  { method: 'GET', pattern: /^\/municipalities$/, routeKey: 'GET /municipalities', names: [] },
  {
    method: 'GET',
    pattern: /^\/municipalities\/([^/]+)$/,
    routeKey: 'GET /municipalities/{slug}',
    names: ['slug'],
  },
  {
    method: 'GET',
    pattern: /^\/municipalities\/([^/]+)\/events$/,
    routeKey: 'GET /municipalities/{municipalityId}/events',
    names: ['municipalityId'],
  },
  {
    method: 'GET',
    pattern: /^\/municipalities\/([^/]+)\/events\/([^/]+)$/,
    routeKey: 'GET /municipalities/{municipalityId}/events/{eventId}',
    names: ['municipalityId', 'eventId'],
  },
  {
    method: 'GET',
    pattern: /^\/municipalities\/([^/]+)\/categories$/,
    routeKey: 'GET /municipalities/{municipalityId}/categories',
    names: ['municipalityId'],
  },
  {
    method: 'GET',
    pattern: /^\/municipalities\/([^/]+)\/organizations$/,
    routeKey: 'GET /municipalities/{municipalityId}/organizations',
    names: ['municipalityId'],
  },
  { method: 'POST', pattern: /^\/devices$/, routeKey: 'POST /devices', names: [] },
  { method: 'GET', pattern: /^\/me\/interests$/, routeKey: 'GET /me/interests', names: [] },
  {
    method: 'PUT',
    pattern: /^\/me\/interests\/([^/]+)$/,
    routeKey: 'PUT /me/interests/{eventId}',
    names: ['eventId'],
  },
  {
    method: 'DELETE',
    pattern: /^\/me\/interests\/([^/]+)$/,
    routeKey: 'DELETE /me/interests/{eventId}',
    names: ['eventId'],
  },
  {
    method: 'PUT',
    pattern: /^\/me\/municipalities\/([^/]+)$/,
    routeKey: 'PUT /me/municipalities/{municipalityId}',
    names: ['municipalityId'],
  },
  { method: 'PUT', pattern: /^\/me\/push-token$/, routeKey: 'PUT /me/push-token', names: [] },
  { method: 'DELETE', pattern: /^\/me$/, routeKey: 'DELETE /me', names: [] },
  {
    method: 'DELETE',
    pattern: /^\/me\/push-token$/,
    routeKey: 'DELETE /me/push-token',
    names: [],
  },
  {
    method: 'GET',
    pattern: /^\/live\/([^/]+)$/,
    routeKey: 'GET /live/{eventId}',
    names: ['eventId'],
  },
  // The panel is one route with a greedy proxy, exactly as API Gateway declares
  // it, so the paths the client builds are matched the way they will be.
  ...(['GET', 'POST', 'PATCH', 'DELETE'] as const).map((method) => ({
    method,
    pattern: /^\/panel\/(.+)$/,
    routeKey: `ANY /panel/{proxy+}`,
    names: ['proxy'],
  })),
  {
    method: 'POST',
    pattern: /^\/volunteer\/redeem$/,
    routeKey: 'POST /volunteer/redeem',
    names: [],
  },
  {
    method: 'POST',
    pattern: /^\/volunteer\/positions$/,
    routeKey: 'POST /volunteer/positions',
    names: [],
  },
];

function toApiEvent(url: URL, init: RequestInit | undefined): ApiEvent | null {
  const method = (init?.method ?? 'GET').toUpperCase();

  for (const route of ROUTES) {
    if (route.method !== method) continue;

    const match = route.pattern.exec(url.pathname);

    if (match === null) continue;

    const pathParameters: Record<string, string> = {};

    for (const [index, name] of route.names.entries()) {
      pathParameters[name] = match[index + 1] ?? '';
    }

    const query: Record<string, string> = {};

    for (const [key, value] of url.searchParams.entries()) query[key] = value;

    return {
      routeKey: route.routeKey,
      rawPath: url.pathname,
      pathParameters,
      queryStringParameters: query,
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      ),
      requestContext: { http: { method } },
    } as unknown as ApiEvent;
  }

  return null;
}

function toResponse(result: ApiResult): Response {
  const value = result as { statusCode: number; headers?: Record<string, string>; body?: string };

  // A 204 carries no body, and the `Response` constructor refuses one — including
  // the empty string an API Gateway handler quite legitimately returns. The
  // conversion has to be faithful in both directions or the test is testing the
  // harness.
  const body = value.body === undefined || value.body === '' ? null : value.body;

  return new Response(body, { status: value.statusCode, headers: value.headers ?? {} });
}

/** What the public handler is given: the calendar store and the live reader. */
function publicReadable(client: StoreClient, table: string) {
  return { ...createPublicStore(client, table), ...createLiveReader(client, table) };
}

describe.skipIf(local === null)('the app against the API', () => {
  let client: StoreClient;
  let stored: DeviceRegistration | null = null;

  /**
   * The API, as `fetch`.
   *
   * The device authorizer is not invoked here — in the cloud API Gateway does that
   * before the handler runs — so its job is done inline: verify the bearer token
   * the same way, and hand the handler the device id it would have been given.
   */
  const apiAsFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input));
    const event = toApiEvent(url, init);

    if (event === null) return new Response('no such route', { status: 404 });

    // Which function answers, decided per route and not by what the path contains.
    // In the cloud API Gateway does this with one integration per route key, and a
    // substring test here got it wrong the moment a device route gained the word
    // "municipalities" in it.
    if (
      event.routeKey.startsWith('GET /municipalities') ||
      event.routeKey === 'GET /live/{eventId}'
    ) {
      return toResponse(await publicRoute(event, publicReadable(client, TABLE)));
    }

    if (event.routeKey === 'ANY /panel/{proxy+}') {
      // API Gateway's JWT authorizer has already validated the token by the time a
      // handler runs, so the harness does what it does: puts the subject in the
      // request context. What the panel token says is checked in the API, not here.
      const staff = (init?.headers as Record<string, string> | undefined)?.['authorization'];

      return toResponse(
        await panelRoute(
          {
            ...event,
            requestContext: {
              ...event.requestContext,
              ...(staff === undefined
                ? {}
                : { authorizer: { jwt: { claims: { sub: staff.replace(/^Bearer\s+/i, '') } } } }),
            },
          } as typeof event,
          client,
          TABLE,
        ),
      );
    }

    if (event.routeKey.includes('/volunteer/')) {
      return toResponse(
        await volunteerRoute(event, {
          store: createVolunteerStore(client, TABLE),
          signingSecret: SECRET,
        }),
      );
    }

    const header = event.headers?.['authorization'];
    const token = header?.replace(/^Bearer\s+/i, '') ?? null;

    return toResponse(
      await deviceRoute(event, {
        client,
        table: TABLE,
        signingSecret: SECRET,
        deviceId: token === null ? null : verifyDeviceToken(token, SECRET),
      }),
    );
  };

  const storage = {
    read: async () => stored,
    write: async (registration: DeviceRegistration) => {
      stored = registration;
    },
  };

  let volunteerSession: VolunteerSession | null = null;

  const data = createHttpDataSource({ baseUrl: BASE, fetch: apiAsFetch });
  const live = createLiveClient({ baseUrl: BASE, fetch: apiAsFetch });
  const volunteers = createVolunteerClient({
    baseUrl: BASE,
    fetch: apiAsFetch,
    storage: {
      read: async () => volunteerSession,
      write: async (session) => {
        volunteerSession = session;
      },
      clear: async () => {
        volunteerSession = null;
      },
    },
  });
  const devices = createDeviceClient({
    baseUrl: BASE,
    fetch: apiAsFetch,
    storage,
    platform: 'android',
    locale: 'es',
  });

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  it('lists the municipalities the selector shows', async () => {
    const towns = await data.listMunicipalities();

    expect(towns.map((town) => town.slug).sort()).toEqual(['la-zubia', 'otura']);
    expect(towns[0]?.latitude).toBeTypeOf('number');
  });

  it('opens a municipality from the slug in a link or a QR code', async () => {
    const municipality = await data.getMunicipalityBySlug('la-zubia');

    expect(municipality?.id).toBe(ZUBIA);
    expect(municipality?.branding.primaryColor).toMatch(/^#/);
    expect(municipality?.settings.reminderHour).toBeTypeOf('number');
  });

  it('answers null for a municipality that is not on the platform', async () => {
    expect(await data.getMunicipalityBySlug('villa-inventada')).toBeNull();
  });

  it('returns events as domain objects, with real dates', async () => {
    const events = await data.listEvents(ZUBIA);
    const first = events[0];

    expect(events.length).toBeGreaterThan(0);
    expect(first?.startAt).toBeInstanceOf(Date);
    expect(Number.isNaN(first?.startAt.getTime())).toBe(false);
    expect(events.every((event) => ['published', 'cancelled'].includes(event.status))).toBe(true);
  });

  it('never hands the app an event the town hall has not approved', async () => {
    const ids = (await data.listEvents(ZUBIA)).map((event) => event.id);

    expect(ids).not.toContain(EVENTS.zubiaDraft);
    expect(ids).not.toContain(EVENTS.hermandadPending);
    expect(await data.getEvent(ZUBIA, EVENTS.zubiaDraft)).toBeNull();
  });

  it('reads the categories and the associations a screen needs', async () => {
    expect((await data.listCategories(ZUBIA)).length).toBeGreaterThan(0);
    expect((await data.listOrganizations(ZUBIA)).map((org) => org.name)).toContain('Hermandad');
  });

  it('registers the device once and keeps the token', async () => {
    const first = await devices.register();
    const again = await devices.register();

    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(verifyDeviceToken(first.token, SECRET)).toBe(first.deviceId);
    expect(again).toEqual(first);
    expect(stored).toEqual(first);
  });

  it('marks and unmarks an event, and reads its own marks back', async () => {
    await devices.mark(ZUBIA, EVENTS.zubiaPublished);

    const marks = await devices.listInterests();

    expect(marks.map((mark) => mark.eventId)).toEqual([EVENTS.zubiaPublished]);
    expect(marks[0]?.createdAt).toBeInstanceOf(Date);

    await devices.unmark(ZUBIA, EVENTS.zubiaPublished);

    expect(await devices.listInterests()).toEqual([]);
  });

  it('counts a resident who never registered, and shows them to the town hall', async () => {
    // The whole of what a neighbour does to exist here: open the app and pick a
    // town. No account, no email, no form.
    await devices.follow(ZUBIA);
    await devices.follow(ZUBIA);

    const memberships = createMembershipStore(client, TABLE);
    const bootstrap = {
      authUserId: 'auth-counter',
      municipalityId: ZUBIA,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    await memberships.grant(bootstrap, {
      authUserId: 'auth-counter',
      role: 'municipal_admin',
      email: 'contador@lazubia.es',
    });

    const panel = createPanelClient({
      baseUrl: BASE,
      fetch: apiAsFetch,
      municipalityId: ZUBIA,
      token: () => 'auth-counter',
    });

    const summary = await panel.stats();

    // One phone, counted once, and nothing in the answer that says who it is.
    expect(summary.devices.following).toBe(1);
    expect(JSON.stringify(summary)).not.toContain((await devices.register()).deviceId);
  });

  it('leaves the address the reminders are sent to, and takes it away again', async () => {
    await devices.setPushToken('ExponentPushToken[contract]');

    const store = createNotificationStore(client, TABLE);
    const registration = await devices.register();

    expect(await store.pushTargets([registration.deviceId])).toEqual([
      { deviceId: registration.deviceId, token: 'ExponentPushToken[contract]', locale: 'es' },
    ]);

    await devices.setPushToken(null);

    expect(await store.pushTargets([registration.deviceId])).toEqual([]);
  });

  it('refuses something that is not an Expo token, rather than storing it', async () => {
    await expect(devices.setPushToken('not-a-token')).rejects.toMatchObject({
      failure: { kind: 'status', status: 400 },
    });
  });

  it('refuses a mark from a token that was not signed by us', async () => {
    const forged = createDeviceClient({
      baseUrl: BASE,
      fetch: apiAsFetch,
      storage: {
        read: async () => ({
          deviceId: 'device-forged',
          token: mintDeviceToken('device-forged', 'otra-clave'),
        }),
        write: async () => {},
      },
      platform: 'web',
      locale: 'es',
    });

    await expect(forged.mark(ZUBIA, EVENTS.zubiaPublished)).rejects.toThrow();
  });

  it('walks a procession: the code becomes a token, and a position reaches the map', async () => {
    const sessions = createLiveStore(client, TABLE, EDITOR);
    const scheduled = await sessions.schedule(EVENTS.zubiaPublished);

    await sessions.start(EVENTS.zubiaPublished);

    // The volunteer types the code off the screen the technician is holding.
    const opened = await volunteers.redeem(` ${scheduled.volunteerCode ?? ''} `);

    expect(opened.eventId).toBe(EVENTS.zubiaPublished);
    expect(volunteerSession?.token).toBe(opened.token);

    const at = await volunteers.send({
      latitude: 37.113,
      longitude: -3.593,
      accuracyMeters: 7,
    });

    expect(at).toBeInstanceOf(Date);

    // And the resident's map reads it back through the public route, which is the
    // whole feature end to end: a code on a screen, a phone in the street, a dot.
    const view = await live.view(EVENTS.zubiaPublished);

    expect(view?.status).toBe('active');
    expect(view?.position?.latitude).toBeCloseTo(37.113);
    expect(view?.position?.recordedAt).toBeInstanceOf(Date);
  });

  it('answers null for an event with no live session', async () => {
    expect(await live.view(EVENTS.zubiaDraft)).toBeNull();
  });

  it('stops recording when the town hall pauses the live session', async () => {
    const sessions = createLiveStore(client, TABLE, EDITOR);

    await sessions.pause(EVENTS.zubiaPublished);

    await expect(
      volunteers.send({ latitude: 37.114, longitude: -3.594, accuracyMeters: 7 }),
    ).rejects.toMatchObject({ failure: { kind: 'status', status: 403 } });

    // And the token survives it, because the same volunteer carries on when they
    // resume it.
    expect(volunteerSession).not.toBeNull();
  });

  it('forgets the device when the resident asks to be forgotten', async () => {
    await devices.mark(ZUBIA, EVENTS.zubiaPublished);
    await devices.setPushToken('ExponentPushToken[goodbye]');

    const before = await devices.register();

    await devices.forget();

    const store = createNotificationStore(client, TABLE);

    expect(await store.pushTargets([before.deviceId])).toEqual([]);
    expect(await store.devicesInterestedIn(EVENTS.zubiaPublished)).not.toContain(before.deviceId);

    // And the app carries on as a different, equally anonymous phone: the stored
    // registration is cleared by the caller, so the next call registers again.
    stored = null;

    const after = await devices.register();

    expect(after.deviceId).not.toBe(before.deviceId);
  });

  it('runs the panel as the person who signed in, over the paths API Gateway declares', async () => {
    const memberships = createMembershipStore(client, TABLE);
    const bootstrap = {
      authUserId: 'auth-admin',
      municipalityId: ZUBIA,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    await memberships.grant(bootstrap, {
      authUserId: 'auth-admin',
      role: 'municipal_admin',
      email: 'admin@lazubia.es',
    });

    const panel = createPanelClient({
      baseUrl: BASE,
      fetch: apiAsFetch,
      municipalityId: ZUBIA,
      // Where a Cognito token goes. The harness reads the subject straight out of
      // it, which is what the JWT authorizer does before the handler ever runs.
      token: () => 'auth-admin',
    });

    const municipality = await panel.getMunicipality();

    expect(municipality?.slug).toBe('la-zubia');

    const created = await panel.createEvent({
      title: 'Pregón de la feria',
      categoryId: 'cat-fiestas',
      startAt: new Date('2027-09-10T21:00:00.000Z'),
      location: { name: 'Plaza', latitude: null, longitude: null },
      status: 'published',
    });

    expect(created.status).toBe('published');
    expect((await panel.listEvents()).map((found) => found.id)).toContain(created.id);

    const edited = await panel.updateEvent(created.id, { title: 'Pregón de la feria 2027' });

    expect(edited.kind).toBe('applied');

    // The town hall's own review queue, and a notice that lands in the outbox for
    // the notification job to deliver.
    const queue = await panel.reviewQueue();

    expect(queue.some((item) => item.kind === 'event')).toBe(true);

    const notice = await panel.sendNotice(created.id, 'time_change', 'Empieza media hora antes.');

    expect(notice.pushSentAt).toBeNull();
    expect((await panel.listNotices(created.id)).map((sent) => sent.id)).toEqual([notice.id]);

    const summary = await panel.stats();

    expect(summary.events.published).toBeGreaterThan(0);
    expect(summary.generatedAt).toBeInstanceOf(Date);
    // The series the panel draws and the report prints, in the shape the client
    // declares: a month and a number, oldest first.
    expect(Array.isArray(summary.interests.monthly)).toBe(true);

    const cancelled = await panel.cancelEvent(created.id);

    expect(cancelled.status).toBe('cancelled');
  });

  it('refuses the panel to somebody with no membership', async () => {
    const stranger = createPanelClient({
      baseUrl: BASE,
      fetch: apiAsFetch,
      municipalityId: ZUBIA,
      token: () => 'auth-nobody',
    });

    await expect(stranger.listEvents()).rejects.toMatchObject({
      failure: { kind: 'status', status: 403 },
    });
  });

  it('says it is offline rather than throwing something unreadable', async () => {
    const offline = createHttpDataSource({
      baseUrl: BASE,
      fetch: async () => {
        throw new Error('Network request failed');
      },
    });

    await expect(offline.listMunicipalities()).rejects.toMatchObject({
      name: 'ApiError',
      failure: { kind: 'offline' },
    });
  });
});
