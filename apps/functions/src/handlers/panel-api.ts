import { AUDIENCE_TAGS, ORGANIZATION_STATUSES, ORGANIZATION_TYPES, routeSchema } from '@agora/core';
import {
  NOTICE_TYPES,
  type StoreClient,
  createMembershipStore,
  createPublicStore,
  createStoreClient,
} from '@agora/store';
import { z } from 'zod';

import {
  type ApiEvent,
  type ApiResult,
  badRequest,
  error,
  handle,
  noContent,
  notFound,
  ok,
  refusal,
  tableName,
} from '../lib/http';
import type { Identities } from '../lib/identities';
import { createCognitoIdentities } from '../lib/identities';
import { definedOnly } from '../lib/json';
import { type PanelContext, buildContext, callerSubject } from '../lib/panel-context';
import { type Route, matchRoute, pathExists, routedPath } from '../lib/router';

/**
 * Everything the town hall and the associations do.
 *
 * One Lambda and one API Gateway route, split inside by path. The rules are not
 * here — they are in `@agora/store`, tested against a real database — and this
 * file does the three things a handler should do: read the caller's membership,
 * check that the body is the shape it claims to be, and write a line in the audit
 * log when something changed.
 *
 * The audit line is written here rather than in the stores on purpose. The stores
 * enforce permissions; this records requests, and a request is what the API has.
 */
const locationSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
});

const newEventSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().min(1),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullable().optional(),
  allDay: z.boolean().optional(),
  location: locationSchema,
  imageUrl: z.string().nullable().optional(),
  priceInfo: z.string().nullable().optional(),
  isFree: z.boolean().optional(),
  audienceTags: z.array(z.enum(AUDIENCE_TAGS)).optional(),
  status: z.enum(['draft', 'pending_review', 'published']).optional(),
  isFeatured: z.boolean().optional(),
});

const eventPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().nullable().optional(),
  location: locationSchema.optional(),
  priceInfo: z.string().nullable().optional(),
  isFree: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

const reasonSchema = z.object({ reason: z.string().min(1) });

const liveScheduleSchema = z.object({
  /** The route the town hall drew, or nothing. */
  plannedRoute: routeSchema.nullable().optional(),
});

const noticeSchema = z.object({
  type: z.enum(NOTICE_TYPES),
  message: z.string().min(1),
});

const newOrganizationSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  type: z.enum(ORGANIZATION_TYPES),
  contactEmail: z.email().nullable().default(null),
});

const organizationPatchSchema = z
  .object({
    isTrusted: z.boolean().optional(),
    status: z.enum(ORGANIZATION_STATUSES).optional(),
  })
  .refine((patch) => patch.isTrusted !== undefined || patch.status !== undefined, {
    message: 'Nothing to change',
  });

const newMembershipSchema = z.object({
  authUserId: z.string().min(1),
  role: z.enum(['org_editor', 'municipal_editor', 'municipal_admin']),
  organizationId: z.string().min(1).nullable().optional(),
  email: z.email(),
  fullName: z.string().optional(),
});

/**
 * An invitation, which is the same thing without the Cognito subject: nobody in
 * the panel knows it, because the account does not exist yet.
 */
const invitationSchema = newMembershipSchema.omit({ authUserId: true });

/** Thrown when a body is not what it says it is; `handle` turns it into a 400. */
class BadBody extends Error {}

function body<Schema extends z.ZodType>(event: ApiEvent, schema: Schema): z.output<Schema> {
  let raw: unknown;

  try {
    raw = JSON.parse(event.body ?? '{}');
  } catch {
    throw new BadBody('El cuerpo tiene que ser JSON.');
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    throw new BadBody(
      `Faltan datos o no son válidos: ${parsed.error.issues
        .map((issue) => issue.path.join('.') || 'cuerpo')
        .join(', ')}.`,
    );
  }

  return parsed.data;
}

interface RequestContext {
  event: ApiEvent;
  panel: PanelContext;
  client: StoreClient;
  table: string;
  /** Null when no user pool is configured, which is the case in the tests. */
  identities: Identities | null;
}

