import { type DeviceRegistration, createDeviceClient, createHttpDataSource } from '@agora/data';
import { type StoreClient, createPublicStore, createStoreClient } from '@agora/store';
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
import { route as publicRoute } from './public-api';

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

    if (event.routeKey.includes('/municipalities') || event.routeKey.includes('/events')) {
      return toResponse(await publicRoute(event, createPublicStore(client, TABLE)));
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

  const data = createHttpDataSource({ baseUrl: BASE, fetch: apiAsFetch });
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
