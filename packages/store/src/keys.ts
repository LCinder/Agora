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

/**
 * One line of an event's programme.
 *
 * Under the municipality and not under the event, unlike the notices and the
 * pending changes next door. Those are read one event at a time, from a screen
 * that already knows which event it is on; a programme is read both ways — the
 * detail screen wants one event's lines, and the calendar wants every programme
 * in the town at once to know which cards say "12 actividades" and how long the
 * feria really runs. Filing them under the municipality answers both with one
 * query shape, and keeps the rule that everything belonging to a town sits in
 * its partition.
 *
 * The event id is in the sort key rather than only in an attribute so that
 * `begins_with(sk, "ACT#<eventId>#")` returns exactly one programme.
 */
export function activityKey(
  municipalityId: string,
  eventId: string,
  activityId: string,
): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `ACT#${eventId}#${activityId}` };
}

/** The prefix that selects one event's programme and nothing else. */
export function activityPrefixFor(eventId: string): string {
  return `ACT#${eventId}#`;
}

/** Prefix used to list one kind of row inside a municipality. */
export const SK_PREFIX = {
  category: 'CAT#',
  organization: 'ORG#',
  event: 'EVT#',
  activity: 'ACT#',
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

/**
 * Marks added in one month, in one municipality.
 *
 * A counter and not a log, for the same reason as the device count: the panel
 * needs the shape of the curve and nothing else. It lives under the municipality
 * so the whole series comes back in the query the statistics already make, and it
 * is keyed `MONTH#` rather than `STAT#` so it does not share a prefix with the
 * device counter next to it.
 *
 * It counts **additions**, never subtractions. A neighbour who unmarks an event
 * three months later cannot un-happen the interest they showed in June, and
 * deciding which month to take it off is a question with no good answer — so the
 * series says "Asistentes por mes", which is what it is.
 */
export function monthlyStatsKey(municipalityId: string, month: string): { pk: string; sk: string } {
  return { pk: municipalityPk(municipalityId), sk: `MONTH#${month}` };
}

export const MONTH_PREFIX = 'MONTH#';

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
 * The same, for one line of a programme.
 *
 * Its own prefix rather than a longer `INT#`: "borrar mis datos" walks the
 * device's rows and has to decrement the right counter for each one, and telling
 * the two apart by counting the hashes in a sort key is the kind of thing that
 * works until an id contains a hash.
 *
 * It carries the event as well as the activity because the counter it moves
 * lives on the activity row, and that row is keyed by both.
 */
export function activityInterestKey(
  deviceId: string,
  municipalityId: string,
  eventId: string,
  activityId: string,
): { pk: string; sk: string } {
  return { pk: devicePk(deviceId), sk: `IAC#${municipalityId}#${eventId}#${activityId}` };
}

export const INTEREST_PREFIX = 'INT#';

export const ACTIVITY_INTEREST_PREFIX = 'IAC#';

/**
 * That this phone already opened this event today.
 *
 * A view is worth counting once a day per phone: a neighbour who checks the
 * time of the procession four times has not made the event four times more
 * popular, and a tally a town hall cannot trust is worse than no tally. The row
 * exists only to make that rule enforceable on the server, so it holds nothing
 * but its own key and carries a TTL that deletes it two days later.
 *
 * Under the device, like everything else a phone owns, so "borrar mis datos"
 * takes it with the rest.
 */
export function viewGuardKey(
  deviceId: string,
  municipalityId: string,
  eventId: string,
  day: string,
): { pk: string; sk: string } {
  return { pk: devicePk(deviceId), sk: `VIEW#${municipalityId}#${eventId}#${day}` };
}

export const VIEW_PREFIX = 'VIEW#';

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

/**
 * Where a mark on one line of a programme is filed, on the same restricted index
 * as the marks on events.
 *
 * `ACT#` and not `EVT#`, so a reminder about the falconry show reaches the people
 * who asked about the falconry show and not everybody who marked the feria. The
 * two never collide: the prefix is part of the key.
 */
export function activityInterestIndexPk(activityId: string): string {
  return `ACT#${activityId}`;
}

/**
 * Everybody who follows a municipality, on the same index as the interests.
 *
 * Deliberately `gsi3` and not a fourth index. That index is the one place in the
 * system that maps something to devices, the only one the notification function
 * may read, and the one every other role denies itself explicitly (D-032). A
 * separate audience index would mean two such places, two grants and two denies —
 * and the second one to be forgotten in a refactor is the one that leaks.
 *
 * It costs one extra index write on the launch where a phone first follows a
 * town, and nothing after that.
 */
export function audienceIndexPk(municipalityId: string): string {
  return `MUN#${municipalityId}#FOL`;
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

/**
 * Where one line of a programme appears, given its state and its event's.
 *
 * The parent's state comes first and is the whole reason this is a separate
 * function: an activity is only ever as public as the event it hangs off. The
 * programme of a draft is not in the calendar index however published each line
 * claims to be, which is what stops a feria the town hall is still writing from
 * leaking one activity at a time.
 *
 * It can be in both indexes at once, and that is correct: a published line with
 * an edit waiting is what the neighbours read *and* what the town hall has to
 * decide on. Its calendar entry shows the published values, because those are
 * the ones on the row — the change lives in `pendingPatch` and touches nothing
 * else until it is approved.
 */
export function activityIndexAttributesFor(activity: {
  municipalityId: string;
  status: string;
  /** The status of the event it belongs to. */
  parentStatus: string;
  startAt: Date;
  createdAt: Date;
  pendingPatch: unknown;
}): IndexAttributes {
  const attributes: IndexAttributes = {};

  const parentVisible = activity.parentStatus === 'published' || activity.parentStatus === 'cancelled';
  const visible = activity.status === 'published' || activity.status === 'cancelled';

  if (parentVisible && visible) {
    attributes.gsi1pk = calendarIndexPk(activity.municipalityId);
    attributes.gsi1sk = activity.startAt.toISOString();
  }

  if (activity.status === 'pending_review' || activity.pendingPatch != null) {
    attributes.gsi2pk = reviewIndexPk(activity.municipalityId);
    attributes.gsi2sk = activity.createdAt.toISOString();
  }

  return attributes;
}
