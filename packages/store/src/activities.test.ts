import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { createDeviceStore } from './device-store';
import { StoreError } from './errors';
import { createNotificationStore } from './notification-store';
import { createPublicStore } from './public-store';
import { createStatsStore } from './stats';
import { type StaffActor, createStaffStore } from './staff-store';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import {
  CORAL,
  DEVICE_ONE,
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
 * Programmes: the lines inside a feria, and the rules they inherit.
 *
 * Two of these matter more than the rest and are the reason this file exists
 * rather than a few cases bolted onto `panel.test.ts`:
 *
 *   * An activity is only ever as public as its event. A line that says it is
 *     published, inside a draft, must be unreachable — and it must become
 *     reachable the moment the town hall approves the event, without anybody
 *     touching the line.
 *   * A mark on a line is not a mark on the event. The reminder for the falconry
 *     show goes to whoever asked about the falconry show; the notice about the
 *     feria goes to both.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-activities-${process.pid}`;

const admin: StaffActor = {
  authUserId: 'auth-admin',
  municipalityId: ZUBIA,
  role: 'municipal_admin',
  organizationId: null,
};

const hermandad: StaffActor = {
  authUserId: 'auth-hermandad',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: HERMANDAD,
};

const pena: StaffActor = {
  authUserId: 'auth-pena',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: PENA,
};

const coral: StaffActor = {
  authUserId: 'auth-coral',
  municipalityId: ZUBIA,
  role: 'org_editor',
  organizationId: CORAL,
};

const neighbouring: StaffActor = {
  authUserId: 'auth-otura',
  municipalityId: OTURA,
  role: 'municipal_admin',
  organizationId: null,
};

const AT = (hour: number) => new Date(`2027-03-01T${String(hour).padStart(2, '0')}:00:00.000Z`);

describe.skipIf(local === null)('programmes', () => {
  let client: StoreClient;
  let counter = 0;

  /** A fresh id per line, so one test's leftovers cannot pass another. */
  const id = (name: string) => {
    counter += 1;

    return `act-${name}-${counter}`;
  };

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

  const staff = (actor: StaffActor) => createStaffStore(client, TABLE, actor);
  const publicStore = () => createPublicStore(client, TABLE);

  // --- inheritance ---------------------------------------------------------

  it('stores what a line does not say as null, which is what inheriting means', async () => {
    const created = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('inherits'),
      title: 'Tómbola con productos locales',
      startAt: AT(13),
    });

    expect(created.categoryId).toBeNull();
    expect(created.location).toBeNull();
    expect(created.isFree).toBeNull();
    expect(created.priceInfo).toBeNull();
    expect(created.interestCount).toBe(0);

    await staff(admin).deleteActivity(EVENTS.zubiaPublished, created.id);
  });

  it('keeps an answer of its own when the line gives one', async () => {
    const created = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('paid'),
      title: 'Taller de queso curado',
      startAt: AT(11),
      categoryId: 'cat-fiestas',
      isFree: false,
      priceInfo: '5 €',
      location: { name: 'Pabellón', latitude: null, longitude: null },
    });

    expect(created.isFree).toBe(false);
    expect(created.priceInfo).toBe('5 €');
    expect(created.location?.name).toBe('Pabellón');

    await staff(admin).deleteActivity(EVENTS.zubiaPublished, created.id);
  });

  // --- visibility ----------------------------------------------------------

  it('keeps the programme of a draft out of the public calendar, however published the line is', async () => {
    const hidden = await staff(admin).createActivity(EVENTS.zubiaDraft, {
      id: id('hidden'),
      title: 'Presentación del programa',
      startAt: AT(18),
      status: 'published',
    });

    expect(hidden.status).toBe('published');
    expect((await publicStore().listActivities(ZUBIA)).map((entry) => entry.id)).not.toContain(
      hidden.id,
    );
    expect(
      (await publicStore().listActivitiesOfEvent(ZUBIA, EVENTS.zubiaDraft)).map(
        (entry) => entry.id,
      ),
    ).toContain(hidden.id);

    await staff(admin).deleteActivity(EVENTS.zubiaDraft, hidden.id);
  });

  it('brings the whole programme into the calendar when the event is approved', async () => {
    const pending = await staff(hermandad).createActivity(EVENTS.hermandadPending, {
      id: id('vialine'),
      title: 'Salida del paso',
      startAt: AT(20),
    });

    expect((await publicStore().listActivities(ZUBIA)).map((entry) => entry.id)).not.toContain(
      pending.id,
    );

    await staff(admin).approveEvent(EVENTS.hermandadPending);

    // The line was never touched: approving the event is what moved it.
    expect((await publicStore().listActivities(ZUBIA)).map((entry) => entry.id)).toContain(
      pending.id,
    );

    const after = await staff(admin).listActivities(EVENTS.hermandadPending);

    expect(after.find((entry) => entry.id === pending.id)?.status).toBe('published');

    // And back out again when the town hall rejects it.
    await staff(admin).rejectEvent(EVENTS.hermandadPending, 'Falta el permiso de la vía pública.');

    expect((await publicStore().listActivities(ZUBIA)).map((entry) => entry.id)).not.toContain(
      pending.id,
    );

    await staff(admin).deleteActivity(EVENTS.hermandadPending, pending.id);
  });

  it('leaves a cancelled line on the programme, struck through rather than gone', async () => {
    const line = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('rained'),
      title: 'Show de aves rapaces',
      startAt: AT(18),
    });

    await staff(admin).cancelActivity(EVENTS.zubiaPublished, line.id);

    const visible = await publicStore().listActivitiesOfEvent(ZUBIA, EVENTS.zubiaPublished);

    expect(visible.find((entry) => entry.id === line.id)?.status).toBe('cancelled');

    await staff(admin).deleteActivity(EVENTS.zubiaPublished, line.id);
  });

  // --- who may touch a programme -------------------------------------------

  it('refuses an association a line on another association event', async () => {
    await expect(
      staff(pena).createActivity(EVENTS.hermandadPending, {
        id: id('intruder'),
        title: 'Concurso de tortillas',
        startAt: AT(12),
      }),
    ).rejects.toBeInstanceOf(StoreError);
  });

  it('cannot reach a programme in another municipality', async () => {
    await expect(
      staff(neighbouring).createActivity(EVENTS.zubiaPublished, {
        id: id('crossborder'),
        title: 'Desde Otura',
        startAt: AT(12),
      }),
    ).rejects.toBeInstanceOf(StoreError);

    expect(
      (await staff(neighbouring).listActivities()).every(
        (activity) => activity.municipalityId === OTURA,
      ),
    ).toBe(true);
  });

  it('publishes a trusted association line without review', async () => {
    const coralEvent = await staff(coral).createEvent({
      id: `evt-coral-trusted-${String(counter)}`,
      title: 'Semana coral',
      categoryId: 'cat-fiestas',
      startAt: AT(19),
      location: { name: 'Teatro', latitude: null, longitude: null },
      status: 'published',
    });

    const line = await staff(coral).createActivity(coralEvent.id, {
      id: id('coralline'),
      title: 'Ensayo abierto',
      startAt: AT(18),
    });

    // Trust is the town hall's decision, not the association's, and it applies
    // to the programme exactly as it applies to the event.
    expect(coralEvent.status).toBe('published');
    expect(line.status).toBe('published');

    const edit = await staff(coral).updateActivity(coralEvent.id, line.id, {
      title: 'Ensayo abierto de la coral',
    });

    expect(edit.kind).toBe('applied');
    expect((await publicStore().listActivitiesOfEvent(ZUBIA, coralEvent.id))[0]?.title).toBe(
      'Ensayo abierto de la coral',
    );

    await staff(admin).deleteEvent(coralEvent.id);
  });

  it('queues an untrusted association edit and leaves the published line alone', async () => {
    // An event of the association's own, published, which is the only situation
    // where a change has to wait.
    const penaEvent = await staff(pena).createEvent({
      id: `evt-pena-feria-${String(counter)}`,
      title: 'Feria de la Peña',
      categoryId: 'cat-fiestas',
      startAt: AT(11),
      location: { name: 'Sede', latitude: null, longitude: null },
      status: 'published',
    });

    // The association cannot publish, so it went to review; the town hall
    // approves it, and from then on its programme is public.
    await staff(admin).approveEvent(penaEvent.id);

    // A new line on something already public waits.
    const line = await staff(pena).createActivity(penaEvent.id, {
      id: id('penaline'),
      title: 'Taller de palmas',
      startAt: AT(20),
    });

    expect(line.status).toBe('pending_review');

    await staff(admin).approveActivity(penaEvent.id, line.id);

    // Now it is published, and an edit to it does not change what the
    // neighbours are reading.
    const edit = await staff(pena).updateActivity(penaEvent.id, line.id, {
      title: 'Taller de palmas y compás',
    });

    expect(edit.kind).toBe('queued');
    expect(edit.activity.title).toBe('Taller de palmas');
    expect(edit.activity.pendingPatch).not.toBeNull();

    // The town hall sees it in the inbox, as an activity rather than an event.
    const queue = await staff(admin).reviewQueue();
    const waiting = queue.flatMap((item) => (item.kind === 'activity' ? [item.activity] : []));

    expect(waiting.map((activity) => activity.id)).toContain(line.id);

    const approved = await staff(admin).approveActivity(penaEvent.id, line.id);

    expect(approved.title).toBe('Taller de palmas y compás');
    expect(approved.pendingPatch).toBeNull();

    await staff(admin).deleteEvent(penaEvent.id);
  });

  it('turning down a change leaves the line exactly as the town was reading it', async () => {
    const penaEvent = await staff(pena).createEvent({
      id: `evt-pena-rejected-${String(counter)}`,
      title: 'Velada flamenca',
      categoryId: 'cat-fiestas',
      startAt: AT(21),
      location: { name: 'Sede', latitude: null, longitude: null },
      status: 'published',
    });

    await staff(admin).approveEvent(penaEvent.id);

    const line = await staff(pena).createActivity(penaEvent.id, {
      id: id('rejectedline'),
      title: 'Cante jondo',
      startAt: AT(21),
    });

    await staff(admin).approveActivity(penaEvent.id, line.id);
    await staff(pena).updateActivity(penaEvent.id, line.id, { title: 'Cante jondo y guitarra' });

    const refused = await staff(admin).rejectActivity(
      penaEvent.id,
      line.id,
      'Ese título no es el del cartel.',
    );

    // The published line is untouched, the change is gone, and the reason is
    // there for the association to read.
    expect(refused.title).toBe('Cante jondo');
    expect(refused.status).toBe('published');
    expect(refused.pendingPatch).toBeNull();
    expect(refused.rejectionReason).toBe('Ese título no es el del cartel.');

    // And it has left the inbox, which is the one screen that must never show a
    // decision somebody already made.
    const queue = await staff(admin).reviewQueue();

    expect(queue.flatMap((item) => (item.kind === 'activity' ? [item.activity.id] : []))).not.toContain(
      line.id,
    );

    await staff(admin).deleteEvent(penaEvent.id);
  });

  it('writes an association line straight through while nobody has seen it', async () => {
    const line = await staff(hermandad).createActivity(EVENTS.hermandadPending, {
      id: id('ridealong'),
      title: 'Traslado del paso',
      startAt: AT(19),
    });

    // The event is still waiting, so there is nothing published to protect: the
    // line rides along with it rather than being approved separately.
    expect(line.status).toBe('published');

    const edited = await staff(hermandad).updateActivity(EVENTS.hermandadPending, line.id, {
      title: 'Traslado del paso a la parroquia',
    });

    expect(edited.kind).toBe('applied');
    expect(edited.activity.title).toBe('Traslado del paso a la parroquia');

    await staff(hermandad).deleteActivity(EVENTS.hermandadPending, line.id);
  });

  // --- what a resident does to it ------------------------------------------

  it('counts a mark on a line without counting one on its event', async () => {
    const line = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('marked'),
      title: 'Justa medieval',
      startAt: AT(18),
    });

    const device = createDeviceStore(client, TABLE, DEVICE_ONE);

    await device.markActivity(ZUBIA, EVENTS.zubiaPublished, line.id);
    // Twice is once: the mark's own condition makes a double tap harmless.
    await device.markActivity(ZUBIA, EVENTS.zubiaPublished, line.id);

    const counted = (await staff(admin).listActivities(EVENTS.zubiaPublished)).find(
      (entry) => entry.id === line.id,
    );
    const event = await staff(admin).getEvent(EVENTS.zubiaPublished);

    expect(counted?.interestCount).toBe(1);
    expect(event?.interestCount).toBe(0);

    const marks = await device.listInterests();

    expect(marks.find((mark) => mark.activityId === line.id)?.eventId).toBe(
      EVENTS.zubiaPublished,
    );

    // The reminder job finds the phone under the line, and not under the event.
    const notifications = createNotificationStore(client, TABLE);

    expect(await notifications.devicesInterestedInActivity(line.id)).toEqual([DEVICE_ONE]);
    expect(await notifications.devicesInterestedIn(EVENTS.zubiaPublished)).not.toContain(
      DEVICE_ONE,
    );

    // But a notice about the event reaches them: they are going to the same
    // square, and have to be told if it moves.
    expect(await notifications.devicesToNotifyAbout(ZUBIA, EVENTS.zubiaPublished)).toContain(
      DEVICE_ONE,
    );

    await device.unmarkActivity(ZUBIA, EVENTS.zubiaPublished, line.id);

    const after = (await staff(admin).listActivities(EVENTS.zubiaPublished)).find(
      (entry) => entry.id === line.id,
    );

    expect(after?.interestCount).toBe(0);
    expect((await device.listInterests()).some((mark) => mark.activityId === line.id)).toBe(false);

    await staff(admin).deleteActivity(EVENTS.zubiaPublished, line.id);
  });

  it('refuses a mark on a line that is not there', async () => {
    const device = createDeviceStore(client, TABLE, DEVICE_ONE);

    await expect(
      device.markActivity(ZUBIA, EVENTS.zubiaPublished, 'act-does-not-exist'),
    ).rejects.toBeInstanceOf(StoreError);
  });

  it('forgets the marks a phone left on lines of a programme', async () => {
    const line = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('forgotten'),
      title: 'Pasacalles',
      startAt: AT(12),
    });

    const device = createDeviceStore(client, TABLE, 'device-forgetful');

    await device.register({ platform: 'android', locale: 'es' });
    await device.markActivity(ZUBIA, EVENTS.zubiaPublished, line.id);
    await device.forget();

    const counted = (await staff(admin).listActivities(EVENTS.zubiaPublished)).find(
      (entry) => entry.id === line.id,
    );

    // Not only deleted: the counter the town hall reads was handed back, or the
    // panel would keep reporting interest from a phone that asked to be
    // forgotten.
    expect(counted?.interestCount).toBe(0);

    await staff(admin).deleteActivity(EVENTS.zubiaPublished, line.id);
  });

  // --- what the town hall reads --------------------------------------------

  it('puts the lines of a programme in the statistics, under the event category they inherit', async () => {
    const line = await staff(admin).createActivity(EVENTS.zubiaPublished, {
      id: id('stats'),
      title: 'Comida popular de migas',
      startAt: AT(14),
    });

    const device = createDeviceStore(client, TABLE, DEVICE_ONE);

    await device.markActivity(ZUBIA, EVENTS.zubiaPublished, line.id);

    const summary = await createStatsStore(client, TABLE, admin).summary();

    expect(summary.interests.topActivities.map((entry) => entry.activityId)).toContain(line.id);
    expect(
      summary.interests.topActivities.find((entry) => entry.activityId === line.id)?.eventTitle,
    ).toBe('Cabalgata');
    // Below the floor, so the number itself is held back rather than printed.
    expect(
      summary.interests.topActivities.find((entry) => entry.activityId === line.id)?.interested,
    ).toBeNull();
    expect(summary.interests.total).toBeGreaterThan(0);

    await device.unmarkActivity(ZUBIA, EVENTS.zubiaPublished, line.id);
    await staff(admin).deleteActivity(EVENTS.zubiaPublished, line.id);
  });

  it('takes the programme with the event when the event is deleted', async () => {
    const feria = await staff(admin).createEvent({
      id: `evt-feria-${String(counter)}`,
      title: 'Feria Medieval',
      categoryId: 'cat-fiestas',
      startAt: AT(11),
      location: { name: 'Casco antiguo', latitude: null, longitude: null },
      status: 'published',
    });

    await staff(admin).createActivity(feria.id, {
      id: id('doomed'),
      title: 'Apertura del mercado',
      startAt: AT(11),
    });

    expect(await staff(admin).listActivities(feria.id)).toHaveLength(1);

    await staff(admin).deleteEvent(feria.id);

    // Nothing left in the calendar index pointing at an event that is gone: the
    // app would otherwise draw the line on a day of its own.
    expect(
      (await publicStore().listActivities(ZUBIA)).some(
        (activity) => activity.eventId === feria.id,
      ),
    ).toBe(false);
  });
});
