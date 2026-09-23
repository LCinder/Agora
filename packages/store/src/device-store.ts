import { DEFAULT_TIME_ZONE, dayKeyInZone, monthKeyInZone } from '@agora/core';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { notFound } from './errors';
import {
  ACTIVITY_INTEREST_PREFIX,
  FOLLOW_PREFIX,
  INTEREST_PREFIX,
  activityInterestIndexPk,
  activityInterestKey,
  activityKey,
  audienceIndexPk,
  deviceCountKey,
  monthlyStatsKey,
  deviceFollowKey,
  deviceKey,
  devicePk,
  eventKey,
  interestKey,
  viewGuardKey,
} from './keys';

/**
 * What a resident's device can reach: itself.
 *
 * A neighbour is not a person here, it is a device (D-029). The partition key of
 * everything a device owns is its own id, and the token it presents carries that
 * id and nothing else, so one device asking for another's marks would have to
 * name an id it does not have. That is the whole of the privacy model on this
 * side, and it is why the `devices` table of the PostgreSQL draft had no name,
 * no email and no telephone: there is nothing to leak.
 *
 * Marking an event does two things: it writes the mark, which carries the
 * attributes of the reminder index, and it increments a counter on the event.
 * The counter is what the panel reads. Nobody in the panel can go the other way.
 */
/**
 * How long the "already counted today" row sticks around.
 *
 * Two days rather than one: the day it guards is a day in `Europe/Madrid`, and
 * a row that expired at midnight UTC would let a phone count the same evening
 * twice for two hours of the year. DynamoDB deletes them on its own schedule
 * anyway, so the only cost of being generous is a row nobody reads.
 */
const VIEW_GUARD_LIFETIME_HOURS = 48;

export interface Interest {
  municipalityId: string;
  eventId: string;
  /** Null for a mark on the event itself, set for one line of its programme. */
  activityId: string | null;
  createdAt: Date;
}

/**
 * What a mark is about: an event, or one line of its programme.
 *
 * The two are the same operation on different rows — write a mark under the
 * device, move a counter, file it on the reminder index — so they go through one
 * piece of code that takes the three addresses rather than through two copies
 * that will drift on the transaction.
 */
interface Subject {
  /** Where the mark lives, under the device that made it. */
  markKey: { pk: string; sk: string };
  /** The row whose counter this moves. */
  counterKey: { pk: string; sk: string };
  /** The partition of the reminder index this mark is filed under. */
  indexPk: string;
  /** What the mark row records about itself, beyond its key. */
  attributes: Record<string, unknown>;
  /** What to say when the thing being marked is not there. */
  missing: string;
}

export interface DeviceStore {
  register(input: { platform: 'ios' | 'android' | 'web'; locale: string }): Promise<void>;
  /**
   * The address the notification job sends to, or null to stop being reachable.
   *
   * Kept on the device's own row, so it is deleted with everything else when a
   * neighbour taps "borrar mis datos". It is an address for a phone, not for a
   * person: nothing about it says who is holding it.
   */
  setPushToken(token: string | null): Promise<void>;
  /**
   * Says this phone follows a municipality, which is how the town hall learns how
   * many neighbours have the app.
   *
   * Called when a resident picks a town and again when they mark an event in one.
   * Idempotent: following twice counts once, so it is safe to call on every launch.
   *
   * It also touches `lastSeenAt`, which is what makes a phone that stopped
   * existing eventually stop being counted. See `purgeIdleDevices`.
   */
  follow(municipalityId: string): Promise<void>;
  listFollowed(): Promise<string[]>;
  listInterests(): Promise<Interest[]>;
  markInterest(municipalityId: string, eventId: string): Promise<void>;
  unmarkInterest(municipalityId: string, eventId: string): Promise<void>;
  /**
   * The same, for one line of a programme.
   *
   * A separate mark from the event's, on purpose. Somebody who wants to be
   * reminded about the falconry show at six on Saturday has not asked to be
   * reminded about the whole feria, and marking the feria does not sign them up
   * to twenty reminders. The two only meet again when the town hall sends a
   * notice, which reaches everybody with a stake in the event.
   */
  markActivityInterest(municipalityId: string, eventId: string, activityId: string): Promise<void>;
  unmarkActivityInterest(
    municipalityId: string,
    eventId: string,
    activityId: string,
  ): Promise<void>;
  /**
   * Counts that this phone opened an event, at most once a day.
   *
   * The guard is here and not only in the app because a tally a town hall puts
   * in its memoria anual has to be one nobody could inflate by holding a finger
   * on the refresh: the app skips the call when it already made it today, and
   * this refuses it if it arrives anyway.
   *
   * Nothing is recorded about the opening beyond the fact that it happened —
   * no time, no place, no order of events read. The guard row is keyed by the
   * day and deletes itself.
   */
  recordView(municipalityId: string, eventId: string): Promise<void>;
  /**
   * Deletes everything this device ever wrote: the marks, the counters of the
   * anti-spam cap, the push token and the device itself.
   *
   * What "borrar mis datos" in Settings promises, on the server side too. The
   * marks go through the same path as unmarking one by one, so the counters the
   * town hall reads stay right — deleting a mark without decrementing would leave
   * the panel reporting interest from a phone that asked to be forgotten.
   */
  forget(): Promise<void>;
}

