import {
  type LiveReader,
  type PublicStore,
  createLiveReader,
  createPublicStore,
  createStoreClient,
} from '@agora/store';

import {
  type ApiEvent,
  type ApiResult,
  badRequest,
  handle,
  notFound,
  ok,
  pathParameter,
  refusal,
  tableName,
} from '../lib/http';

/**
 * What a resident reads: the municipality list, a calendar, one event.
 *
 * No authorizer sits in front of this, on purpose. The calendar of a town is
 * public the same way a poster on a wall is, and asking a neighbour to identify
 * themselves to read it would be both rude and a lie about what we need.
 *
 * Most requests never arrive here at all: CloudFront caches these paths for a
 * minute (and the live one for five seconds), which is what makes a procession
 * with five thousand people watching cost nothing (D-028).
 *
 * The store this uses cannot return a draft or an event waiting for approval —
 * not by filtering afterwards, but because those are not in the index it reads.
 */
/**
 * Everything a resident's request can read: the calendar, and the live map.
 *
 * Two stores rather than one because the IAM policy is the same but the reasons
 * are not — one reads events, the other reads a session and its last position —
 * and keeping them apart means the live one can move to its own function the day
 * a procession makes that worth doing.
 */
export type PublicReadable = PublicStore & LiveReader;

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (value === undefined || value === '') return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid ${name}`);
  }

  return date;
}

export async function route(event: ApiEvent, store: PublicReadable): Promise<ApiResult> {
  try {
    return await dispatch(event, store);
  } catch (thrown) {
    // A missing path parameter is a refusal, not a crash.
    const refused = refusal(thrown);

    if (refused !== null) return refused;

    throw thrown;
  }
}

async function dispatch(event: ApiEvent, store: PublicReadable): Promise<ApiResult> {
  switch (event.routeKey) {
    case 'GET /municipalities':
      return ok(await store.listMunicipalities());

    case 'GET /municipalities/{slug}': {
      const municipality = await store.getMunicipalityBySlug(pathParameter(event, 'slug'));

      return municipality === null
        ? notFound('Ese municipio no está en la app.')
        : ok(municipality);
    }

    case 'GET /municipalities/{municipalityId}/events': {
      const municipalityId = pathParameter(event, 'municipalityId');

      let from: Date | undefined;
      let to: Date | undefined;

      try {
        from = parseDate(event.queryStringParameters?.['from'], 'from');
        to = parseDate(event.queryStringParameters?.['to'], 'to');
      } catch {
        return badRequest('Las fechas from y to tienen que ser ISO 8601.');
      }

      return ok(
        await store.listCalendar(municipalityId, {
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
        }),
      );
    }

    case 'GET /municipalities/{municipalityId}/categories':
      return ok(await store.listCategories(pathParameter(event, 'municipalityId')));

    case 'GET /municipalities/{municipalityId}/organizations':
      return ok(await store.listOrganizations(pathParameter(event, 'municipalityId')));

    case 'GET /municipalities/{municipalityId}/events/{eventId}': {
      const found = await store.getVisibleEvent(
        pathParameter(event, 'municipalityId'),
        pathParameter(event, 'eventId'),
      );

      // A draft and a non-existent event answer the same thing. Anything else
      // would turn this endpoint into a way to find out what the town hall is
      // preparing.
      return found === null ? notFound('Ese evento no existe o no está publicado.') : ok(found);
    }

    /**
     * The one endpoint that is polled rather than read once.
     *
     * CloudFront caches it for five seconds, so five thousand neighbours watching
     * a procession reach this function about once every five seconds (D-028). It
     * answers the newest position and never the trail, and the app decides whether
     * to trust it: the position carries when it was recorded, and a map that shows
     * a four-minute-old dot as if it were live is worse than one that says so.
     */
    case 'GET /live/{eventId}': {
      const live = await store.live(pathParameter(event, 'eventId'));

      return live === null ? notFound('Ese evento no tiene directo.') : ok(live);
    }

    default:
      return notFound('Esa ruta no existe.');
  }
}

let store: PublicReadable | null = null;

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    // Built once per container: the client keeps its connections warm between
    // requests, which is most of the latency of a small read.
    if (store === null) {
      const client = createStoreClient();
      const table = tableName();

      store = { ...createPublicStore(client, table), ...createLiveReader(client, table) };
    }

    return route(event, store);
  });
