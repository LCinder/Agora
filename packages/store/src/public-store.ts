import {
  type Activity,
  type Event,
  type EventCategory,
  type Municipality,
  type Organization,
  eventCategorySchema,
  municipalitySchema,
  organizationSchema,
} from '@agora/core';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { fromActivityItem, fromEventItem } from './items';
import {
  CALENDAR_INDEX,
  PLATFORM_PK,
  SK_PREFIX,
  activityPrefixFor,
  calendarIndexPk,
  eventKey,
  municipalityIndexKey,
  municipalityKey,
  municipalityPk,
} from './keys';

/**
 * What a resident's request can reach.
 *
 * Everything here is a read, and every read is either the public calendar or a
 * single published event. There is no method that returns a draft, an event
 * waiting for approval, a device or an interest — not because they are filtered
 * out afterwards, but because the queries go to the calendar index, and an
 * event only appears in that index once it is visible (D-026).
 *
 * The IAM policy of the public function says the same thing (D-032). This is the
 * layer above it, so that a bug cannot reach for what the policy already denies.
 */
export interface MunicipalitySummary {
  id: string;
  slug: string;
  name: string;
  province: string;
  population: number;
  latitude: number;
  longitude: number;
}

export interface PublicStore {
  listMunicipalities(): Promise<MunicipalitySummary[]>;
  getMunicipality(municipalityId: string): Promise<Municipality | null>;
  getMunicipalityBySlug(slug: string): Promise<Municipality | null>;
  listCategories(municipalityId: string): Promise<EventCategory[]>;
  listOrganizations(municipalityId: string): Promise<Organization[]>;
  /** The calendar: published and cancelled events, by date. */
  listCalendar(municipalityId: string, range?: { from?: Date; to?: Date }): Promise<Event[]>;
  /** One event, and only if a resident is allowed to see it. */
  getVisibleEvent(municipalityId: string, eventId: string): Promise<Event | null>;
  /**
   * Every programme in the municipality, off the same index as the calendar.
   *
   * An activity is written into that index only when its own state and its
   * event's both allow it, so this cannot return the programme of a draft any
   * more than `listCalendar` can return the draft. That is the same guarantee,
   * from the same mechanism, and not a filter applied afterwards.
   */
  listActivities(municipalityId: string, range?: { from?: Date; to?: Date }): Promise<Activity[]>;
  /**
   * One event's programme, read directly rather than through the index.
   *
   * For the public page of a shared link, which already has the event and needs
   * the lines under it. The parent's visibility is the caller's to have
   * established — it got the event from `getVisibleEvent` — so what is applied
   * here is the line's own.
   */
  listActivitiesOfEvent(municipalityId: string, eventId: string): Promise<Activity[]>;
}

export function createPublicStore(client: StoreClient, tableName: string): PublicStore {
  async function getMunicipality(municipalityId: string): Promise<Municipality | null> {
    const result = await client.send(
      new GetCommand({ TableName: tableName, Key: municipalityKey(municipalityId) }),
    );

    return result.Item === undefined ? null : municipalitySchema.parse(result.Item);
  }

  async function queryPrefix(municipalityId: string, prefix: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': municipalityPk(municipalityId),
          ':prefix': prefix,
        },
      }),
    );

    return result.Items ?? [];
  }

  /**
   * The calendar index, narrowed to one kind of row.
   *
   * Events and programmes share the index on purpose: an activity belongs in the
   * public calendar under exactly the same conditions as an event, and a second
   * index would mean a second set of sparse attributes to keep in step — and the
   * one that drifts is the one that leaks. The cost is a filter here, which
   * DynamoDB applies before anything crosses the wire.
   */
  async function calendarRows(
    municipalityId: string,
    range: { from?: Date; to?: Date },
    entity: 'event' | 'activity',
  ) {
    const from = range.from?.toISOString() ?? '0000';
    const to = range.to?.toISOString() ?? '9999';

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: CALENDAR_INDEX,
        KeyConditionExpression: 'gsi1pk = :pk and gsi1sk between :from and :to',
        FilterExpression: '#entity = :entity',
        ExpressionAttributeNames: { '#entity': 'entity' },
        ExpressionAttributeValues: {
          ':pk': calendarIndexPk(municipalityId),
          ':from': from,
          ':to': to,
          ':entity': entity,
        },
      }),
    );

    return result.Items ?? [];
  }

  return {
    async listMunicipalities() {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': PLATFORM_PK, ':prefix': 'MUN#' },
        }),
      );

      return (result.Items ?? []).map((item) => ({
        id: String(item['id']),
        slug: String(item['slug']),
        name: String(item['name']),
        province: String(item['province']),
        population: Number(item['population']),
        latitude: Number(item['latitude']),
        longitude: Number(item['longitude']),
      }));
    },

    getMunicipality,

    async getMunicipalityBySlug(slug) {
      const pointer = await client.send(
        new GetCommand({ TableName: tableName, Key: municipalityIndexKey(slug) }),
      );

      if (pointer.Item === undefined) return null;

      // Not `this.getMunicipality`: a store whose methods break when they are
      // destructured is a trap, and destructuring a store is the obvious thing
      // for a handler to do.
      return getMunicipality(String(pointer.Item['id']));
    },

    async listCategories(municipalityId) {
      const items = await queryPrefix(municipalityId, SK_PREFIX.category);

      return items.map((item) => eventCategorySchema.parse(item));
    },

    async listOrganizations(municipalityId) {
      const items = await queryPrefix(municipalityId, SK_PREFIX.organization);

      return items.map((item) => organizationSchema.parse(item));
    },

    async listCalendar(municipalityId, range = {}) {
      return (await calendarRows(municipalityId, range, 'event')).map(fromEventItem);
    },

    async listActivities(municipalityId, range = {}) {
      return (await calendarRows(municipalityId, range, 'activity')).map(fromActivityItem);
    },

    async listActivitiesOfEvent(municipalityId, eventId) {
      const items = await queryPrefix(municipalityId, activityPrefixFor(eventId));

      return items
        .map(fromActivityItem)
        .filter((activity) => activity.status === 'published' || activity.status === 'cancelled')
        .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    },

    async getVisibleEvent(municipalityId, eventId) {
      const result = await client.send(
        new GetCommand({ TableName: tableName, Key: eventKey(municipalityId, eventId) }),
      );

      if (result.Item === undefined) return null;

      const event = fromEventItem(result.Item);

      // The index cannot return an invisible event, but a direct read by id can,
      // so the same rule is applied here rather than trusted to the caller.
      return event.status === 'published' || event.status === 'cancelled' ? event : null;
    },
  };
}
