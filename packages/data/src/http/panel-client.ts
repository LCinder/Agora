import {
  eventSchema,
  liveSessionSchema,
  municipalitySchema,
  organizationSchema,
  routeSchema,
  type Event,
  type Municipality,
  type ORGANIZATION_STATUSES,
  type ORGANIZATION_TYPES,
  type Organization,
} from '@agora/core';
import { z } from 'zod';

import { type ApiClient, type ApiClientOptions, createApiClient } from './client';

/**
 * The town hall's and the associations' side of the API.
 *
 * Everything the panel does goes through here. The rules are not in this file and
 * cannot be: what a municipal editor may do and what an association may do is
 * decided in the table, per municipality, and this only carries the request and
 * the identity (D-026, D-032).
 *
 * The identity is a Cognito token, read on every call rather than captured,
 * because it expires every hour and the panel refreshes it behind the scenes.
 *
 * The shapes are declared again here rather than imported from `@agora/store`:
 * that package carries the AWS SDK, and the panel must never ship it.
 */
const pendingChangeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  municipalityId: z.string(),
  organizationId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'applied', 'rejected']),
  rejectionReason: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
});

export type PendingChange = z.infer<typeof pendingChangeSchema>;

const editResultSchema = z.union([
  z.object({ kind: z.literal('applied'), event: eventSchema }),
  z.object({ kind: z.literal('queued'), change: pendingChangeSchema }),
]);

export type EditResult = z.infer<typeof editResultSchema>;

const reviewItemSchema = z.union([
  z.object({ kind: z.literal('event'), event: eventSchema }),
  z.object({ kind: z.literal('change'), change: pendingChangeSchema }),
]);

export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const NOTICE_TYPES = ['time_change', 'location_change', 'cancelled', 'notice'] as const;

export type NoticeType = (typeof NOTICE_TYPES)[number];

const noticeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  type: z.enum(NOTICE_TYPES),
  message: z.string(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  pushSentAt: z.coerce.date().nullable(),
});

export type EventNotice = z.infer<typeof noticeSchema>;

/** A count the panel may show, or null when it is small enough to be a person. */
const reportableSchema = z.number().nullable();

const statsSchema = z.object({
  /** Phones that follow this municipality. Nobody registered to be in it. */
  devices: z.object({ following: z.number() }),
  events: z.object({
    total: z.number(),
    published: z.number(),
    awaitingReview: z.number(),
    draft: z.number(),
    cancelled: z.number(),
  }),
  /** Openings of an event page across the municipality. A total, not a segment. */
  views: z.object({ total: z.number() }).default({ total: 0 }),
  interests: z.object({
    total: z.number(),
    topEvents: z.array(
      z.object({
        eventId: z.string(),
        title: z.string(),
        startAt: z.coerce.date(),
        interested: reportableSchema,
        /** Held back below the same threshold as the marks. */
        viewed: reportableSchema.default(null),
      }),
    ),
    byCategory: z.array(z.object({ categoryId: z.string(), interested: reportableSchema })),
    /** New marks per month, oldest first. A municipal total, never suppressed. */
    monthly: z.array(z.object({ month: z.string(), interested: z.number() })),
  }),
  suppressed: z.number(),
  generatedAt: z.coerce.date(),
});

export type PanelStats = z.infer<typeof statsSchema>;

