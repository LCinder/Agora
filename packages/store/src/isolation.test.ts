import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { createDeviceStore } from './device-store';
import { StoreError } from './errors';
import { createPublicStore } from './public-store';
import { createNotificationStore } from './notification-store';
import { type ReviewItem, type StaffActor, createStaffStore } from './staff-store';
import {
  CORAL,
  DEVICE_ONE,
  DEVICE_TWO,
  EVENTS,
  HERMANDAD,
  OTURA,
  ZUBIA,
  createTable,
  dropTable,
  seed,
} from './testing/fixtures';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';

/**
 * Tenant isolation, against a real DynamoDB.
 *
 * These are the highest priority tests in the product (CLAUDE.md, section 10),
 * ported from `infra/db/tests.sql` — where the guarantee came from PostgreSQL's
 * row level security — to the key design that replaces it (D-026).
 *
 * What is being proven is not that the code filters correctly. It is that the
 * queries a caller can even express cannot reach another municipality's data:
 * every partition key names a municipality, and an unapproved event is not in
 * the index the public calendar reads.
 *
 * Needs a DynamoDB Local. The CI provides one; a developer machine with Docker
 * gets one started automatically; without either the suite skips and says so.
 */
const local: LocalDynamo | null = await startDynamoLocal();

const TABLE = `agora-isolation-${process.pid}`;

const municipalEditor: StaffActor = {
  authUserId: 'auth-zubia-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor',
  organizationId: null,
};

const hermandadEditor: StaffActor = {
  authUserId: 'auth-hermandad',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: HERMANDAD,
};

const coralEditor: StaffActor = {
  authUserId: 'auth-coral',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: CORAL,
};

const oturaEditor: StaffActor = {
  authUserId: 'auth-otura-editor',
  municipalityId: OTURA,
  role: 'municipal_editor',
  organizationId: null,
};

/**
 * The suite runs in order and later tests build on earlier ones: the fixtures
 * are seeded once, and the review decisions at the end deliberately change the
 * state the tests before them read. Vitest runs the tests of a file in order,
 * which is what makes that safe.
 */
/** The events waiting in a review inbox, which also holds changes. */
function pendingEvents(queue: ReviewItem[]) {
  return queue.flatMap((item) => (item.kind === 'event' ? [item.event] : []));
}

