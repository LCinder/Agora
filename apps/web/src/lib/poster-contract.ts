/**
 * Where the poster endpoints live, and what they answer.
 *
 * The shapes come from `@agora/poster`, which is also what serves them — the
 * panel's own route handlers in development, the poster Lambda in the cloud — so
 * the types are re-exported here rather than described a second time.
 */

import { currentIdToken } from './auth';

export type { PosterBrief, PosterDrawing, PosterReading } from '@agora/poster';

/**
 * Base URL of the poster endpoints.
 *
 * Empty in development, where the panel's own route handlers answer under `/api`.
 * In the static export it is the HTTP API, injected at build time as
 * `NEXT_PUBLIC_POSTER_API_BASE` — a public variable because it is a hostname, not
 * a secret: the keys stay in Parameter Store, on the Lambda's side.
 */
const BASE = process.env.NEXT_PUBLIC_POSTER_API_BASE ?? '';

/** Where to POST a poster to be read, or a description to be drawn. */
export function posterEndpoint(what: 'read' | 'draw'): string {
  const path = what === 'read' ? '/poster' : '/poster/generate';

  return BASE === '' ? `/api${path}` : `${BASE.replace(/\/$/, '')}${path}`;
}

/**
 * Calls one of them, signed in.
 *
 * The signature is the whole point of this function existing. In development the
 * panel's own route handlers answer and nobody is asked for anything; deployed,
 * the same two paths are routes on the HTTP API behind the Cognito authorizer,
 * and a request with no token is refused before the function runs. That is
 * exactly what happened: reading and drawing worked on a laptop and answered
 * "Unauthorized" in the cloud, with a poster Lambda whose log group was empty
 * because it had never been invoked once.
 *
 * Both calls cost real money at somebody else's meter — Gemini reads the poster,
 * Workers AI draws it — so the authorizer is right and the missing header was
 * the bug.
 *
 * The token is asked for on every call rather than held: a panel left open all
 * afternoon in a town hall office has an expired one, and `currentIdToken`
 * refreshes it. It is left out when there is none, which is the development
 * build and the demo, where the endpoint does not want one.
 */
export async function callPoster(what: 'read' | 'draw', body: unknown): Promise<Response> {
  let token: string | null = null;

  try {
    token = await currentIdToken();
  } catch {
    // No pool configured, or a session that cannot be refreshed. Send it
    // unsigned and let the endpoint answer: the caller already knows how to
    // show a refusal, and it is a better message than one invented here.
  }

  return fetch(posterEndpoint(what), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

/**
 * What to tell somebody when a poster call is refused.
 *
 * API Gateway answers a missing or expired token with `{"message":"Unauthorized"}`,
 * and printing that word into a Spanish panel is how a session that simply timed
 * out looks like a broken feature.
 */
export function posterError(response: Response, payload: unknown, fallback: string): string {
  if (response.status === 401 || response.status === 403) {
    return 'Tu sesión ha caducado. Vuelve a entrar y prueba otra vez.';
  }

  const message =
    typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : '';

  return message === '' || message === 'Unauthorized' ? fallback : message;
}

/**
 * How big an edge of the poster is worth sending.
 *
 * The photo comes off a phone at twelve megapixels, and what the model has to do
 * is read a date and a place off it: 1,500 pixels on the long edge is more than
 * enough for that, and it is the difference between a 400 kB request and an 8 MB
 * one that the API refuses outright (the limit is 6 MB, and base64 inflates by a
 * third). It also means somebody in a town hall office on a slow line can upload
 * a poster at all.
 */
const MAX_EDGE = 1500;

/** Enough for text to stay crisp; past this the file grows and the reading does not improve. */
const JPEG_QUALITY = 0.85;

/**
 * The photo, scaled down, or null when there is no point or no way.
 *
 * Null for an image that is already small, for a format the browser will not
 * decode, and anywhere without a canvas — in all three cases the original bytes
 * are sent, which is what happened before this existed.
 */
async function shrink(file: File): Promise<{ mimeType: string; blob: Blob } | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);

    if (longest <= MAX_EDGE) return null;

    const scale = MAX_EDGE / longest;
    const canvas = document.createElement('canvas');

    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');

    if (context === null) return null;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    return blob === null ? null : { mimeType: 'image/jpeg', blob };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * A file picked in the browser, as the endpoints want it.
 *
 * Both the panel's development route and the poster Lambda take the image as
 * base64 inside JSON, and not as a multipart upload: one shape for both means the
 * panel does not behave differently depending on where it is deployed, and a
 * Lambda does not have to parse multipart by hand.
 *
 * The image is scaled down first. A poster photographed with a modern phone does
 * not fit in the request otherwise, and nothing about reading a date off it needs
 * twelve megapixels.
 */
export async function imagePayload(file: File): Promise<{ mimeType: string; data: string }> {
  const smaller = await shrink(file);
  const source: Blob = smaller?.blob ?? file;
  const buffer = await source.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let binary = '';

  // In chunks, because spreading a few million bytes into `String.fromCharCode`
  // overflows the call stack on a phone.
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }

  return { mimeType: smaller?.mimeType ?? file.type, data: btoa(binary) };
}
