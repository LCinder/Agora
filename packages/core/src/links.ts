/**
 * Shared link shapes.
 *
 * The app and the web panel must agree on them: a link shared on WhatsApp has
 * to open the event in the app when it is installed, and the public web page
 * when it is not. That page is how the app spreads through a town without the
 * town hall doing anything, so the path is part of the product, not a detail.
 */

/** Path of the public page of an event, relative to the site root. */
export function publicEventPath(municipalitySlug: string, eventId: string): string {
  return `/e/${municipalitySlug}/${eventId}`;
}

/** Full public URL of an event. */
export function publicEventUrl(baseUrl: string, municipalitySlug: string, eventId: string): string {
  return `${baseUrl.replace(/\/$/, '')}${publicEventPath(municipalitySlug, eventId)}`;
}

/**
 * The path prefix both stores verify, and the app claims.
 *
 * It is a prefix and not the whole site on purpose: the panel and the legal
 * pages live on the same domain and the app has neither, so an app that claimed
 * everything would swallow links it cannot show. Declared in
 * `apps/mobile/app.config.ts` and written into the two `.well-known` files by
 * `apps/web/scripts/write-well-known.mjs`; all three read it from here.
 */
export const SHARED_LINK_PREFIX = '/e/';

/**
 * The host that receives shared links, or null when there is no site yet.
 *
 * Both platforms verify a claim against a file served from this host, so a claim
 * on a host nobody owns does nothing — which is why an empty site URL has to be a
 * case the callers handle rather than a placeholder they pass on.
 *
 * Read with a pattern rather than with `URL`. This package has to compile for
 * React Native, for a Lambda and for a browser, and it does that by depending on
 * nothing any of them provides: `URL` is a global of each host, not of the
 * language. The port is part of the host, because a claim has to match the
 * address exactly and a local build has one.
 */
const SITE_URL = /^https?:\/\/([a-z0-9.-]+(?::\d+)?)(?:\/|$)/i;

export function sharedLinkHost(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();

  if (trimmed === '') return null;

  const host = SITE_URL.exec(trimmed)?.[1];

  if (host === undefined) throw new Error(`Not a URL: ${baseUrl}`);

  return host.toLowerCase();
}
