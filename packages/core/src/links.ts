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

/** Deep link that opens the event inside the app. */
export function appEventUrl(scheme: string, eventId: string): string {
  return `${scheme}://event/${eventId}`;
}
