import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { notFound } from './errors';
import { deviceKey, devicePk, eventKey, interestKey } from './keys';

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
export interface Interest {
  municipalityId: string;
  eventId: string;
  createdAt: Date;
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
  listInterests(): Promise<Interest[]>;
  markInterest(municipalityId: string, eventId: string): Promise<void>;
  unmarkInterest(municipalityId: string, eventId: string): Promise<void>;
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
  async function move(municipalityId: string, eventId: string, by: 1 | -1): Promise<void> {
    const key = interestKey(deviceId, municipalityId, eventId);

    const mark =
      by === 1
        ? {
            Put: {
              TableName: tableName,
              Item: {
                ...key,
                entity: 'interest',
                deviceId,
                municipalityId,
                eventId,
                createdAt: new Date().toISOString(),
                // The reminder index: from an event to the devices to notify.
                // Only the reminder job may read it (D-032).
                gsi3pk: `EVT#${eventId}`,
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

    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            mark,
            {
              Update: {
                TableName: tableName,
                Key: eventKey(municipalityId, eventId),
                UpdateExpression: 'SET interestCount = if_not_exists(interestCount, :zero) + :by',
                ExpressionAttributeValues: { ':zero': 0, ':by': by },
                ConditionExpression: 'attribute_exists(pk)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;

      const reasons = error.CancellationReasons ?? [];

      // The mark was already there, or already gone. Tapping twice is not
      // something a resident should be told about.
      if (reasons[0]?.Code === 'ConditionalCheckFailed') return;

      // The event itself does not exist, which is worth saying out loud.
      throw notFound('Ese evento no existe.');
    }
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

    async listInterests() {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': devicePk(deviceId), ':prefix': 'INT#' },
        }),
      );

      return (result.Items ?? []).map((item) => ({
        municipalityId: String(item['municipalityId']),
        eventId: String(item['eventId']),
        createdAt: new Date(String(item['createdAt'])),
      }));
    },

    async markInterest(municipalityId, eventId) {
      await move(municipalityId, eventId, 1);
    },

    async unmarkInterest(municipalityId, eventId) {
      await move(municipalityId, eventId, -1);
    },
  };
}
