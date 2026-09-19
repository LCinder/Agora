import {
  type StoreClient,
  createLiveReader,
  createLiveStore,
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

import {
  mintDeviceToken,
  mintVolunteerToken,
  verifyDeviceToken,
  verifyVolunteerToken,
} from '../lib/device-token';
import type { ApiEvent } from '../lib/http';
import { route } from './volunteer';

/**
 * The volunteer's two calls.
 *
 * The property worth the most here is the one about scope: a token lets its holder
 * write positions to one session, and to nothing else. It is enforced by where the
 * event comes from — inside the token — so the test that matters is the one that
 * tries to use a token for another event and finds there is no way to ask.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-volunteer-${process.pid}`;
const SECRET = 'volunteer-signing-secret';

const EDITOR = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor' as const,
  organizationId: null,
};

function request(path: string, body: unknown, options: { token?: string } = {}): ApiEvent {
  return {
    rawPath: `/${path}`,
    body: JSON.stringify(body),
    headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
    requestContext: { http: { method: 'POST' } },
  } as unknown as ApiEvent;
}

const statusOf = (result: Awaited<ReturnType<typeof route>>) =>
  (result as { statusCode: number }).statusCode;

const bodyOf = (result: Awaited<ReturnType<typeof route>>) =>
  JSON.parse((result as { body: string }).body) as Record<string, string>;

describe('the two kinds of token', () => {
  it('cannot be mistaken for one another', () => {
    const device = mintDeviceToken('device-one', SECRET);
    const volunteer = mintVolunteerToken('evt-one', SECRET);

    expect(verifyDeviceToken(device, SECRET)).toBe('device-one');
    expect(verifyVolunteerToken(volunteer, SECRET)).toBe('evt-one');

    // The point: neither verifier accepts the other's token, so a device cannot
    // emit a position and a volunteer cannot mark events as somebody else.
    expect(verifyVolunteerToken(device, SECRET)).toBeNull();
    expect(verifyDeviceToken(volunteer, SECRET)).toBeNull();
  });

  it('expires, and says nothing about why it was rejected', () => {
    const token = mintVolunteerToken('evt-one', SECRET, new Date('2027-04-01T12:00:00Z'));

    expect(verifyVolunteerToken(token, SECRET, new Date('2027-04-01T19:00:00Z'))).toBe('evt-one');
    expect(verifyVolunteerToken(token, SECRET, new Date('2027-04-02T12:00:00Z'))).toBeNull();
    expect(verifyVolunteerToken(token, 'otra-clave')).toBeNull();
  });
});

describe.skipIf(local === null)('the volunteer endpoints', () => {
  let client: StoreClient;
  let code: string;

  const call = (path: string, body: unknown, options?: { token?: string }) =>
    route(request(path, body, options), {
      store: createVolunteerStore(client, TABLE),
      signingSecret: SECRET,
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

    const staff = createLiveStore(client, TABLE, EDITOR);
    const session = await staff.schedule(EVENTS.zubiaPublished);

    code = session.volunteerCode!;

    await staff.start(EVENTS.zubiaPublished);
    await staff.schedule(EVENTS.zubiaCancelled);
    await staff.start(EVENTS.zubiaCancelled);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  it('exchanges the code the town hall gave for a token', async () => {
    const result = await call('volunteer/redeem', { code });

    expect(statusOf(result)).toBe(200);

    const body = bodyOf(result);

    expect(body.eventId).toBe(EVENTS.zubiaPublished);
    expect(verifyVolunteerToken(body.token!, SECRET)).toBe(EVENTS.zubiaPublished);
  });

  it('refuses a code that was already used, and one that never existed', async () => {
    expect(statusOf(await call('volunteer/redeem', { code }))).toBe(404);
    expect(statusOf(await call('volunteer/redeem', { code: 'ZZZZZZZZ' }))).toBe(404);
    expect(statusOf(await call('volunteer/redeem', {}))).toBe(400);
  });

  it('records a position, and a resident sees it', async () => {
    const token = mintVolunteerToken(EVENTS.zubiaPublished, SECRET);

    const result = await call(
      'volunteer/positions',
      { latitude: 37.1, longitude: -3.78, accuracyMeters: 12 },
      { token },
    );

    expect(statusOf(result)).toBe(200);

    const view = await createLiveReader(client, TABLE).live(EVENTS.zubiaPublished);

    expect(view?.position?.latitude).toBe(37.1);
  });

  it('cannot emit to another event, because there is nowhere to ask for one', async () => {
    const token = mintVolunteerToken(EVENTS.zubiaPublished, SECRET);

    // The body names another event on purpose. It is ignored: the event comes from
    // the token, so this lands where it was always going to land.
    await call(
      'volunteer/positions',
      { latitude: 40.4, longitude: -3.7, accuracyMeters: 5, eventId: EVENTS.zubiaCancelled },
      { token },
    );

    const other = await createLiveReader(client, TABLE).live(EVENTS.zubiaCancelled);

    expect(other?.position).toBeNull();
  });

  it('refuses a missing, forged or expired token', async () => {
    const position = { latitude: 37.1, longitude: -3.78, accuracyMeters: null };

    expect(statusOf(await call('volunteer/positions', position))).toBe(401);
    expect(
      statusOf(await call('volunteer/positions', position, { token: 'v1l.evt.999.sig' })),
    ).toBe(401);
    expect(
      statusOf(
        await call('volunteer/positions', position, {
          token: mintVolunteerToken(EVENTS.zubiaPublished, 'otra-clave'),
        }),
      ),
    ).toBe(401);
  });

  it('refuses a device token, however valid it is', async () => {
    const result = await call(
      'volunteer/positions',
      { latitude: 37.1, longitude: -3.78, accuracyMeters: null },
      { token: mintDeviceToken('device-one', SECRET) },
    );

    expect(statusOf(result)).toBe(401);
  });

  it('refuses a position with no coordinates', async () => {
    const token = mintVolunteerToken(EVENTS.zubiaPublished, SECRET);

    expect(statusOf(await call('volunteer/positions', { accuracyMeters: 5 }, { token }))).toBe(400);
  });

  it('stops recording once the town hall ends the session', async () => {
    const token = mintVolunteerToken(EVENTS.zubiaPublished, SECRET);

    await createLiveStore(client, TABLE, EDITOR).end(EVENTS.zubiaPublished);

    const result = await call(
      'volunteer/positions',
      { latitude: 37.1, longitude: -3.78, accuracyMeters: null },
      { token },
    );

    // The token is still valid — it is the session that is over, which is a
    // different sentence for the volunteer's screen.
    expect(statusOf(result)).toBe(403);
  });

  it('answers 404 for a path it does not serve and 405 for a GET', async () => {
    expect(statusOf(await call('volunteer/whatever', {}))).toBe(404);
    expect(
      statusOf(
        await route(
          {
            ...request('volunteer/redeem', { code }),
            requestContext: { http: { method: 'GET' } },
          } as ApiEvent,
          { store: createVolunteerStore(client, TABLE), signingSecret: SECRET },
        ),
      ),
    ).toBe(405);
  });
});
