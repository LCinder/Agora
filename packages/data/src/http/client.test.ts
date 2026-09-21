import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient } from './client';

/**
 * How the client behaves when the answer is not the happy one.
 *
 * The happy paths are covered where they belong — against the real handlers, in
 * `apps/functions/src/handlers/contract.test.ts`. What is worth testing in
 * isolation is the part a neighbour on one bar of signal will meet: a request that
 * never lands, a body that is not what this version of the app understands, and
 * the difference between "that event is gone" and "something is broken".
 */
const identity = (value: unknown) => value;

function clientWith(answer: Response | (() => never), token?: string) {
  const fetcher = vi.fn<typeof fetch>(async (): Promise<Response> => {
    if (typeof answer === 'function') return answer();

    return answer;
  });

  const client = createApiClient({
    baseUrl: 'https://api.test/',
    fetch: fetcher,
    ...(token === undefined ? {} : { token: () => token }),
  });

  return { client, fetcher };
}

describe('the API client', () => {
  it('joins the base URL and the path without doubling the slash', async () => {
    const { client, fetcher } = clientWith(new Response('[]', { status: 200 }));

    await client.get('/municipalities', identity);

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.test/municipalities');
  });

  it('carries the device token when there is one, and nothing when there is not', async () => {
    const withToken = clientWith(new Response('[]', { status: 200 }), 'v1.device.999.sig');
    await withToken.client.get('/me/interests', identity);

    const headers = (withToken.fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

    expect(headers['authorization']).toBe('Bearer v1.device.999.sig');

    const without = clientWith(new Response('[]', { status: 200 }));
    await without.client.get('/municipalities', identity);

    const bare = (without.fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

    expect(bare['authorization']).toBeUndefined();
  });

  it('turns a request that never lands into an offline failure', async () => {
    const { client } = clientWith(() => {
      throw new TypeError('Network request failed');
    });

    await expect(client.get('/municipalities', identity)).rejects.toMatchObject({
      failure: { kind: 'offline' },
    });
  });

  it('reads our own error code out of the body', async () => {
    const { client } = clientWith(
      new Response(JSON.stringify({ error: 'not_found', message: 'No existe.' }), { status: 404 }),
    );

    await expect(client.get('/events/nope', identity)).rejects.toMatchObject({
      failure: { kind: 'status', status: 404, code: 'not_found' },
    });
  });

  it('treats a 404 as an answer where the caller asked for one', async () => {
    const { client } = clientWith(new Response('{}', { status: 404 }));

    expect(await client.getOrNull('/municipalities/nope', identity)).toBeNull();
  });

  it('says a body it cannot read is unreadable, rather than crashing', async () => {
    const notJson = clientWith(new Response('<html>a proxy said no</html>', { status: 200 }));

    await expect(notJson.client.get('/municipalities', identity)).rejects.toMatchObject({
      failure: { kind: 'unreadable' },
    });

    // A shape this version does not understand: the app is older than the API.
    const wrongShape = clientWith(new Response(JSON.stringify({ nope: true }), { status: 200 }));

    await expect(
      wrongShape.client.get('/municipalities', () => {
        throw new Error('schema says no');
      }),
    ).rejects.toMatchObject({ failure: { kind: 'unreadable' } });
  });

  it('accepts a 204 with no body from a write', async () => {
    const { client } = clientWith(new Response(null, { status: 204 }));

    expect(await client.send('PUT', '/me/interests/evt-1')).toBeNull();
  });

  it('keeps the original error as the cause, so a bug here is findable', async () => {
    const { client } = clientWith(() => {
      throw new TypeError('the real reason');
    });

    const error = await client.get('/municipalities', identity).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).cause).toBeInstanceOf(TypeError);
  });
});
