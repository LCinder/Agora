import { type Municipality, type Event, municipalitySchema } from '@agora/core';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { fromEventItem } from './items';
import {
  CALENDAR_INDEX,
  INTERESTS_INDEX,
  NOTICE_PREFIX,
  OUTBOX_PK,
  PLATFORM_PK,
  calendarIndexPk,
  deviceKey,
  eventKey,
  municipalityKey,
  notificationCounterKey,
} from './keys';
import type { NoticeType } from './notices';

/**
 * Everything the notification job reads and writes, and nothing else's business.
 *
 * It is its own module — rather than methods on the panel's store — because that
 * separation **is** the privacy promise of the product: the town hall sees how
 * many, never who. `devicesInterestedIn` is the one place in the system that goes
 * from an event to people, and the notification function is the only one whose
 * IAM role has permission on `gsi3`. Every other role denies itself that index
 * explicitly (D-032), so if this module were imported from the panel's Lambda the
 * call would fail at AWS, not in a code review.
 *
 * Two jobs use it. The evening one asks which events start tomorrow; the
 * every-minute one drains the outbox the panel writes into. Both end up in the
 * same three questions: who is interested, do they still have quota today, and
 * where do I send it.
 */

/** Two days, so a counter written at 19:00 outlives the rest of its own day. */
const COUNTER_LIFETIME_HOURS = 48;

export interface JobMunicipality {
  id: string;
  timeZone: string;
  reminderHour: number;
  maxDailyNotifications: number;
}

export interface PushTarget {
  deviceId: string;
  token: string;
  locale: string;
}

/** A push the panel asked for and nobody has delivered yet. */
export interface PendingPush {
  /** The outbox row, so it can be deleted once it is done. */
  id: string;
  createdAt: Date;
  kind: 'notice' | 'live_started';
  municipalityId: string;
  eventId: string;
  /** Set for a notice, so it can be marked as sent. */
  noticeId: string | null;
  noticeType: NoticeType | null;
  message: string | null;
}

export interface NotificationStore {
  /** Every municipality on the platform, with the settings the job needs. */
  municipalities(): Promise<JobMunicipality[]>;
  /** Published events of a municipality starting inside a window. */
  eventsStartingBetween(municipalityId: string, from: Date, to: Date): Promise<Event[]>;
  getEvent(municipalityId: string, eventId: string): Promise<Event | null>;
  /** Device ids to notify about an event. The only event-to-people query there is. */
  devicesInterestedIn(eventId: string): Promise<string[]>;
  /** Devices that can actually receive a push, with the language to write in. */
  pushTargets(deviceIds: readonly string[]): Promise<PushTarget[]>;
  /**
   * Spends one of the device's notifications for the day, or answers false when
   * the municipality has already used its quota on that phone.
   */
  reserveDailyNotification(
    deviceId: string,
    municipalityId: string,
    day: string,
    limit: number,
  ): Promise<boolean>;
  /** False when a reminder for this event already went out. */
  claimReminder(municipalityId: string, eventId: string, at: Date): Promise<boolean>;
  /**
   * Gives the claim back, for a reminder that was claimed and then reached nobody.
   *
   * Without it, an evening when the push provider was down would leave every
   * reminder marked as sent and never sent: the claim is what stops a double send,
   * so it has to be released when there was no send at all.
   */
  releaseReminder(municipalityId: string, eventId: string): Promise<void>;
  pendingPushes(limit: number): Promise<PendingPush[]>;
  /** Deletes the outbox row: this push is done, whatever came of it. */
  completePush(push: PendingPush): Promise<void>;
  markNoticeSent(eventId: string, noticeId: string, at: Date): Promise<void>;
  /** The app was uninstalled from that phone, so the token is worthless. */
  clearPushToken(deviceId: string): Promise<void>;
}

function toJobMunicipality(municipality: Municipality): JobMunicipality {
  return {
    id: municipality.id,
    timeZone: municipality.timeZone,
    reminderHour: municipality.settings.reminderHour,
    maxDailyNotifications: municipality.settings.maxDailyNotifications,
  };
}

function expiresIn(hours: number): number {
  return Math.floor(Date.now() / 1000) + hours * 3600;
}

