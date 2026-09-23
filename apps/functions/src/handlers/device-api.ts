import { isExpoPushToken } from '@agora/push';
import { type StoreClient, createDeviceStore, createStoreClient } from '@agora/store';

import {
  type ApiEvent,
  type ApiResult,
  badRequest,
  error,
  handle,
  noContent,
  ok,
  pathParameter,
  refusal,
  tableName,
} from '../lib/http';
import { mintDeviceToken, newDeviceId } from '../lib/device-token';
import { readSecret } from '../lib/secrets';

/**
 * The only thing a resident writes: that an event interests them.
 *
 * Registering is public, because it is how a device gets the token every other
 * route here requires. What comes back is an identifier we invented and a
 * signature — no account, no email, nothing asked of the person holding the
 * phone (D-029).
 *
 * The municipality travels in the query string rather than being looked up,
 * because the mark itself is stored under the device and has to name the
 * municipality it belongs to: a resident can follow more than one town.
 */
export interface DeviceApiDependencies {
  client: StoreClient;
  table: string;
  signingSecret: string;
  /** The device the authorizer vouched for, or null on a public route. */
  deviceId: string | null;
}

function municipalityFrom(event: ApiEvent): string | null {
  const value = event.queryStringParameters?.['municipalityId'];

  return value === undefined || value === '' ? null : value;
}

/**
 * The event a marked activity belongs to.
 *
 * It travels with the request because the counter the mark moves lives on the
 * activity's row, and that row is keyed by its event as well as itself. Asking
 * the phone for it costs a query string parameter; looking it up here would cost
 * a read of every programme in the town.
 */
function eventFrom(event: ApiEvent): string | null {
  const value = event.queryStringParameters?.['eventId'];

  return value === undefined || value === '' ? null : value;
}

export async function route(
  event: ApiEvent,
  dependencies: DeviceApiDependencies,
): Promise<ApiResult> {
  try {
    return await dispatch(event, dependencies);
  } catch (thrown) {
    // A refusal is an answer: that event does not exist, that mark is not yours.
    const refused = refusal(thrown);

    if (refused !== null) return refused;

    throw thrown;
  }
}

async function dispatch(event: ApiEvent, dependencies: DeviceApiDependencies): Promise<ApiResult> {
  const { client, table, signingSecret, deviceId } = dependencies;

  if (event.routeKey === 'POST /devices') {
    let platform = 'web';
    let locale = 'es';

    if (event.body !== undefined && event.body !== null && event.body !== '') {
      try {
        const body = JSON.parse(event.body) as { platform?: unknown; locale?: unknown };

        if (body.platform === 'ios' || body.platform === 'android' || body.platform === 'web') {
          platform = body.platform;
        }

        if (typeof body.locale === 'string' && body.locale !== '') locale = body.locale;
      } catch {
        return badRequest('El cuerpo tiene que ser JSON.');
      }
    }

    const id = newDeviceId();

    await createDeviceStore(client, table, id).register({
      platform: platform as 'ios' | 'android' | 'web',
      locale,
    });

    return ok({ deviceId: id, token: mintDeviceToken(id, signingSecret) });
  }

  // Everything below is behind the device authorizer, so a missing device means
  // the authorizer let something through that it should not have.
  if (deviceId === null) {
    return error(401, 'unauthenticated', 'Falta el testigo del dispositivo.');
  }

  const store = createDeviceStore(client, table, deviceId);

  switch (event.routeKey) {
    case 'GET /me/interests':
      return ok(await store.listInterests());

    case 'PUT /me/interests/{eventId}': {
      const municipalityId = municipalityFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');

      // Marking an event in a town is following that town, whether or not the
      // resident ever chose it from the list: somebody who arrived through a
      // shared link is one of that municipality's neighbours too.
      await store.follow(municipalityId);
      await store.markInterest(municipalityId, pathParameter(event, 'eventId'));

      return noContent();
    }

    /**
     * Marking one line of a programme.
     *
     * Its own pair of routes rather than an argument on the two above, because a
     * mark on an activity is a different row, a different counter and a different
     * reminder. Marking one is following the town for the same reason marking an
     * event is: somebody who came in through a shared link and marked the
     * falconry show is one of that municipality's neighbours.
     */
    case 'PUT /me/activity-interests/{activityId}': {
      const municipalityId = municipalityFrom(event);
      const eventId = eventFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');
      if (eventId === null) return badRequest('Falta eventId.');

      await store.follow(municipalityId);
      await store.markActivityInterest(municipalityId, eventId, pathParameter(event, 'activityId'));

      return noContent();
    }

    case 'DELETE /me/activity-interests/{activityId}': {
      const municipalityId = municipalityFrom(event);
      const eventId = eventFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');
      if (eventId === null) return badRequest('Falta eventId.');

      await store.unmarkActivityInterest(
        municipalityId,
        eventId,
        pathParameter(event, 'activityId'),
      );

      return noContent();
    }

    // Choosing a municipality in the app. Nothing personal is written: one row
    // saying a phone follows a town, and one more on that town's counter.
    case 'PUT /me/municipalities/{municipalityId}':
      await store.follow(pathParameter(event, 'municipalityId'));

      return noContent();

    // Opening an event. The app only sends this the first time a phone opens a
    // given event on a given day, and the store refuses it a second time
    // anyway, so the number the town hall reads is openings and not taps.
    case 'PUT /me/views/{eventId}': {
      const municipalityId = municipalityFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');

      await store.recordView(municipalityId, pathParameter(event, 'eventId'));

      return noContent();
    }

    case 'DELETE /me/interests/{eventId}': {
      const municipalityId = municipalityFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');

      await store.unmarkInterest(municipalityId, pathParameter(event, 'eventId'));

      return noContent();
    }

    case 'PUT /me/push-token': {
      let token: unknown;

      try {
        token = (JSON.parse(event.body ?? '{}') as { token?: unknown }).token;
      } catch {
        return badRequest('El cuerpo tiene que ser JSON.');
      }

      // Checked here rather than taken on trust: a value that is not an Expo
      // token is a message the job will build, send and have refused, every time
      // it runs, for as long as the row exists.
      if (typeof token !== 'string' || !isExpoPushToken(token)) {
        return badRequest('Ese testigo de notificaciones no vale.');
      }

      await store.setPushToken(token);

      return noContent();
    }

    case 'DELETE /me/push-token':
      await store.setPushToken(null);

      return noContent();

    // "Borrar mis datos", from Settings. The token the app is holding stops
    // meaning anything the moment this returns: the device it named is gone.
    case 'DELETE /me':
      await store.forget();

      return noContent();

    default:
      return error(404, 'not_found', 'Esa ruta no existe.');
  }
}

/** What the authorizer put in the request context. */
export function deviceFromContext(event: ApiEvent): string | null {
  const context = (
    event.requestContext as {
      authorizer?: { lambda?: Record<string, unknown> };
    }
  ).authorizer?.lambda;

  const value = context?.['deviceId'];

  return typeof value === 'string' && value !== '' ? value : null;
}

let client: StoreClient | null = null;

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    client ??= createStoreClient();

    const parameter = process.env['DEVICE_TOKEN_PARAMETER'];

    if (parameter === undefined || parameter === '') {
      throw new Error('DEVICE_TOKEN_PARAMETER is not set.');
    }

    return route(event, {
      client,
      table: tableName(),
      signingSecret: await readSecret(parameter),
      deviceId: deviceFromContext(event),
    });
  });
