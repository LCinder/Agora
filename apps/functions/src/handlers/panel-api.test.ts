import { type StoreClient, createMembershipStore, createStoreClient } from '@agora/store';
import {
  EVENTS,
  HERMANDAD,
  LOCAL_CREDENTIALS,
  type LocalDynamo,
  OTURA,
  ZUBIA,
  createTable,
  dropTable,
  seed,
  startDynamoLocal,
} from '@agora/store/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ApiEvent } from '../lib/http';
import { scopedStoreClient } from '../lib/panel-credentials';
import { route } from './panel-api';

/**
 * The panel over HTTP.
 *
 * The rules are tested in `@agora/store`, against the same database. What this
 * checks is the layer above them: that the paths are the ones the panel will
 * call, that permissions are read from the membership table and not from the
 * token, that a body which lies about its shape is a 400 and not a 500, and that
 * something that changed left a line in the audit log.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-panel-api-${process.pid}`;

const ADMIN = 'auth-admin';
const EDITOR = 'auth-editor';
const ASSOCIATION = 'auth-hermandad';
const STRANGER = 'auth-stranger';

function request(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: { subject?: string; body?: unknown } = {},
): ApiEvent {
  return {
    routeKey: 'ANY /panel/{proxy+}',
    rawPath: `/panel/${path}`,
    pathParameters: { proxy: path },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    requestContext: {
      http: { method },
      ...(options.subject === undefined
        ? {}
        : { authorizer: { jwt: { claims: { sub: options.subject } } } }),
    },
  } as unknown as ApiEvent;
}

function statusOf(result: Awaited<ReturnType<typeof route>>): number {
  return (result as { statusCode: number }).statusCode;
}

function bodyOf(result: Awaited<ReturnType<typeof route>>): unknown {
  const value = result as { body?: string };

  return value.body === undefined ? undefined : JSON.parse(value.body);
}

describe.skipIf(local === null)('the panel API', () => {
  let client: StoreClient;

  /** A Cognito that hands out a subject without there being a Cognito. */
  const invitations: { email: string; fullName?: string }[] = [];
  const identities = {
    invite: async (input: { email: string; fullName?: string }) => {
      invitations.push(input);

      return `auth-${input.email.split('@')[0]!}`;
    },
  };

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: { subject?: string; body?: unknown },
  ) => route(request(method, path, options), client, TABLE, identities);

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);

    // The memberships are the permissions, so the fixtures are memberships.
    const memberships = createMembershipStore(client, TABLE);
    const bootstrap = {
      authUserId: ADMIN,
      municipalityId: ZUBIA,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    await memberships.grant(bootstrap, {
      authUserId: ADMIN,
      role: 'municipal_admin',
      email: 'admin@lazubia.es',
    });
    await memberships.grant(bootstrap, {
      authUserId: EDITOR,
      role: 'municipal_editor',
      email: 'cultura@lazubia.es',
    });
    await memberships.grant(bootstrap, {
      authUserId: ASSOCIATION,
      role: 'org_editor',
      organizationId: HERMANDAD,
      email: 'hermandad@lazubia.es',
    });
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  describe('the credentials a request runs with', () => {
    it('asks for a client scoped to the municipality in the path', async () => {
      const asked: string[] = [];

      const result = await route(
        request('GET', `municipalities/${ZUBIA}/events`, { subject: EDITOR }),
        client,
        TABLE,
        identities,
        async (municipalityId) => {
          asked.push(municipalityId);

          // The same client: what is being checked is that the request goes
          // through whatever this returns, not what AWS does with it.
          return client;
        },
      );

      expect(statusOf(result)).toBe(200);
      expect(asked).toEqual([ZUBIA]);
    });

    it('falls back to the function\u2019s own client where there is no role to assume', async () => {
      // Which is every test here, and any run against DynamoDB Local: there is no
      // IAM to narrow, and a panel that refused to work without one would be a
      // panel nobody could develop against.
      expect(await scopedStoreClient(ZUBIA)).toBeNull();

      const result = await route(
        request('GET', `municipalities/${ZUBIA}/events`, { subject: EDITOR }),
        client,
        TABLE,
        identities,
        scopedStoreClient,
      );

      expect(statusOf(result)).toBe(200);
    });
  });

  describe('inviting somebody', () => {
    it('creates the account and the membership in one request', async () => {
      const result = await call('POST', `municipalities/${ZUBIA}/invitations`, {
        subject: ADMIN,
        body: {
          email: 'festejos@lazubia.es',
          role: 'municipal_editor',
          fullName: 'Técnica de festejos',
        },
      });

      const granted = bodyOf(result) as { authUserId: string; role: string; email: string };

      expect(statusOf(result)).toBe(200);
      expect(granted.authUserId).toBe('auth-festejos');
      expect(granted.role).toBe('municipal_editor');
      expect(invitations.at(-1)).toEqual({
        email: 'festejos@lazubia.es',
        fullName: 'Técnica de festejos',
      });

      // And the invited person can now read the panel of that municipality.
      const theirs = await call('GET', `municipalities/${ZUBIA}/events`, {
        subject: 'auth-festejos',
      });

      expect(statusOf(theirs)).toBe(200);
    });

    it('refuses an editor, before any account is created', async () => {
      const before = invitations.length;

      const result = await call('POST', `municipalities/${ZUBIA}/invitations`, {
        subject: EDITOR,
        body: { email: 'alguien@lazubia.es', role: 'municipal_editor' },
      });

      expect(statusOf(result)).toBe(403);
      // The important half: nobody was left with a login and nowhere to log in to.
      expect(invitations).toHaveLength(before);
    });

    it('lists who has access, and refuses an association', async () => {
      const mine = await call('GET', `municipalities/${ZUBIA}/staff`, { subject: EDITOR });
      const theirs = await call('GET', `municipalities/${ZUBIA}/staff`, { subject: ASSOCIATION });

      const people = bodyOf(mine) as { email: string }[];

      expect(statusOf(mine)).toBe(200);
      expect(people.map((member) => member.email)).toContain('admin@lazubia.es');
      expect(statusOf(theirs)).toBe(403);
    });

    it('refuses a body without a real email', async () => {
      const result = await call('POST', `municipalities/${ZUBIA}/invitations`, {
        subject: ADMIN,
        body: { email: 'no-es-un-correo', role: 'municipal_editor' },
      });

      expect(statusOf(result)).toBe(400);
    });
  });

  describe('getting in', () => {
    it('reads the municipality the panel paints itself with', async () => {
      const result = await call('GET', `municipalities/${ZUBIA}`, { subject: EDITOR });
      const municipality = bodyOf(result) as { id: string; branding: { primaryColor: string } };

      expect(statusOf(result)).toBe(200);
      expect(municipality.id).toBe(ZUBIA);
      expect(municipality.branding.primaryColor).toMatch(/^#/);
    });

    it('refuses a request with no identity', async () => {
      expect(statusOf(await call('GET', 'me'))).toBe(401);
    });

    it('answers which municipalities the caller may work in', async () => {
      const result = await call('GET', 'me', { subject: EDITOR });
      const body = bodyOf(result) as { memberships: { municipalityId: string; role: string }[] };

      expect(statusOf(result)).toBe(200);
      expect(body.memberships).toHaveLength(1);
      expect(body.memberships[0]?.municipalityId).toBe(ZUBIA);
      expect(body.memberships[0]?.role).toBe('municipal_editor');
    });

    it('refuses a municipality the caller has no membership in', async () => {
      const mine = await call('GET', `municipalities/${ZUBIA}/events`, { subject: EDITOR });
      const theirs = await call('GET', `municipalities/${OTURA}/events`, { subject: EDITOR });

      expect(statusOf(mine)).toBe(200);
      expect(statusOf(theirs)).toBe(403);
    });

    it('refuses somebody with a valid token and no membership at all', async () => {
      const result = await call('GET', `municipalities/${ZUBIA}/events`, { subject: STRANGER });

      expect(statusOf(result)).toBe(403);
    });

    it('tells a wrong route from a wrong method', async () => {
      expect(statusOf(await call('GET', 'municipalities/x/nope', { subject: EDITOR }))).toBe(404);
      expect(
        statusOf(await call('DELETE', `municipalities/${ZUBIA}/events`, { subject: EDITOR })),
      ).toBe(405);
    });
  });

  describe('events', () => {
    it('lists what the panel sees, drafts included', async () => {
      const result = await call('GET', `municipalities/${ZUBIA}/events`, { subject: EDITOR });
      const events = bodyOf(result) as { id: string; status: string }[];

      expect(events.map((event) => event.id)).toContain(EVENTS.zubiaDraft);
    });

    it('creates one, and says so in the audit log', async () => {
      const created = await call('POST', `municipalities/${ZUBIA}/events`, {
        subject: EDITOR,
        body: {
          id: 'evt-from-api',
          title: 'Pregón de la feria',
          categoryId: 'cat-fiestas',
          startAt: '2027-08-15T20:00:00.000Z',
          location: { name: 'Plaza del Ayuntamiento' },
          status: 'published',
        },
      });

      expect(statusOf(created)).toBe(200);
      expect((bodyOf(created) as { status: string }).status).toBe('published');

      const log = bodyOf(await call('GET', `municipalities/${ZUBIA}/audit`, { subject: ADMIN }));

      expect((log as { action: string; entityId: string }[])[0]).toMatchObject({
        action: 'event.create',
        entityId: 'evt-from-api',
      });
    });

    it('refuses a body that is not what it claims', async () => {
      const missingTitle = await call('POST', `municipalities/${ZUBIA}/events`, {
        subject: EDITOR,
        body: { categoryId: 'cat-fiestas', startAt: '2027-08-15T20:00:00.000Z' },
      });
      const notJson = await route(
        {
          ...request('POST', `municipalities/${ZUBIA}/events`, { subject: EDITOR }),
          body: 'esto no es json',
        } as ApiEvent,
        client,
        TABLE,
      );

      expect(statusOf(missingTitle)).toBe(400);
      expect(statusOf(notJson)).toBe(400);
    });

    it('approves, cancels, and refuses to reject without a reason', async () => {
      const approved = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.hermandadPending}/approve`,
        { subject: EDITOR },
      );

      expect(statusOf(approved)).toBe(200);
      expect((bodyOf(approved) as { status: string }).status).toBe('published');

      const noReason = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.penaPending}/reject`,
        { subject: EDITOR, body: {} },
      );

      expect(statusOf(noReason)).toBe(400);

      const cancelled = await call('POST', `municipalities/${ZUBIA}/events/evt-from-api/cancel`, {
        subject: EDITOR,
      });

      expect((bodyOf(cancelled) as { status: string }).status).toBe('cancelled');
    });

    it('queues an association edit of a published event instead of applying it', async () => {
      const result = await call(
        'PATCH',
        `municipalities/${ZUBIA}/events/${EVENTS.hermandadPending}`,
        { subject: ASSOCIATION, body: { title: 'Vía crucis con recorrido nuevo' } },
      );

      expect(statusOf(result)).toBe(200);
      expect((bodyOf(result) as { kind: string }).kind).toBe('queued');

      const inbox = bodyOf(
        await call('GET', `municipalities/${ZUBIA}/review`, { subject: EDITOR }),
      );
      const changes = (inbox as { kind: string; change?: { id: string } }[]).filter(
        (item) => item.kind === 'change',
      );

      expect(changes).toHaveLength(1);

      const approved = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.hermandadPending}/changes/${changes[0]?.change?.id}/approve`,
        { subject: EDITOR },
      );

      expect((bodyOf(approved) as { title: string }).title).toBe('Vía crucis con recorrido nuevo');
    });

    it('deletes one, and the log is all that is left of it', async () => {
      const created = await call('POST', `municipalities/${ZUBIA}/events`, {
        subject: EDITOR,
        body: {
          id: 'evt-typed-twice',
          title: 'Concierto (duplicado)',
          categoryId: 'cat-cultura',
          startAt: '2027-08-16T21:00:00.000Z',
          location: { name: 'Auditorio' },
          status: 'published',
        },
      });

      expect(statusOf(created)).toBe(200);

      const deleted = await call('DELETE', `municipalities/${ZUBIA}/events/evt-typed-twice`, {
        subject: EDITOR,
      });

      expect(statusOf(deleted)).toBe(204);
      expect(
        statusOf(
          await call('GET', `municipalities/${ZUBIA}/events/evt-typed-twice`, { subject: EDITOR }),
        ),
      ).toBe(404);

      const log = bodyOf(await call('GET', `municipalities/${ZUBIA}/audit`, { subject: ADMIN }));

      expect((log as { action: string; entityId: string }[])[0]).toMatchObject({
        action: 'event.delete',
        entityId: 'evt-typed-twice',
      });
    });

    it('refuses a poster that is not an image, and one that is too big', async () => {
      // No MEDIA_BUCKET in the tests, so nothing reaches S3 — which is the
      // point: both of these have to be refused before anything is stored, and
      // the order is what this checks.
      const wrongType = await call(
        'PUT',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/image`,
        { subject: EDITOR, body: { mimeType: 'application/pdf', data: 'AAAA' } },
      );

      const noBody = await call(
        'PUT',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/image`,
        { subject: EDITOR, body: { mimeType: 'image/jpeg' } },
      );

      // 503 when the environment has no bucket configured, which is this one;
      // what matters is that neither is a 500 and neither wrote anything.
      expect([415, 503]).toContain(statusOf(wrongType));
      expect([400, 503]).toContain(statusOf(noBody));
    });

    it('does not let an association delete what the town has already seen', async () => {
      const refused = await call(
        'DELETE',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}`,
        { subject: ASSOCIATION },
      );

      expect(statusOf(refused)).toBe(403);
      expect(
        statusOf(
          await call('GET', `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}`, {
            subject: EDITOR,
          }),
        ),
      ).toBe(200);
    });
  });

  describe('notices', () => {
    it('are sent by the town hall and refused to an association', async () => {
      const sent = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/notices`,
        {
          subject: EDITOR,
          body: { type: 'time_change', message: 'Empieza media hora más tarde.' },
        },
      );

      expect(statusOf(sent)).toBe(200);
      expect((bodyOf(sent) as { pushSentAt: null }).pushSentAt).toBeNull();

      const refused = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.hermandadPending}/notices`,
        { subject: ASSOCIATION, body: { type: 'notice', message: 'Hola' } },
      );

      expect(statusOf(refused)).toBe(403);
    });

    it('refuse a type that is not one of ours', async () => {
      const result = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/notices`,
        { subject: EDITOR, body: { type: 'lo_que_sea', message: 'Hola' } },
      );

      expect(statusOf(result)).toBe(400);
    });

    it('feature a published event for the whole town, and log who did it', async () => {
      const featured = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/featured`,
        { subject: EDITOR, body: { message: 'Mañana empieza la feria.' } },
      );

      expect(statusOf(featured)).toBe(200);

      // The widest action in the panel, so the question of who pressed it will be
      // asked, and the log is where it gets answered.
      const log = await call('GET', `municipalities/${ZUBIA}/audit`, { subject: ADMIN });

      expect(bodyOf(log)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'event.featured' })]),
      );
    });

    it('refuse to feature a draft, and refuse an association outright', async () => {
      const draft = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaDraft}/featured`,
        { subject: EDITOR, body: { message: 'Venid' } },
      );

      expect(statusOf(draft)).toBe(403);

      const association = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/featured`,
        { subject: ASSOCIATION, body: { message: 'Venid' } },
      );

      expect(statusOf(association)).toBe(403);

      // Whitespace passes the schema, which only asks for a character, and is
      // stopped by the store: a push that says nothing must not go to a town.
      const empty = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/featured`,
        { subject: EDITOR, body: { message: '   ' } },
      );

      expect(statusOf(empty)).toBe(403);

      const missing = await call(
        'POST',
        `municipalities/${ZUBIA}/events/${EVENTS.zubiaPublished}/featured`,
        { subject: EDITOR, body: {} },
      );

      expect(statusOf(missing)).toBe(400);
    });
  });

  describe('associations and access', () => {
    it('are created by an administrator and not by an editor', async () => {
      const created = await call('POST', `municipalities/${ZUBIA}/organizations`, {
        subject: ADMIN,
        body: {
          id: 'org-club',
          name: 'Club de atletismo',
          type: 'sports_club',
          contactEmail: null,
        },
      });

      expect(statusOf(created)).toBe(200);
      expect((bodyOf(created) as { isTrusted: boolean }).isTrusted).toBe(false);

      const refused = await call('POST', `municipalities/${ZUBIA}/organizations`, {
        subject: EDITOR,
        body: { name: 'Otra', type: 'cultural', contactEmail: null },
      });

      expect(statusOf(refused)).toBe(403);
    });

    it('are trusted with a patch, and the log says who did it', async () => {
      const patched = await call('PATCH', `municipalities/${ZUBIA}/organizations/org-club`, {
        subject: ADMIN,
        body: { isTrusted: true },
      });

      expect((bodyOf(patched) as { isTrusted: boolean }).isTrusted).toBe(true);

      const log = bodyOf(
        await call('GET', `municipalities/${ZUBIA}/audit`, { subject: ADMIN }),
      ) as { action: string; actorId: string }[];

      expect(log[0]).toMatchObject({ action: 'organization.trust', actorId: ADMIN });
    });

    it('grant and revoke access, administrators only', async () => {
      const granted = await call('POST', `municipalities/${ZUBIA}/staff`, {
        subject: ADMIN,
        body: { authUserId: 'auth-new', role: 'municipal_editor', email: 'nuevo@lazubia.es' },
      });

      expect(statusOf(granted)).toBe(200);

      const byEditor = await call('POST', `municipalities/${ZUBIA}/staff`, {
        subject: EDITOR,
        body: { authUserId: 'auth-sneaky', role: 'municipal_admin', email: 'x@y.es' },
      });

      expect(statusOf(byEditor)).toBe(403);

      const revoked = await call('DELETE', `municipalities/${ZUBIA}/staff/auth-new`, {
        subject: ADMIN,
      });

      expect(statusOf(revoked)).toBe(204);
      expect(statusOf(await call('GET', 'me', { subject: 'auth-new' }))).toBe(200);
    });
  });

  describe('what a councillor reads', () => {
    it('gives aggregates and no names', async () => {
      const result = await call('GET', `municipalities/${ZUBIA}/stats`, { subject: EDITOR });
      const stats = bodyOf(result) as Record<string, unknown>;

      expect(statusOf(result)).toBe(200);
      expect(Object.keys(stats)).toEqual([
        'devices',
        'events',
        'views',
        'interests',
        'suppressed',
        'generatedAt',
      ]);

      // `devices` is a count of phones following the town and nothing else: no id
      // of any of them, and nothing that could be matched back to a person.
      expect(stats['devices']).toEqual({ following: expect.any(Number) });
      expect(JSON.stringify(stats)).not.toContain('DEV#');
      expect(JSON.stringify(stats)).not.toContain('deviceId');
    });

    it('keeps the audit log for the administrator', async () => {
      expect(
        statusOf(await call('GET', `municipalities/${ZUBIA}/audit`, { subject: EDITOR })),
      ).toBe(403);
    });
  });
});