describe.skipIf(local === null)('tenant isolation', () => {
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
  // 1. A municipal editor and the municipality next door
  // -------------------------------------------------------------------------

  describe('a municipal editor', () => {
    it('sees every event of their own municipality, whatever its state', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);
      const events = await store.listEvents();

      expect(events.map((event) => event.id).sort()).toEqual(
        [
          EVENTS.zubiaPublished,
          EVENTS.zubiaDraft,
          EVENTS.hermandadPending,
          EVENTS.penaPending,
          EVENTS.zubiaCancelled,
        ].sort(),
      );
    });

    it('sees nothing of another municipality, not even by asking for it by id', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);

      expect(await store.getEvent(EVENTS.oturaDraft)).toBeNull();
      expect(await store.getEvent(EVENTS.oturaPublished)).toBeNull();
    });

    it('cannot edit an event of another municipality', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);

      await expect(
        store.updateEvent(EVENTS.oturaPublished, { title: 'secuestrado' }),
      ).rejects.toThrow(StoreError);

      // And the event next door is untouched.
      const next = createStaffStore(client, TABLE, oturaEditor);
      const event = await next.getEvent(EVENTS.oturaPublished);

      expect(event?.title).toBe('Coral');
    });

    it('reads how many residents marked an event, and has no way to read who', async () => {
      const device = createDeviceStore(client, TABLE, DEVICE_ONE);
      await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

      const store = createStaffStore(client, TABLE, municipalEditor);

      expect(await store.interestCount(EVENTS.zubiaPublished)).toBe(1);
      expect('devicesInterestedIn' in store).toBe(false);
      expect(Object.keys(store)).not.toContain('listInterests');
    });

    it('reads how many marked one line of a programme, and has no way to read who either', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);

      const line = await store.createActivity(EVENTS.zubiaPublished, {
        id: 'act-isolation-count',
        title: 'Show de aves rapaces',
        startAt: new Date('2027-03-01T17:00:00.000Z'),
      });

      const device = createDeviceStore(client, TABLE, DEVICE_ONE);

      await device.markActivityInterest(ZUBIA, EVENTS.zubiaPublished, line.id);

      expect(Object.keys(store)).not.toContain('devicesInterestedInActivity');
      expect(Object.keys(store)).not.toContain('listActivityInterests');

      // What it does get is the tally on the line itself, which is the whole of
      // what the panel ever learns about who cared.
      const counted = (await store.listActivities(EVENTS.zubiaPublished)).find(
        (entry) => entry.id === line.id,
      );

      expect(counted?.interestCount).toBe(1);

      // Tidied up, mark included: the tests further down read this device's own
      // marks back and expect only what they put there.
      await device.unmarkActivityInterest(ZUBIA, EVENTS.zubiaPublished, line.id);
      await store.deleteActivity(EVENTS.zubiaPublished, line.id);
    });

    it('has a review queue with the pending events of its own municipality only', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);
      const queue = await store.reviewQueue();

      expect(
        pendingEvents(queue)
          .map((event) => event.id)
          .sort(),
      ).toEqual([EVENTS.hermandadPending, EVENTS.penaPending].sort());
      expect(pendingEvents(queue).every((event) => event.municipalityId === ZUBIA)).toBe(true);
    });

    it('refuses to reject an event without a reason', async () => {
      const store = createStaffStore(client, TABLE, municipalEditor);

      await expect(store.rejectEvent(EVENTS.penaPending, '  ')).rejects.toThrow(StoreError);
    });
  });

  // -------------------------------------------------------------------------
  // 2. An association, its own events, and everybody else's
  // -------------------------------------------------------------------------

  describe('an association', () => {
    it('sees its own pending event', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      expect(await store.getEvent(EVENTS.hermandadPending)).not.toBeNull();
    });

    it('does not see another association pending event', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      expect(await store.getEvent(EVENTS.penaPending)).toBeNull();
    });

    it('does not see the town hall draft', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      expect(await store.getEvent(EVENTS.zubiaDraft)).toBeNull();
    });

    it('lists only its own events plus what any resident can see', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);
      const events = await store.listEvents();

      expect(events.map((event) => event.id).sort()).toEqual(
        [EVENTS.hermandadPending, EVENTS.zubiaPublished, EVENTS.zubiaCancelled].sort(),
      );
    });

    it('cannot edit another association event', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      await expect(store.updateEvent(EVENTS.penaPending, { title: 'secuestrado' })).rejects.toThrow(
        StoreError,
      );
    });

    // The one that matters most: if an association can publish, the review
    // queue is decorative.
    it('cannot publish, however it asks: the event lands in the review queue', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      const created = await store.createEvent({
        id: 'evt-attempted-publish',
        title: 'Publicado a la brava',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-05-01T18:00:00.000Z'),
        location: { name: 'Plaza', latitude: null, longitude: null },
        status: 'published',
      });

      expect(created.status).toBe('pending_review');

      // And it is not in the calendar a resident reads.
      const publicStore = createPublicStore(client, TABLE);
      const calendar = await publicStore.listCalendar(ZUBIA);

      expect(calendar.map((event) => event.id)).not.toContain('evt-attempted-publish');
    });

    it('cannot approve its own event', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      await expect(store.approveEvent(EVENTS.hermandadPending)).rejects.toThrow(StoreError);
    });

    it('cannot open the review queue at all', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      await expect(store.reviewQueue()).rejects.toThrow(StoreError);
    });

    it('creates its events in its own municipality and organisation, with no say in it', async () => {
      const store = createStaffStore(client, TABLE, hermandadEditor);

      const created = await store.createEvent({
        id: 'evt-own-scope',
        title: 'Charla',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-06-01T18:00:00.000Z'),
        location: { name: 'Casa de la cultura', latitude: null, longitude: null },
      });

      expect(created.municipalityId).toBe(ZUBIA);
      expect(created.organizationId).toBe(HERMANDAD);
    });

    it('publishes without review when the town hall marked it as trusted', async () => {
      const store = createStaffStore(client, TABLE, coralEditor);

      const created = await store.createEvent({
        id: 'evt-trusted',
        title: 'Concierto de la coral',
        categoryId: 'cat-fiestas',
        startAt: new Date('2027-04-01T18:00:00.000Z'),
        location: { name: 'Iglesia', latitude: null, longitude: null },
      });

      expect(created.status).toBe('published');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Residents
  // -------------------------------------------------------------------------

  describe('a resident', () => {
    it('sees published and cancelled events, and nothing else', async () => {
      const store = createPublicStore(client, TABLE);
      const calendar = await store.listCalendar(ZUBIA);

      expect(calendar.every((event) => ['published', 'cancelled'].includes(event.status))).toBe(
        true,
      );
      expect(calendar.map((event) => event.id)).toContain(EVENTS.zubiaPublished);
    });

    it('never sees an event waiting for approval or a draft', async () => {
      const store = createPublicStore(client, TABLE);
      const ids = (await store.listCalendar(ZUBIA)).map((event) => event.id);

      expect(ids).not.toContain(EVENTS.hermandadPending);
      expect(ids).not.toContain(EVENTS.penaPending);
      expect(ids).not.toContain(EVENTS.zubiaDraft);
    });

    it('cannot open a draft by asking for it by id', async () => {
      const store = createPublicStore(client, TABLE);

      expect(await store.getVisibleEvent(ZUBIA, EVENTS.zubiaDraft)).toBeNull();
      expect(await store.getVisibleEvent(ZUBIA, EVENTS.hermandadPending)).toBeNull();
    });

    it('still sees a cancelled event, because finding out is the point', async () => {
      const store = createPublicStore(client, TABLE);
      const event = await store.getVisibleEvent(ZUBIA, EVENTS.zubiaCancelled);

      expect(event?.status).toBe('cancelled');
    });

    it('gets one municipality calendar at a time, never two mixed', async () => {
      const store = createPublicStore(client, TABLE);
      const zubia = await store.listCalendar(ZUBIA);
      const otura = await store.listCalendar(OTURA);

      expect(zubia.every((event) => event.municipalityId === ZUBIA)).toBe(true);
      expect(otura.every((event) => event.municipalityId === OTURA)).toBe(true);
      expect(otura.map((event) => event.id)).toEqual([EVENTS.oturaPublished]);
    });
  });

  // -------------------------------------------------------------------------
  // 4. A device, and the device next to it
  // -------------------------------------------------------------------------

  describe('a device', () => {
    it('reads its own marks', async () => {
      const device = createDeviceStore(client, TABLE, DEVICE_ONE);
      await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

      const interests = await device.listInterests();

      expect(interests.map((interest) => interest.eventId)).toEqual([EVENTS.zubiaPublished]);
    });

    it('cannot read another device marks', async () => {
      const two = createDeviceStore(client, TABLE, DEVICE_TWO);
      await two.markInterest(OTURA, EVENTS.oturaPublished);

      const one = createDeviceStore(client, TABLE, DEVICE_ONE);
      const interests = await one.listInterests();

      expect(interests.map((interest) => interest.eventId)).not.toContain(EVENTS.oturaPublished);
    });

    it('marking twice counts once', async () => {
      const device = createDeviceStore(client, TABLE, DEVICE_ONE);
      const staff = createStaffStore(client, TABLE, municipalEditor);

      const before = await staff.interestCount(EVENTS.zubiaPublished);
      await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

      expect(await staff.interestCount(EVENTS.zubiaPublished)).toBe(before);
    });

    it('cannot mark an event that does not exist', async () => {
      const device = createDeviceStore(client, TABLE, DEVICE_ONE);

      await expect(device.markInterest(ZUBIA, 'evt-does-not-exist')).rejects.toThrow(StoreError);

      // And nothing was written: the mark and the counter move together or not
      // at all.
      const interests = await device.listInterests();

      expect(interests.map((interest) => interest.eventId)).not.toContain('evt-does-not-exist');
    });

    it('unmarking takes the count back down', async () => {
      const device = createDeviceStore(client, TABLE, DEVICE_ONE);
      const staff = createStaffStore(client, TABLE, municipalEditor);

      const before = await staff.interestCount(EVENTS.zubiaPublished);
      await device.unmarkInterest(ZUBIA, EVENTS.zubiaPublished);

      expect(await staff.interestCount(EVENTS.zubiaPublished)).toBe(before - 1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. The one place that maps an event to people
  // -------------------------------------------------------------------------

  it('only the reminder store can go from an event to the devices interested', async () => {
    const device = createDeviceStore(client, TABLE, DEVICE_ONE);
    await device.markInterest(ZUBIA, EVENTS.zubiaPublished);

    const reminders = createNotificationStore(client, TABLE);

    expect(await reminders.devicesInterestedIn(EVENTS.zubiaPublished)).toEqual([DEVICE_ONE]);
  });

  // -------------------------------------------------------------------------
  // 6. Approving and rejecting move an event between the two indexes
  // -------------------------------------------------------------------------

  describe('the review decision', () => {
    it('approving puts the event in the calendar and takes it out of the queue', async () => {
      const staff = createStaffStore(client, TABLE, municipalEditor);
      const publicStore = createPublicStore(client, TABLE);

      await staff.approveEvent(EVENTS.hermandadPending);

      const calendar = await publicStore.listCalendar(ZUBIA);
      const queue = await staff.reviewQueue();

      expect(calendar.map((event) => event.id)).toContain(EVENTS.hermandadPending);
      expect(pendingEvents(queue).map((event) => event.id)).not.toContain(EVENTS.hermandadPending);
    });

    it('rejecting leaves the event in neither index, and says why', async () => {
      const staff = createStaffStore(client, TABLE, municipalEditor);
      const publicStore = createPublicStore(client, TABLE);

      const rejected = await staff.rejectEvent(EVENTS.penaPending, 'Coincide con la feria');

      expect(rejected.rejectionReason).toBe('Coincide con la feria');

      const calendar = await publicStore.listCalendar(ZUBIA);
      const queue = await staff.reviewQueue();

      expect(calendar.map((event) => event.id)).not.toContain(EVENTS.penaPending);
      expect(pendingEvents(queue).map((event) => event.id)).not.toContain(EVENTS.penaPending);

      // The town hall can still find it; it simply is not reachable through an
      // index any more.
      expect(await staff.getEvent(EVENTS.penaPending)).not.toBeNull();
    });

    it('cancelling keeps the event in the calendar, marked as cancelled', async () => {
      const staff = createStaffStore(client, TABLE, municipalEditor);
      const publicStore = createPublicStore(client, TABLE);

      await staff.cancelEvent(EVENTS.zubiaPublished);

      const event = await publicStore.getVisibleEvent(ZUBIA, EVENTS.zubiaPublished);

      expect(event?.status).toBe('cancelled');
    });
  });
});

if (local === null) {
  console.warn(
    'Isolation tests skipped: no DynamoDB Local. Start Docker, or set DYNAMODB_ENDPOINT.',
  );
}
