/**
 * Where the poster endpoints live, and what they answer.
 *
 * The shapes come from `@agora/poster`, which is also what serves them — the
 * panel's own route handlers in development, the poster Lambda in the cloud — so
 * the types are re-exported here rather than described a second time.
 */

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
 * A file picked in the browser, as the endpoints want it.
 *
 * Both the panel's development route and the poster Lambda take the image as
 * base64 inside JSON, and not as a multipart upload: one shape for both means the
 * panel does not behave differently depending on where it is deployed, and a
 * Lambda does not have to parse multipart by hand.
 */
export async function imagePayload(file: File): Promise<{ mimeType: string; data: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let binary = '';

  // In chunks, because spreading a few million bytes into `String.fromCharCode`
  // overflows the call stack on a phone.
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }

  return { mimeType: file.type, data: btoa(binary) };
}
