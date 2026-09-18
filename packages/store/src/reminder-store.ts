import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { INTERESTS_INDEX } from './keys';

/**
 * The one place in the system that goes from an event to the people interested
 * in it.
 *
 * It exists because a reminder cannot be sent without knowing who to send it
 * to, and it is its own module — rather than a method on the panel's store —
 * because that separation is the privacy promise of the product: the town hall
 * sees how many, never who.
 *
 * The separation is not only a convention. The reminder function is the only one
 * whose IAM role has permission on `gsi3`, and every other role denies itself
 * that index explicitly (D-032). If this module were imported from the panel's
 * Lambda, the call would fail at AWS.
 */
export interface ReminderStore {
  /** Device ids to notify about an event. */
  devicesInterestedIn(eventId: string): Promise<string[]>;
}

export function createReminderStore(client: StoreClient, tableName: string): ReminderStore {
  return {
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
  };
}
