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
