import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * The token a resident's device carries.
 *
 * Residents are not in Cognito (D-029): everything they do is either reading
 * public data, which needs no identity at all, or marking an event, which needs
 * to know which device is asking and nothing else. So the token says exactly
 * that and is signed by us.
 *
 *   v1.<deviceId>.<expiry>.<signature>
 *
 * No name, no email, no telephone — there is nothing in it to leak, which is the
 * point of the whole privacy model and the first thing an auditor will look at.
 *
 * Losing the signing key is not an incident: every device quietly registers
 * again the next time it is opened, and nothing of value was in the token.
 */
const VERSION = 'v1';

/**
 * Six months. Long, because expiry here protects nothing much and a resident
 * being silently logged out of their own "Me interesa" list is a real annoyance;
 * short enough that a leaked token is not forever.
 */
export const TOKEN_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

export function newDeviceId(): string {
  return randomUUID();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function mintDeviceToken(deviceId: string, secret: string, now: Date = new Date()): string {
  const expiry = Math.floor(now.getTime() / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = `${VERSION}.${deviceId}.${expiry}`;

  return `${payload}.${sign(payload, secret)}`;
}

/**
 * The device id the token claims, or null.
 *
 * Null covers every way a token can be wrong — malformed, expired, signed with
 * another key — on purpose: the caller has nothing useful to do with the
 * difference, and telling an attacker which part they got right is free
 * information.
 */
export function verifyDeviceToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): string | null {
  const parts = token.trim().split('.');

  if (parts.length !== 4) return null;

  const [version, deviceId, expiry, signature] = parts as [string, string, string, string];

  if (version !== VERSION || deviceId === '' || !/^\d+$/.test(expiry)) return null;

  const expected = sign(`${version}.${deviceId}.${expiry}`, secret);
  const given = Buffer.from(signature);
  const mine = Buffer.from(expected);

  if (given.length !== mine.length || !timingSafeEqual(given, mine)) return null;

  if (Number(expiry) * 1000 <= now.getTime()) return null;

  return deviceId;
}

/** The token out of an Authorization header, whether or not it says Bearer. */
export function tokenFromHeader(header: string | undefined): string | null {
  if (header === undefined || header.trim() === '') return null;

  const value = header.trim();
  const bearer = /^bearer\s+(.+)$/i.exec(value);

  return bearer?.[1]?.trim() ?? value;
}
