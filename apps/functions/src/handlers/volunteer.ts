import { livePositionSchema } from '@agora/core';
import {
  type StoreClient,
  type VolunteerStore,
  createStoreClient,
  createVolunteerStore,
} from '@agora/store';
import { z } from 'zod';

import {
  type ApiEvent,
  type ApiResult,
  badRequest,
  error,
  handle,
  notFound,
  ok,
  refusal,
  tableName,
} from '../lib/http';
import { mintVolunteerToken, tokenFromHeader, verifyVolunteerToken } from '../lib/device-token';
import { readSecret } from '../lib/secrets';

/**
 * The volunteer who carries the phone in the procession.
 *
 * Two operations and nothing else: exchange the code the town hall gave you for a
 * token, and send a position.
 *
 * There is no authorizer in front of this, deliberately. An API Gateway authorizer
 * earns its keep by caching an answer across requests, and here it would not: a
 * position arrives every few seconds and each one is a write that has to happen
 * anyway, so the check costs the same inside the handler and saves a moving part
 * plus a second Lambda. Redeeming is public because the code **is** the credential.
 *
 * The event is never read from the body. It comes out of the token, which is what
 * makes a volunteer's token unable to touch another event's session.
 */
const redeemSchema = z.object({ code: z.string().min(4).max(32) });

const positionSchema = livePositionSchema.omit({ recordedAt: true });

export interface VolunteerDependencies {
  store: VolunteerStore;
  signingSecret: string;
}

export async function route(
  event: ApiEvent,
  dependencies: VolunteerDependencies,
): Promise<ApiResult> {
  const { store, signingSecret } = dependencies;
  const path = event.rawPath.replace(/^\/+|\/+$/g, '');
  const method = event.requestContext?.http?.method ?? 'POST';

  if (method !== 'POST') {
    return error(405, 'method_not_allowed', 'Esto se pide con POST.');
  }

  let body: unknown;

  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('El cuerpo tiene que ser JSON.');
  }

  try {
    if (path === 'volunteer/redeem') {
      const parsed = redeemSchema.safeParse(body);

      if (!parsed.success) return badRequest('Escribe el código que te ha dado el ayuntamiento.');

      const redeemed = await store.redeem(parsed.data.code);

      return ok({
        eventId: redeemed.eventId,
        municipalityId: redeemed.municipalityId,
        token: mintVolunteerToken(redeemed.eventId, signingSecret),
      });
    }

    if (path === 'volunteer/positions') {
      const token = tokenFromHeader(event.headers?.['authorization']);
      const eventId = token === null ? null : verifyVolunteerToken(token, signingSecret);

      if (eventId === null) {
        // Also what an expired token gets, which is the common case: the session
        // ran longer than the token. The app asks for a new code.
        return error(401, 'unauthenticated', 'Vuelve a introducir el código del directo.');
      }

      const parsed = positionSchema.safeParse(body);

      if (!parsed.success) return badRequest('Faltan la latitud y la longitud.');

      const recorded = await store.record(eventId, parsed.data);

      return ok(recorded);
    }

    return notFound('Esa ruta no existe.');
  } catch (thrown) {
    const refused = refusal(thrown);

    if (refused !== null) return refused;

    throw thrown;
  }
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
      store: createVolunteerStore(client, tableName()),
      // The same key that signs device tokens. They cannot be confused: the kind
      // is inside the payload and each verifier only accepts its own.
      signingSecret: await readSecret(parameter),
    });
  });
