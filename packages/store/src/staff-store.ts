import {
  type Event,
  type EventStatus,
  type Organization,
  organizationSchema,
  publishesWithoutReview,
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
import { eventWriteExpression, fromEventItem, interestCountOf, toEventItem } from './items';
import {
  CHANGE_PREFIX,
  REVIEW_INDEX,
  SK_PREFIX,
  eventKey,
  municipalityPk,
  organizationKey,
  pendingChangeKey,
  reviewIndexPk,
} from './keys';

/**
 * What municipal staff and associations can reach.
 *
 * The actor is not a suggestion: it is built from the membership row of the
 * table — never from the token, because a role belongs to a municipality and a
 * Cognito group knows nothing about municipalities (D-029) — and every method
 * here reads it. A store is created for one actor in one municipality, so there
 * is no method that could touch another municipality: the municipality is not a
 * parameter anywhere below.
 *
 * The rules this layer enforces, which are the ones the PostgreSQL draft
 * enforced with row level security:
 *
 *   * An association sees its own events plus what any resident can see. It does
 *     not see the town hall's drafts, nor another association's pending events.
 *   * An association cannot publish. If it could, the review queue would be
 *     decorative. The exception is an association the town hall marked as
 *     trusted, which is the town hall's decision and not the association's.
 *   * An association cannot approve, reject, or edit an event that is not its
 *     own.
 *   * Nobody here can read who is interested in an event. There is no method for
 *     it, and the IAM policy of this function denies the index that would answer
 *     it (D-032). The count comes off a counter on the event itself.
 */
export type StaffRole = 'org_editor' | 'municipal_editor' | 'municipal_admin';

export interface StaffActor {
  authUserId: string;
  municipalityId: string;
  role: StaffRole;
  /** Set for `org_editor`, and null for municipal staff. */
  organizationId: string | null;
}

export interface NewEvent {
  id: string;
  title: string;
  description?: string;
  categoryId: string;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  location: { name: string; latitude: number | null; longitude: number | null };
  imageUrl?: string | null;
  priceInfo?: string | null;
  isFree?: boolean;
  /** What the author asks for. An association does not get to ask for `published`. */
  status?: Extract<EventStatus, 'draft' | 'pending_review' | 'published'>;
  isFeatured?: boolean;
}

export interface EventPatch {
  title?: string;
  description?: string;
  categoryId?: string;
  startAt?: Date;
  endAt?: Date | null;
  location?: { name: string; latitude: number | null; longitude: number | null };
  priceInfo?: string | null;
  isFree?: boolean;
  isFeatured?: boolean;
}

/**
 * A change an association asked for on an event that is already published.
 *
 * The acceptance criterion this exists for is exact: an untrusted association
 * editing a published event sends the change back to review, and the published
 * version stays visible (project document, section 7.2). A neighbour who already
 * planned their evening around what the poster said must not see it change
 * because somebody is still editing.
 */
export interface PendingChange {
  id: string;
  eventId: string;
  municipalityId: string;
  organizationId: string | null;
  /** What was asked for, to be applied on approval. */
  payload: EventPatch;
  status: 'pending' | 'applied' | 'rejected';
  rejectionReason: string | null;
  createdBy: string;
  createdAt: Date;
}

/** An edit either happened or is waiting for the town hall. */
export type EditResult =
  { kind: 'applied'; event: Event } | { kind: 'queued'; change: PendingChange };

/** What the review inbox holds: new events, and changes to published ones. */
export type ReviewItem =
  { kind: 'event'; event: Event } | { kind: 'change'; change: PendingChange };

export interface StaffStore {
  listEvents(): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | null>;
  createEvent(input: NewEvent): Promise<Event>;
  updateEvent(eventId: string, patch: EventPatch): Promise<EditResult>;
  /** Municipal staff only. Events waiting for approval and changes to published ones. */
  reviewQueue(): Promise<ReviewItem[]>;
  approveEvent(eventId: string): Promise<Event>;
  rejectEvent(eventId: string, reason: string): Promise<Event>;
  cancelEvent(eventId: string): Promise<Event>;
  /**
   * Removes an event for good, with the changes anybody asked for on it.
   *
   * Cancelling is the right answer almost every time: a neighbour who planned
   * their evening around an event has to be told it is off, and one that simply
   * vanishes reads as a bug. This is for the other case — the duplicate, the
   * test entry, the concert typed into the wrong town — where leaving a
   * tombstone in the calendar would be worse than the mistake.
   *
   * So it is the town hall's, and an association may only delete its own event
   * while nobody has seen it: once something is published or cancelled, taking
   * it off the calendar is a municipal decision.
   */
  deleteEvent(eventId: string): Promise<void>;
  /** The changes asked for on one event, whatever their state. */
  listChanges(eventId: string): Promise<PendingChange[]>;
  approveChange(eventId: string, changeId: string): Promise<Event>;
  rejectChange(eventId: string, changeId: string, reason: string): Promise<PendingChange>;
  /** How many residents marked it. Never who. */
  interestCount(eventId: string): Promise<number>;
}

/**
 * A patch on its way into the table.
 *
 * DynamoDB has no date type, so the two dates a patch can carry become strings —
 * the same ISO strings the event itself is stored with, so a change that sat in
 * the queue for a week applies exactly as it would have on the day it was asked
 * for.
 */
function serialisePatch(patch: EventPatch): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...patch };

  if (patch.startAt !== undefined) raw['startAt'] = patch.startAt.toISOString();

  if (patch.endAt !== undefined) {
    raw['endAt'] = patch.endAt === null ? null : patch.endAt.toISOString();
  }

  return raw;
}

