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
  /** Openings of the detail screen, one per phone per day. Same rule: a number, never a list. */
  viewCount: number;
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

    // Zero, and never `event.interestCount`. This builds the item for a brand
    // new event; on an edit the write expression below refuses to touch either
    // tally, which is what stops an edit taking them back to zero.
    interestCount: 0,
    viewCount: 0,
  };
}

export function fromEventItem(item: Record<string, unknown>): Event {
  return eventSchema.parse(item);
}

/**
 * The attributes an edit may write.
 *
 * Deliberately a list and not "everything in the item": `pk`, `sk` and `entity`
 * are not an editor's to touch, and `interestCount` belongs to the residents.
 * Leaving them out of the expression is how that is guaranteed.
 */
const WRITABLE_FIELDS = [
  'title',
  'description',
  'categoryId',
  'startAt',
  'endAt',
  'allDay',
  'location',
  'imageUrl',
  'priceInfo',
  'isFree',
  'audienceTags',
  'status',
  'rejectionReason',
  'isFeatured',
  'liveTrackingEnabled',
  'updatedAt',
  'publishedAt',
] as const;

/**
 * The attributes written once and never again: what the event *is*, as opposed
 * to what it currently says. An edit leaves them alone; a creation has to write
 * them or the row is unreadable.
 */
const CREATION_FIELDS = ['entity', 'id', 'municipalityId', 'organizationId', 'createdAt'] as const;

const INDEX_ATTRIBUTES = ['gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

export interface EventWriteOptions {
  /**
   * True when the row may not exist yet, which also writes the fields above.
   * The panel edits and passes nothing; the seed migration upserts and passes
   * this.
   */
  create?: boolean;
}

export interface EventWriteExpression {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

/**
 * How an event is written once it already exists — or might.
 *
 * An update and not a `Put` of the whole item, for one reason that matters: the
 * item also carries `interestCount` and `viewCount`, which residents increment
 * and no writer here may reset. Rewriting the item would take them back to zero
 * on every edit, and those counters are the only thing the panel is ever
 * allowed to see about who cared.
 *
 * The index attributes are recomputed from the new state and removed when the
 * state does not belong in an index. That single line is what moves an event
 * between the public calendar, the review queue and neither.
 *
 * Shared by the panel and by the seed migration, because two builders of the
 * same expression drift, and what they would drift on is which attributes are
 * safe to overwrite.
 */
export function eventWriteExpression(
  event: Event,
  options: EventWriteOptions = {},
): EventWriteExpression {
  const item = toEventItem(event);
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':zero': 0 };
  const sets: string[] = [
    'interestCount = if_not_exists(interestCount, :zero)',
    'viewCount = if_not_exists(viewCount, :zero)',
  ];
  const removes: string[] = [];

  const fields =
    options.create === true ? [...WRITABLE_FIELDS, ...CREATION_FIELDS] : WRITABLE_FIELDS;

  for (const field of fields) {
    names[`#${field}`] = field;
    values[`:${field}`] = item[field];
    sets.push(`#${field} = :${field}`);
  }

  const attributes = indexAttributesFor(event);

  for (const key of INDEX_ATTRIBUTES) {
    names[`#${key}`] = key;

    const value = attributes[key];

    if (value === undefined) {
      removes.push(`#${key}`);
    } else {
      values[`:${key}`] = value;
      sets.push(`#${key} = :${key}`);
    }
  }

  return {
    UpdateExpression:
      `SET ${sets.join(', ')}` + (removes.length === 0 ? '' : ` REMOVE ${removes.join(', ')}`),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

/** How many residents marked an event, straight off the counter. */
export function interestCountOf(item: Record<string, unknown>): number {
  return counterOf(item, 'interestCount');
}

/** How many phones opened it, straight off the other counter. */
export function viewCountOf(item: Record<string, unknown>): number {
  return counterOf(item, 'viewCount');
}

/**
 * Zero for an item written before the counter existed.
 *
 * Not a nicety: every event seeded before this was added has no such attribute,
 * and a report that says `NaN` where a number belongs is a report a councillor
 * stops trusting.
 */
function counterOf(item: Record<string, unknown>, name: string): number {
  const value = item[name];

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
