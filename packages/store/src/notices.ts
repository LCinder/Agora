import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import { NOTICE_PREFIX, OUTBOX_LIFETIME_HOURS, eventKey, eventUpdateKey, outboxKey } from './keys';
import type { StaffActor } from './staff-store';

/**
 * Notices attached to an event: the time moved, the street is closed, it rains
 * so it is off.
 *
 * This is the half of "Asistiré" that the town hall gets something out of. A
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
  /**
   * Pushes a published event to every phone that follows the municipality.
   *
   * The one notice in the product that is not addressed to people who asked for
   * it, which is exactly why it is separate from `send` rather than a fifth
   * notice type: it reaches a different audience, it is the easiest thing here to
   * abuse, and a town hall should have to mean it.
   *
   * It leaves no notice on the event. A notice is the record of something that
   * changed, and nothing changed — this is an announcement.
   */
  feature(input: { eventId: string; message: string }): Promise<void>;
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
  /**
   * The event, if it belongs to this municipality.
   *
   * Reading it through the municipality's own key is the isolation: an id from
   * another town simply is not there (D-026). It answers with the status because
   * the caller that broadcasts needs it, and one read is cheaper than two.
   */
  async function assertOwnEvent(eventId: string): Promise<{ status: string }> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: eventKey(actor.municipalityId, eventId),
        // `status` is a reserved word in DynamoDB, hence the alias.
        ProjectionExpression: 'pk, #status',
        ExpressionAttributeNames: { '#status': 'status' },
      }),
    );

    if (result.Item === undefined) {
      throw notFound('Ese evento no existe en este municipio.');
    }

    return { status: String(result.Item['status']) };
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

      // The notice and the order to deliver it, in one transaction.
      //
      // The panel cannot send the push itself: no municipal role has permission on
      // the index that says who marked the event, and that is deliberate (D-032).
      // So it writes what it wants sent into the outbox, and the notification job
      // — the only function that may read that index — drains it within the
      // minute. Two separate writes here would mean a notice the town hall
      // believes went out and nobody received.
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...eventUpdateKey(created.eventId, created.createdAt, created.id),
                  entity: 'event_notice',
                  ...created,
                  createdAt: created.createdAt.toISOString(),
                  pushSentAt: null,
                },
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...outboxKey(created.createdAt, created.id),
                  entity: 'outbox',
                  id: created.id,
                  createdAt: created.createdAt.toISOString(),
                  kind: 'notice',
                  municipalityId: actor.municipalityId,
                  eventId: created.eventId,
                  noticeId: created.id,
                  noticeType: created.type,
                  message: created.message,
                  expiresAt: Math.floor(Date.now() / 1000) + OUTBOX_LIFETIME_HOURS * 3600,
                },
              },
            },
          ],
        }),
      );

      return created;
    },

    async feature({ eventId, message }) {
      if (actor.role !== 'municipal_editor' && actor.role !== 'municipal_admin') {
        throw forbidden('Los avisos a todo el municipio los envía el ayuntamiento.');
      }

      const trimmed = message.trim();

      if (trimmed === '') {
        throw forbidden('Un aviso sin mensaje no se envía.');
      }

      const event = await assertOwnEvent(eventId);

      // A draft or a rejected event has no public page to open, and a phone that
      // taps the notification would land nowhere. Cancelled is refused for a
      // different reason: telling a whole town to come to something that is off
      // is the worst message this system could send.
      if (event.status !== 'published') {
        throw forbidden('Solo se puede destacar un evento publicado.');
      }

      const createdAt = new Date();
      const id = crypto.randomUUID();

      // Just the order. There is no paired row to keep consistent, so this is one
      // write rather than a transaction — and the job that drains it is the only
      // thing in the system allowed to ask who follows this municipality (D-062).
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...outboxKey(createdAt, id),
            entity: 'outbox',
            id,
            createdAt: createdAt.toISOString(),
            kind: 'featured',
            municipalityId: actor.municipalityId,
            eventId,
            message: trimmed,
            expiresAt: Math.floor(Date.now() / 1000) + OUTBOX_LIFETIME_HOURS * 3600,
          },
        }),
      );
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
