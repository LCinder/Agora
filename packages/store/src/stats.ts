import { type Event, isAwaitingReview } from '@agora/core';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { interestCountOf } from './items';
import { MONTH_PREFIX, SK_PREFIX, deviceCountKey, municipalityPk } from './keys';
import type { StaffActor } from './staff-store';

/**
 * The numbers the panel shows, and the numbers it is allowed to show.
 *
 * What a councillor wants out of this is the argument for next year's budget:
 * which events people cared about, which kinds of event, how it moves over the
 * months. All of that comes from counters on the events themselves — this
 * module never goes near who marked what, and could not: the index that would
 * answer it is denied to this function's role (D-032).
 *
 * Small counts are reported as "fewer than five" rather than as a number, which
 * is the rule the project document sets for any segment (section 10). A count of
 * two in a village is not an anonymous statistic, it is two neighbours, and the
 * difference between a number and a threshold costs the town hall nothing:
 * either way they learn the event did not land.
 *
 * The aggregation runs on read, over one query. There is no daily statistics
 * table yet because there is nothing it would make faster: a municipality has
 * dozens of events a month, not millions, and a table of pre-computed totals is
 * a second source of truth to keep honest.
 */
export const MINIMUM_SEGMENT = 5;

/** A year of the monthly series is what a memoria anual compares against. */
const MONTHS_KEPT = 12;

/** A count, or null when it is too small to be shown. */
export type ReportableCount = number | null;

export interface EventInterest {
  eventId: string;
  title: string;
  startAt: Date;
  interested: ReportableCount;
}

export interface PanelStats {
  /**
   * The neighbours, counted and nothing else.
   *
   * The number of phones that follow this municipality. Nobody registers to be in
   * it: a resident opens the app, picks their town and is counted, and there is no
   * name, email or telephone attached to any of them (D-029). It is the
   * municipality's own total and not a segment, so it is never suppressed.
   */
  devices: { following: number };
  events: {
    total: number;
    published: number;
    awaitingReview: number;
    draft: number;
    cancelled: number;
  };
  interests: {
    /** The municipality's total. Not a segment, so never suppressed. */
    total: number;
    /** Most marked events first. */
    topEvents: EventInterest[];
    byCategory: { categoryId: string; interested: ReportableCount }[];
    /**
     * New marks per month, oldest first, as `2026-09`.
     *
     * The shape of the curve, which is the question a councillor actually asks:
     * is this growing. Counted on the way up only, so it never goes backwards
     * because somebody tidied their list — and it is a municipal total, not a
     * segment, so it is never suppressed.
     */
    monthly: { month: string; interested: number }[];
  };
  /** How many numbers were held back for being too small. */
  suppressed: number;
  generatedAt: Date;
}

function reportable(count: number): ReportableCount {
  return count < MINIMUM_SEGMENT ? null : count;
}

export interface StatsStore {
  summary(options?: { topEvents?: number }): Promise<PanelStats>;
}

export function createStatsStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): StatsStore {
  return {
    async summary(options = {}) {
      const [result, devices, months] = await Promise.all([
        client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
            ExpressionAttributeValues: {
              ':pk': municipalityPk(actor.municipalityId),
              ':prefix': SK_PREFIX.event,
            },
          }),
        ),
        client.send(
          new GetCommand({
            TableName: tableName,
            Key: deviceCountKey(actor.municipalityId),
          }),
        ),
        client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
            ExpressionAttributeValues: {
              ':pk': municipalityPk(actor.municipalityId),
              ':prefix': MONTH_PREFIX,
            },
            // Newest first, then reversed below: a year is all this reads, however
            // many years the municipality has been on the platform.
            ScanIndexForward: false,
            Limit: MONTHS_KEPT,
          }),
        ),
      ]);

      const items = result.Items ?? [];
      const following = Number(devices.Item?.['deviceCount'] ?? 0);

      const monthly = (months.Items ?? [])
        .map((item) => ({
          month: String(item['sk']).replace(MONTH_PREFIX, ''),
          interested: Number(item['interestsAdded'] ?? 0),
        }))
        .reverse();

      // An association gets the numbers of its own events, which is what the
      // product document promises it, and nothing about the rest of the town.
      const mine =
        actor.organizationId === null
          ? items
          : items.filter((item) => item['organizationId'] === actor.organizationId);

      const events = {
        total: mine.length,
        published: 0,
        awaitingReview: 0,
        draft: 0,
        cancelled: 0,
      };

      const perCategory = new Map<string, number>();
      const perEvent: { eventId: string; title: string; startAt: Date; count: number }[] = [];
      let total = 0;

      for (const item of mine) {
        const status = String(item['status']) as Event['status'];

        if (status === 'published') events.published += 1;
        if (status === 'draft') events.draft += 1;
        if (status === 'cancelled') events.cancelled += 1;
        if (isAwaitingReview({ status })) events.awaitingReview += 1;

        const count = interestCountOf(item);
        const categoryId = String(item['categoryId']);

        total += count;
        perCategory.set(categoryId, (perCategory.get(categoryId) ?? 0) + count);
        perEvent.push({
          eventId: String(item['id']),
          title: String(item['title']),
          startAt: new Date(String(item['startAt'])),
          count,
        });
      }

      let suppressed = 0;

      const topEvents = perEvent
        .sort((left, right) => right.count - left.count)
        .slice(0, options.topEvents ?? 10)
        .map((entry) => {
          const interested = reportable(entry.count);

          if (interested === null) suppressed += 1;

          return {
            eventId: entry.eventId,
            title: entry.title,
            startAt: entry.startAt,
            interested,
          };
        });

      const byCategory = [...perCategory.entries()]
        .sort(([, left], [, right]) => right - left)
        .map(([categoryId, count]) => {
          const interested = reportable(count);

          if (interested === null) suppressed += 1;

          return { categoryId, interested };
        });

      return {
        devices: { following },
        events,
        interests: { total, topEvents, byCategory, monthly },
        suppressed,
        generatedAt: new Date(),
      };
    },
  };
}
