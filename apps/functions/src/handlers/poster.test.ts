import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiEvent } from '../lib/http';
import { route } from './poster';

/**
 * The poster endpoints as the API serves them.
 *
 * The providers are tested in `@agora/poster`; this checks the layer the cloud
 * adds: the two paths, the size and type limits on an upload, and that a spent
 * free tier reaches the panel as a 429 rather than as a 500.
 */
const KEYS = {
  geminiKey: 'test-key',
  cloudflare: { accountId: 'account', apiToken: 'token' },
};

const READING = {
  title: 'Concurso de tortillas',
  description: '',
  startDate: '2027-05-01',
  startTime: '17:00',
  endTime: '',
  locationName: 'Plaza',
  isFree: true,
  priceInfo: '',
  organizerName: '',
  confidence: 'high',
};

function geminiAnswers(value: unknown): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
    { status: 200 },
  );
}

function stubFetch(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();

  for (const response of responses) fetcher.mockResolvedValueOnce(response);

  vi.stubGlobal('fetch', fetcher);

  return fetcher;
}

function request(path: string, body: unknown, method = 'POST'): ApiEvent {
  return {
    rawPath: `/${path}`,
    body: JSON.stringify(body),
    requestContext: { http: { method } },
  } as unknown as ApiEvent;
}

const statusOf = (result: Awaited<ReturnType<typeof route>>) =>
  (result as { statusCode: number }).statusCode;

const bodyOf = (result: Awaited<ReturnType<typeof route>>) =>
  JSON.parse((result as { body: string }).body) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the poster endpoints', () => {
  it('reads a poster sent as base64', async () => {
    stubFetch(geminiAnswers(READING));

    const result = await route(request('poster', { mimeType: 'image/jpeg', data: 'aGk=' }), KEYS);

    expect(statusOf(result)).toBe(200);
    expect(bodyOf(result).title).toBe('Concurso de tortillas');
  });

  it('refuses a type a model cannot read, and something too big', async () => {
    const wrongType = await route(
      request('poster', { mimeType: 'application/pdf', data: 'aGk=' }),
      KEYS,
    );
    const tooBig = await route(
      request('poster', { mimeType: 'image/jpeg', data: 'a'.repeat(12 * 1024 * 1024) }),
      KEYS,
    );

    expect(statusOf(wrongType)).toBe(415);
    expect(statusOf(tooBig)).toBe(413);
  });

  it('draws one from a description', async () => {
    stubFetch(
      geminiAnswers({ imagePrompt: 'A sunny square', altText: 'Una plaza al sol' }),
      new Response(JSON.stringify({ result: { image: 'Zm90bw==' } }), { status: 200 }),
    );

    const result = await route(
      request('poster/generate', {
        description: 'concurso de tortillas en la plaza',
        mode: 'background',
        event: { title: 'Concurso de tortillas' },
      }),
      KEYS,
    );

    expect(statusOf(result)).toBe(200);
    expect(bodyOf(result).altText).toBe('Una plaza al sol');
  });

  it('passes a spent quota through as a 429, not as a crash', async () => {
    stubFetch(new Response('', { status: 429 }));

    const result = await route(request('poster', { mimeType: 'image/jpeg', data: 'aGk=' }), KEYS);

    expect(statusOf(result)).toBe(429);
    expect(bodyOf(result).error).toBe('rate_limited');
  });

  it('says which key is missing without calling anybody', async () => {
    const fetcher = stubFetch();

    const result = await route(request('poster', { mimeType: 'image/jpeg', data: 'aGk=' }), {
      geminiKey: undefined,
      cloudflare: { accountId: undefined, apiToken: undefined },
    });

    expect(statusOf(result)).toBe(503);
    expect(bodyOf(result).error).toBe('missing_api_key');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a poster, a wrong path and a wrong method', async () => {
    expect(statusOf(await route(request('poster', { nope: true }), KEYS))).toBe(400);
    expect(statusOf(await route(request('poster/whatever', {}), KEYS))).toBe(404);
    expect(statusOf(await route(request('poster', {}, 'GET'), KEYS))).toBe(405);
  });
});
