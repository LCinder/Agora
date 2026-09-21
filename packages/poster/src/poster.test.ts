import { afterEach, describe, expect, it, vi } from 'vitest';

import { codeFor, messageFor, statusFor } from './failure';
import { drawPoster } from './draw-poster';
import { isAcceptedImageType, readPoster } from './read-poster';

/**
 * The provider calls, with the network stubbed.
 *
 * What is worth testing here is not the happy path — it is every way a free tier
 * says no. A quota that ran out, a key that is wrong, a model that answered with
 * nothing usable: each one reaches a municipal officer as a different sentence,
 * and getting them confused is how "it is broken" becomes the only thing they can
 * tell you.
 */
const KEYS = {
  geminiKey: 'test-key',
  cloudflare: { accountId: 'account', apiToken: 'token' },
};

/**
 * Replaces the network with a queue of answers, and hands back the spy so a test
 * can look at what was sent. Typed as `fetch` itself so the call arguments are
 * not `never`.
 */
function stubFetch(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();

  for (const response of responses) fetcher.mockResolvedValueOnce(response);

  vi.stubGlobal('fetch', fetcher);

  return fetcher;
}

function geminiAnswers(value: unknown): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const READING = {
  title: 'Concurso de tortillas',
  description: 'En la plaza, por la tarde.',
  startDate: '2027-05-01',
  startTime: '17:00',
  endTime: '',
  locationName: 'Plaza del Ayuntamiento',
  isFree: true,
  priceInfo: '',
  organizerName: 'Peña El Almendro',
  confidence: 'high' as const,
};

const IMAGE = { data: 'aGVsbG8=', mimeType: 'image/jpeg' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a poster', () => {
  it('returns the fields the form needs', async () => {
    stubFetch(geminiAnswers(READING));

    const result = await readPoster({ ...KEYS, image: IMAGE });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.title).toBe('Concurso de tortillas');
    expect(result.ok && result.value.confidence).toBe('high');
  });

  it('sends the image and today, so a poster with no year lands in the right one', async () => {
    const fetcher = stubFetch(geminiAnswers(READING));

    await readPoster({ ...KEYS, image: IMAGE, today: new Date('2027-04-01T10:00:00Z') });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      contents: { parts: { text?: string; inlineData?: { data: string } }[] }[];
    };
    const parts = body.contents[0]?.parts ?? [];

    expect(parts[0]?.inlineData?.data).toBe(IMAGE.data);
    expect(parts[1]?.text).toContain('2027-04-01');
  });

  it('says which key is missing rather than calling anybody', async () => {
    const fetcher = stubFetch();

    const result = await readPoster({ geminiKey: undefined, image: IMAGE });

    expect(result).toEqual({ ok: false, failure: 'missing_key' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('tells a spent quota from a bad key from a server that is down', async () => {
    const cases: [number, string][] = [
      [429, 'rate_limited'],
      [401, 'bad_key'],
      [403, 'bad_key'],
      // A free tier answers these for "too many people are asking right now",
      // which is a different thing to tell somebody than "something broke": the
      // answer is to press the button again in a minute.
      [500, 'busy'],
      [503, 'busy'],
      [504, 'busy'],
      [418, 'unknown'],
    ];

    for (const [status, failure] of cases) {
      stubFetch(new Response('', { status }));

      const result = await readPoster({ ...KEYS, image: IMAGE });

      expect(result).toEqual({ ok: false, failure });
    }
  });

  it('treats an unreachable provider as such', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    );

    expect(await readPoster({ ...KEYS, image: IMAGE })).toEqual({
      ok: false,
      failure: 'unreachable',
    });
  });

  it('tells a provider that never answered from one that could not be reached', async () => {
    // What `AbortSignal.timeout` throws when the budget runs out. The two have
    // to be told apart: past the gateway's own 30 seconds the failure stops
    // being ours and the panel gets an empty 503, so this is the last point at
    // which anybody can say what happened.
    // Both names. `AbortSignal.timeout` rejects with the first one, which is the
    // case that happens here; the second is what an explicit abort would throw.
    for (const name of ['TimeoutError', 'AbortError']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new DOMException('The operation was aborted.', name);
        }),
      );

      expect(await readPoster({ ...KEYS, image: IMAGE })).toEqual({
        ok: false,
        failure: 'timed_out',
      });
    }
  });

  it('treats an answer it cannot use as a refusal, not as a crash', async () => {
    const answers = [
      // A safety block: a candidate with no parts.
      new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), { status: 200 }),
      // Text that is not JSON.
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'vale' }] } }] }), {
        status: 200,
      }),
      // JSON that is not the shape we asked for.
      geminiAnswers({ title: 'Solo el título' }),
    ];

    for (const answer of answers) {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(answer));

      expect(await readPoster({ ...KEYS, image: IMAGE })).toEqual({
        ok: false,
        failure: 'refused',
      });
    }
  });

  it('accepts the image types a phone produces', () => {
    expect(isAcceptedImageType('image/jpeg')).toBe(true);
    expect(isAcceptedImageType('image/heic')).toBe(false);
    expect(isAcceptedImageType('application/pdf')).toBe(false);
  });
});

