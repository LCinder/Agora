import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import { NOTICE_PREFIX, eventKey, eventUpdateKey } from './keys';
import type { StaffActor } from './staff-store';

/**
 * Notices attached to an event: the time moved, the street is closed, it rains
 * so it is off.
 *
 * This is the half of "Me interesa" that the town hall gets something out of. A
 * notice reaches only the devices that marked the event, which is what makes it
 * worth sending — a message that goes to everybody gets muted by everybody.
 *
 * Sending one is municipal staff only, deliberately. An association can edit its
 * own events and see its own numbers, but a notification is the one thing here
 * that cannot be taken back, and the product document puts it under the town
 * hall (section 7.3).
 */
export const NOTICE_TYPES = ['time_change', 'location_change', 'cancelled', 'notice'] as const;

export type NoticeType = (typeof NOTICE_TYPES)[number];

export interface EventNotice {
  id: string;
  eventId: string;
  type: NoticeType;
  message: string;
  createdBy: string;
  createdAt: Date;
  /** When the push actually went out, or null while it has not. */
  pushSentAt: Date | null;
}

export interface NewNotice {
  eventId: string;
  type: NoticeType;
  message: string;
}

export interface NoticeStore {
  list(eventId: string): Promise<EventNotice[]>;
  send(notice: NewNotice): Promise<EventNotice>;
  /** Called by whatever ends up delivering the push, once it has. */
  markSent(eventId: string, noticeId: string, at?: Date): Promise<void>;
}

function toNotice(item: Record<string, unknown>): EventNotice {
  const sent = item['pushSentAt'];

  return {
    id: String(item['id']),
    eventId: String(item['eventId']),
    type: String(item['type']) as NoticeType,
    message: String(item['message']),
    createdBy: String(item['createdBy']),
    createdAt: new Date(String(item['createdAt'])),
    pushSentAt: typeof sent === 'string' ? new Date(sent) : null,
  };
}

export function createNoticeStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): NoticeStore {
  /**
   * An event of this actor's municipality, or nothing.
   *
   * The notice itself lives under `EVT#<id>`, a partition that does not name a
   * municipality, so this is the check that keeps one town hall from writing a
   * notice on another town's event: the event is read through the municipality
   * of the actor, and if it is not there, it does not exist as far as this store
   * is concerned.
   */
  async function assertOwnEvent(eventId: string): Promise<void> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: eventKey(actor.municipalityId, eventId),
        ProjectionExpression: 'pk',
      }),
    );

    if (result.Item === undefined) {
      throw notFound('Ese evento no existe en este municipio.');
    }
  }

  return {
    async list(eventId) {
      await assertOwnEvent(eventId);

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': NOTICE_PREFIX },
        }),
      );

      return (result.Items ?? []).map(toNotice);
    },

    async send(notice) {
      if (actor.role !== 'municipal_editor' && actor.role !== 'municipal_admin') {
        throw forbidden('Los avisos los envía el ayuntamiento.');
      }

      if (notice.message.trim() === '') {
        throw forbidden('Un aviso sin mensaje no se envía.');
      }

      await assertOwnEvent(notice.eventId);

      const created: EventNotice = {
        id: crypto.randomUUID(),
        eventId: notice.eventId,
        type: notice.type,
        message: notice.message.trim(),
        createdBy: actor.authUserId,
        createdAt: new Date(),
        pushSentAt: null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...eventUpdateKey(created.eventId, created.createdAt, created.id),
            entity: 'event_notice',
            ...created,
            createdAt: created.createdAt.toISOString(),
            pushSentAt: null,
          },
        }),
      );

      return created;
    },

    async markSent(eventId, noticeId, at = new Date()) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': NOTICE_PREFIX },
        }),
      );

      const found = (result.Items ?? []).find((item) => String(item['id']) === noticeId);

      if (found === undefined) throw notFound('Ese aviso no existe.');

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: String(found['pk']), sk: String(found['sk']) },
          UpdateExpression: 'SET pushSentAt = :at',
          ExpressionAttributeValues: { ':at': at.toISOString() },
        }),
      );
    },
  };
}
