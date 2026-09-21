import { describe, expect, it } from 'vitest';

import {
  TOKEN_LIFETIME_SECONDS,
  mintDeviceToken,
  newDeviceId,
  tokenFromHeader,
  verifyDeviceToken,
} from './device-token';

const SECRET = 'a-secret-long-enough-to-be-a-secret';

describe('the device token', () => {
  it('round trips the device id', () => {
    const id = newDeviceId();
    const token = mintDeviceToken(id, SECRET);

    expect(verifyDeviceToken(token, SECRET)).toBe(id);
  });

  it('carries nothing but the id, the expiry and the signature', () => {
    const token = mintDeviceToken('device-one', SECRET);
    const [version, deviceId, expiry, signature] = token.split('.');

    expect(version).toBe('v1');
    expect(deviceId).toBe('device-one');
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(signature).toMatch(/^[\w-]+$/);
    expect(token.split('.')).toHaveLength(4);
  });

  it('rejects a token signed with another key', () => {
    const token = mintDeviceToken('device-one', SECRET);

    expect(verifyDeviceToken(token, 'another-secret-entirely')).toBeNull();
  });

  it('rejects a tampered device id', () => {
    const token = mintDeviceToken('device-one', SECRET);
    const forged = token.replace('device-one', 'device-two');

    expect(verifyDeviceToken(forged, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = mintDeviceToken('device-one', SECRET, new Date('2026-01-01T00:00:00Z'));
    const later = new Date('2026-01-01T00:00:00Z');
    later.setSeconds(later.getSeconds() + TOKEN_LIFETIME_SECONDS + 1);

    expect(verifyDeviceToken(token, SECRET, later)).toBeNull();
  });

  it('rejects nonsense', () => {
    for (const nonsense of ['', 'v1', 'v1.device.123', 'v2.device.999999999999.sig', 'a.b.c.d']) {
      expect(verifyDeviceToken(nonsense, SECRET)).toBeNull();
    }
  });
});

describe('the Authorization header', () => {
  it('accepts a bearer token and a bare one', () => {
    expect(tokenFromHeader('Bearer abc')).toBe('abc');
    expect(tokenFromHeader('bearer  abc ')).toBe('abc');
    expect(tokenFromHeader('abc')).toBe('abc');
  });

  it('says nothing when there is nothing', () => {
    expect(tokenFromHeader(undefined)).toBeNull();
    expect(tokenFromHeader('   ')).toBeNull();
  });
});