describe('drawing a poster', () => {
  const BRIEF = { imagePrompt: 'A sunny square with long tables', altText: 'Una plaza al sol' };

  it('writes a brief and then draws it', async () => {
    const fetcher = stubFetch(
      geminiAnswers(BRIEF),
      new Response(JSON.stringify({ result: { image: 'Zm90bw==' } }), { status: 200 }),
    );

    const result = await drawPoster({
      ...KEYS,
      description: 'concurso de tortillas en la plaza',
      mode: 'background',
      event: { title: 'Concurso de tortillas', municipalityName: 'La Zubia' },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.altText).toBe('Una plaza al sol');
    expect(result.ok && result.value.image).toEqual({ mimeType: 'image/jpeg', data: 'Zm90bw==' });

    // Two providers, two calls, in that order.
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('generativelanguage');
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('api.cloudflare.com');
  });

  it('asks for no text in the image in background mode, and for exact text in the other', async () => {
    for (const [mode, expected] of [
      ['background', 'NO debe contener ningún texto'],
      ['complete', 'SÍ lleva el texto dentro de la imagen'],
    ] as const) {
      const fetcher = stubFetch(
        geminiAnswers(BRIEF),
        new Response(JSON.stringify({ result: { image: 'Zm90bw==' } }), { status: 200 }),
      );

      await drawPoster({ ...KEYS, description: 'algo', mode, event: {} });

      expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain(expected);
    }
  });

  it('does not call the text model when the drawing credentials are missing', async () => {
    const fetcher = stubFetch();

    const result = await drawPoster({
      geminiKey: 'test-key',
      cloudflare: { accountId: undefined, apiToken: 'token' },
      description: 'algo',
      mode: 'background',
      event: {},
    });

    expect(result).toEqual({ ok: false, failure: 'missing_key' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a spent image quota as such', async () => {
    stubFetch(geminiAnswers(BRIEF), new Response('', { status: 429 }));

    expect(
      await drawPoster({ ...KEYS, description: 'algo', mode: 'background', event: {} }),
    ).toEqual({ ok: false, failure: 'rate_limited' });
  });

  it('says so when the service answers without an image', async () => {
    stubFetch(
      geminiAnswers(BRIEF),
      new Response(JSON.stringify({ success: false, errors: [{ message: 'nope' }] }), {
        status: 200,
      }),
    );

    expect(
      await drawPoster({ ...KEYS, description: 'algo', mode: 'background', event: {} }),
    ).toEqual({ ok: false, failure: 'no_image' });
  });
});

describe('what the officer is told', () => {
  it('maps every failure to a status, a code and a sentence in Spanish', () => {
    const failures = [
      'missing_key',
      'bad_key',
      'rate_limited',
      'unreachable',
      'refused',
      'no_image',
      'unknown',
    ] as const;

    for (const failure of failures) {
      expect(statusFor(failure)).toBeGreaterThanOrEqual(400);
      expect(codeFor(failure)).toMatch(/^[a-z_]+$/);
      expect(messageFor(failure, 'leer carteles').length).toBeGreaterThan(10);
    }

    expect(statusFor('rate_limited')).toBe(429);
    expect(statusFor('missing_key')).toBe(503);
    expect(statusFor('refused')).toBe(422);
    expect(codeFor('missing_key')).toBe('missing_api_key');
  });
});