export function createDeviceStore(
  client: StoreClient,
  tableName: string,
  deviceId: string,
): DeviceStore {
  /**
   * The mark and the counter, in one transaction.
   *
   * Two separate writes drift: a mark that saved and a counter that did not
   * leaves the town hall reading a number that is quietly wrong, and that
   * counter is the only thing the panel is ever allowed to see, so it is the one
   * number that has to be right.
   *
   * The condition on the mark also makes a double tap harmless without reading
   * first: the second attempt fails its condition, the whole transaction is
   * cancelled, and nothing is counted twice.
   *
   * `if_not_exists` on the counter because an event written before this feature
   * existed has no attribute to add to.
   */
  async function move(municipalityId: string, subject: Subject, by: 1 | -1): Promise<void> {
    const key = subject.markKey;

    const mark =
      by === 1
        ? {
            Put: {
              TableName: tableName,
              Item: {
                ...key,
                deviceId,
                municipalityId,
                ...subject.attributes,
                createdAt: new Date().toISOString(),
                // The reminder index: from a thing to the devices to notify.
                // Only the reminder job may read it (D-032).
                gsi3pk: subject.indexPk,
                gsi3sk: devicePk(deviceId),
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          }
        : {
            Delete: {
              TableName: tableName,
              Key: key,
              ConditionExpression: 'attribute_exists(pk)',
            },
          };

    // The month a mark was added to, for the series the panel draws. Counted in
    // the time zone the whole product computes dates in rather than the server's,
    // and only on the way up: see `monthlyStatsKey`.
    const monthly =
      by === 1
        ? [
            {
              Update: {
                TableName: tableName,
                Key: monthlyStatsKey(municipalityId, monthKeyInZone(new Date(), DEFAULT_TIME_ZONE)),
                UpdateExpression:
                  'SET interestsAdded = if_not_exists(interestsAdded, :zero) + :one, entity = :entity',
                ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':entity': 'monthly_stats' },
              },
            },
          ]
        : [];

    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            mark,
            {
              Update: {
                TableName: tableName,
                Key: subject.counterKey,
                UpdateExpression: 'SET interestCount = if_not_exists(interestCount, :zero) + :by',
                ExpressionAttributeValues: { ':zero': 0, ':by': by },
                ConditionExpression: 'attribute_exists(pk)',
              },
            },
            ...monthly,
          ],
        }),
      );
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;

      const reasons = error.CancellationReasons ?? [];

      // The mark was already there, or already gone. Tapping twice is not
      // something a resident should be told about.
      if (reasons[0]?.Code === 'ConditionalCheckFailed') return;

      // It is gone. On the way up that is worth saying out loud — the resident
      // asked to be reminded of something that does not exist.
      if (by === 1) throw notFound(subject.missing);

      // On the way down it is not. The town hall deleted a duplicate and a
      // phone is still carrying the mark: the counter it would have decremented
      // went with the row, and refusing here would leave the resident holding
      // a mark they cannot remove — and "borrar mis datos", which unmarks
      // everything one by one, unable to finish.
      await client.send(new DeleteCommand({ TableName: tableName, Key: key }));
    }
  }

  /** The event itself, as something to mark. */
  function eventSubject(municipalityId: string, eventId: string): Subject {
    return {
      markKey: interestKey(deviceId, municipalityId, eventId),
      counterKey: eventKey(municipalityId, eventId),
      indexPk: `EVT#${eventId}`,
      attributes: { entity: 'interest', eventId },
      missing: 'Ese evento no existe.',
    };
  }

  /** One line of its programme, as something to mark. */
  function activitySubject(municipalityId: string, eventId: string, activityId: string): Subject {
    return {
      markKey: activityInterestKey(deviceId, municipalityId, eventId, activityId),
      counterKey: activityKey(municipalityId, eventId, activityId),
      indexPk: activityInterestIndexPk(activityId),
      attributes: { entity: 'activity_interest', eventId, activityId },
      missing: 'Esa actividad no existe.',
    };
  }

  return {
    async register({ platform, locale }) {
      const now = new Date().toISOString();

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk: devicePk(deviceId),
            sk: 'META',
            entity: 'device',
            id: deviceId,
            platform,
            locale,
            createdAt: now,
            lastSeenAt: now,
          },
        }),
      );
    },

    async setPushToken(token) {
      const now = new Date().toISOString();

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: deviceKey(deviceId),
          UpdateExpression:
            token === null
              ? 'SET lastSeenAt = :now REMOVE pushToken'
              : 'SET pushToken = :token, lastSeenAt = :now',
          ExpressionAttributeValues:
            token === null ? { ':now': now } : { ':token': token, ':now': now },
          // The app registers before it ever asks for permission, so a device
          // without a row here is a bug and not a case to paper over.
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    },

    async follow(municipalityId) {
      // Every launch passes through here, which is what makes this the honest
      // place to record that the phone still exists. Without it `lastSeenAt` only
      // ever says when the app was installed, and nothing can tell a device that
      // was wiped from one that is simply quiet in November.
      //
      // Swallowed on purpose: this is bookkeeping, and a resident picking their
      // town is not waiting on it.
      await client
        .send(
          new UpdateCommand({
            TableName: tableName,
            Key: deviceKey(deviceId),
            UpdateExpression: 'SET lastSeenAt = :now',
            ExpressionAttributeValues: { ':now': new Date().toISOString() },
            ConditionExpression: 'attribute_exists(pk)',
          }),
        )
        .catch(() => undefined);

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...deviceFollowKey(deviceId, municipalityId),
                    entity: 'device_follow',
                    deviceId,
                    municipalityId,
                    createdAt: new Date().toISOString(),
                    // What makes this phone reachable by a notice addressed to
                    // the whole town. Only the notification function may read
                    // this index; the panel is denied it outright (D-062).
                    gsi3pk: audienceIndexPk(municipalityId),
                    gsi3sk: devicePk(deviceId),
                  },
                  // The condition is what makes the counter mean something: the
                  // second launch fails it, the transaction is cancelled, and
                  // nobody is counted twice.
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: deviceCountKey(municipalityId),
                  UpdateExpression:
                    'SET deviceCount = if_not_exists(deviceCount, :zero) + :one, entity = :entity',
                  ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':entity': 'device_count' },
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) throw error;

        // Already following, which is every launch after the first. The write is
        // still worth making once: a phone that started following before the
        // audience index existed has a row without those two attributes, and the
        // condition above means it would never be rewritten — so it would stay
        // invisible to a notice addressed to the whole town for ever. This puts
        // them there without touching the counter.
        await client
          .send(
            new UpdateCommand({
              TableName: tableName,
              Key: deviceFollowKey(deviceId, municipalityId),
              UpdateExpression: 'SET gsi3pk = :audience, gsi3sk = :device',
              ExpressionAttributeValues: {
                ':audience': audienceIndexPk(municipalityId),
                ':device': devicePk(deviceId),
              },
              ConditionExpression: 'attribute_exists(pk) and attribute_not_exists(gsi3pk)',
            }),
          )
          .catch(() => {
            // Already indexed, or the row is gone. Both are fine: this is a repair,
            // not a step the resident is waiting on.
          });
      }
    },

    async listFollowed() {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': devicePk(deviceId), ':prefix': FOLLOW_PREFIX },
          ProjectionExpression: 'municipalityId',
        }),
      );

      return (result.Items ?? []).map((item) => String(item['municipalityId']));
    },

    async listInterests() {
      // Two prefixes, one after the other, because a single `begins_with` cannot
      // match both and the alternative is reading every row the device owns —
      // including the daily notification counters, which are none of this
      // question's business.
      const [events, activities] = await Promise.all(
        [INTEREST_PREFIX, ACTIVITY_INTEREST_PREFIX].map((prefix) =>
          client.send(
            new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
              ExpressionAttributeValues: { ':pk': devicePk(deviceId), ':prefix': prefix },
            }),
          ),
        ),
      );

      return [...(events?.Items ?? []), ...(activities?.Items ?? [])].map((item) => ({
        municipalityId: String(item['municipalityId']),
        eventId: String(item['eventId']),
        activityId: item['activityId'] === undefined ? null : String(item['activityId']),
        createdAt: new Date(String(item['createdAt'])),
      }));
    },

    async markInterest(municipalityId, eventId) {
      await move(municipalityId, eventSubject(municipalityId, eventId), 1);
    },

    async markActivityInterest(municipalityId, eventId, activityId) {
      await move(municipalityId, activitySubject(municipalityId, eventId, activityId), 1);
    },

    async unmarkActivityInterest(municipalityId, eventId, activityId) {
      await move(municipalityId, activitySubject(municipalityId, eventId, activityId), -1);
    },

    async forget() {
      const rows = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': devicePk(deviceId) },
          ProjectionExpression: 'pk, sk, municipalityId, eventId, activityId',
        }),
      );

      for (const item of rows.Items ?? []) {
        const sk = String(item['sk']);
        const town = String(item['municipalityId']);

        if (sk.startsWith(INTEREST_PREFIX)) {
          await move(town, eventSubject(town, String(item['eventId'])), -1);

          continue;
        }

        // The marks on lines of a programme go the same way, and they have to:
        // leaving them would keep the town hall reading interest from a phone
        // that asked to be forgotten, one activity at a time.
        if (sk.startsWith(ACTIVITY_INTEREST_PREFIX)) {
          await move(
            town,
            activitySubject(town, String(item['eventId']), String(item['activityId'])),
            -1,
          );

          continue;
        }

        // Unfollowing hands the count back, or the town hall would keep reading a
        // neighbour who asked to be forgotten as one of theirs.
        if (sk.startsWith(FOLLOW_PREFIX)) {
          await client.send(
            new TransactWriteCommand({
              TransactItems: [
                { Delete: { TableName: tableName, Key: { pk: String(item['pk']), sk } } },
                {
                  Update: {
                    TableName: tableName,
                    Key: deviceCountKey(String(item['municipalityId'])),
                    UpdateExpression: 'SET deviceCount = if_not_exists(deviceCount, :one) - :one',
                    ExpressionAttributeValues: { ':one': 1 },
                  },
                },
              ],
            }),
          );

          continue;
        }

        // The device row itself, and the daily counters of the cap.
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { pk: String(item['pk']), sk },
          }),
        );
      }
    },

    async unmarkInterest(municipalityId, eventId) {
      await move(municipalityId, eventSubject(municipalityId, eventId), -1);
    },

    async recordView(municipalityId, eventId) {
      const day = dayKeyInZone(new Date(), DEFAULT_TIME_ZONE);

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...viewGuardKey(deviceId, municipalityId, eventId, day),
                    entity: 'view_guard',
                    expiresAt: Math.floor(Date.now() / 1000) + VIEW_GUARD_LIFETIME_HOURS * 3600,
                  },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: eventKey(municipalityId, eventId),
                  UpdateExpression: 'SET viewCount = if_not_exists(viewCount, :zero) + :one',
                  ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
                  ConditionExpression: 'attribute_exists(pk)',
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) throw error;

        // Already counted today, or the event is not there. Neither is worth an
        // error: the neighbour is reading a page, not filing a return.
      }
    },
  };
}
