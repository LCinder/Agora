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

export async function route(
  event: ApiEvent,
  dependencies: DeviceApiDependencies,
): Promise<ApiResult> {
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

      await store.markInterest(municipalityId, pathParameter(event, 'eventId'));

      return noContent();
    }

    case 'DELETE /me/interests/{eventId}': {
      const municipalityId = municipalityFrom(event);

      if (municipalityId === null) return badRequest('Falta municipalityId.');

      await store.unmarkInterest(municipalityId, pathParameter(event, 'eventId'));

      return noContent();
    }

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
