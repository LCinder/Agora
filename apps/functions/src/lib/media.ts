import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Where an event's poster is kept.
 *
 * The bucket, the CloudFront behaviour that serves it at `/media/*` and this
 * function's permission to write to it have existed since the stack was first
 * applied, and nothing ever used them. This is the code that was missing: an
 * event carried an `imageUrl` that only the seed could fill, so every event a
 * town hall created had no poster and the app drew its fallback cover for all of
 * them.
 *
 * The image arrives as base64 inside the request rather than as a presigned
 * upload straight to S3. One fewer round trip, no CORS to configure on the
 * bucket, and the panel already has the bytes in that shape: the drawn poster
 * comes out of a canvas as a data URL, and an uploaded photo is shrunk to about
 * 1,500 pixels before it is sent. API Gateway allows 10 MB, and the limit below
 * is well under it.
 */

/**
 * The formats a poster arrives in, and what each one is called on the way out.
 *
 * An allow list rather than trusting the browser's word: the extension decides
 * how CloudFront serves the object, and "whatever the client said" is how a
 * bucket ends up serving something it should not.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isStorableImage(mimeType: string): boolean {
  return mimeType.toLowerCase() in EXTENSIONS;
}

/**
 * Four megabytes, after the panel has already shrunk it.
 *
 * A poster photographed by a phone arrives at about 400 kB once scaled to 1,500
 * pixels, and a drawn one at around a megabyte. Anything far past that is not a
 * poster, and refusing it here is cheaper than storing it.
 */
export const MAX_POSTER_BYTES = 4 * 1024 * 1024;

/** The byte count of base64, without decoding it. */
export function sizeOfBase64(data: string): number {
  return Math.floor((data.length * 3) / 4);
}

let client: S3Client | null = null;

export interface StoredPoster {
  /** The path under the site, which is what the event stores. */
  url: string;
  /** The object's key, kept so the old one can be deleted when it is replaced. */
  key: string;
}

/**
 * Writes the poster and answers where it now lives.
 *
 * The key names the municipality and the event, so everything one town owns
 * shares a prefix and a whole municipality can be removed with one call the day
 * a contract ends. The random suffix is what makes the URL change when the
 * poster does: CloudFront caches these for a long time on purpose, and a poster
 * replaced at a URL that did not change is a poster nobody sees until the cache
 * expires.
 */
export async function storePoster(input: {
  bucket: string;
  siteUrl: string;
  municipalityId: string;
  eventId: string;
  mimeType: string;
  data: string;
}): Promise<StoredPoster> {
  client ??= new S3Client({});

  const extension = EXTENSIONS[input.mimeType.toLowerCase()] ?? 'jpg';
  const key = `media/${input.municipalityId}/${input.eventId}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: key,
      Body: Buffer.from(input.data, 'base64'),
      ContentType: input.mimeType,
      // A year. The key changes whenever the image does, so nothing here is ever
      // stale — and a poster is looked at by everybody in a town on the same
      // evening, which is exactly what a cache is for.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return { url: `${input.siteUrl.replace(/\/$/, '')}/${key}`, key };
}

/**
 * Removes a poster we stored, best effort.
 *
 * Called when one replaces another and when an event's cover is taken off. It
 * never fails the request: an object left behind costs a fraction of a cent a
 * year, and an error here would undo a change the officer has already been told
 * happened.
 *
 * A URL that does not point into our own bucket is ignored rather than parsed
 * harder — an event's `imageUrl` can also be a link somebody typed, or a seed
 * file's, and neither is ours to delete.
 */
export async function removePoster(bucket: string, url: string | null): Promise<void> {
  if (url === null) return;

  const key = /\/(media\/[^?#]+)/.exec(url)?.[1];

  if (key === undefined) return;

  client ??= new S3Client({});

  await client
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => undefined)
    .then(() => undefined);
}
