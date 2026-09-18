import {
  type Event,
  type EventCategory,
  type Municipality,
  type Organization,
  eventSchema,
} from '@agora/core';

import { eventKey, indexAttributesFor, municipalityPk } from './keys';

/**
 * Domain objects to table items, and back.
 *
 * DynamoDB has no date type, so instants are stored as ISO strings — sortable
 * as text, which is what lets the calendar index be ordered by start date with
 * no extra work. Reading goes back through the Zod schema of @agora/core rather
 * than being cast: the table is the one place data can arrive from an older
 * version of the code, so it is the one place worth validating.
 */

export interface EventItem extends Record<string, unknown> {
  pk: string;
  sk: string;
  entity: 'event';
  id: string;
  municipalityId: string;
  organizationId: string | null;
  /** Count of residents who marked "Me interesa". The panel sees this and never the devices. */
  interestCount: number;
}

export function toEventItem(event: Event): EventItem {
  const { pk, sk } = eventKey(event.municipalityId, event.id);

  return {
    pk,
    sk,
    entity: 'event',
    ...indexAttributesFor(event),

    id: event.id,
    municipalityId: event.municipalityId,
    organizationId: event.organizationId,

    title: event.title,
    description: event.description,
    categoryId: event.categoryId,

    startAt: event.startAt.toISOString(),
    endAt: event.endAt === null ? null : event.endAt.toISOString(),
    allDay: event.allDay,

    location: event.location,
    imageUrl: event.imageUrl,
    priceInfo: event.priceInfo,
    isFree: event.isFree,
    audienceTags: event.audienceTags,

    status: event.status,
    rejectionReason: event.rejectionReason,
    isFeatured: event.isFeatured,
    liveTrackingEnabled: event.liveTrackingEnabled,

    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    publishedAt: event.publishedAt === null ? null : event.publishedAt.toISOString(),

    interestCount: 0,
  };
}

export function fromEventItem(item: Record<string, unknown>): Event {
  return eventSchema.parse(item);
}

/** How many residents marked an event, straight off the counter. */
export function interestCountOf(item: Record<string, unknown>): number {
  const value = item['interestCount'];

  return typeof value === 'number' ? value : 0;
}

export function municipalityItem(municipality: Municipality): Record<string, unknown> {
  return {
    pk: municipalityPk(municipality.id),
    sk: 'META',
    entity: 'municipality',
    ...municipality,
  };
}

/**
 * The slug to municipality pointer.
 *
 * The only row in the table whose partition is not a municipality or a device,
 * and the reason a resident can open a link with a slug in it without the
 * platform having to scan anything.
 */
export function municipalityPointerItem(municipality: {
  id: string;
  slug: string;
  name: string;
  province: string;
  population: number;
  latitude: number;
  longitude: number;
}): Record<string, unknown> {
  return {
    pk: 'PLATFORM',
    sk: `MUN#${municipality.slug}`,
    entity: 'municipality_pointer',
    ...municipality,
  };
}

export function organizationItem(
  municipalityId: string,
  organization: Organization,
): Record<string, unknown> {
  return {
    pk: municipalityPk(municipalityId),
    sk: `ORG#${organization.id}`,
    entity: 'organization',
    ...organization,
    municipalityId,
  };
}

/**
 * A category row.
 *
 * `municipalityId` is overwritten with the municipality it is stored under, on
 * purpose. A shared category has `null` in the seed files, where "shared" is a
 * useful idea; in the table every row belongs to a municipality, so a shared
 * category is copied into each one. That is what keeps the partition key rule
 * true with no exception to remember.
 */
export function categoryItem(
  municipalityId: string,
  category: EventCategory,
): Record<string, unknown> {
  return {
    pk: municipalityPk(municipalityId),
    sk: `CAT#${category.id}`,
    entity: 'category',
    ...category,
    municipalityId,
  };
}
