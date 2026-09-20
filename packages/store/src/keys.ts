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

/**
 * The same membership, filed under the municipality instead of the person.
 *
 * Two rows for one fact, which is the price of answering both questions this
 * product asks: "where may this person work" (by person) and "who has access to
 * my town hall" (by municipality). A single row cannot answer both without an
 * index, and an index costs a write on every change too — the difference is that
 * this one is readable in the same query the panel already makes.
 *
 * They are written and deleted together, in a transaction, because a mirror that
 * can drift is worse than not having one: it would show a technician who left.
 */
export function municipalMemberKey(
  municipalityId: string,
  authUserId: string,
): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `MEM#${authUserId}` };
}

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

/**
 * How many notifications a device has already had from one municipality today.
 *
 * Under the device, because that is who the cap protects, and keyed by
 * municipality because the promise is "not more than X a day **from the same
 * town**" (CLAUDE.md, 7.3): two towns a resident follows do not spend each
 * other's quota. It carries a TTL, so yesterday's counters delete themselves.
 */
export function notificationCounterKey(
  deviceId: string,
  municipalityId: string,
  day: string,
): { pk: string; sk: string } {
  return { pk: devicePk(deviceId), sk: `NOTIF#${municipalityId}#${day}` };
}

/**
 * The outbox: pushes that have to go out and have not gone out yet.
 *
 * One partition for the whole platform, which is exactly what makes it cheap to
 * poll: the notification job asks for `OUTBOX` every minute and almost always
 * gets nothing back. The alternative — an index of unsent notices, or a stream on
 * the table — is a permanent piece of infrastructure for something that happens
 * twice on a rainy Thursday.
 *
 * Writing here is what the panel does instead of sending: no municipal role has
 * permission on the index that says who is interested (D-032), so the panel
 * cannot send a push even by accident.
 */
export const OUTBOX_PK = 'OUTBOX';

/**
 * A push that has waited this long has missed the thing it was about. Better
 * deleted by itself than delivered a day late, saying an event starts in an hour.
 */
export const OUTBOX_LIFETIME_HOURS = 24;

export function outboxKey(createdAt: Date, id: string): { pk: string; sk: string } {
  return { pk: OUTBOX_PK, sk: `${createdAt.toISOString()}#${id}` };
}

/**
 * A municipality a device follows.
 *
 * Under the device, like everything else it owns, so it goes when the device asks
 * to be forgotten. It says a phone follows a town and nothing about who holds it:
 * there is no name here to leak because no name was ever asked for (D-029).
 */
export function deviceFollowKey(
  deviceId: string,
  municipalityId: string,
): { pk: string; sk: string } {
  return { pk: devicePk(deviceId), sk: `FOL#${municipalityId}` };
}

export const FOLLOW_PREFIX = 'FOL#';

/**
 * How many devices follow a municipality.
 *
 * A counter, not a list: the panel's "dispositivos activos" tile is the number of
 * neighbours with the app, and the only way to answer it that does not involve a
 * query the panel's role is forbidden from making. Kept under the municipality so
 * the statistics read it with the same query they already make.
 */
export function deviceCountKey(municipalityId: string): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: 'STAT#DEVICES' };
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
