/**
 * The keys of the single table, in one place.
 *
 * Every guarantee this product makes about keeping one municipality's data away
 * from another's starts here, so the shapes are worth stating plainly:
 *
 *   * The partition key of anything that belongs to a municipality starts with
 *     `MUN#<id>`. A query that does not name a municipality is not forbidden —
 *     it cannot be written. That is the property that replaces the row level
 *     security of the PostgreSQL draft (D-026).
 *   * `gsi1` and `gsi2` are sparse. The attributes that put an event in them are
 *     only written when it reaches a state that belongs there, so the public
 *     calendar physically cannot return an unapproved event.
 *   * `gsi3` maps an event to the devices interested in it, and only the
 *     reminder job has IAM permission on it (D-032).
 *
 * The table itself is defined in `infra/terraform/modules/data`, and
 * `table-definition.ts` here mirrors it for the tests.
 */

export const PLATFORM_PK = 'PLATFORM';

/** Item of a municipality, and the prefix every one of its rows shares. */
export function municipalityPk(municipalityId: string): string {
  return `MUN#${municipalityId}`;
}

export function municipalityKey(municipalityId: string): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: 'META' };
}

/** Slug to municipality, the one lookup that is not scoped to a municipality. */
export function municipalityIndexKey(slug: string): { pk: string; sk: string } {
  return { pk: PLATFORM_PK, sk: `MUN#${slug}` };
}

export function categoryKey(
  municipalityId: string,
  categoryId: string,
): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `CAT#${categoryId}` };
}

export function organizationKey(
  municipalityId: string,
  organizationId: string,
): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `ORG#${organizationId}` };
}

export function eventKey(municipalityId: string, eventId: string): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `EVT#${eventId}` };
}

/** Prefix used to list one kind of row inside a municipality. */
export const SK_PREFIX = {
  category: 'CAT#',
  organization: 'ORG#',
  event: 'EVT#',
} as const;

export function eventUpdateKey(
  eventId: string,
  createdAt: Date,
  id: string,
): { pk: string; sk: string } {
  return { pk: `EVT#${eventId}`, sk: `UPD#${createdAt.toISOString()}#${id}` };
}

/**
 * A change an association asked for on an event that is already published.
 *
 * The event itself is not touched — the version the neighbours see stays up
 * while the town hall decides — so the asked-for change has to live somewhere,
 * and it lives next to the event it is about.
 *
 * The sort key is the change's own id and not a timestamp, unlike the notices
 * above: a decision on a change addresses it directly, and the ordering the
 * review inbox needs comes from the index, not from the key.
 */
export function pendingChangeKey(eventId: string, changeId: string): { pk: string; sk: string } {
  return { pk: `EVT#${eventId}`, sk: `CHG#${changeId}` };
}

export const CHANGE_PREFIX = 'CHG#';

export const NOTICE_PREFIX = 'UPD#';

/**
 * A line in the audit log, under the municipality it belongs to.
 *
 * Newest last by key, which is what `ScanIndexForward: false` then reverses, and
 * the reason the timestamp comes before the id: an audit log is read backwards
 * from now.
 */
export function auditKey(
  municipalityId: string,
  createdAt: Date,
  id: string,
): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `AUD#${createdAt.toISOString()}#${id}` };
}

export const AUDIT_PREFIX = 'AUD#';

export const MEMBERSHIP_PREFIX = 'MEM#';

export function liveSessionKey(eventId: string): { pk: string; sk: string } {
  return { pk: `EVT#${eventId}`, sk: 'LIVE' };
}

export function livePositionKey(eventId: string, recordedAt: Date): { pk: string; sk: string } {
  return { pk: `EVT#${eventId}`, sk: `POS#${recordedAt.toISOString()}` };
}

export const POSITION_PREFIX = 'POS#';

/**
 * The code a volunteer types, pointing at the session it belongs to.
 *
 * Its own row because it is looked up by the one thing the volunteer has — the
 * code on the screen or the QR — and not by a municipality: they are standing in
 * the street holding a phone, not choosing a town from a list. It carries a TTL,
 * so a code nobody used stops existing on its own.
 */
export function liveCodeKey(code: string): { pk: string; sk: string } {
  return { pk: `CODE#${code.toUpperCase()}`, sk: 'LIVE' };
}

export function dailyStatsKey(eventId: string, day: string): { pk: string; sk: string } {
  return { pk: `EVT#${eventId}`, sk: `STAT#${day}` };
}

/**
 * A resident's mark. The partition is the device, which is what makes one
 * device unable to read another's marks: it would have to name the other's id,
 * and the token it presents only carries its own.
 */
export function interestKey(
  deviceId: string,
  municipalityId: string,
  eventId: string,
): { pk: string; sk: string } {
  return { pk: `DEV#${deviceId}`, sk: `INT#${municipalityId}#${eventId}` };
}

export function devicePk(deviceId: string): string {
  return `DEV#${deviceId}`;
}

export function deviceKey(deviceId: string): { pk: string; sk: string } {
  return { pk: devicePk(deviceId), sk: 'META' };
}

/** A staff user's role in a municipality. Permissions live here, not in the token. */
export function membershipKey(
  authUserId: string,
  municipalityId: string,
): { pk: string; sk: string } {
  return { pk: `USER#${authUserId}`, sk: `MEM#${municipalityId}` };
}

export function membershipPk(authUserId: string): string {
  return `USER#${authUserId}`;
}

// ---------------------------------------------------------------------------
// The index attributes
//
// These are the sparse ones. Writing them is what makes an event reachable, and
// leaving them out is what makes it unreachable — which is why they are
// computed from the status in one function instead of being set by hand at
// every call site.
// ---------------------------------------------------------------------------

export const CALENDAR_INDEX = 'gsi1';
export const REVIEW_INDEX = 'gsi2';
export const INTERESTS_INDEX = 'gsi3';

export function calendarIndexPk(municipalityId: string): string {
  return `MUN#${municipalityId}#PUB`;
}

export function reviewIndexPk(municipalityId: string): string {
  return `MUN#${municipalityId}#REVIEW`;
}

export interface IndexAttributes {
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
}

/**
 * Where an event appears, given its state.
 *
 * `published` and `cancelled` are in the calendar, because a neighbour who
 * planned their evening around an event has to find out it was called off.
 * `pending_review` is in the review queue and nowhere else. A draft and a
 * rejected event are in neither index: they exist only for whoever owns them,
 * reachable by naming the municipality and the event.
 */
export function indexAttributesFor(event: {
  municipalityId: string;
  status: string;
  startAt: Date;
  createdAt: Date;
}): IndexAttributes {
  if (event.status === 'published' || event.status === 'cancelled') {
    return {
      gsi1pk: calendarIndexPk(event.municipalityId),
      gsi1sk: event.startAt.toISOString(),
    };
  }

  if (event.status === 'pending_review') {
    return {
      gsi2pk: reviewIndexPk(event.municipalityId),
      gsi2sk: event.createdAt.toISOString(),
    };
  }

  return {};
}
