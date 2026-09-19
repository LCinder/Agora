import {
  type LivePosition,
  type LiveSession,
  type Route,
  distanceInKm,
  liveSessionSchema,
  livePositionSchema,
  routeSchema,
} from '@agora/core';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import { POSITION_PREFIX, eventKey, liveCodeKey, livePositionKey, liveSessionKey } from './keys';
import type { StaffActor } from './staff-store';

/**
 * Live tracking: the procession on a map, while it is happening.
 *
 * This is the feature that gets the app opened by half a town on one afternoon,
 * and the one with the sharpest privacy edge in the product: it is the only place
 * where somebody's location is recorded at all. So the rules are narrow and they
 * are here rather than in a handler:
 *
 *   * A volunteer emits for **one session** and nothing else. The event is in
 *     their token, never in the request, so there is no shape of call that writes
 *     somewhere else.
 *   * Every position carries a TTL, so DynamoDB removes it whether or not anybody
 *     remembers to.
 *   * Ending a session **deletes the detailed trail** and keeps a simplified
 *     route. That is the GDPR promise the product document makes (section 7.4),
 *     and it is a delete rather than an expiry because "it will be gone within two
 *     days" is not what it says.
 */

/** Unambiguous on a phone screen and over the telephone: no O/0, no I/1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** A code nobody redeems stops existing. Long enough for a fiesta afternoon. */
const CODE_LIFETIME_HOURS = 12;

/** How long a position may sit in the table before DynamoDB removes it. */
const POSITION_LIFETIME_HOURS = 6;

/** Points closer together than this add nothing to a route anybody looks at. */
const SIMPLIFY_METRES = 25;

/** A ceiling, because an item has to stay well under DynamoDB's size limit. */
const SIMPLIFIED_MAX_POINTS = 500;

export interface LiveSessionWithCode extends LiveSession {
  /** Only municipal staff ever see this. */
  volunteerCode: string | null;
  simplifiedRoute: Route | null;
  lastPositionAt: Date | null;
}

export interface LiveStore {
  get(eventId: string): Promise<LiveSessionWithCode | null>;
  /** Creates or replaces the session of an event, and mints a fresh code. */
  schedule(
    eventId: string,
    options?: { plannedRoute?: Route | null },
  ): Promise<LiveSessionWithCode>;
  start(eventId: string): Promise<LiveSessionWithCode>;
  pause(eventId: string): Promise<LiveSessionWithCode>;
  /** Ends it, deletes the detailed trail and keeps a simplified route. */
  end(eventId: string): Promise<LiveSessionWithCode>;
}

export function newVolunteerCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function toSession(item: Record<string, unknown>): LiveSessionWithCode {
  const session = liveSessionSchema.parse(item);
  const code = item['volunteerCode'];
  const simplified = item['simplifiedRoute'];
  const last = item['lastPositionAt'];

  return {
    ...session,
    volunteerCode: typeof code === 'string' ? code : null,
    simplifiedRoute:
      simplified === null || simplified === undefined ? null : routeSchema.parse(simplified),
    lastPositionAt: typeof last === 'string' ? new Date(last) : null,
  };
}

function hoursFromNow(hours: number): number {
  return Math.floor(Date.now() / 1000) + hours * 3600;
}

/**
 * The trail, with the points that say nothing taken out.
 *
 * Not a real line simplification: a distance threshold walking forwards, which for
 * a procession at walking pace is the same answer for a tenth of the code. The
 * first and last points are always kept, because where it started and where it
 * finished are the two anybody asks about.
 */
export function simplifyTrail(positions: readonly LivePosition[]): Route | null {
  if (positions.length < 2) return null;

  const kept: LivePosition[] = [positions[0]!];

  for (const position of positions.slice(1, -1)) {
    const previous = kept[kept.length - 1]!;
    const metres = distanceInKm(previous, position) * 1000;

    if (metres >= SIMPLIFY_METRES) kept.push(position);
  }

  kept.push(positions[positions.length - 1]!);

  const trimmed =
    kept.length <= SIMPLIFIED_MAX_POINTS
      ? kept
      : kept.filter((_, index) => index % Math.ceil(kept.length / SIMPLIFIED_MAX_POINTS) === 0);

  return {
    type: 'LineString',
    coordinates: trimmed.map((position) => [position.longitude, position.latitude]),
  };
}

