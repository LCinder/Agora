import {
  type Activity,
  type Event,
  type EventStatus,
  type Organization,
  isActivityVisible,
  organizationSchema,
  publishesWithoutReview,
} from '@agora/core';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { StoreClient } from './client';
import { forbidden, notFound } from './errors';
import {
  activityWriteExpression,
  eventWriteExpression,
  fromActivityItem,
  fromEventItem,
  interestCountOf,
  toActivityItem,
  toEventItem,
} from './items';
import {
  CHANGE_PREFIX,
  REVIEW_INDEX,
  SK_PREFIX,
  activityKey,
  activityPrefixFor,
  eventKey,
  municipalityPk,
  organizationKey,
  pendingChangeKey,
  reviewIndexPk,
} from './keys';

/**
 * What municipal staff and associations can reach.
 *
 * The actor is not a suggestion: it is built from the membership row of the
 * table — never from the token, because a role belongs to a municipality and a
 * Cognito group knows nothing about municipalities (D-029) — and every method
 * here reads it. A store is created for one actor in one municipality, so there
 * is no method that could touch another municipality: the municipality is not a
 * parameter anywhere below.
 *
 * The rules this layer enforces, which are the ones the PostgreSQL draft
 * enforced with row level security:
 *
 *   * An association sees its own events plus what any resident can see. It does
 *     not see the town hall's drafts, nor another association's pending events.
 *   * An association cannot publish. If it could, the review queue would be
 *     decorative. The exception is an association the town hall marked as
 *     trusted, which is the town hall's decision and not the association's.
 *   * An association cannot approve, reject, or edit an event that is not its
 *     own.
 *   * Nobody here can read who is interested in an event. There is no method for
 *     it, and the IAM policy of this function denies the index that would answer
 *     it (D-032). The count comes off a counter on the event itself.
 */
export type StaffRole = 'org_editor' | 'municipal_editor' | 'municipal_admin';

export interface StaffActor {
  authUserId: string;
  municipalityId: string;
  role: StaffRole;
  /** Set for `org_editor`, and null for municipal staff. */
  organizationId: string | null;
}

export interface NewEvent {
  id: string;
  title: string;
  description?: string;
  categoryId: string;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  location: { name: string; latitude: number | null; longitude: number | null };
  imageUrl?: string | null;
  priceInfo?: string | null;
  isFree?: boolean;
  /** What the author asks for. An association does not get to ask for `published`. */
  status?: Extract<EventStatus, 'draft' | 'pending_review' | 'published'>;
  isFeatured?: boolean;
}

export interface EventPatch {
  title?: string;
  description?: string;
  categoryId?: string;
  startAt?: Date;
  endAt?: Date | null;
  location?: { name: string; latitude: number | null; longitude: number | null };
  priceInfo?: string | null;
  isFree?: boolean;
  isFeatured?: boolean;
  /**
   * Where the poster is, or null for none.
   *
   * Set by the route that uploads one, which has already put the bytes in the
   * bucket: what an event carries is a URL and never an image. An association
   * may change its own event's poster like any other field, and the same review
   * rules apply — a new poster on a published event goes to the town hall.
   */
  imageUrl?: string | null;
}

/**
 * A change an association asked for on an event that is already published.
 *
 * The acceptance criterion this exists for is exact: an untrusted association
 * editing a published event sends the change back to review, and the published
 * version stays visible (project document, section 7.2). A neighbour who already
 * planned their evening around what the poster said must not see it change
 * because somebody is still editing.
 */
export interface PendingChange {
  id: string;
  eventId: string;
  municipalityId: string;
  organizationId: string | null;
  /** What was asked for, to be applied on approval. */
  payload: EventPatch;
  status: 'pending' | 'applied' | 'rejected';
  rejectionReason: string | null;
  createdBy: string;
  createdAt: Date;
}

/** An edit either happened or is waiting for the town hall. */
export type EditResult =
  { kind: 'applied'; event: Event } | { kind: 'queued'; change: PendingChange };

/**
 * What the review inbox holds: new events, changes to published ones, and lines
 * of a programme in either of those two states.
 *
 * An activity needs no second shape because it carries its own: a line waiting
 * to be published says so in `status`, and a line whose edit is waiting says so
 * in `pendingPatch`, with the published values still on the row underneath.
 */
export type ReviewItem =
  | { kind: 'event'; event: Event }
  | { kind: 'change'; change: PendingChange }
  | { kind: 'activity'; activity: Activity };

