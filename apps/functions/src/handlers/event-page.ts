import { type PublicStore, createPublicStore, createStoreClient } from '@agora/store';

import { renderEventPage, renderNotFoundPage } from '../lib/event-page-html';
import { type ApiEvent, type ApiResult, handle, refusal, tableName } from '../lib/http';

/**
 * Serves `/e/<slug>/<eventId>`: the page a shared link lands on.
 *
 * Behind CloudFront, which caches it for a minute, so the same link pasted into a
 * WhatsApp group of four hundred people reaches this function roughly once.
 *
 * It answers HTML and not JSON, and it is the only function that does. What it is
 * for is the preview card — see `lib/event-page-html.ts` — and a page somebody
 * without the app can read in the street.
 */
const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // A minute at the edge as well, in case this is ever served without CloudFront
  // in front. An event changes when an officer publishes something, and a minute
  // of staleness for a neighbour is not worth paying to avoid.
  'cache-control': 'public, max-age=60',
};

/** `/e/<slug>/<eventId>`, tolerant of a trailing slash and of the raw path. */
export function parsePath(path: string): { slug: string; eventId: string } | null {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/');
  const [prefix, slug, eventId] = segments;

  if (prefix !== 'e' || segments.length !== 3) return null;
  if (slug === undefined || slug === '' || eventId === undefined || eventId === '') return null;

  return { slug: decodeURIComponent(slug), eventId: decodeURIComponent(eventId) };
}

export async function route(
  event: ApiEvent,
  store: PublicStore,
  siteUrl: string,
): Promise<ApiResult> {
  const notFound: ApiResult = {
    statusCode: 404,
    headers: HTML_HEADERS,
    body: renderNotFoundPage(),
  };

  try {
    const parsed = parsePath(event.rawPath);

    if (parsed === null) return notFound;

    const municipality = await store.getMunicipalityBySlug(parsed.slug);

    if (municipality === null) return notFound;

    const found = await store.getVisibleEvent(municipality.id, parsed.eventId);

    // A draft answers exactly what a missing event answers. Anything else turns a
    // shared link into a way to find out what the town hall is preparing.
    if (found === null) return notFound;

    const organizations =
      found.organizationId === null ? [] : await store.listOrganizations(municipality.id);
    const organization = organizations.find((entry) => entry.id === found.organizationId) ?? null;

    // The programme, for an event that has one. Read directly rather than
    // through the calendar index, because this page already knows the event is
    // visible and wants the lines of that one event rather than of the town.
    const activities = await store.listActivitiesOfEvent(municipality.id, found.id);

    return {
      statusCode: 200,
      headers: HTML_HEADERS,
      body: renderEventPage({ municipality, event: found, organization, activities, siteUrl }),
    };
  } catch (thrown) {
    const refused = refusal(thrown);

    if (refused !== null) return refused;

    throw thrown;
  }
}

let store: PublicStore | null = null;

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    store ??= createPublicStore(createStoreClient(), tableName());

    // Where this page is served from, for the canonical and Open Graph URLs. Set
    // to the CloudFront domain until there is a domain of our own.
    const siteUrl = process.env['SITE_URL'] ?? '';

    return route(event, store, siteUrl);
  });
