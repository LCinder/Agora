import { DEVICE_IDLE_MONTHS } from '@agora/core';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { createDeviceStore } from './device-store';

/**
 * Forgetting the phones that stopped existing.
 *
 * A resident who taps "borrar mis datos" is forgotten there and then, properly:
 * every mark removed one by one so each event's counter comes down with it, the
 * follow row removed so the town's total comes down too. That path is tested and
 * it works.
 *
 * This is the other half, and it is the one that actually happens. Somebody
 * clears the app's storage from the phone's own settings, or reinstalls, or
 * changes phone. The app is never told, so it cannot tell us: it registers again
 * as a new device and the old row stays behind for ever, with its marks still
 * counted on every event it ever marked and still counted in the municipality's
 * "vecinos con la aplicación".
 *
 * Nothing personal leaks — a device row is a UUID we invented, a platform, a
 * locale and two dates. What rots is the truth of the numbers, and those numbers
 * are what the product is sold on: told that four hundred people looked at the
 * concert, a councillor should not be counting phones that were wiped in March.
 * A counter that only ever goes up is not a counter.
 *
 * So there is a plazo — `DEVICE_IDLE_MONTHS`, which the privacy policy states —
 * and this is what applies it.
 *
 * **It goes through exactly the same `forget` the button does.** Not a bulk
 * delete: deleting the rows without decrementing what they contributed would
 * make the very numbers this exists to protect wrong in the other direction.
 */

/** A scan, because there is no index on "when was this phone last seen". */
const PAGE = 200;

export interface PurgeResult {
  /** Devices examined, which is every device row in the table. */
  examined: number;
  forgotten: number;
}

export interface PurgeOptions {
  /** Devices last seen before this are forgotten. Defaults to the plazo. */
  before?: Date;
  /**
   * Most devices to forget in one run, so a month of neglect cannot turn into a
   * function that runs for fifteen minutes and is killed halfway through. What is
   * left over goes next month; nothing here is urgent.
   */
  limit?: number;
  now?: Date;
}

export function idleCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);

  cutoff.setMonth(cutoff.getMonth() - DEVICE_IDLE_MONTHS);

  return cutoff;
}

/**
 * Why a scan and not an index.
 *
 * A sparse index on `lastSeenAt` would cost a write on every launch of every
 * phone in every municipality, for ever, to save one read a month. This reads
 * the whole table twelve times a year, and the whole table is one small item per
 * device plus the calendar of a few towns — pennies a year, against a cost that
 * scales with how well the product does. The day a scan is too slow is the day
 * there is a pilot paying for an index.
 */
export async function purgeIdleDevices(
  client: StoreClient,
  tableName: string,
  options: PurgeOptions = {},
): Promise<PurgeResult> {
  const before = options.before ?? idleCutoff(options.now);
  const limit = options.limit ?? 500;
  const cutoff = before.toISOString();

  const result: PurgeResult = { examined: 0, forgotten: 0 };
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entity = :device',
        ExpressionAttributeValues: { ':device': 'device' },
        // The id and the date, and nothing else: this function has no business
        // reading a push token it is not going to send to.
        ProjectionExpression: 'id, lastSeenAt',
        Limit: PAGE,
        ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey }),
      }),
    );

    for (const item of page.Items ?? []) {
      result.examined += 1;

      const id = item['id'];
      const lastSeen = item['lastSeenAt'];

      if (typeof id !== 'string' || id === '') continue;

      // A row written before `lastSeenAt` was kept up to date has one from the
      // day it registered, which is the right answer anyway: a phone nobody has
      // heard from since is a phone nobody has heard from since.
      if (typeof lastSeen !== 'string' || lastSeen >= cutoff) continue;

      await createDeviceStore(client, tableName, id).forget();

      result.forgotten += 1;

      if (result.forgotten >= limit) return result;
    }

    startKey = page.LastEvaluatedKey;
  } while (startKey !== undefined);

  return result;
}