const ROUTES: readonly Route<RequestContext>[] = [
  // --- the municipality itself ---------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId',
    run: async ({ municipalityId }, { client, table }) => {
      // Read through the public store, because it is the same municipality a
      // resident sees: the branding the panel paints itself with, the time zone
      // its dates are in, and the settings the reminders run on. Getting here at
      // all means the membership check has already passed.
      const municipality = await createPublicStore(client, table).getMunicipality(municipalityId!);

      return municipality === null ? notFound('Ese municipio no existe.') : ok(municipality);
    },
  },

  // --- events --------------------------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/events',
    run: async (_parameters, { panel }) => ok(await panel.events.listEvents()),
  },
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/events/:eventId',
    run: async ({ eventId }, { panel }) => {
      const event = await panel.events.getEvent(eventId!);

      return event === null ? notFound('Ese evento no existe en este municipio.') : ok(event);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events',
    run: async (_parameters, { event, panel }) => {
      const input = body(event, newEventSchema);
      const created = await panel.events.createEvent({
        ...definedOnly(input),
        id: input.id ?? crypto.randomUUID(),
      });

      await panel.audit.record({ action: 'event.create', entity: 'event', entityId: created.id });

      return ok(created);
    },
  },
  {
    method: 'PATCH',
    pattern: 'municipalities/:municipalityId/events/:eventId',
    run: async ({ eventId }, { event, panel }) => {
      const result = await panel.events.updateEvent(
        eventId!,
        definedOnly(body(event, eventPatchSchema)),
      );

      await panel.audit.record({
        action: result.kind === 'queued' ? 'event.change_requested' : 'event.update',
        entity: 'event',
        entityId: eventId!,
      });

      return ok(result);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/approve',
    run: async ({ eventId }, { panel }) => {
      const approved = await panel.events.approveEvent(eventId!);

      await panel.audit.record({ action: 'event.approve', entity: 'event', entityId: eventId! });

      return ok(approved);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/reject',
    run: async ({ eventId }, { event, panel }) => {
      const { reason } = body(event, reasonSchema);
      const rejected = await panel.events.rejectEvent(eventId!, reason);

      await panel.audit.record({ action: 'event.reject', entity: 'event', entityId: eventId! });

      return ok(rejected);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/cancel',
    run: async ({ eventId }, { panel }) => {
      const cancelled = await panel.events.cancelEvent(eventId!);

      await panel.audit.record({ action: 'event.cancel', entity: 'event', entityId: eventId! });

      return ok(cancelled);
    },
  },

  // --- the review inbox ----------------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/review',
    run: async (_parameters, { panel }) => ok(await panel.events.reviewQueue()),
  },
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/events/:eventId/changes',
    run: async ({ eventId }, { panel }) => ok(await panel.events.listChanges(eventId!)),
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/changes/:changeId/approve',
    run: async ({ eventId, changeId }, { panel }) => {
      const updated = await panel.events.approveChange(eventId!, changeId!);

      await panel.audit.record({
        action: 'event_change.approve',
        entity: 'event_change',
        entityId: changeId!,
      });

      return ok(updated);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/changes/:changeId/reject',
    run: async ({ eventId, changeId }, { event, panel }) => {
      const { reason } = body(event, reasonSchema);
      const rejected = await panel.events.rejectChange(eventId!, changeId!, reason);

      await panel.audit.record({
        action: 'event_change.reject',
        entity: 'event_change',
        entityId: changeId!,
      });

      return ok(rejected);
    },
  },

  // --- notices -------------------------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/events/:eventId/notices',
    run: async ({ eventId }, { panel }) => ok(await panel.notices.list(eventId!)),
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/notices',
    run: async ({ eventId }, { event, panel }) => {
      const input = body(event, noticeSchema);
      const sent = await panel.notices.send({ eventId: eventId!, ...input });

      await panel.audit.record({
        action: `notice.${input.type}`,
        entity: 'event_notice',
        entityId: sent.id,
      });

      // The push itself is not sent here: there is no provider yet, and the
      // notice carries `pushSentAt: null` until whatever delivers it says so.
      return ok(sent);
    },
  },

  // --- associations --------------------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/organizations',
    run: async (_parameters, { panel }) => ok(await panel.organizations.list()),
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/organizations',
    run: async (_parameters, { event, panel }) => {
      const created = await panel.organizations.create(
        definedOnly(body(event, newOrganizationSchema)),
      );

      await panel.audit.record({
        action: 'organization.create',
        entity: 'organization',
        entityId: created.id,
      });

      return ok(created);
    },
  },
  {
    method: 'PATCH',
    pattern: 'municipalities/:municipalityId/organizations/:organizationId',
    run: async ({ organizationId }, { event, panel }) => {
      const patch = body(event, organizationPatchSchema);
      let updated = await panel.organizations.get(organizationId!);

      if (patch.isTrusted !== undefined) {
        updated = await panel.organizations.setTrusted(organizationId!, patch.isTrusted);

        await panel.audit.record({
          action: patch.isTrusted ? 'organization.trust' : 'organization.untrust',
          entity: 'organization',
          entityId: organizationId!,
        });
      }

      if (patch.status !== undefined) {
        updated = await panel.organizations.setStatus(organizationId!, patch.status);

        await panel.audit.record({
          action: `organization.${patch.status}`,
          entity: 'organization',
          entityId: organizationId!,
        });
      }

      return updated === null ? notFound('Esa asociación no existe.') : ok(updated);
    },
  },

  // --- the people with access ---------------------------------------------
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/staff',
    run: async (_parameters, { event, panel }) => {
      const input = body(event, newMembershipSchema);
      const granted = await panel.memberships.grant(panel.actor, definedOnly(input));

      await panel.audit.record({
        action: `membership.grant.${granted.role}`,
        entity: 'membership',
        entityId: granted.authUserId,
      });

      return ok(granted);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/invitations',
    run: async (_parameters, { event, panel, identities }) => {
      const input = body(event, invitationSchema);

      if (identities === null) {
        return error(503, 'no_user_pool', 'No hay un pool de usuarios configurado.');
      }

      // Checked before the account is created, and not only by `grant` afterwards:
      // a refusal at that point would leave an invited person with a login and
      // nowhere to log in to.
      if (panel.actor.role !== 'municipal_admin') {
        return error(403, 'forbidden', 'Solo un responsable municipal invita a alguien.');
      }

      const authUserId = await identities.invite(
        definedOnly({ email: input.email, fullName: input.fullName }),
      );

      const granted = await panel.memberships.grant(
        panel.actor,
        definedOnly({ ...input, authUserId }),
      );

      await panel.audit.record({
        action: `membership.invite.${granted.role}`,
        entity: 'membership',
        entityId: granted.authUserId,
      });

      return ok(granted);
    },
  },
  {
    method: 'DELETE',
    pattern: 'municipalities/:municipalityId/staff/:authUserId',
    run: async ({ authUserId }, { panel }) => {
      await panel.memberships.revoke(panel.actor, authUserId!);

      await panel.audit.record({
        action: 'membership.revoke',
        entity: 'membership',
        entityId: authUserId!,
      });

      return noContent();
    },
  },

  // --- live tracking -------------------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/events/:eventId/live',
    run: async ({ eventId }, { panel }) => {
      const session = await panel.live.get(eventId!);

      return session === null ? notFound('Ese evento no tiene directo.') : ok(session);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/live',
    run: async ({ eventId }, { event, panel }) => {
      const { plannedRoute } = body(event, liveScheduleSchema);
      const session = await panel.live.schedule(
        eventId!,
        plannedRoute === undefined ? {} : { plannedRoute },
      );

      await panel.audit.record({
        action: 'live.schedule',
        entity: 'live_session',
        entityId: eventId!,
      });

      // The volunteer code is in the answer because this is the request that
      // creates it, and the town hall has to be able to read it out loud or put it
      // in a QR code.
      return ok(session);
    },
  },
  {
    method: 'POST',
    pattern: 'municipalities/:municipalityId/events/:eventId/live/:action',
    run: async ({ eventId, action }, { panel }) => {
      const run = {
        start: () => panel.live.start(eventId!),
        pause: () => panel.live.pause(eventId!),
        end: () => panel.live.end(eventId!),
      }[action ?? ''];

      if (run === undefined) return notFound('Esa acción no existe.');

      const session = await run();

      await panel.audit.record({
        action: `live.${action!}`,
        entity: 'live_session',
        entityId: eventId!,
      });

      return ok(session);
    },
  },

  // --- what a councillor reads ---------------------------------------------
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/stats',
    run: async (_parameters, { panel }) => ok(await panel.stats.summary()),
  },
  {
    method: 'GET',
    pattern: 'municipalities/:municipalityId/audit',
    run: async (_parameters, { panel }) => ok(await panel.audit.list()),
  },
];

