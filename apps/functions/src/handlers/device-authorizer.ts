import { tokenFromHeader, verifyDeviceToken } from '../lib/device-token';
import { readSecret } from '../lib/secrets';

/**
 * Checks the token a device presents, and says who it is.
 *
 * API Gateway caches the answer for an hour, so this runs far less often than
 * the routes it guards: a device identity does not change, and a cache hit is an
 * invocation that never happens.
 *
 * It answers false for everything it cannot verify, including its own failures.
 * An authorizer that fails open is worse than one that is down.
 */
export interface AuthorizerEvent {
  headers?: Record<string, string | undefined> | undefined;
}

export interface AuthorizerResult {
  isAuthorized: boolean;
  context?: { deviceId: string };
}

export async function authorize(
  event: AuthorizerEvent,
  secret: string,
  now: Date = new Date(),
): Promise<AuthorizerResult> {
  const header = event.headers?.['authorization'] ?? event.headers?.['Authorization'];
  const token = tokenFromHeader(header);

  if (token === null) return { isAuthorized: false };

  const deviceId = verifyDeviceToken(token, secret, now);

  return deviceId === null
    ? { isAuthorized: false }
    : { isAuthorized: true, context: { deviceId } };
}

export const handler = async (event: AuthorizerEvent): Promise<AuthorizerResult> => {
  const parameter = process.env['DEVICE_TOKEN_PARAMETER'];

  if (parameter === undefined || parameter === '') {
    console.error(JSON.stringify({ message: 'DEVICE_TOKEN_PARAMETER is not set' }));

    return { isAuthorized: false };
  }

  try {
    return await authorize(event, await readSecret(parameter));
  } catch (thrown) {
    console.error(
      JSON.stringify({
        message: 'authorizer_failed',
        error: thrown instanceof Error ? thrown.message : String(thrown),
      }),
    );

    return { isAuthorized: false };
  }
};
