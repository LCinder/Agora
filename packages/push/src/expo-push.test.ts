import { describe, expect, it, vi } from 'vitest';

import { createExpoPush, isExpoPushToken } from './expo-push';

/**
 * What the reminder job depends on when it is three minutes from 19:00 and there
 * are four hundred messages to get out: that one bad token does not sink the
 * batch, that a dead network is counted rather than thrown, and that a token
 * belonging to an uninstalled app comes back so it can be deleted.
 */
const OK = (count: number) =>
  new Response(JSON.stringify({ data: Array.from({ length: count }, () => ({ status: 'ok' })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function message(index: number) {
  return { to: `ExponentPushToken[device-${index}]`, title: 'Cabalgata', body: 'Mañana' };
}

describe('the Expo push client', () => {
  it('recognises the shape of a push token', () => {
    expect(isExpoPushToken('ExponentPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('abc')).toBe(false);
  });

  it('sends one request and counts the tickets', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => OK(2));
    const push = createExpoPush({ fetch: fetcher });

    const outcome = await push.send([message(1), message(2)]);

    expect(outcome).toEqual({ sent: 2, failed: 0, unregistered: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, request] = fetcher.mock.calls[0] ?? [];

    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse(String(request?.body))).toHaveLength(2);
  });

  it('splits a long list into batches of a hundred', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) =>
      OK((JSON.parse(String(init?.body)) as unknown[]).length),
    );
    const push = createExpoPush({ fetch: fetcher });

    const outcome = await push.send(Array.from({ length: 250 }, (_, index) => message(index)));

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(outcome.sent).toBe(250);
  });

  it('carries the access token only when there is one', async () => {
    const withToken = vi.fn<typeof fetch>(async () => OK(1));
    await createExpoPush({ fetch: withToken, accessToken: 'secret' }).send([message(1)]);

    const headers = (withToken.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

    expect(headers['authorization']).toBe('Bearer secret');

    const without = vi.fn<typeof fetch>(async () => OK(1));
    await createExpoPush({ fetch: without }).send([message(1)]);

    const bare = (without.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

    expect(bare['authorization']).toBeUndefined();
  });

  it('reports the tokens of apps that were uninstalled', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { status: 'ok' },
              { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
              { status: 'error', message: 'boom', details: { error: 'MessageTooBig' } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const outcome = await createExpoPush({ fetch: fetcher }).send([
      message(1),
      message(2),
      message(3),
    ]);

    expect(outcome.sent).toBe(1);
    expect(outcome.failed).toBe(2);
    expect(outcome.unregistered).toEqual(['ExponentPushToken[device-2]']);
  });

  it('never asks Expo about something that is not a token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => OK(1));

    const outcome = await createExpoPush({ fetch: fetcher }).send([
      { to: 'not-a-token', title: 'a', body: 'b' },
      message(1),
    ]);

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toHaveLength(1);
    expect(outcome).toEqual({ sent: 1, failed: 1, unregistered: [] });
  });

  it('counts a dead network instead of throwing at the job', async () => {
    const push = createExpoPush({
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
    });

    await expect(push.send([message(1)])).resolves.toEqual({
      sent: 0,
      failed: 1,
      unregistered: [],
    });
  });

  it('counts a refusal from Expo the same way', async () => {
    const push = createExpoPush({ fetch: async () => new Response('nope', { status: 503 }) });

    expect(await push.send([message(1)])).toEqual({ sent: 0, failed: 1, unregistered: [] });
  });
});