export async function route(
  event: ApiEvent,
  client: StoreClient,
  table: string,
  identities: Identities | null = null,
): Promise<ApiResult> {
  const subject = callerSubject(event);

  if (subject === null) {
    return error(401, 'unauthenticated', 'Falta la identidad de quien llama.');
  }

  const path = routedPath(event, 'panel');
  const method = event.requestContext?.http?.method ?? 'GET';

  // The one route that is not about a municipality: which municipalities this
  // person may work in at all. The panel calls it first.
  if (method === 'GET' && path === 'me') {
    const memberships = await createMembershipStore(client, table).listForUser(subject);

    return ok({ authUserId: subject, memberships });
  }

  const match = matchRoute(ROUTES, method, path);

  if (match === null) {
    return pathExists(ROUTES, path)
      ? error(405, 'method_not_allowed', 'Ese método no vale para esta ruta.')
      : notFound('Esa ruta no existe.');
  }

  const municipalityId = match.parameters['municipalityId'];

  if (municipalityId === undefined) {
    return badRequest('Falta el municipio en la ruta.');
  }

  try {
    const panel = await buildContext(client, table, subject, municipalityId);

    return await match.route.run(match.parameters, { event, panel, identities, client, table });
  } catch (thrown) {
    if (thrown instanceof BadBody) return badRequest(thrown.message);

    // A refusal is an answer and not a crash: no access to this municipality,
    // only the town hall approves, that event is not here.
    const refused = refusal(thrown);

    if (refused !== null) return refused;

    throw thrown;
  }
}

let client: StoreClient | null = null;

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    client ??= createStoreClient();

    const userPoolId = process.env['USER_POOL_ID'];

    return route(
      event,
      client,
      tableName(),
      userPoolId === undefined || userPoolId === '' ? null : createCognitoIdentities(userPoolId),
    );
  });
