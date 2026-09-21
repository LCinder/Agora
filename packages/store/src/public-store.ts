import {
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
import { fromEventItem } from './items';
import {
  CALENDAR_INDEX,
  PLATFORM_PK,
  SK_PREFIX,
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
      const from = range.from?.toISOString() ?? '0000';
      const to = range.to?.toISOString() ?? '9999';

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: CALENDAR_INDEX,
          KeyConditionExpression: 'gsi1pk = :pk and gsi1sk between :from and :to',
          ExpressionAttributeValues: {
            ':pk': calendarIndexPk(municipalityId),
            ':from': from,
            ':to': to,
          },
        }),
      );

      return (result.Items ?? []).map(fromEventItem);
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
