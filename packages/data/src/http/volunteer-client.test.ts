import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './client';
import {
  type VolunteerSession,
  type VolunteerSessionStore,
  createVolunteerClient,
  normaliseCode,
} from './volunteer-client';

/**
 * What the volunteer's phone does on its own.
 *
 * The happy path against the real handler is covered in the contract test; what
 * matters here is the behaviour nobody will be around to supervise at eleven at
 * night in the middle of a procession: the code typed with a space in it, the
 * token that stops being valid, and the session that survives a phone dying.
 */
function storeWith(initial: VolunteerSession | null = null) {
  let held = initial;

  const storage: VolunteerSessionStore = {
    read: vi.fn(async () => held),
    write: vi.fn(async (session: VolunteerSession) => {
      held = session;
    }),
    clear: vi.fn(async () => {
      held = null;
    }),
  };

  return { storage, get: () => held };
}

const REDEEMED = {
  eventId: 'evt-1',
  municipalityId: 'la-zubia',
  token: 'v1l.evt-1.999.sig',
};

function clientWith(
  answers: (() => Response)[],
  initial: VolunteerSession | null = null,
): {
  client: ReturnType<typeof createVolunteerClient>;
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  stored: () => VolunteerSession | null;
} {
  const queue = [...answers];
  const fetcher = vi.fn<typeof fetch>(async (): Promise<Response> => {
    const next = queue.shift();

    if (next === undefined) throw new Error('The client made more calls than expected.');

    return next();
  });

  const { storage, get } = storeWith(initial);

  return {
    client: createVolunteerClient({ baseUrl: 'https://api.test', fetch: fetcher, storage }),
    fetcher,
    stored: get,
  };
}

const json =
  (value: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });

describe('the volunteer client', () => {
  it('cleans up a code read off a screen', () => {
    expect(normaliseCode(' ab12-cd ')).toBe('AB12CD');
  });

  it('redeems a code and keeps the session on the phone', async () => {
    const { client, fetcher, stored } = clientWith([json(REDEEMED)]);

    const session = await client.redeem('ab12 cd');

    expect(session.eventId).toBe('evt-1');
    expect(stored()).toEqual(REDEEMED);

    const [url, request] = fetcher.mock.calls[0] ?? [];

    expect(url).toBe('https://api.test/volunteer/redeem');
    expect(JSON.parse(String(request?.body))).toEqual({ code: 'AB12CD' });
  });

  it('resumes the session stored by a previous launch', async () => {
    const { client } = clientWith([], REDEEMED);

    expect(await client.resume()).toEqual(REDEEMED);
  });

  it('sends a position with the session token and returns when it was recorded', async () => {
    const recordedAt = '2026-04-03T21:14:00.000Z';
    const { client, fetcher } = clientWith(
      [json({ latitude: 37.1, longitude: -3.6, accuracyMeters: 8, recordedAt })],
      REDEEMED,
    );

    await client.resume();

    const at = await client.send({ latitude: 37.1, longitude: -3.6, accuracyMeters: 8 });

    expect(at.toISOString()).toBe(recordedAt);

    const headers = (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

    expect(headers['authorization']).toBe(`Bearer ${REDEEMED.token}`);
  });

  it('refuses to send with no session rather than calling the API without a token', async () => {
    const { client, fetcher } = clientWith([]);

    await expect(
      client.send({ latitude: 37.1, longitude: -3.6, accuracyMeters: null }),
    ).rejects.toThrow(/no volunteer session/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('drops the session when the API rejects the token, so the screen asks for a new code', async () => {
    const { client, stored } = clientWith([json({ error: 'unauthenticated' }, 401)], REDEEMED);

    await client.resume();

    await expect(
      client.send({ latitude: 37.1, longitude: -3.6, accuracyMeters: null }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(stored()).toBeNull();
  });

  it('keeps the session when the live session is merely paused', async () => {
    // 403 is the town hall having paused the broadcast: the same code still works
    // when they resume it, so throwing the token away would be wrong.
    const { client, stored } = clientWith([json({ error: 'forbidden' }, 403)], REDEEMED);

    await client.resume();

    await expect(
      client.send({ latitude: 37.1, longitude: -3.6, accuracyMeters: null }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(stored()).toEqual(REDEEMED);
  });

  it('forgets the session when the volunteer finishes', async () => {
    const { client, stored } = clientWith([], REDEEMED);

    await client.resume();
    await client.forget();

    expect(stored()).toBeNull();
  });
});