/** A new line of a programme. The three nullable fields mean "same as the event". */
export interface NewActivity {
  id: string;
  title: string;
  description?: string;
  categoryId?: string | null;
  startAt: Date;
  endAt?: Date | null;
  location?: { name: string; latitude: number | null; longitude: number | null } | null;
  isFree?: boolean | null;
  priceInfo?: string | null;
  /** What the author asks for. An association does not get to ask for `published`. */
  status?: Extract<EventStatus, 'draft' | 'pending_review' | 'published'>;
}

export interface ActivityPatch {
  title?: string;
  description?: string;
  categoryId?: string | null;
  startAt?: Date;
  endAt?: Date | null;
  location?: { name: string; latitude: number | null; longitude: number | null } | null;
  isFree?: boolean | null;
  priceInfo?: string | null;
}

/**
 * What became of an edit to one line of a programme.
 *
 * `queued` means the change is in `pendingPatch` and the neighbours are still
 * reading the old line — the same promise an event's edit makes, kept in an
 * attribute instead of a row of its own because four fields fit in one.
 */
export interface ActivityEditResult {
  kind: 'applied' | 'queued';
  activity: Activity;
}

export interface StaffStore {
  listEvents(): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | null>;
  createEvent(input: NewEvent): Promise<Event>;
  updateEvent(eventId: string, patch: EventPatch): Promise<EditResult>;
  /** Municipal staff only. Events waiting for approval and changes to published ones. */
  reviewQueue(): Promise<ReviewItem[]>;
  approveEvent(eventId: string): Promise<Event>;
  rejectEvent(eventId: string, reason: string): Promise<Event>;
  cancelEvent(eventId: string): Promise<Event>;
  /**
   * Removes an event for good, with the changes anybody asked for on it.
   *
   * Cancelling is the right answer almost every time: a neighbour who planned
   * their evening around an event has to be told it is off, and one that simply
   * vanishes reads as a bug. This is for the other case — the duplicate, the
   * test entry, the concert typed into the wrong town — where leaving a
   * tombstone in the calendar would be worse than the mistake.
   *
   * So it is the town hall's, and an association may only delete its own event
   * while nobody has seen it: once something is published or cancelled, taking
   * it off the calendar is a municipal decision.
   */
  deleteEvent(eventId: string): Promise<void>;
  /** The changes asked for on one event, whatever their state. */
  listChanges(eventId: string): Promise<PendingChange[]>;
  approveChange(eventId: string, changeId: string): Promise<Event>;
  rejectChange(eventId: string, changeId: string, reason: string): Promise<PendingChange>;
  /** How many residents marked it. Never who. */
  interestCount(eventId: string): Promise<number>;

  // --- programmes ----------------------------------------------------------
  //
  // An activity is never reached on its own: every method below takes the event
  // it belongs to, and the permission question is answered about that event.
  // There is no such thing as an activity somebody may edit inside an event they
  // may not.

  /** Every line of every programme in the municipality, or of one event. */
  listActivities(eventId?: string): Promise<Activity[]>;
  createActivity(eventId: string, input: NewActivity): Promise<Activity>;
  updateActivity(
    eventId: string,
    activityId: string,
    patch: ActivityPatch,
  ): Promise<ActivityEditResult>;
  /** Struck through on the programme, not gone: the rain got the falconry show. */
  cancelActivity(eventId: string, activityId: string): Promise<Activity>;
  /**
   * Off the programme for good, with the marks residents left on it.
   *
   * The marks are not deleted — they live under the devices that made them,
   * behind the index this role is denied — but a line that is gone is never read
   * and never reminded, so they sit there inert. Same rule as a deleted event.
   */
  deleteActivity(eventId: string, activityId: string): Promise<void>;
  /** Publishes a new line, or applies the edit waiting on a published one. */
  approveActivity(eventId: string, activityId: string): Promise<Activity>;
  rejectActivity(eventId: string, activityId: string, reason: string): Promise<Activity>;
}

/**
 * A patch on its way into the table.
 *
 * DynamoDB has no date type, so the two dates a patch can carry become strings —
 * the same ISO strings the event itself is stored with, so a change that sat in
 * the queue for a week applies exactly as it would have on the day it was asked
 * for.
 */
function serialisePatch(patch: EventPatch): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...patch };

  if (patch.startAt !== undefined) raw['startAt'] = patch.startAt.toISOString();

  if (patch.endAt !== undefined) {
    raw['endAt'] = patch.endAt === null ? null : patch.endAt.toISOString();
  }

  return raw;
}