const auditEntrySchema = z.object({
  id: z.string(),
  municipalityId: z.string(),
  actorId: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  createdAt: z.coerce.date(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

const liveSessionWithCodeSchema = liveSessionSchema.extend({
  volunteerCode: z.string().nullable(),
  simplifiedRoute: routeSchema.nullable(),
  lastPositionAt: z.coerce.date().nullable(),
});

export type LiveSession = z.infer<typeof liveSessionWithCodeSchema>;

const membershipSchema = z.object({
  authUserId: z.string(),
  municipalityId: z.string(),
  role: z.enum(['org_editor', 'municipal_editor', 'municipal_admin']),
  organizationId: z.string().nullable(),
  email: z.string(),
  fullName: z.string(),
  createdAt: z.coerce.date(),
});

export type Membership = z.infer<typeof membershipSchema>;

/** What the panel sends to create an event. Dates go as ISO strings over JSON. */
export interface NewEventInput {
  id?: string;
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
  status?: 'draft' | 'pending_review' | 'published';
  isFeatured?: boolean;
}

export type EventPatchInput = Partial<Omit<NewEventInput, 'id' | 'status' | 'allDay'>>;

export interface PanelClientOptions extends ApiClientOptions {
  /** The municipality this panel is working in. Every path is under it. */
  municipalityId: string;
  client?: ApiClient;
}

/** What `GET /panel/me` answers: who you are, and where you may work. */
const panelSessionSchema = z.object({
  authUserId: z.string(),
  memberships: z.array(membershipSchema),
});

export type PanelSession = z.infer<typeof panelSessionSchema>;

/**
 * The first call the panel makes, before it knows which municipality it is for.
 *
 * Separate from the client below because that one is built around a municipality,
 * and this is the request that says which ones there are. A person with no
 * membership is not an error: it is somebody whose access was revoked.
 */
export async function fetchPanelSession(options: ApiClientOptions): Promise<PanelSession> {
  return createApiClient(options).get('/panel/me', (value) => panelSessionSchema.parse(value));
}

export interface PanelClient {
  /** The municipality itself: its branding, its settings, its time zone. */
  getMunicipality(): Promise<Municipality | null>;
  listEvents(): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | null>;
  createEvent(input: NewEventInput): Promise<Event>;
  /** Applied for the town hall; queued for review when an association edits. */
  updateEvent(eventId: string, patch: EventPatchInput): Promise<EditResult>;
  cancelEvent(eventId: string): Promise<Event>;
  /**
   * Removes an event and everything asked about it. There is no undo.
   *
   * For the duplicate and the one typed into the wrong month. An event
   * neighbours have already seen should be cancelled instead, and the API
   * refuses this one to an association once it is published.
   */
  deleteEvent(eventId: string): Promise<void>;
  /**
   * Puts a poster on an event, or takes it off.
   *
   * The image travels as base64 and what comes back is an edit result, like any
   * other change to the event: an association without trust gets `queued` here
   * too, because a poster is what a neighbour looks at first and swapping it on
   * a published event is not a small edit.
   *
   * The bytes go to a bucket and the event keeps the URL. Replacing one deletes
   * the old object, so a town hall that redraws a poster four times is not
   * paying to keep the first three.
   */
  setEventImage(eventId: string, image: { mimeType: string; data: string }): Promise<EditResult>;
  removeEventImage(eventId: string): Promise<EditResult>;
  approveEvent(eventId: string): Promise<Event>;
  rejectEvent(eventId: string, reason: string): Promise<Event>;

  reviewQueue(): Promise<ReviewItem[]>;
  approveChange(eventId: string, changeId: string): Promise<EditResult>;
  rejectChange(eventId: string, changeId: string, reason: string): Promise<PendingChange>;

  listNotices(eventId: string): Promise<EventNotice[]>;
  sendNotice(eventId: string, type: NoticeType, message: string): Promise<EventNotice>;
  /**
   * Pushes a published event to every phone following the municipality.
   *
   * Queued rather than sent: the panel is not allowed to know who follows the
   * town, so it leaves the order and the notification job delivers it within the
   * minute (D-062).
   */
  featureEvent(eventId: string, message: string): Promise<void>;

  listOrganizations(): Promise<Organization[]>;
  createOrganization(input: {
    name: string;
    type: (typeof ORGANIZATION_TYPES)[number];
    contactEmail?: string | null;
  }): Promise<Organization>;
  setOrganizationTrusted(organizationId: string, isTrusted: boolean): Promise<Organization>;
  setOrganizationStatus(
    organizationId: string,
    status: (typeof ORGANIZATION_STATUSES)[number],
  ): Promise<Organization>;

  /** Everybody with access to this municipality. Municipal staff only. */
  listStaff(): Promise<Membership[]>;
  /** Creates the account in Cognito and the membership in one request. */
  invite(input: {
    email: string;
    role: Membership['role'];
    fullName?: string;
    organizationId?: string | null;
  }): Promise<Membership>;
  revoke(authUserId: string): Promise<void>;

  getLiveSession(eventId: string): Promise<LiveSession | null>;
  scheduleLiveSession(
    eventId: string,
    plannedRoute?: z.input<typeof routeSchema> | null,
  ): Promise<LiveSession>;
  runLiveSession(eventId: string, action: 'start' | 'pause' | 'end'): Promise<LiveSession>;

  stats(): Promise<PanelStats>;
  auditLog(): Promise<AuditEntry[]>;
}

export function createPanelClient(options: PanelClientOptions): PanelClient {
  const api = options.client ?? createApiClient(options);
  const town = `/panel/municipalities/${encodeURIComponent(options.municipalityId)}`;
  const at = (eventId: string) => `${town}/events/${encodeURIComponent(eventId)}`;
  const one =
    <T>(schema: z.ZodType<T>) =>
    (value: unknown) =>
      schema.parse(value);

  return {
    async getMunicipality() {
      return api.getOrNull(town, one(municipalitySchema));
    },

    async listEvents() {
      return api.get(`${town}/events`, one(z.array(eventSchema)));
    },

    async getEvent(eventId) {
      return api.getOrNull(at(eventId), one(eventSchema));
    },

    async createEvent(input) {
      return eventSchema.parse(await api.send('POST', `${town}/events`, input));
    },

    async updateEvent(eventId, patch) {
      return editResultSchema.parse(await api.send('PATCH', at(eventId), patch));
    },

    async cancelEvent(eventId) {
      return eventSchema.parse(await api.send('POST', `${at(eventId)}/cancel`));
    },

    async deleteEvent(eventId) {
      await api.send('DELETE', at(eventId));
    },

    async setEventImage(eventId, image) {
      return editResultSchema.parse(await api.send('PUT', `${at(eventId)}/image`, image));
    },

    async removeEventImage(eventId) {
      return editResultSchema.parse(await api.send('DELETE', `${at(eventId)}/image`));
    },

    async approveEvent(eventId) {
      return eventSchema.parse(await api.send('POST', `${at(eventId)}/approve`));
    },

    async rejectEvent(eventId, reason) {
      return eventSchema.parse(await api.send('POST', `${at(eventId)}/reject`, { reason }));
    },

    async reviewQueue() {
      return api.get(`${town}/review`, one(z.array(reviewItemSchema)));
    },

    async approveChange(eventId, changeId) {
      return editResultSchema.parse(
        await api.send('POST', `${at(eventId)}/changes/${encodeURIComponent(changeId)}/approve`),
      );
    },

    async rejectChange(eventId, changeId, reason) {
      return pendingChangeSchema.parse(
        await api.send('POST', `${at(eventId)}/changes/${encodeURIComponent(changeId)}/reject`, {
          reason,
        }),
      );
    },

    async listNotices(eventId) {
      return api.get(`${at(eventId)}/notices`, one(z.array(noticeSchema)));
    },

    async sendNotice(eventId, type, message) {
      return noticeSchema.parse(
        await api.send('POST', `${at(eventId)}/notices`, { type, message }),
      );
    },

    async featureEvent(eventId, message) {
      await api.send('POST', `${at(eventId)}/featured`, { message });
    },

    async listOrganizations() {
      return api.get(`${town}/organizations`, one(z.array(organizationSchema)));
    },

    async createOrganization(input) {
      return organizationSchema.parse(await api.send('POST', `${town}/organizations`, input));
    },

    async setOrganizationTrusted(organizationId, isTrusted) {
      return organizationSchema.parse(
        await api.send('PATCH', `${town}/organizations/${encodeURIComponent(organizationId)}`, {
          isTrusted,
        }),
      );
    },

    async setOrganizationStatus(organizationId, status) {
      return organizationSchema.parse(
        await api.send('PATCH', `${town}/organizations/${encodeURIComponent(organizationId)}`, {
          status,
        }),
      );
    },

    async listStaff() {
      return api.get(`${town}/staff`, one(z.array(membershipSchema)));
    },

    async invite(input) {
      return membershipSchema.parse(await api.send('POST', `${town}/invitations`, input));
    },

    async revoke(authUserId) {
      await api.send('DELETE', `${town}/staff/${encodeURIComponent(authUserId)}`);
    },

    async getLiveSession(eventId) {
      return api.getOrNull(`${at(eventId)}/live`, one(liveSessionWithCodeSchema));
    },

    async scheduleLiveSession(eventId, plannedRoute) {
      return liveSessionWithCodeSchema.parse(
        await api.send('POST', `${at(eventId)}/live`, { plannedRoute: plannedRoute ?? null }),
      );
    },

    async runLiveSession(eventId, action) {
      return liveSessionWithCodeSchema.parse(
        await api.send('POST', `${at(eventId)}/live/${action}`),
      );
    },

    async stats() {
      return api.get(`${town}/stats`, one(statsSchema));
    },

    async auditLog() {
      return api.get(`${town}/audit`, one(z.array(auditEntrySchema)));
    },
  };
}