function revivePatch(raw: unknown): EventPatch {
  if (typeof raw !== 'object' || raw === null) return {};

  const stored = raw as Record<string, unknown>;
  const patch: EventPatch = {};

  for (const field of ['title', 'description', 'categoryId', 'priceInfo'] as const) {
    const value = stored[field];

    if (typeof value === 'string') patch[field] = value;
  }

  for (const field of ['isFree', 'isFeatured'] as const) {
    const value = stored[field];

    if (typeof value === 'boolean') patch[field] = value;
  }

  if (typeof stored['startAt'] === 'string') patch.startAt = new Date(stored['startAt']);

  if (stored['endAt'] === null) patch.endAt = null;
  else if (typeof stored['endAt'] === 'string') patch.endAt = new Date(stored['endAt']);

  const location = stored['location'];

  if (typeof location === 'object' && location !== null) {
    const shape = location as Record<string, unknown>;

    patch.location = {
      name: String(shape['name'] ?? ''),
      latitude: typeof shape['latitude'] === 'number' ? shape['latitude'] : null,
      longitude: typeof shape['longitude'] === 'number' ? shape['longitude'] : null,
    };
  }

  return patch;
}

function toPendingChange(item: Record<string, unknown>): PendingChange {
  const reason = item['rejectionReason'];

  return {
    id: String(item['id']),
    eventId: String(item['eventId']),
    municipalityId: String(item['municipalityId']),
    organizationId: item['organizationId'] === null ? null : String(item['organizationId']),
    payload: revivePatch(item['payload']),
    status: String(item['status']) as PendingChange['status'],
    rejectionReason: typeof reason === 'string' ? reason : null,
    createdBy: String(item['createdBy']),
    createdAt: new Date(String(item['createdAt'])),
  };
}

const isMunicipal = (actor: StaffActor): boolean =>
  actor.role === 'municipal_editor' || actor.role === 'municipal_admin';

