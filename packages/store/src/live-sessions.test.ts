import { isPositionStale } from '@agora/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { StoreError } from './errors';
import { livePositionKey, liveSessionKey } from './keys';
import {
  createLiveReader,
  createLiveStore,
  createVolunteerStore,
  newVolunteerCode,
  simplifyTrail,
} from './live-sessions';
import type { StaffActor } from './staff-store';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import { EVENTS, ZUBIA, createTable, dropTable, seed } from './testing/fixtures';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Live tracking, which is the only place in the product where somebody's location
 * is recorded at all.
 *
 * So the tests that matter are the ones about giving it back: that a volunteer can
 * only write to their own session, that a code works once, and that ending an event
 * deletes the trail rather than waiting for an expiry to get round to it.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-live-${process.pid}`;

const editor: StaffActor = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor',
  organizationId: null,
};

const association: StaffActor = {
  authUserId: 'auth-hermandad',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: 'org-hermandad',
};

const ROUTE = {
  type: 'LineString' as const,
  coordinates: [
    [-3.78, 37.1],
    [-3.781, 37.101],
  ] as [number, number][],
};

describe('the volunteer code', () => {
  it('avoids the characters people get wrong out loud', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(newVolunteerCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it('is not the same twice', () => {
    const codes = new Set(Array.from({ length: 200 }, () => newVolunteerCode()));

    expect(codes.size).toBe(200);
  });
});

describe('simplifying a trail', () => {
  const at = (latitude: number, longitude: number, minute: number) => ({
    latitude,
    longitude,
    accuracyMeters: null,
    recordedAt: new Date(Date.UTC(2027, 3, 1, 18, minute)),
  });

  it('drops the points that say nothing and keeps the ends', () => {
    // Three readings from a phone standing still, then one 200 metres away.
    const trail = [
      at(37.1, -3.78, 0),
      at(37.1, -3.78, 1),
      at(37.1001, -3.78, 2),
      at(37.1018, -3.78, 3),
    ];
    const route = simplifyTrail(trail);

    expect(route?.type).toBe('LineString');
    expect(route?.coordinates).toEqual([
      [-3.78, 37.1],
      [-3.78, 37.1018],
    ]);
  });

  it('has nothing to say about a trail of one point', () => {
    expect(simplifyTrail([at(37.1, -3.78, 0)])).toBeNull();
    expect(simplifyTrail([])).toBeNull();
  });
});

describe.skipIf(local === null)('a live session', () => {
  let client: StoreClient;

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  const staff = () => createLiveStore(client, TABLE, editor);
  const volunteer = () => createVolunteerStore(client, TABLE);
  const resident = () => createLiveReader(client, TABLE);

  it('is scheduled by the town hall, with a code and the planned route', async () => {
    const session = await staff().schedule(EVENTS.zubiaPublished, { plannedRoute: ROUTE });

    expect(session.status).toBe('scheduled');
    expect(session.volunteerCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(session.plannedRoute).toEqual(ROUTE);

    // And the event says so, which is what puts the button in the app.
    const event = await client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk: `MUN#${ZUBIA}`, sk: `EVT#${EVENTS.zubiaPublished}` },
      }),
    );

    expect(event.Item?.['liveTrackingEnabled']).toBe(true);
  });

  it('is not an association to schedule or to end', async () => {
    const theirs = createLiveStore(client, TABLE, association);

    await expect(theirs.schedule(EVENTS.zubiaPublished)).rejects.toThrow(StoreError);
    await expect(theirs.end(EVENTS.zubiaPublished)).rejects.toThrow(StoreError);
    await expect(theirs.get(EVENTS.zubiaPublished)).rejects.toThrow(StoreError);
  });

  it('cannot be scheduled on another municipality event', async () => {
    await expect(staff().schedule(EVENTS.oturaPublished)).rejects.toThrow(StoreError);
  });

  it('records nothing until the town hall starts it', async () => {
    await expect(
      volunteer().record(EVENTS.zubiaPublished, {
        latitude: 37.1,
        longitude: -3.78,
        accuracyMeters: 8,
      }),
    ).rejects.toThrow(StoreError);
  });

  it('gives a resident the position once it is emitting', async () => {
    await staff().start(EVENTS.zubiaPublished);
    await volunteer().record(EVENTS.zubiaPublished, {
      latitude: 37.1,
      longitude: -3.78,
      accuracyMeters: 8,
    });

    const view = await resident().live(EVENTS.zubiaPublished);

    expect(view?.status).toBe('active');
    expect(view?.position?.latitude).toBe(37.1);
    expect(view?.position?.recordedAt).toBeInstanceOf(Date);
    expect(view?.plannedRoute).toEqual(ROUTE);
    expect(isPositionStale(view!.position!, new Date())).toBe(false);
  });

  it('shows only the newest position, never the trail', async () => {
    for (const latitude of [37.101, 37.102, 37.103]) {
      await volunteer().record(EVENTS.zubiaPublished, {
        latitude,
        longitude: -3.78,
        accuracyMeters: 8,
      });
    }

    const view = await resident().live(EVENTS.zubiaPublished);

    expect(view?.position?.latitude).toBe(37.103);
    expect(Object.keys(view ?? {})).toEqual([
      'status',
      'position',
      'plannedRoute',
      'simplifiedRoute',
    ]);
  });

  it('gives every position a time to live, so nothing outlives the afternoon', async () => {
    const stored = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `EVT#${EVENTS.zubiaPublished}`, ':prefix': 'POS#' },
      }),
    );

    expect((stored.Items ?? []).length).toBeGreaterThan(0);
    expect(
      (stored.Items ?? []).every((item) => Number(item['expiresAt']) > Date.now() / 1000),
    ).toBe(true);
  });

  it('stops recording while it is paused', async () => {
    await staff().pause(EVENTS.zubiaPublished);

    await expect(
      volunteer().record(EVENTS.zubiaPublished, {
        latitude: 37.104,
        longitude: -3.78,
        accuracyMeters: 8,
      }),
    ).rejects.toThrow(StoreError);

    await staff().start(EVENTS.zubiaPublished);
  });

  it('exchanges a code once, and never again', async () => {
    const session = await staff().schedule(EVENTS.zubiaCancelled);
    const code = session.volunteerCode!;

    const redeemed = await volunteer().redeem(code);

    expect(redeemed.eventId).toBe(EVENTS.zubiaCancelled);
    expect(redeemed.municipalityId).toBe(ZUBIA);

    await expect(volunteer().redeem(code)).rejects.toThrow(StoreError);
    await expect(volunteer().redeem('AAAAAAAA')).rejects.toThrow(StoreError);
  });

  it('deletes the detailed trail when the event ends, and keeps the line', async () => {
    const before = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `EVT#${EVENTS.zubiaPublished}`, ':prefix': 'POS#' },
      }),
    );

    expect((before.Items ?? []).length).toBeGreaterThan(1);

    const ended = await staff().end(EVENTS.zubiaPublished);

    expect(ended.status).toBe('ended');
    expect(ended.endedAt).toBeInstanceOf(Date);
    expect(ended.simplifiedRoute?.type).toBe('LineString');

    const after = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `EVT#${EVENTS.zubiaPublished}`, ':prefix': 'POS#' },
      }),
    );

    // Gone now, not "expiring within two days", which is what the promise says.
    expect(after.Items ?? []).toHaveLength(0);
  });

  it('takes the code out of circulation when it ends', async () => {
    const session = await client.send(
      new GetCommand({ TableName: TABLE, Key: liveSessionKey(EVENTS.zubiaPublished) }),
    );

    expect(session.Item?.['volunteerCode']).toBeUndefined();
  });

  it('refuses to record on a session that does not exist', async () => {
    await expect(
      volunteer().record('evt-nope', { latitude: 37.1, longitude: -3.78, accuracyMeters: null }),
    ).rejects.toThrow(StoreError);

    expect(await resident().live('evt-nope')).toBeNull();
  });

  it('still shows the route to somebody opening it the next day', async () => {
    const view = await resident().live(EVENTS.zubiaPublished);

    expect(view?.status).toBe('ended');
    expect(view?.position).toBeNull();
    expect(view?.simplifiedRoute?.coordinates.length).toBeGreaterThan(1);
  });

  it('writes a position under the key its time says', async () => {
    await staff().schedule(EVENTS.penaPending);
    await staff().start(EVENTS.penaPending);

    const recorded = await volunteer().record(EVENTS.penaPending, {
      latitude: 37.2,
      longitude: -3.7,
      accuracyMeters: null,
    });

    const item = await client.send(
      new GetCommand({
        TableName: TABLE,
        Key: livePositionKey(EVENTS.penaPending, recorded.recordedAt),
      }),
    );

    expect(item.Item?.['latitude']).toBe(37.2);
  });
});