function revivePatch(raw: unknown): EventPatch {
  if (typeof raw !== 'object' || raw === null) return {};

  const stored = raw as Record<string, unknown>;
  const patch: EventPatch = {};

  for (const field of ['title', 'description', 'categoryId', 'priceInfo'] as const) {
    const value = stored[field];

    if (typeof value === 'string') patch[field] = value;
  }

  for (const field of ['isFree', 'isFeatured'] as const) {
    const value = stored[field];

    if (typeof value === 'boolean') patch[field] = value;
  }

  // Nullable, so it needs its own two lines rather than joining the strings
  // above: null is what taking the poster off an event looks like, and a change
  // that lost it on the way through the queue would silently put the old poster
  // back when the town hall approved it.
  if (stored['imageUrl'] === null) patch.imageUrl = null;
  else if (typeof stored['imageUrl'] === 'string') patch.imageUrl = stored['imageUrl'];

  if (typeof stored['startAt'] === 'string') patch.startAt = new Date(stored['startAt']);

  if (stored['endAt'] === null) patch.endAt = null;
  else if (typeof stored['endAt'] === 'string') patch.endAt = new Date(stored['endAt']);

  const location = stored['location'];

  if (typeof location === 'object' && location !== null) {
    const shape = location as Record<string, unknown>;

    patch.location = {
      name: String(shape['name'] ?? ''),
      latitude: typeof shape['latitude'] === 'number' ? shape['latitude'] : null,
      longitude: typeof shape['longitude'] === 'number' ? shape['longitude'] : null,
    };
  }

  return patch;
}

function toPendingChange(item: Record<string, unknown>): PendingChange {
  const reason = item['rejectionReason'];

  return {
    id: String(item['id']),
    eventId: String(item['eventId']),
    municipalityId: String(item['municipalityId']),
    organizationId: item['organizationId'] === null ? null : String(item['organizationId']),
    payload: revivePatch(item['payload']),
    status: String(item['status']) as PendingChange['status'],
    rejectionReason: typeof reason === 'string' ? reason : null,
    createdBy: String(item['createdBy']),
    createdAt: new Date(String(item['createdAt'])),
  };
}

const isMunicipal = (actor: StaffActor): boolean =>
  actor.role === 'municipal_editor' || actor.role === 'municipal_admin';