export function createLiveStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): LiveStore {
  const municipalityId = actor.municipalityId;

  function assertMunicipal(): void {
    if (actor.role !== 'municipal_editor' && actor.role !== 'municipal_admin') {
      throw forbidden('El directo lo gestiona el ayuntamiento.');
    }
  }

  /**
   * The event, read through this actor's municipality.
   *
   * A session lives under `EVT#<id>`, a partition that does not name a
   * municipality, so this read is what keeps one town hall out of another's live
   * tracking.
   */
  async function assertOwnEvent(eventId: string): Promise<void> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: eventKey(municipalityId, eventId),
        ProjectionExpression: 'pk',
      }),
    );

    if (result.Item === undefined) throw notFound('Ese evento no existe en este municipio.');
  }

  async function read(eventId: string): Promise<LiveSessionWithCode | null> {
    const result = await client.send(
      new GetCommand({ TableName: tableName, Key: liveSessionKey(eventId) }),
    );

    if (result.Item === undefined) return null;

    const session = toSession(result.Item);

    return session.municipalityId === municipalityId ? session : null;
  }

  async function positions(eventId: string): Promise<LivePosition[]> {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': POSITION_PREFIX },
      }),
    );

    return (result.Items ?? []).map((item) => livePositionSchema.parse(item));
  }

  async function setStatus(
    eventId: string,
    status: LiveSession['status'],
    extra: Record<string, unknown> = {},
  ): Promise<LiveSessionWithCode> {
    assertMunicipal();

    const session = await read(eventId);

    if (session === null) throw notFound('Ese evento no tiene directo.');

    const values: Record<string, unknown> = { ':status': status, ...extra };
    const sets = [
      '#status = :status',
      ...Object.keys(extra).map((key) => `${key.slice(1)} = ${key}`),
    ];

    const result = await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: liveSessionKey(eventId),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    return toSession(result.Attributes ?? {});
  }

  return {
    async get(eventId) {
      assertMunicipal();

      return read(eventId);
    },

    async schedule(eventId, options = {}) {
      assertMunicipal();
      await assertOwnEvent(eventId);

      const existing = await read(eventId);

      // A code only ever belongs to one session. Minting a new one has to take the
      // old one out of circulation, or an old QR code printed on a poster would
      // still work.
      if (existing?.volunteerCode != null) {
        await client
          .send(
            new DeleteCommand({ TableName: tableName, Key: liveCodeKey(existing.volunteerCode) }),
          )
          .catch(() => undefined);
      }

      const code = newVolunteerCode();
      const session: LiveSessionWithCode = {
        id: existing?.id ?? crypto.randomUUID(),
        eventId,
        municipalityId,
        status: 'scheduled',
        plannedRoute: options.plannedRoute ?? existing?.plannedRoute ?? null,
        startedAt: null,
        endedAt: null,
        volunteerCode: code,
        simplifiedRoute: existing?.simplifiedRoute ?? null,
        lastPositionAt: null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...liveSessionKey(eventId),
            entity: 'live_session',
            ...session,
            startedAt: null,
            endedAt: null,
            lastPositionAt: null,
          },
        }),
      );

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...liveCodeKey(code),
            entity: 'live_code',
            code,
            eventId,
            municipalityId,
            expiresAt: hoursFromNow(CODE_LIFETIME_HOURS),
          },
        }),
      );

      // The app decides whether to show a "Ver en directo" button from the event
      // itself, so the flag lives there.
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          UpdateExpression: 'SET liveTrackingEnabled = :on',
          ExpressionAttributeValues: { ':on': true },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      return session;
    },

    start(eventId) {
      return setStatus(eventId, 'active', { ':startedAt': new Date().toISOString() });
    },

    pause(eventId) {
      return setStatus(eventId, 'paused');
    },

    async end(eventId) {
      assertMunicipal();

      const session = await read(eventId);

      if (session === null) throw notFound('Ese evento no tiene directo.');

      const trail = await positions(eventId);
      const simplified = simplifyTrail(trail);

      // The detailed trail goes now, not whenever the TTL gets around to it. What
      // stays is a line on a map with no timestamps: enough to say where the
      // procession went, nothing about who was carrying the phone.
      for (const position of trail) {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: livePositionKey(eventId, position.recordedAt),
          }),
        );
      }

      if (session.volunteerCode !== null) {
        await client
          .send(
            new DeleteCommand({ TableName: tableName, Key: liveCodeKey(session.volunteerCode) }),
          )
          .catch(() => undefined);
      }

      const result = await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: liveSessionKey(eventId),
          UpdateExpression:
            'SET #status = :status, endedAt = :endedAt, simplifiedRoute = :route REMOVE volunteerCode',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'ended',
            ':endedAt': new Date().toISOString(),
            ':route': simplified,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      return toSession(result.Attributes ?? {});
    },
  };
}

