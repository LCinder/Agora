import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuditLog } from './audit-log';
import { type StoreClient, createStoreClient } from './client';
import { createDeviceStore } from './device-store';
import { StoreError } from './errors';
import { createMembershipStore } from './memberships';
import { createNoticeStore } from './notices';
import { createOrganizationStore } from './organizations';
import { createPublicStore } from './public-store';
import { MINIMUM_SEGMENT, createStatsStore } from './stats';
import { type ReviewItem, type StaffActor, createStaffStore } from './staff-store';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import {
  EVENTS,
  HERMANDAD,
  OTURA,
  PENA,
  ZUBIA,
  createTable,
  dropTable,
  seed,
} from './testing/fixtures';

/**
 * Everything the panel does beyond creating an event.
 *
 * The rules here are the ones that make the collaborative calendar worth selling
 * — an association fills it, the town hall stays in control of what appears —
 * and the one that makes the data panel safe to show: numbers, never names, and
 * not even numbers when they are small enough to be people.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-panel-${process.pid}`;

const admin: StaffActor = {
  authUserId: 'auth-admin',
  municipalityId: ZUBIA,
  role: 'municipal_admin',
  organizationId: null,
};

const editor: StaffActor = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor',
  organizationId: null,
};

const hermandad: StaffActor = {
  authUserId: 'auth-hermandad',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: HERMANDAD,
};

const changes = (queue: ReviewItem[]) =>
  queue.flatMap((item) => (item.kind === 'change' ? [item.change] : []));

describe.skipIf(local === null)('the panel', () => {
  let client: StoreClient;

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  // -------------------------------------------------------------------------
  // Memberships: the table that turns an identity into permissions
  // -------------------------------------------------------------------------

  describe('memberships', () => {
    it('gives a municipality its role, and the role comes from the table', async () => {
      const store = createMembershipStore(client, TABLE);

      const granted = await store.grant(admin, {
        authUserId: 'auth-new-officer',
        role: 'municipal_editor',
        email: 'tecnico@lazubia.es',
        fullName: 'Técnica de cultura',
      });

      expect(granted.municipalityId).toBe(ZUBIA);
      expect((await store.get('auth-new-officer', ZUBIA))?.role).toBe('municipal_editor');
      expect(await store.listForUser('auth-new-officer')).toHaveLength(1);
    });

    it('puts the new person in the granting administrator municipality, whatever is asked', async () => {
      const store = createMembershipStore(client, TABLE);

      const granted = await store.grant(
        { ...admin },
        {
          authUserId: 'auth-invader',
          role: 'municipal_editor',
          email: 'x@y.es',
        },
      );

      // There is no field to smuggle another municipality through: it is read
      // off the actor.
      expect(granted.municipalityId).toBe(ZUBIA);
      expect(await store.get('auth-invader', OTURA)).toBeNull();
    });

    it('is not something an editor or an association can hand out', async () => {
      const store = createMembershipStore(client, TABLE);

      for (const actor of [editor, hermandad]) {
        await expect(
          store.grant(actor, {
            authUserId: 'auth-friend',
            role: 'municipal_admin',
            email: 'a@b.es',
          }),
        ).rejects.toThrow(StoreError);
      }
    });

    it('will not create an association editor with no association', async () => {
      const store = createMembershipStore(client, TABLE);

      await expect(
        store.grant(admin, { authUserId: 'auth-nobody', role: 'org_editor', email: 'a@b.es' }),
      ).rejects.toThrow(StoreError);
    });

    it('revokes, but never your own access', async () => {
      const store = createMembershipStore(client, TABLE);

      await expect(store.revoke(admin, admin.authUserId)).rejects.toThrow(StoreError);

      await store.revoke(admin, 'auth-invader');

      expect(await store.get('auth-invader', ZUBIA)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Notices: the half of "Me interesa" the town hall gets something out of
  // -------------------------------------------------------------------------

  describe('notices', () => {
    it('are sent by the town hall and land on the event', async () => {
      const store = createNoticeStore(client, TABLE, editor);

      const sent = await store.send({
        eventId: EVENTS.zubiaPublished,
        type: 'time_change',
        message: 'La cabalgata sale a las 18:30 en lugar de a las 18:00.',
      });

      expect(sent.pushSentAt).toBeNull();

      const listed = await store.list(EVENTS.zubiaPublished);

      expect(listed.map((notice) => notice.id)).toEqual([sent.id]);
      expect(listed[0]?.createdBy).toBe(editor.authUserId);
    });

    it('are not an association to send', async () => {
      const store = createNoticeStore(client, TABLE, hermandad);

      await expect(
        store.send({ eventId: EVENTS.hermandadPending, type: 'notice', message: 'Hola' }),
      ).rejects.toThrow(StoreError);
    });

    it('cannot be written on another municipality event', async () => {
      const store = createNoticeStore(client, TABLE, editor);

      await expect(
        store.send({ eventId: EVENTS.oturaPublished, type: 'notice', message: 'Hola' }),
      ).rejects.toThrow(StoreError);
    });

    it('refuse an empty message', async () => {
      const store = createNoticeStore(client, TABLE, editor);

      await expect(
        store.send({ eventId: EVENTS.zubiaPublished, type: 'notice', message: '   ' }),
      ).rejects.toThrow(StoreError);
    });

    it('record when the push went out', async () => {
      const store = createNoticeStore(client, TABLE, editor);
      const [notice] = await store.list(EVENTS.zubiaPublished);

      expect(notice).toBeDefined();

      await store.markSent(EVENTS.zubiaPublished, notice!.id);

      const [updated] = await store.list(EVENTS.zubiaPublished);

      expect(updated?.pushSentAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Associations: both levers belong to the town hall
  // -------------------------------------------------------------------------

  describe('associations', () => {
    it('are created invited and never trusted', async () => {
      const store = createOrganizationStore(client, TABLE, admin);

      const created = await store.create({
        id: 'org-ampa',
        name: 'AMPA del colegio',
        type: 'parents_assoc',
        contactEmail: 'ampa@lazubia.es',
      });

      expect(created.status).toBe('invited');
      expect(created.isTrusted).toBe(false);
    });

    it('are not an editor to create, nor an association to trust', async () => {
      await expect(
        createOrganizationStore(client, TABLE, editor).create({
          name: 'Peña nueva',
          type: 'pena',
          contactEmail: null,
        }),
      ).rejects.toThrow(StoreError);

      await expect(
        createOrganizationStore(client, TABLE, hermandad).setTrusted(HERMANDAD, true),
      ).rejects.toThrow(StoreError);
    });

    it('show an association itself and nobody else', async () => {
      const all = await createOrganizationStore(client, TABLE, admin).list();
      const mine = await createOrganizationStore(client, TABLE, hermandad).list();

      expect(all.length).toBeGreaterThan(1);
      expect(mine.map((organization) => organization.id)).toEqual([HERMANDAD]);
      expect(await createOrganizationStore(client, TABLE, hermandad).get(PENA)).toBeNull();
    });

    it('publish without review once the town hall says so', async () => {
      await createOrganizationStore(client, TABLE, admin).setTrusted(HERMANDAD, true);

      const created = await createStaffStore(client, TABLE, hermandad).createEvent({
        id: 'evt-trusted-now',
        title: 'Charla de Semana Santa',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-03-20T19:00:00.000Z'),
        location: { name: 'Casa de hermandad', latitude: null, longitude: null },
      });

      expect(created.status).toBe('published');

      // And back to how it was, so the tests below see an untrusted association.
      await createOrganizationStore(client, TABLE, admin).setTrusted(HERMANDAD, false);
    });
  });

  // -------------------------------------------------------------------------
  // A change to something already published
  // -------------------------------------------------------------------------

  describe('a change to a published event', () => {
    const NEW_TITLE = 'Vía crucis (recorrido nuevo)';

    it('does not touch what the neighbours see', async () => {
      const staff = createStaffStore(client, TABLE, hermandad);
      const publicStore = createPublicStore(client, TABLE);

      // The association's event is published first, by the town hall approving.
      await createStaffStore(client, TABLE, editor).approveEvent(EVENTS.hermandadPending);

      const before = await publicStore.getVisibleEvent(ZUBIA, EVENTS.hermandadPending);
      const result = await staff.updateEvent(EVENTS.hermandadPending, { title: NEW_TITLE });

      expect(result.kind).toBe('queued');

      const after = await publicStore.getVisibleEvent(ZUBIA, EVENTS.hermandadPending);

      expect(after?.title).toBe(before?.title);
      expect(after?.title).not.toBe(NEW_TITLE);
    });

    it('waits in the same inbox as the pending events', async () => {
      const queue = await createStaffStore(client, TABLE, editor).reviewQueue();
      const waiting = changes(queue);

      expect(waiting).toHaveLength(1);
      expect(waiting[0]?.eventId).toBe(EVENTS.hermandadPending);
      expect(waiting[0]?.payload.title).toBe(NEW_TITLE);
    });

    it('is not an association to approve', async () => {
      const queue = await createStaffStore(client, TABLE, editor).reviewQueue();
      const [change] = changes(queue);

      await expect(
        createStaffStore(client, TABLE, hermandad).approveChange(
          EVENTS.hermandadPending,
          change!.id,
        ),
      ).rejects.toThrow(StoreError);
    });

    it('applies to the event when the town hall approves it, and leaves the inbox', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const [change] = changes(await staff.reviewQueue());

      const updated = await staff.approveChange(EVENTS.hermandadPending, change!.id);

      expect(updated.title).toBe(NEW_TITLE);

      const publicStore = createPublicStore(client, TABLE);

      expect((await publicStore.getVisibleEvent(ZUBIA, EVENTS.hermandadPending))?.title).toBe(
        NEW_TITLE,
      );
      expect(changes(await staff.reviewQueue())).toHaveLength(0);
    });

    it('stays readable with its reason when it is turned down', async () => {
      const association = createStaffStore(client, TABLE, hermandad);
      const staff = createStaffStore(client, TABLE, editor);

      await association.updateEvent(EVENTS.hermandadPending, { title: 'Otra cosa' });

      const [waiting] = changes(await staff.reviewQueue());

      await expect(staff.rejectChange(EVENTS.hermandadPending, waiting!.id, '  ')).rejects.toThrow(
        StoreError,
      );

      const rejected = await staff.rejectChange(
        EVENTS.hermandadPending,
        waiting!.id,
        'El recorrido no está autorizado',
      );

      expect(rejected.rejectionReason).toBe('El recorrido no está autorizado');
      expect(changes(await staff.reviewQueue())).toHaveLength(0);

      const own = await association.listChanges(EVENTS.hermandadPending);

      expect(own.at(-1)?.status).toBe('rejected');
      expect(own.at(-1)?.rejectionReason).toBe('El recorrido no está autorizado');
    });

    it('goes straight through for the town hall', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const result = await staff.updateEvent(EVENTS.zubiaPublished, {
        title: 'Cabalgata de Reyes',
      });

      expect(result.kind).toBe('applied');
      expect((await staff.getEvent(EVENTS.zubiaPublished))?.title).toBe('Cabalgata de Reyes');
    });
  });

  describe('the cover', () => {
    it('holds one event at a time, whoever puts it there', async () => {
      const staff = createStaffStore(client, TABLE, editor);

      const first = await staff.createEvent({
        id: 'evt-cover-one',
        title: 'Pregón',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-05-01T20:00:00.000Z'),
        location: { name: 'Plaza', latitude: null, longitude: null },
        status: 'published',
        isFeatured: true,
      });

      expect(first.isFeatured).toBe(true);

      const second = await staff.createEvent({
        id: 'evt-cover-two',
        title: 'Verbena',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-05-02T22:00:00.000Z'),
        location: { name: 'Plaza', latitude: null, longitude: null },
        status: 'published',
        isFeatured: true,
      });

      expect(second.isFeatured).toBe(true);
      expect((await staff.getEvent('evt-cover-one'))?.isFeatured).toBe(false);

      // And the same through an edit, which is how the panel actually does it.
      await staff.updateEvent('evt-cover-one', { isFeatured: true });

      expect((await staff.getEvent('evt-cover-two'))?.isFeatured).toBe(false);

      const featured = (await staff.listEvents()).filter((event) => event.isFeatured);

      expect(featured).toHaveLength(1);
      expect(featured[0]?.id).toBe('evt-cover-one');
    });

    it('is not an association to put itself on', async () => {
      const association = createStaffStore(client, TABLE, hermandad);

      const asked = await association.createEvent({
        id: 'evt-cover-asked',
        title: 'Triduo',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-05-03T19:00:00.000Z'),
        location: { name: 'Parroquia', latitude: null, longitude: null },
        isFeatured: true,
      });

      expect(asked.isFeatured).toBe(false);

      // Nor by editing one of its own afterwards.
      await association.updateEvent('evt-cover-asked', { isFeatured: true, title: 'Triduo (2)' });

      const after = await association.getEvent('evt-cover-asked');

      expect(after?.isFeatured).toBe(false);
      expect(after?.title).toBe('Triduo (2)');
    });
  });

  describe('deleting an event', () => {
    it('takes it off the calendar for good', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const publicStore = createPublicStore(client, TABLE);

      const doomed = await staff.createEvent({
        id: 'evt-duplicate',
        title: 'Concierto (duplicado)',
        categoryId: 'cat-cultura',
        startAt: new Date('2027-06-01T21:00:00.000Z'),
        location: { name: 'Auditorio', latitude: null, longitude: null },
        status: 'published',
      });

      expect(await publicStore.getVisibleEvent(ZUBIA, doomed.id)).not.toBeNull();

      await staff.deleteEvent(doomed.id);

      expect(await publicStore.getVisibleEvent(ZUBIA, doomed.id)).toBeNull();
      expect(await staff.getEvent(doomed.id)).toBeNull();
    });

    it('leaves nothing in the review inbox pointing at it', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const association = createStaffStore(client, TABLE, hermandad);

      const pending = await association.createEvent({
        id: 'evt-pending-then-deleted',
        title: 'Rosario de la aurora',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-06-15T07:00:00.000Z'),
        location: { name: 'Parroquia', latitude: null, longitude: null },
      });

      expect(pending.status).toBe('pending_review');

      const queued = (await staff.reviewQueue()).filter(
        (item) => item.kind === 'event' && item.event.id === pending.id,
      );

      expect(queued).toHaveLength(1);

      await staff.deleteEvent(pending.id);

      expect(
        (await staff.reviewQueue()).filter(
          (item) => item.kind === 'event' && item.event.id === pending.id,
        ),
      ).toHaveLength(0);
      expect(await association.getEvent(pending.id)).toBeNull();
    });

    it('belongs to the town hall once the neighbours have seen it', async () => {
      const association = createStaffStore(client, TABLE, hermandad);

      const own = await association.createEvent({
        id: 'evt-association-own',
        title: 'Ensayo',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-07-01T19:00:00.000Z'),
        location: { name: 'Casa hermandad', latitude: null, longitude: null },
      });

      // Waiting for review, so nobody has seen it: the association may drop it.
      await association.deleteEvent(own.id);

      expect(await association.getEvent(own.id)).toBeNull();

      // Published, so it may not.
      await expect(association.deleteEvent(EVENTS.zubiaPublished)).rejects.toThrow(StoreError);
      expect(await association.getEvent(EVENTS.zubiaPublished)).not.toBeNull();
    });

    it('lets a resident drop a mark it left behind', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const device = createDeviceStore(client, TABLE, 'device-orphan');

      const doomed = await staff.createEvent({
        id: 'evt-marked-then-deleted',
        title: 'Cine de verano',
        categoryId: 'cat-cultura',
        startAt: new Date('2027-08-01T22:00:00.000Z'),
        location: { name: 'Piscina', latitude: null, longitude: null },
        status: 'published',
      });

      await device.markInterest(ZUBIA, doomed.id);
      await staff.deleteEvent(doomed.id);

      // The counter it would have decremented went with the event. Refusing here
      // would leave the phone holding a mark it cannot remove, and would break
      // "borrar mis datos", which unmarks everything one by one.
      await device.unmarkInterest(ZUBIA, doomed.id);

      expect(await device.listInterests()).toHaveLength(0);
    });
  });

  describe('how many opened an event', () => {
    it('counts a phone once a day, however many times it looks', async () => {
      const staff = createStaffStore(client, TABLE, editor);
      const one = createDeviceStore(client, TABLE, 'device-reader-one');
      const two = createDeviceStore(client, TABLE, 'device-reader-two');

      const event = await staff.createEvent({
        id: 'evt-read',
        title: 'Taller',
        categoryId: 'cat-cultura',
        startAt: new Date('2027-09-01T18:00:00.000Z'),
        location: { name: 'Biblioteca', latitude: null, longitude: null },
        status: 'published',
      });

      expect(event.viewCount).toBe(0);

      await one.recordView(ZUBIA, event.id);
      await one.recordView(ZUBIA, event.id);
      await one.recordView(ZUBIA, event.id);
      await two.recordView(ZUBIA, event.id);

      expect((await staff.getEvent(event.id))?.viewCount).toBe(2);
    });

    it('says nothing about an event that is not there', async () => {
      const device = createDeviceStore(client, TABLE, 'device-reader-three');

      await expect(device.recordView(ZUBIA, 'evt-does-not-exist')).resolves.toBeUndefined();
    });

    it('survives an edit, like the marks do', async () => {
      const staff = createStaffStore(client, TABLE, editor);

      await createDeviceStore(client, TABLE, 'device-reader-four').recordView(ZUBIA, 'evt-read');

      const before = (await staff.getEvent('evt-read'))?.viewCount;

      await staff.updateEvent('evt-read', { title: 'Taller de cerámica' });

      const after = await staff.getEvent('evt-read');

      expect(after?.title).toBe('Taller de cerámica');
      expect(after?.viewCount).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // The data panel
  // -------------------------------------------------------------------------

  describe('who has access', () => {
    it('lists everybody with a membership in the municipality', async () => {
      const store = createMembershipStore(client, TABLE);

      await store.grant(admin, {
        authUserId: 'auth-listed',
        role: 'municipal_editor',
        email: 'listado@lazubia.es',
        fullName: 'Persona listada',
      });

      const people = await store.listForMunicipality(editor);
      const listed = people.find((member) => member.authUserId === 'auth-listed');

      expect(listed?.email).toBe('listado@lazubia.es');
      expect(people.every((member) => member.municipalityId === ZUBIA)).toBe(true);
    });

    it('stops listing somebody whose access was taken away', async () => {
      const store = createMembershipStore(client, TABLE);

      await store.grant(admin, {
        authUserId: 'auth-temporary',
        role: 'municipal_editor',
        email: 'temporal@lazubia.es',
      });

      await store.revoke(admin, 'auth-temporary');

      const people = await store.listForMunicipality(admin);

      // Both rows go, or the screen would offer to remove somebody who is gone.
      expect(people.map((member) => member.authUserId)).not.toContain('auth-temporary');
      expect(await store.listForUser('auth-temporary')).toEqual([]);
    });

    it('is not an association\u2019s business', async () => {
      await expect(
        createMembershipStore(client, TABLE).listForMunicipality(hermandad),
      ).rejects.toThrow(StoreError);
    });
  });

  describe('the neighbours, counted', () => {
    it('counts a phone once however many times it says it follows a town', async () => {
      const one = createDeviceStore(client, TABLE, 'device-follow-one');
      const two = createDeviceStore(client, TABLE, 'device-follow-two');

      await one.register({ platform: 'android', locale: 'es' });
      await two.register({ platform: 'ios', locale: 'es' });

      const before = (await createStatsStore(client, TABLE, editor).summary()).devices.following;

      // Nobody registered for this: a resident opened the app and picked a town.
      await one.follow(ZUBIA);
      await one.follow(ZUBIA);
      await two.follow(ZUBIA);
      await two.follow(OTURA);

      const after = await createStatsStore(client, TABLE, editor).summary();

      expect(after.devices.following).toBe(before + 2);
      expect(await two.listFollowed()).toEqual([OTURA, ZUBIA]);
    });

    it('hands the count back when a phone asks to be forgotten', async () => {
      const device = createDeviceStore(client, TABLE, 'device-goodbye');

      await device.register({ platform: 'web', locale: 'es' });
      await device.follow(ZUBIA);

      const withThem = (await createStatsStore(client, TABLE, editor).summary()).devices.following;

      await device.forget();

      const without = (await createStatsStore(client, TABLE, editor).summary()).devices.following;

      expect(without).toBe(withThem - 1);
    });
  });

  describe('the statistics', () => {
    it('count the events of the municipality by state', async () => {
      const stats = await createStatsStore(client, TABLE, editor).summary();

      expect(stats.events.total).toBeGreaterThan(0);
      expect(stats.events.published).toBeGreaterThan(0);
      expect(stats.events.total).toBe(
        stats.events.published +
          stats.events.draft +
          stats.events.cancelled +
          stats.events.awaitingReview,
      );
    });

    it('hold back a number small enough to be people, and say how many it held back', async () => {
      const devices = ['device-a', 'device-b'];

      for (const id of devices) {
        await createDeviceStore(client, TABLE, id).markInterest(ZUBIA, EVENTS.zubiaPublished);
      }

      const stats = await createStatsStore(client, TABLE, editor).summary();
      const top = stats.interests.topEvents.find(
        (entry) => entry.eventId === EVENTS.zubiaPublished,
      );

      expect(devices.length).toBeLessThan(MINIMUM_SEGMENT);
      expect(stats.interests.total).toBe(devices.length);
      expect(top?.interested).toBeNull();
      expect(stats.suppressed).toBeGreaterThan(0);
    });

    it('report the number once there are enough of them', async () => {
      for (const id of ['device-c', 'device-d', 'device-e', 'device-f']) {
        await createDeviceStore(client, TABLE, id).markInterest(ZUBIA, EVENTS.zubiaPublished);
      }

      const stats = await createStatsStore(client, TABLE, editor).summary();
      const top = stats.interests.topEvents.find(
        (entry) => entry.eventId === EVENTS.zubiaPublished,
      );

      expect(top?.interested).toBe(6);
    });

    it('count new marks by month, and never take them off again', async () => {
      const before = await createStatsStore(client, TABLE, editor).summary();
      const month = new Date().toISOString().slice(0, 7);
      const started =
        before.interests.monthly.find((entry) => entry.month === month)?.interested ?? 0;

      const device = createDeviceStore(client, TABLE, 'device-monthly');

      await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

      const after = await createStatsStore(client, TABLE, editor).summary();
      const counted =
        after.interests.monthly.find((entry) => entry.month === month)?.interested ?? 0;

      expect(counted).toBe(started + 1);

      // Unmarking does not un-happen the interest somebody showed in June, and
      // deciding which month to take it off has no good answer. The event's own
      // counter does go down, which is the number the panel shows per event.
      await device.unmarkInterest(ZUBIA, EVENTS.zubiaPublished);

      const later = await createStatsStore(client, TABLE, editor).summary();

      expect(later.interests.monthly.find((entry) => entry.month === month)?.interested).toBe(
        started + 1,
      );
      expect(later.interests.total).toBe(after.interests.total - 1);
    });

    it('give an association its own events and not the town', async () => {
      const all = await createStatsStore(client, TABLE, editor).summary();
      const mine = await createStatsStore(client, TABLE, hermandad).summary();

      expect(mine.events.total).toBeLessThan(all.events.total);
    });
  });

  // -------------------------------------------------------------------------
  // The log a secretary will ask about
  // -------------------------------------------------------------------------

  describe('the audit log', () => {
    it('appends and reads back newest first', async () => {
      const log = createAuditLog(client, TABLE, admin);

      await log.record({ action: 'event.publish', entity: 'event', entityId: 'evt-one' });
      await log.record({
        action: 'organization.trust',
        entity: 'organization',
        entityId: 'org-one',
      });

      const lines = await log.list();

      expect(lines[0]?.action).toBe('organization.trust');
      expect(lines[1]?.action).toBe('event.publish');
      expect(lines.every((line) => line.municipalityId === ZUBIA)).toBe(true);
      expect(lines[0]?.actorId).toBe(admin.authUserId);
    });

    it('is the administrator to read, not an editor', async () => {
      await expect(createAuditLog(client, TABLE, editor).list()).rejects.toThrow(StoreError);
    });
  });
});