export function createStaffStore(
  client: StoreClient,
  tableName: string,
  actor: StaffActor,
): StaffStore {
  const municipalityId = actor.municipalityId;

  /** The event, or nothing — and nothing also covers "not yours to see". */
  async function readEvent(eventId: string): Promise<Event | null> {
    const result = await client.send(
      new GetCommand({ TableName: tableName, Key: eventKey(municipalityId, eventId) }),
    );

    if (result.Item === undefined) return null;

    const event = fromEventItem(result.Item);

    return canSee(event) ? event : null;
  }

  function canSee(event: Event): boolean {
    if (isMunicipal(actor)) return true;

    // An association: its own events, whatever their state, and anything a
    // resident could already see.
    return (
      event.organizationId === actor.organizationId ||
      event.status === 'published' ||
      event.status === 'cancelled'
    );
  }

  function canEdit(event: Event): boolean {
    if (isMunicipal(actor)) return true;

    return event.organizationId !== null && event.organizationId === actor.organizationId;
  }

  async function organization(): Promise<Organization | null> {
    if (actor.organizationId === null) return null;

    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: organizationKey(municipalityId, actor.organizationId),
      }),
    );

    return result.Item === undefined ? null : organizationSchema.parse(result.Item);
  }

  /**
   * Writes a changed event.
   *
   * An update and not a `Put` of the whole item, for one reason that matters:
   * the item also carries `interestCount`, which residents increment and this
   * layer must never know how to reset. Rewriting the item would set it back to
   * zero on every edit.
   *
   * The index attributes are recomputed from the new state and removed when the
   * state does not belong in an index. That single line is what moves an event
   * between the public calendar, the review queue and neither.
   */
  async function writeEvent(next: Event): Promise<Event> {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: eventKey(municipalityId, next.id),
        ...eventWriteExpression(next),
        // An edit, not a creation: an event that is not there is a bug in the
        // caller, not a row to invent.
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );

    if (next.isFeatured) await keepOnlyFeatured(next.id);

    return next;
  }

  /**
   * One event on the cover, and only one.
   *
   * The app draws the featured event of a block large, at the top, and a
   * calendar with three of them has no cover at all — it has a list with three
   * shouty rows. So featuring an event un-features whatever was there, and that
   * happens here rather than in the panel: a rule the client enforces is a rule
   * that holds until somebody opens a second tab.
   *
   * A query of the town's own events, which is a partition read of a few dozen
   * rows, and it only runs when something is being put on the cover — a handful
   * of times a year in a municipality.
   */
  async function keepOnlyFeatured(eventId: string): Promise<void> {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        FilterExpression: 'isFeatured = :featured',
        ExpressionAttributeValues: {
          ':pk': municipalityPk(municipalityId),
          ':prefix': SK_PREFIX.event,
          ':featured': true,
        },
        ProjectionExpression: 'id',
      }),
    );

    for (const item of result.Items ?? []) {
      const other = String(item['id']);

      if (other === eventId) continue;

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, other),
          UpdateExpression: 'SET isFeatured = :featured',
          ExpressionAttributeValues: { ':featured': false },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    }
  }

  /**
   * Whether this edit has to be looked at before the neighbours see it.
   *
   * Only in one case: an association without trust, changing something that is
   * already published. Everything else — a draft, an event still waiting for
   * approval, a trusted association, the town hall itself — writes straight
   * through, because there is nothing published to protect.
   */
  async function needsReview(event: Event): Promise<boolean> {
    if (isMunicipal(actor)) return false;
    if (event.status !== 'published') return false;

    const org = await organization();

    return org === null || !publishesWithoutReview(org);
  }

  async function queueChange(event: Event, patch: EventPatch): Promise<PendingChange> {
    const change: PendingChange = {
      id: crypto.randomUUID(),
      eventId: event.id,
      municipalityId,
      organizationId: actor.organizationId,
      payload: patch,
      status: 'pending',
      rejectionReason: null,
      createdBy: actor.authUserId,
      createdAt: new Date(),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...pendingChangeKey(change.eventId, change.id),
          entity: 'event_change',
          ...change,
          payload: serialisePatch(patch),
          createdAt: change.createdAt.toISOString(),
          // Into the same review index the pending events use, so the town hall
          // has one inbox and not two.
          gsi2pk: reviewIndexPk(municipalityId),
          gsi2sk: change.createdAt.toISOString(),
        },
      }),
    );

    return change;
  }

  async function readChange(eventId: string, changeId: string): Promise<PendingChange | null> {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: pendingChangeKey(eventId, changeId),
      }),
    );

    if (result.Item === undefined) return null;

    const change = toPendingChange(result.Item);

    // A change is reachable through the event it belongs to, and that event is
    // read in the actor's municipality, so a change from another town is not
    // addressable here.
    return change.municipalityId === municipalityId ? change : null;
  }

  async function writeStatus(
    eventId: string,
    status: EventStatus,
    extra: { rejectionReason?: string | null } = {},
  ): Promise<Event> {
    const event = await readEvent(eventId);
    if (event === null) throw notFound('Ese evento no existe en este municipio.');

    const now = new Date();

    const written = await writeEvent({
      ...event,
      status,
      rejectionReason: extra.rejectionReason ?? null,
      updatedAt: now,
      publishedAt: status === 'published' ? (event.publishedAt ?? now) : event.publishedAt,
    });

    // The programme follows the event in and out of the calendar. Where an
    // activity appears is written on the activity's own row — that is what makes
    // the public query unable to return it — so approving a feria means
    // rewriting each of its lines with the new parent status. Nothing else about
    // them changes.
    if (status !== event.status) await reindexProgramme(eventId, status);

    return written;
  }

  // -------------------------------------------------------------------------
  // Programmes
  // -------------------------------------------------------------------------

  /** Everything under one prefix of this municipality's partition. */
  async function queryActivities(prefix: string): Promise<Activity[]> {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': municipalityPk(municipalityId), ':prefix': prefix },
      }),
    );

    return (result.Items ?? []).map(fromActivityItem);
  }

  /**
   * Writes a line that already exists.
   *
   * An update and not a `Put`, for the reason the event's write has the same
   * shape: the row also carries `interestCount`, which the residents own and
   * nothing here may reset. Creation goes through `createActivity`, which is the
   * only place allowed to make the row.
   */
  async function writeActivity(
    activity: Activity,
    parentStatus: EventStatus,
  ): Promise<Activity> {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: activityKey(municipalityId, activity.eventId, activity.id),
        ...activityWriteExpression(activity, parentStatus),
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );

    return activity;
  }

  async function reindexProgramme(eventId: string, parentStatus: EventStatus): Promise<void> {
    for (const activity of await queryActivities(activityPrefixFor(eventId))) {
      await writeActivity(activity, parentStatus);
    }
  }

  /**
   * The event and one of its lines, or nothing.
   *
   * Always both, because nothing about an activity can be decided without its
   * event: whether this person may touch it, and whether it is public.
   */
  async function readActivity(
    eventId: string,
    activityId: string,
  ): Promise<{ event: Event; activity: Activity } | null> {
    const event = await readEvent(eventId);

    if (event === null) return null;

    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: activityKey(municipalityId, eventId, activityId),
      }),
    );

    if (result.Item === undefined) return null;

    const activity = fromActivityItem(result.Item);

    // Somebody who can only see the event because it is published sees only the
    // lines that are published too — another association's drafts inside a shared
    // feria are not theirs to read.
    if (!canEdit(event) && !isActivityVisible(activity, event.status)) return null;

    return { event, activity };
  }

  /** A patch on its way into `pendingPatch`, with its dates as the table stores them. */
  function serialiseActivityPatch(patch: ActivityPatch): Record<string, unknown> {
    const raw: Record<string, unknown> = { ...patch };

    if (patch.startAt !== undefined) raw['startAt'] = patch.startAt.toISOString();

    if (patch.endAt !== undefined) {
      raw['endAt'] = patch.endAt === null ? null : patch.endAt.toISOString();
    }

    return raw;
  }

  /**
   * The same patch on the way back out, when the town hall approves it.
   *
   * Field by field rather than a cast, for the reason the table always deserves
   * one: it is the one place data can arrive from an older version of this code,
   * and a change that sat in the inbox for a week has to apply exactly as it
   * would have on the day it was asked for.
   */
  function reviveActivityPatch(raw: unknown): ActivityPatch {
    if (typeof raw !== 'object' || raw === null) return {};

    const stored = raw as Record<string, unknown>;
    const patch: ActivityPatch = {};

    for (const field of ['title', 'description'] as const) {
      const value = stored[field];

      if (typeof value === 'string') patch[field] = value;
    }

    for (const field of ['categoryId', 'priceInfo'] as const) {
      const value = stored[field];

      if (value === null) patch[field] = null;
      else if (typeof value === 'string') patch[field] = value;
    }

    if (stored['isFree'] === null) patch.isFree = null;
    else if (typeof stored['isFree'] === 'boolean') patch.isFree = stored['isFree'];

    if (typeof stored['startAt'] === 'string') patch.startAt = new Date(stored['startAt']);

    if (stored['endAt'] === null) patch.endAt = null;
    else if (typeof stored['endAt'] === 'string') patch.endAt = new Date(stored['endAt']);

    if (stored['location'] === null) {
      patch.location = null;
    } else if (typeof stored['location'] === 'object' && stored['location'] !== null) {
      const shape = stored['location'] as Record<string, unknown>;

      patch.location = {
        name: String(shape['name'] ?? ''),
        latitude: typeof shape['latitude'] === 'number' ? shape['latitude'] : null,
        longitude: typeof shape['longitude'] === 'number' ? shape['longitude'] : null,
      };
    }

    return patch;
  }

  // Whether a change to a programme has to be looked at first is the same
  // question as for the event, answered by the same `needsReview`: an
  // association without trust, touching something already public. A line added
  // to a feria still waiting for approval is not public yet, so it rides along
  // with the feria — the town hall approving a feria is approving the programme
  // they read on it, and approving thirteen things one at a time is a workflow
  // nobody uses.

  /**
   * The events this actor may see.
   *
   * A local function and not only a method, because `listActivities` needs the
   * same answer and reaching it through `this` would break the moment somebody
   * destructured the store — which is the obvious thing for a handler to do.
   */
  async function listVisibleEvents(): Promise<Event[]> {
    // The filter is DynamoDB's and not this code's on purpose: an association
    // asking for its events must not have the town hall's drafts travel back
    // to the function at all, even to be dropped afterwards. `canSee` stays as
    // a second check, because a filter is a where clause and not a guarantee.
    const scoped = !isMunicipal(actor);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
        ...(scoped
          ? {
              FilterExpression: 'organizationId = :org or #status in (:published, :cancelled)',
              ExpressionAttributeNames: { '#status': 'status' },
            }
          : {}),
        ExpressionAttributeValues: {
          ':pk': municipalityPk(municipalityId),
          ':prefix': SK_PREFIX.event,
          ...(scoped
            ? {
                ':org': actor.organizationId,
                ':published': 'published',
                ':cancelled': 'cancelled',
              }
            : {}),
        },
      }),
    );

    return (result.Items ?? []).map(fromEventItem).filter(canSee);
  }

  return {
    listEvents: listVisibleEvents,

    getEvent(eventId) {
      return readEvent(eventId);
    },

    async createEvent(input) {
      const asked = input.status ?? 'draft';
      let status: EventStatus = asked;

      if (!isMunicipal(actor)) {
        if (actor.organizationId === null) {
          throw forbidden('Esta cuenta no está asociada a ninguna asociación.');
        }

        // The only way an association's event reaches `published` is the town
        // hall having marked the association as trusted. Asking for it does
        // nothing.
        const org = await organization();
        if (org === null) throw notFound('Esa asociación no existe en este municipio.');

        status = publishesWithoutReview(org) ? 'published' : 'pending_review';
      }

      const now = new Date();
      const event: Event = {
        id: input.id,
        municipalityId,
        organizationId: isMunicipal(actor) ? null : actor.organizationId,
        title: input.title,
        description: input.description ?? '',
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        allDay: input.allDay ?? false,
        location: input.location,
        imageUrl: input.imageUrl ?? null,
        priceInfo: input.priceInfo ?? null,
        isFree: input.isFree ?? true,
        audienceTags: [],
        status,
        rejectionReason: null,
        // The cover belongs to the town hall. An association asking for it gets
        // the same answer as one asking to publish: nothing happens, quietly.
        isFeatured: isMunicipal(actor) && (input.isFeatured ?? false),
        liveTrackingEnabled: false,
        // A new event has no audience yet, and neither number is ever an
        // author's to set: both belong to the residents from here on.
        interestCount: 0,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === 'published' ? now : null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: toEventItem(event),
          // Creating an event twice with the same id is a bug, not an update.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );

      if (event.isFeatured) await keepOnlyFeatured(event.id);

      return event;
    },

    async updateEvent(eventId, patch) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      // Same rule as on creation, and it has to be here too: an association
      // editing its own published event could otherwise put itself on the cover
      // through the back door.
      const asked: EventPatch = { ...patch };

      if (!isMunicipal(actor)) delete asked.isFeatured;

      if (await needsReview(event)) {
        return { kind: 'queued', change: await queueChange(event, asked) };
      }

      return {
        kind: 'applied',
        event: await writeEvent({ ...event, ...asked, updatedAt: new Date() }),
      };
    },

    async reviewQueue() {
      if (!isMunicipal(actor)) {
        throw forbidden('La bandeja de revisión es del ayuntamiento.');
      }

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: REVIEW_INDEX,
          KeyConditionExpression: 'gsi2pk = :pk',
          ExpressionAttributeValues: { ':pk': reviewIndexPk(municipalityId) },
        }),
      );

      return (result.Items ?? []).map((item): ReviewItem => {
        if (item['entity'] === 'event_change') {
          return { kind: 'change', change: toPendingChange(item) };
        }

        if (item['entity'] === 'activity') {
          return { kind: 'activity', activity: fromActivityItem(item) };
        }

        return { kind: 'event', event: fromEventItem(item) };
      });
    },

    // `async` even though the guard throws before any await: a method that
    // sometimes throws synchronously and sometimes rejects makes every caller
    // wrap it twice.
    async approveEvent(eventId) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento aprueba eventos.');
      }

      return writeStatus(eventId, 'published');
    },

    async rejectEvent(eventId, reason) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento rechaza eventos.');
      }

      if (reason.trim() === '') {
        throw forbidden('Un evento rechazado tiene que decir por qué.');
      }

      return writeStatus(eventId, 'rejected', { rejectionReason: reason });
    },

    async cancelEvent(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      return writeStatus(eventId, 'cancelled');
    },

    async deleteEvent(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      if (!isMunicipal(actor) && (event.status === 'published' || event.status === 'cancelled')) {
        throw forbidden(
          'Este evento ya lo han visto los vecinos. Pídele al ayuntamiento que lo borre.',
        );
      }

      // The programme first, for the same reason as the changes below: a line
      // left behind would sit in the calendar index pointing at an event that is
      // not there, and the app would draw it on a day of its own.
      for (const activity of await queryActivities(activityPrefixFor(eventId))) {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: activityKey(municipalityId, eventId, activity.id),
          }),
        );
      }

      // The changes next. An event deleted with a pending change still in the
      // review index leaves a row in the town hall's inbox pointing at nothing,
      // and the inbox is the one screen that must never show a ghost.
      const changes = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': CHANGE_PREFIX },
          ProjectionExpression: 'pk, sk',
        }),
      );

      for (const item of changes.Items ?? []) {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { pk: String(item['pk']), sk: String(item['sk']) },
          }),
        );
      }

      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      // What is deliberately left alone: the marks residents made on it. They
      // live under the devices that made them, reachable only through the index
      // this role is denied (D-032), so this function could not reach them if it
      // wanted to — and should not: they are somebody else's rows. An event that
      // is gone is never read, never reminded and never listed, so they sit
      // there inert until the phone is forgotten.
    },

    async listChanges(eventId) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk and begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `EVT#${eventId}`, ':prefix': CHANGE_PREFIX },
        }),
      );

      return (result.Items ?? []).map(toPendingChange);
    },

    async approveChange(eventId, changeId) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento aprueba cambios.');
      }

      const change = await readChange(eventId, changeId);
      if (change === null) throw notFound('Ese cambio no existe.');
      if (change.status !== 'pending') throw forbidden('Ese cambio ya estaba decidido.');

      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');

      const updated = await writeEvent({ ...event, ...change.payload, updatedAt: new Date() });

      // The change has served its purpose and leaves the inbox. It is deleted
      // rather than kept: what it asked for is now in the event, and the audit
      // log is where "who changed this" lives.
      await client.send(
        new DeleteCommand({ TableName: tableName, Key: pendingChangeKey(eventId, changeId) }),
      );

      return updated;
    },

    async rejectChange(eventId, changeId, reason) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento rechaza cambios.');
      }

      if (reason.trim() === '') {
        throw forbidden('Un cambio rechazado tiene que decir por qué.');
      }

      const change = await readChange(eventId, changeId);
      if (change === null) throw notFound('Ese cambio no existe.');

      // Kept, unlike an approved one, and out of the index: the association has
      // to be able to read why it was turned down.
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: pendingChangeKey(eventId, changeId),
          UpdateExpression:
            'SET #status = :status, rejectionReason = :reason REMOVE gsi2pk, gsi2sk',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'rejected', ':reason': reason.trim() },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );

      return { ...change, status: 'rejected', rejectionReason: reason.trim() };
    },

    async interestCount(eventId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: eventKey(municipalityId, eventId),
          // The counter and nothing else: this is the only thing the panel ever
          // learns about who marked an event.
          ProjectionExpression: 'interestCount',
        }),
      );

      return result.Item === undefined ? 0 : interestCountOf(result.Item);
    },

    // --- programmes --------------------------------------------------------

    async listActivities(eventId) {
      if (eventId !== undefined) {
        const event = await readEvent(eventId);

        if (event === null) throw notFound('Ese evento no existe en este municipio.');

        const lines = await queryActivities(activityPrefixFor(eventId));

        return canEdit(event)
          ? lines
          : lines.filter((activity) => isActivityVisible(activity, event.status));
      }

      const all = await queryActivities(SK_PREFIX.activity);

      if (isMunicipal(actor)) return all;

      // An association sees the programmes of its own events whole, and of
      // everybody else's only what a resident would see. Which of the two applies
      // is a property of the event, so the events are read once and consulted per
      // line rather than per line read again.
      const events = new Map((await listVisibleEvents()).map((event) => [event.id, event]));

      return all.filter((activity) => {
        const event = events.get(activity.eventId);

        if (event === undefined) return false;

        return canEdit(event) || isActivityVisible(activity, event.status);
      });
    },

    async createActivity(eventId, input) {
      const event = await readEvent(eventId);
      if (event === null) throw notFound('Ese evento no existe en este municipio.');
      if (!canEdit(event)) throw forbidden('Ese evento es de otra asociación.');

      // A new line on something the neighbours are already reading is a change to
      // what they read, so it waits — unless the person adding it could have
      // published it themselves anyway.
      const status: EventStatus = (await needsReview(event))
        ? 'pending_review'
        : (input.status ?? 'published');

      const now = new Date();
      const activity: Activity = {
        id: input.id,
        municipalityId,
        eventId,
        title: input.title,
        description: input.description ?? '',
        categoryId: input.categoryId ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        location: input.location ?? null,
        isFree: input.isFree ?? null,
        priceInfo: input.priceInfo ?? null,
        status,
        rejectionReason: null,
        pendingPatch: null,
        // A new line has no audience yet, and it is never the author's to set.
        interestCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: toActivityItem(activity, event.status),
          // Twice with the same id is a bug in the caller, not an update.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );

      return activity;
    },

    async updateActivity(eventId, activityId, patch) {
      const found = await readActivity(eventId, activityId);
      if (found === null) throw notFound('Esa actividad no existe en este evento.');
      if (!canEdit(found.event)) throw forbidden('Ese evento es de otra asociación.');

      const { event, activity } = found;
      const now = new Date();

      // Only a line the neighbours can already read is worth protecting. One
      // still waiting for approval is edited in place: nobody has seen it, so
      // there is no old version to keep showing.
      if ((await needsReview(event)) && activity.status === 'published') {
        return {
          kind: 'queued',
          activity: await writeActivity(
            {
              ...activity,
              // Merged, not replaced: an association that changes the time on
              // Monday and the place on Tuesday means both, and the town hall
              // decides on one line rather than on two halves of one.
              pendingPatch: {
                ...(activity.pendingPatch ?? {}),
                ...serialiseActivityPatch(patch),
              },
              updatedAt: now,
            },
            event.status,
          ),
        };
      }

      return {
        kind: 'applied',
        activity: await writeActivity(
          { ...activity, ...patch, updatedAt: now },
          event.status,
        ),
      };
    },

    async cancelActivity(eventId, activityId) {
      const found = await readActivity(eventId, activityId);
      if (found === null) throw notFound('Esa actividad no existe en este evento.');
      if (!canEdit(found.event)) throw forbidden('Ese evento es de otra asociación.');

      return writeActivity(
        { ...found.activity, status: 'cancelled', updatedAt: new Date() },
        found.event.status,
      );
    },

    async deleteActivity(eventId, activityId) {
      const found = await readActivity(eventId, activityId);
      if (found === null) throw notFound('Esa actividad no existe en este evento.');
      if (!canEdit(found.event)) throw forbidden('Ese evento es de otra asociación.');

      // The same rule as for an event: an association may drop a line nobody has
      // seen, and once the town has read it, taking it off the programme without
      // telling anybody is the town hall's call. Cancelling is what they want
      // almost every time.
      if (!isMunicipal(actor) && found.activity.status === 'published') {
        throw forbidden(
          'Esta actividad ya la han visto los vecinos. Cancélala, o pídele al ayuntamiento que la borre.',
        );
      }

      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: activityKey(municipalityId, eventId, activityId),
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
    },

    async approveActivity(eventId, activityId) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento aprueba actividades.');
      }

      const found = await readActivity(eventId, activityId);
      if (found === null) throw notFound('Esa actividad no existe en este evento.');

      const { event, activity } = found;
      const now = new Date();

      // Two different things wear the same button. A line with an edit waiting is
      // published already and what is being approved is the change; a line
      // without one is waiting to exist at all.
      if (activity.pendingPatch !== null) {
        return writeActivity(
          {
            ...activity,
            ...reviveActivityPatch(activity.pendingPatch),
            pendingPatch: null,
            rejectionReason: null,
            updatedAt: now,
          },
          event.status,
        );
      }

      return writeActivity(
        { ...activity, status: 'published', rejectionReason: null, updatedAt: now },
        event.status,
      );
    },

    async rejectActivity(eventId, activityId, reason) {
      if (!isMunicipal(actor)) {
        throw forbidden('Solo el ayuntamiento rechaza actividades.');
      }

      if (reason.trim() === '') {
        throw forbidden('Una actividad rechazada tiene que decir por qué.');
      }

      const found = await readActivity(eventId, activityId);
      if (found === null) throw notFound('Esa actividad no existe en este evento.');

      const { event, activity } = found;
      const now = new Date();

      // Turning down a change leaves the published line exactly as the
      // neighbours have been reading it, with the reason attached so the
      // association can see why.
      if (activity.pendingPatch !== null) {
        return writeActivity(
          { ...activity, pendingPatch: null, rejectionReason: reason.trim(), updatedAt: now },
          event.status,
        );
      }

      return writeActivity(
        { ...activity, status: 'rejected', rejectionReason: reason.trim(), updatedAt: now },
        event.status,
      );
    },
  };
}