export function createStaffStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): StaffStore {
  const municipalityId = actor.municipalityId;

  /** The event, or nothing — and nothing also covers "not yours to see". */
  async function readEvent(eventId: string): Promise<Event | null> {
    const result = await client.send(
      new GetCommand({ TableName: tableName, Key: eventKey(municipalityId, eventId) }),
    );

    if (result.Item === undefined) return null;

    const event = fromEventItem(result.Item);

    return canSee(event) ? event : null;
  }

  function canSee(event: Event): boolean {
    if (isMunicipal(actor)) return true;

    // An association: its own events, whatever their state, and anything a
    // resident could already see.
    return (
      event.organizationId === actor.organizationId ||
      event.status === 'published' ||
      event.status === 'cancelled'
    );
  }

  function canEdit(event: Event): boolean {
    if (isMunicipal(actor)) return true;

    return event.organizationId !== null && event.organizationId === actor.organizationId;
  }

  async function organization(): Promise<Organization | null> {
    if (actor.organizationId === null) return null;

    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: organizationKey(municipalityId, actor.organizationId),
      }),
    );

    return result.Item === undefined ? null : organizationSchema.parse(result.Item);
  }

  /**
   * Writes a changed event.
   *
   * An update and not a `Put` of the whole item, for one reason that matters:
   * the item also carries `interestCount`, which residents increment and this
   * layer must never know how to reset. Rewriting the item would set it back to
   * zero on every edit.
   *
   * The index attributes are recomputed from the new state and removed when the
   * state does not belong in an index. That single line is what moves an event
   * between the public calendar, the review queue and neither.
   */
  async function writeEvent(next: Event): Promise<Event> {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: eventKey(municipalityId, next.id),
        ...eventWriteExpression(next),
        // An edit, not a creation: an event that is not there is a bug in the
        // caller, not a row to invent.
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );

    if (next.isFeatured) await keepOnlyFeatured(next.id);

    return next;
  }

  /**
   * One event on the cover, and only one.
   *
   * The app draws the featured event of a block large, at the top, and a
   * calendar with three of them has no cover at all — it has a list with three
   * shouty rows. So featuring an event un-features whatever was there, and that
   * happens here rather than in the panel: a rule the client enforces is a rule
   * that holds until somebody opens a second tab.
   *
   * A query of the town's own events, which is a partition read of a few dozen
   * rows, and it only runs when something is being put on the cover — a handful
   * of times a year in a municipality.
   */
  async function keepOnlyFeatured(eventId: string): Promise<void> {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        FilterExpression: 'isFeatured = :featured',
        ExpressionAttributeValues: {
          ':pk': municipalityPk(municipalityId),
          ':prefix': SK_PREFIX.event,
          ':featured': true,
        },
        ProjectionExpression: 'id',
      }),
    );

    for (const item of result.Items ?? []) {
      const other = String(item['id']);

      if (other === eventId) continue;

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, other),
          UpdateExpression: 'SET isFeatured = :featured',
          ExpressionAttributeValues: { ':featured': false },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    }
  }

  /**
   * Whether this edit has to be looked at before the neighbours see it.
   *
   * Only in one case: an association without trust, changing something that is
   * already published. Everything else — a draft, an event still waiting for
   * approval, a trusted association, the town hall itself — writes straight
   * through, because there is nothing published to protect.
   */
  async function needsReview(event: Event): Promise<boolean> {
    if (isMunicipal(actor)) return false;
    if (event.status !== 'published') return false;

    const org = await organization();

    return org === null || !publishesWithoutReview(org);
  }

  async function queueChange(event: Event, patch: EventPatch): Promise<PendingChange> {
    const change: PendingChange = {
      id: crypto.randomUUID(),
      eventId: event.id,
      municipalityId,
      organizationId: actor.organizationId,
      payload: patch,
      status: 'pending',
      rejectionReason: null,
      createdBy: actor.authUserId,
      createdAt: new Date(),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...pendingChangeKey(change.eventId, change.id),
          entity: 'event_change',
          ...change,
          payload: serialisePatch(patch),
          createdAt: change.createdAt.toISOString(),
          // Into the same review index the pending events use, so the town hall
          // has one inbox and not two.
          gsi2pk: reviewIndexPk(municipalityId),
          gsi2sk: change.createdAt.toISOString(),
        },
      }),
    );

    return change;
  }

  async function readChange(eventId: string, changeId: string): Promise<PendingChange | null> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: pendingChangeKey(eventId, changeId),
      }),
    );

    if (result.Item === undefined) return null;

    const change = toPendingChange(result.Item);

    // A change is reachable through the event it belongs to, and that event is
    // read in the actor's municipality, so a change from another town is not
    // addressable here.
    return change.municipalityId === municipalityId ? change : null;
  }

  async function writeStatus(
    eventId: string,
    status: EventStatus,
    extra: { rejectionReason?: string | null } = {},
  ): Promise<Event> {
    const event = await readEvent(eventId);
    if (event === null) throw notFound('Ese evento no existe en este municipio.');

    const now = new Date();

    return writeEvent({
      ...event,
      status,
      rejectionReason: extra.rejectionReason ?? null,
      updatedAt: now,
      publishedAt: status === 'published' ? (event.publishedAt ?? now) : event.publishedAt,
    });
  }

  return {
    async listEvents() {
      // The filter is DynamoDB's and not this code's on purpose: an association
      // asking for its events must not have the town hall's drafts travel back
      // to the function at all, even to be dropped afterwards. `canSee` stays as
      // a second check, because a filter is a where clause and not a guarantee.
      const scoped = !isMunicipal(actor);

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ...(scoped
            ? {
                FilterExpression: 'organizationId = :org or #status in (:published, :cancelled)',
                ExpressionAttributeNames: { '#status': 'status' },
              }
            : {}),
          ExpressionAttributeValues: {
            ':pk': municipalityPk(municipalityId),
            ':prefix': SK_PREFIX.event,
            ...(scoped
              ? {
                  ':org': actor.organizationId,
                  ':published': 'published',
                  ':cancelled': 'cancelled',
                }
              : {}),
          },
        }),
      );

      return (result.Items ?? []).map(fromEventItem).filter(canSee);
    },

    getEvent(eventId) {
      return readEvent(eventId);
    },

    async createEvent(input) {
      const asked = input.status ?? 'draft';
      let status: EventStatus = asked;

      if (!isMunicipal(actor)) {
        if (actor.organizationId === null) {
          throw forbidden('Esta cuenta no está asociada a ninguna asociación.');
        }

        // The only way an association's event reaches `published` is the town
        // hall having marked the association as trusted. Asking for it does
        // nothing.
        const org = await organization();
        if (org === null) throw notFound('Esa asociación no existe en este municipio.');

        status = publishesWithoutReview(org) ? 'published' : 'pending_review';
      }

      const now = new Date();
      const event: Event = {
        id: input.id,
        municipalityId,
        organizationId: isMunicipal(actor) ? null : actor.organizationId,
        title: input.title,
        description: input.description ?? '',
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        allDay: input.allDay ?? false,
        location: input.location,
        imageUrl: input.imageUrl ?? null,
        priceInfo: input.priceInfo ?? null,
        isFree: input.isFree ?? true,
        audienceTags: [],
        status,
        rejectionReason: null,
        // The cover belongs to the town hall. An association asking for it gets
        // the same answer as one asking to publish: nothing happens, quietly.
        isFeatured: isMunicipal(actor) && (input.isFeatured ?? false),
        liveTrackingEnabled: false,
        // A new event has no audience yet, and neither number is ever an
        // author's to set: both belong to the residents from here on.
        interestCount: 0,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === 'published' ? now : null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: toEventItem(event),
          // Creating an event twice with the same id is a bug, not an update.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );

      if (event.isFeatured) await keepOnlyFeatured(event.id);

      return event;
    },

    async updateEvent(eventId, patch) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      // Same rule as on creation, and it has to be here too: an association
      // editing its own published event could otherwise put itself on the cover
      // through the back door.
      const asked: EventPatch = { ...patch };

      if (!isMunicipal(actor)) delete asked.isFeatured;

      if (await needsReview(event)) {
        return { kind: 'queued', change: await queueChange(event, asked) };
      }

      return {
        kind: 'applied',
        event: await writeEvent({ ...event, ...asked, updatedAt: new Date() }),
      };
    },

    async reviewQueue() {
      if (!isMunicipal(actor)) {
        throw forbidden('La bandeja de revisión es del ayuntamiento.');
      }

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: REVIEW_INDEX,
          KeyConditionExpression: 'gsi2pk = :pk',
          ExpressionAttributeValues: { ':pk': reviewIndexPk(municipalityId) },
        }),
      );

      return (result.Items ?? []).map((item): ReviewItem =>
        item['entity'] === 'event_change'
          ? { kind: 'change', change: toPendingChange(item) }
          : { kind: 'event', event: fromEventItem(item) },
      );
    },

    // `async` even though the guard throws before any await: a method that
    // sometimes throws synchronously and sometimes rejects makes every caller
    // wrap it twice.
    async approveEvent(eventId) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento aprueba eventos.');
      }

      return writeStatus(eventId, 'published');
    },

    async rejectEvent(eventId, reason) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento rechaza eventos.');
      }

      if (reason.trim() === '') {
        throw forbidden('Un evento rechazado tiene que decir por qué.');
      }

      return writeStatus(eventId, 'rejected', { rejectionReason: reason });
    },

    async cancelEvent(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      return writeStatus(eventId, 'cancelled');
    },

    async deleteEvent(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      if (!isMunicipal(actor) && (event.status === 'published' || event.status === 'cancelled')) {
        throw forbidden(
          'Este evento ya lo han visto los vecinos. Pídele al ayuntamiento que lo borre.',
        );
      }

      // The changes first. An event deleted with a pending change still in the
      // review index leaves a row in the town hall's inbox pointing at nothing,
      // and the inbox is the one screen that must never show a ghost.
      const changes = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': CHANGE_PREFIX },
          ProjectionExpression: 'pk, sk',
        }),
      );

      for (const item of changes.Items ?? []) {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { pk: String(item['pk']), sk: String(item['sk']) },
          }),
        );
      }

      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      // What is deliberately left alone: the marks residents made on it. They
      // live under the devices that made them, reachable only through the index
      // this role is denied (D-032), so this function could not reach them if it
      // wanted to — and should not: they are somebody else's rows. An event that
      // is gone is never read, never reminded and never listed, so they sit
      // there inert until the phone is forgotten.
    },

    async listChanges(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': CHANGE_PREFIX },
        }),
      );

      return (result.Items ?? []).map(toPendingChange);
    },

    async approveChange(eventId, changeId) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento aprueba cambios.');
      }

      const change = await readChange(eventId, changeId);
      if (change === null) throw notFound('Ese cambio no existe.');
      if (change.status !== 'pending') throw forbidden('Ese cambio ya estaba decidido.');

      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');

      const updated = await writeEvent({ ...event, ...change.payload, updatedAt: new Date() });

      // The change has served its purpose and leaves the inbox. It is deleted
      // rather than kept: what it asked for is now in the event, and the audit
      // log is where "who changed this" lives.
      await client.send(
        new DeleteCommand({ TableName: tableName, Key: pendingChangeKey(eventId, changeId) }),
      );

      return updated;
    },

    async rejectChange(eventId, changeId, reason) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento rechaza cambios.');
      }

      if (reason.trim() === '') {
        throw forbidden('Un cambio rechazado tiene que decir por qué.');
      }

      const change = await readChange(eventId, changeId);
      if (change === null) throw notFound('Ese cambio no existe.');

      // Kept, unlike an approved one, and out of the index: the association has
      // to be able to read why it was turned down.
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: pendingChangeKey(eventId, changeId),
          UpdateExpression:
            'SET #status = :status, rejectionReason = :reason REMOVE gsi2pk, gsi2sk',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'rejected', ':reason': reason.trim() },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      return { ...change, status: 'rejected', rejectionReason: reason.trim() };
    },

    async interestCount(eventId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          // The counter and nothing else: this is the only thing the panel ever
          // learns about who marked an event.
          ProjectionExpression: 'interestCount',
        }),
      );

      return result.Item === undefined ? 0 : interestCountOf(result.Item);
    },
  };
}