// ---------------------------------------------------------------------------
// The volunteer
// ---------------------------------------------------------------------------

export interface RedeemedCode {
  eventId: string;
  municipalityId: string;
}

export interface VolunteerStore {
  /** Single use: the code is gone once it has been exchanged. */
  redeem(code: string): Promise<RedeemedCode>;
  /** The event comes from the caller's token, never from the request body. */
  record(eventId: string, position: Omit<LivePosition, 'recordedAt'>): Promise<LivePosition>;
}

export function createVolunteerStore(client: StoreClient, tableName: string): VolunteerStore {
  return {
    async redeem(code) {
      const key = liveCodeKey(code);
      const found = await client.send(new GetCommand({ TableName: tableName, Key: key }));

      if (found.Item === undefined) throw notFound('Ese código no vale.');

      // Single use, as the product document asks. A volunteer whose phone dies asks
      // the town hall for another one, which is a ten second conversation and the
      // price of a code that cannot be passed around.
      await client.send(new DeleteCommand({ TableName: tableName, Key: key }));

      return {
        eventId: String(found.Item['eventId']),
        municipalityId: String(found.Item['municipalityId']),
      };
    },

    async record(eventId, position) {
      const session = await client.send(
        new GetCommand({ TableName: tableName, Key: liveSessionKey(eventId) }),
      );

      if (session.Item === undefined) throw notFound('Ese directo no existe.');

      const status = String(session.Item['status']);

      // Paused means the volunteer pressed pause, or the town hall did. Either way
      // the phone should stop sending, and if it does not, nothing is recorded.
      if (status !== 'active') throw forbidden('Ese directo no está emitiendo.');

      const recordedAt = new Date();
      const recorded: LivePosition = { ...position, recordedAt };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...livePositionKey(eventId, recordedAt),
            entity: 'live_position',
            ...recorded,
            recordedAt: recordedAt.toISOString(),
            // Belt to the explicit delete's braces: even if a session is never
            // ended, no position outlives the afternoon.
            expiresAt: hoursFromNow(POSITION_LIFETIME_HOURS),
          },
        }),
      );

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: liveSessionKey(eventId),
          UpdateExpression: 'SET lastPositionAt = :at',
          ExpressionAttributeValues: { ':at': recordedAt.toISOString() },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      return recorded;
    },
  };
}

// ---------------------------------------------------------------------------
// What a resident sees
// ---------------------------------------------------------------------------

export interface LiveView {
  status: LiveSession['status'];
  /** The latest position, or null when none has arrived yet. */
  position: LivePosition | null;
  plannedRoute: Route | null;
  /** Kept after the event, for anybody opening the page later. */
  simplifiedRoute: Route | null;
}

export interface LiveReader {
  live(eventId: string): Promise<LiveView | null>;
}

export function createLiveReader(client: StoreClient, tableName: string): LiveReader {
  return {
    async live(eventId) {
      const session = await client.send(
        new GetCommand({ TableName: tableName, Key: liveSessionKey(eventId) }),
      );

      if (session.Item === undefined) return null;

      const parsed = toSession(session.Item);

      // The newest position, and only that one: a resident's map shows where the
      // procession is, and the trail is nobody's business while it is happening.
      const latest = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': POSITION_PREFIX },
          ScanIndexForward: false,
          Limit: 1,
        }),
      );

      const item = (latest.Items ?? [])[0];

      return {
        status: parsed.status,
        position: item === undefined ? null : livePositionSchema.parse(item),
        plannedRoute: parsed.plannedRoute,
        simplifiedRoute: parsed.simplifiedRoute,
      };
    },
  };
}