export function createNotificationStore(client: StoreClient, tableName: string): NotificationStore {
  return {
    async municipalities() {
      // The slug pointers, which are the only list of municipalities that does
      // not need a scan. They carry the id and nothing the job needs, so the
      // settings come from each municipality's own row.
      const pointers = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': PLATFORM_PK, ':prefix': 'MUN#' },
          ProjectionExpression: 'id',
        }),
      );

      const ids = (pointers.Items ?? []).map((item) => String(item['id']));
      const rows = await Promise.all(
        ids.map((id) =>
          client.send(new GetCommand({ TableName: tableName, Key: municipalityKey(id) })),
        ),
      );

      return rows
        .filter((row) => row.Item !== undefined)
        .map((row) => toJobMunicipality(municipalitySchema.parse(row.Item)));
    },

    async eventsStartingBetween(municipalityId, from, to) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: CALENDAR_INDEX,
          KeyConditionExpression: 'gsi1pk = :pk and gsi1sk between :from and :to',
          ExpressionAttributeValues: {
            ':pk': calendarIndexPk(municipalityId),
            ':from': from.toISOString(),
            ':to': to.toISOString(),
          },
        }),
      );

      // The calendar index holds cancelled events too, because a neighbour has to
      // find out. What it must not do is remind them to go.
      return (result.Items ?? [])
        .map(fromEventItem)
        .filter((event) => event.status === 'published');
    },

    async getEvent(municipalityId, eventId) {
      const result = await client.send(
        new GetCommand({ TableName: tableName, Key: eventKey(municipalityId, eventId) }),
      );

      return result.Item === undefined ? null : fromEventItem(result.Item);
    },

    async devicesInterestedIn(eventId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: INTERESTS_INDEX,
          KeyConditionExpression: 'gsi3pk = :pk',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}` },
        }),
      );

      // KEYS_ONLY projection: the index holds the keys and nothing else, which
      // is all a reminder needs and the least it could hold.
      return (result.Items ?? []).map((item) => String(item['gsi3sk']).replace('DEV#', ''));
    },

    async pushTargets(deviceIds) {
      if (deviceIds.length === 0) return [];

      const targets: PushTarget[] = [];

      // BatchGet takes a hundred keys at a time.
      for (let index = 0; index < deviceIds.length; index += 100) {
        const chunk = deviceIds.slice(index, index + 100);

        const result = await client.send(
          new BatchGetCommand({
            RequestItems: {
              [tableName]: {
                Keys: chunk.map((deviceId) => deviceKey(deviceId)),
                ProjectionExpression: 'id, pushToken, locale',
              },
            },
          }),
        );

        for (const item of result.Responses?.[tableName] ?? []) {
          const token = item['pushToken'];

          // A device with no token is a neighbour who said no to notifications,
          // or who has not been asked yet. Nothing to do about it here.
          if (typeof token !== 'string' || token === '') continue;

          targets.push({
            deviceId: String(item['id']),
            token,
            locale: typeof item['locale'] === 'string' ? item['locale'] : 'es',
          });
        }
      }

      return targets;
    },

    async reserveDailyNotification(deviceId, municipalityId, day, limit) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: notificationCounterKey(deviceId, municipalityId, day),
            UpdateExpression:
              'SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :ttl, entity = :entity',
            // The check and the increment in one write, which is what makes the
            // cap hold when the evening job and a cancellation land together.
            ConditionExpression: 'attribute_not_exists(#count) or #count < :limit',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: {
              ':zero': 0,
              ':one': 1,
              ':limit': limit,
              ':ttl': expiresIn(COUNTER_LIFETIME_HOURS),
              ':entity': 'notification_counter',
            },
          }),
        );

        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;

        throw error;
      }
    },

    async claimReminder(municipalityId, eventId, at) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: eventKey(municipalityId, eventId),
            UpdateExpression: 'SET reminderSentAt = :at',
            // Once, and by whoever got there first. The job runs every hour and
            // an event may sit inside the window of two runs.
            ConditionExpression: 'attribute_exists(pk) and attribute_not_exists(reminderSentAt)',
            ExpressionAttributeValues: { ':at': at.toISOString() },
          }),
        );

        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;

        throw error;
      }
    },

    async releaseReminder(municipalityId, eventId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          UpdateExpression: 'REMOVE reminderSentAt',
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    },

    async pendingPushes(limit) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': OUTBOX_PK },
          Limit: limit,
        }),
      );

      return (result.Items ?? []).map((item) => {
        const noticeId = item['noticeId'];
        const noticeType = item['noticeType'];
        const message = item['message'];

        return {
          id: String(item['id']),
          createdAt: new Date(String(item['createdAt'])),
          kind: String(item['kind']) as PendingPush['kind'],
          municipalityId: String(item['municipalityId']),
          eventId: String(item['eventId']),
          noticeId: typeof noticeId === 'string' ? noticeId : null,
          noticeType: typeof noticeType === 'string' ? (noticeType as NoticeType) : null,
          message: typeof message === 'string' ? message : null,
        };
      });
    },

    async completePush(push) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: OUTBOX_PK, sk: `${push.createdAt.toISOString()}#${push.id}` },
        }),
      );
    },

    async markNoticeSent(eventId, noticeId, at) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': NOTICE_PREFIX },
        }),
      );

      const found = (result.Items ?? []).find((item) => String(item['id']) === noticeId);

      if (found === undefined) return;

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: String(found['pk']), sk: String(found['sk']) },
          UpdateExpression: 'SET pushSentAt = :at',
          ExpressionAttributeValues: { ':at': at.toISOString() },
        }),
      );
    },

    async clearPushToken(deviceId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: deviceKey(deviceId),
          UpdateExpression: 'REMOVE pushToken',
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    },
  };
}
