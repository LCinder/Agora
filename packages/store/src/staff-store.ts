import {
  type Event,
  type EventStatus,
  type Organization,
  organizationSchema,
  publishesWithoutReview,
} from '@agora/core';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import { fromEventItem, interestCountOf, toEventItem } from './items';
import {
  REVIEW_INDEX,
  SK_PREFIX,
  eventKey,
  indexAttributesFor,
  municipalityPk,
  organizationKey,
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

export interface StaffStore {
  listEvents(): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | null>;
  createEvent(input: NewEvent): Promise<Event>;
  updateEvent(eventId: string, patch: EventPatch): Promise<Event>;
  /** Municipal staff only. */
  reviewQueue(): Promise<Event[]>;
  approveEvent(eventId: string): Promise<Event>;
  rejectEvent(eventId: string, reason: string): Promise<Event>;
  cancelEvent(eventId: string): Promise<Event>;
  /** How many residents marked it. Never who. */
  interestCount(eventId: string): Promise<number>;
}

/**
 * The attributes an edit may write. Deliberately a list and not "everything in
 * the item": `pk`, `sk`, `entity` and `interestCount` are not an editor's to
 * touch, and leaving them out of the expression is how that is guaranteed.
 */
const MUTABLE_FIELDS = [
  'title',
  'description',
  'categoryId',
  'startAt',
  'endAt',
  'allDay',
  'location',
  'imageUrl',
  'priceInfo',
  'isFree',
  'audienceTags',
  'status',
  'rejectionReason',
  'isFeatured',
  'liveTrackingEnabled',
  'updatedAt',
  'publishedAt',
] as const;

const INDEX_ATTRIBUTES = ['gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

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
    const item = toEventItem(next);
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];
    const removes: string[] = [];

    for (const field of MUTABLE_FIELDS) {
      names[`#${field}`] = field;
      values[`:${field}`] = item[field];
      sets.push(`#${field} = :${field}`);
    }

    const attributes = indexAttributesFor(next);

    for (const key of INDEX_ATTRIBUTES) {
      names[`#${key}`] = key;

      const value = attributes[key];

      if (value === undefined) {
        removes.push(`#${key}`);
      } else {
        values[`:${key}`] = value;
        sets.push(`#${key} = :${key}`);
      }
    }

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: eventKey(municipalityId, next.id),
        UpdateExpression:
          `SET ${sets.join(', ')}` + (removes.length === 0 ? '' : ` REMOVE ${removes.join(', ')}`),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );

    return next;
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
        isFeatured: input.isFeatured ?? false,
        liveTrackingEnabled: false,
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

      return event;
    },

    async updateEvent(eventId, patch) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      return writeEvent({ ...event, ...patch, updatedAt: new Date() });
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

      return (result.Items ?? []).map(fromEventItem);
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
