import {
  type StoreClient,
  createLiveReader,
  createPublicStore,
  createStoreClient,
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

import { mintDeviceToken } from '../lib/device-token';
import type { ApiEvent } from '../lib/http';
import { authorize } from './device-authorizer';
import { route as deviceRoute } from './device-api';
import { route as publicRoute } from './public-api';

/**
 * The handlers, over a real table.
 *
 * The rules themselves are tested in `@agora/store` — this checks the layer above
 * them: that the routes are the ones Terraform declares, that a draft answers
 * the same 404 as an event that does not exist, and that the device routes are
 * useless without a token the authorizer accepts.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-handlers-${process.pid}`;
const SECRET = 'test-signing-secret';

/** An API Gateway v2 event, with only the fields a handler reads. */
function apiEvent(
  routeKey: string,
  options: {
    path?: Record<string, string>;
    query?: Record<string, string>;
    body?: string;
    deviceId?: string;
  } = {},
): ApiEvent {
  return {
    routeKey,
    rawPath: routeKey.split(' ')[1] ?? '/',
    pathParameters: options.path,
    queryStringParameters: options.query,
    body: options.body,
    requestContext: {
      http: { method: routeKey.split(' ')[0] ?? 'GET' },
      ...(options.deviceId === undefined
        ? {}
        : { authorizer: { lambda: { deviceId: options.deviceId } } }),
    },
  } as unknown as ApiEvent;
}

function bodyOf(result: Awaited<ReturnType<typeof publicRoute>>): unknown {
  const value = result as { body?: string };

  return value.body === undefined ? undefined : JSON.parse(value.body);
}

function statusOf(result: Awaited<ReturnType<typeof publicRoute>>): number {
  return (result as { statusCode: number }).statusCode;
}

/** What the public handler is given: the calendar store and the live reader. */
function publicReadable(client: StoreClient, table: string) {
  return { ...createPublicStore(client, table), ...createLiveReader(client, table) };
}

describe.skipIf(local === null)('the handlers', () => {
  let client: StoreClient;

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

  describe('the public API', () => {
    const store = () => publicReadable(client, TABLE);

    it('lists the municipalities', async () => {
      const result = await publicRoute(apiEvent('GET /municipalities'), store());

      expect(statusOf(result)).toBe(200);
      expect((bodyOf(result) as { slug: string }[]).map((town) => town.slug).sort()).toEqual([
        'la-zubia',
        'otura',
      ]);
    });

    it('finds a municipality by slug and misses politely', async () => {
      const found = await publicRoute(
        apiEvent('GET /municipalities/{slug}', { path: { slug: 'la-zubia' } }),
        store(),
      );
      const missing = await publicRoute(
        apiEvent('GET /municipalities/{slug}', { path: { slug: 'no-existe' } }),
        store(),
      );

      expect(statusOf(found)).toBe(200);
      expect(statusOf(missing)).toBe(404);
    });

    it('serves the calendar, and only what a resident may see', async () => {
      const result = await publicRoute(
        apiEvent('GET /municipalities/{municipalityId}/events', {
          path: { municipalityId: ZUBIA },
        }),
        store(),
      );

      const ids = (bodyOf(result) as { id: string }[]).map((event) => event.id);

      expect(ids).toContain(EVENTS.zubiaPublished);
      expect(ids).not.toContain(EVENTS.zubiaDraft);
      expect(ids).not.toContain(EVENTS.hermandadPending);
    });

    it('refuses a range that is not a date', async () => {
      const result = await publicRoute(
        apiEvent('GET /municipalities/{municipalityId}/events', {
          path: { municipalityId: ZUBIA },
          query: { from: 'el jueves' },
        }),
        store(),
      );

      expect(statusOf(result)).toBe(400);
    });

    it('answers a draft exactly as it answers an event that does not exist', async () => {
      const draft = await publicRoute(
        apiEvent('GET /municipalities/{municipalityId}/events/{eventId}', {
          path: { municipalityId: ZUBIA, eventId: EVENTS.zubiaDraft },
        }),
        store(),
      );
      const missing = await publicRoute(
        apiEvent('GET /municipalities/{municipalityId}/events/{eventId}', {
          path: { municipalityId: ZUBIA, eventId: 'evt-nope' },
        }),
        store(),
      );

      expect(statusOf(draft)).toBe(404);
      expect(bodyOf(draft)).toEqual(bodyOf(missing));
    });

    it('answers the live map, and a 404 for an event with no session', async () => {
      const { createLiveStore } = await import('@agora/store');
      const staff = createLiveStore(client, TABLE, {
        authUserId: 'auth-editor',
        municipalityId: ZUBIA,
        role: 'municipal_editor',
        organizationId: null,
      });

      await staff.schedule(EVENTS.zubiaPublished);

      const scheduled = await publicRoute(
        apiEvent('GET /live/{eventId}', { path: { eventId: EVENTS.zubiaPublished } }),
        store(),
      );
      const missing = await publicRoute(
        apiEvent('GET /live/{eventId}', { path: { eventId: EVENTS.zubiaDraft } }),
        store(),
      );

      expect(statusOf(scheduled)).toBe(200);
      expect(statusOf(missing)).toBe(404);

      const view = bodyOf(scheduled) as Record<string, unknown>;

      // What a resident gets: where it is, where it was going, and nothing else.
      expect(Object.keys(view)).toEqual(['status', 'position', 'plannedRoute', 'simplifiedRoute']);
      expect(JSON.stringify(view)).not.toContain('volunteerCode');
    });
  });

  describe('the device API', () => {
    const dependencies = (deviceId: string | null) => ({
      client,
      table: TABLE,
      signingSecret: SECRET,
      deviceId,
    });

    it('registers a device and hands back a token that works', async () => {
      const result = await deviceRoute(
        apiEvent('POST /devices', { body: JSON.stringify({ platform: 'android', locale: 'es' }) }),
        dependencies(null),
      );

      expect(statusOf(result)).toBe(200);

      const body = bodyOf(result) as { deviceId: string; token: string };

      expect(body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
      await expect(authorize({ headers: { authorization: body.token } }, SECRET)).resolves.toEqual({
        isAuthorized: true,
        context: { deviceId: body.deviceId },
      });
    });

    it('refuses to touch marks without a device', async () => {
      const result = await deviceRoute(apiEvent('GET /me/interests'), dependencies(null));

      expect(statusOf(result)).toBe(401);
    });

    it('marks, lists and unmarks, and nobody else sees it', async () => {
      const mine = dependencies('device-mine');
      const theirs = dependencies('device-theirs');

      const marked = await deviceRoute(
        apiEvent('PUT /me/interests/{eventId}', {
          path: { eventId: EVENTS.zubiaPublished },
          query: { municipalityId: ZUBIA },
        }),
        mine,
      );

      expect(statusOf(marked)).toBe(204);

      const listed = await deviceRoute(apiEvent('GET /me/interests'), mine);
      const others = await deviceRoute(apiEvent('GET /me/interests'), theirs);

      expect((bodyOf(listed) as { eventId: string }[]).map((mark) => mark.eventId)).toEqual([
        EVENTS.zubiaPublished,
      ]);
      expect(bodyOf(others)).toEqual([]);

      const unmarked = await deviceRoute(
        apiEvent('DELETE /me/interests/{eventId}', {
          path: { eventId: EVENTS.zubiaPublished },
          query: { municipalityId: ZUBIA },
        }),
        mine,
      );

      expect(statusOf(unmarked)).toBe(204);
      expect(bodyOf(await deviceRoute(apiEvent('GET /me/interests'), mine))).toEqual([]);
    });

    it('needs to be told which municipality the mark belongs to', async () => {
      const result = await deviceRoute(
        apiEvent('PUT /me/interests/{eventId}', { path: { eventId: EVENTS.zubiaPublished } }),
        dependencies('device-mine'),
      );

      expect(statusOf(result)).toBe(400);
    });

    it('counts a view once a day, and needs the municipality too', async () => {
      const mine = dependencies('device-reader');

      const view = () =>
        deviceRoute(
          apiEvent('PUT /me/views/{eventId}', {
            path: { eventId: EVENTS.zubiaPublished },
            query: { municipalityId: ZUBIA },
          }),
          mine,
        );

      expect(statusOf(await view())).toBe(204);
      // The second one is answered the same way and changes nothing: a phone
      // that opens an event twice has not made it twice as popular.
      expect(statusOf(await view())).toBe(204);

      const event = await createPublicStore(client, TABLE).getVisibleEvent(
        ZUBIA,
        EVENTS.zubiaPublished,
      );

      expect(event?.viewCount).toBe(1);

      const noMunicipality = await deviceRoute(
        apiEvent('PUT /me/views/{eventId}', { path: { eventId: EVENTS.zubiaPublished } }),
        mine,
      );

      expect(statusOf(noMunicipality)).toBe(400);
    });

    it('turns a store refusal into the right status', async () => {
      const result = await deviceRoute(
        apiEvent('PUT /me/interests/{eventId}', {
          path: { eventId: 'evt-does-not-exist' },
          query: { municipalityId: ZUBIA },
        }),
        dependencies('device-mine'),
      );

      // The route answers the refusal itself rather than throwing at its caller,
      // which is the contract every route in this package keeps.
      expect(statusOf(result)).toBe(404);
      expect((bodyOf(result) as { error: string }).error).toBe('not_found');
    });
  });

  describe('the authorizer', () => {
    it('says no to a missing, malformed or foreign token', async () => {
      const cases = [{}, { authorization: 'nonsense' }, { authorization: 'Bearer v1.a.b.c' }];

      for (const headers of cases) {
        await expect(authorize({ headers }, SECRET)).resolves.toEqual({ isAuthorized: false });
      }
    });

    it('says yes only to a token it signed', async () => {
      const token = mintDeviceToken('device-one', SECRET);

      await expect(authorize({ headers: { authorization: token } }, SECRET)).resolves.toEqual({
        isAuthorized: true,
        context: { deviceId: 'device-one' },
      });
      await expect(authorize({ headers: { authorization: token } }, 'other')).resolves.toEqual({
        isAuthorized: false,
      });
    });
  });
});
