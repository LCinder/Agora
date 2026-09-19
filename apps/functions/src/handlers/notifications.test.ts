import type { Push, PushMessage, PushOutcome } from '@agora/push';
import {
  type NotificationStore,
  type StoreClient,
  createDeviceStore,
  createLiveStore,
  createNoticeStore,
  createNotificationStore,
  createStoreClient,
} from '@agora/store';
import {
  DEVICE_ONE,
  DEVICE_TWO,
  EVENTS,
  LOCAL_CREDENTIALS,
  type LocalDynamo,
  ZUBIA,
  createTable,
  dropTable,
  seed,
  startDynamoLocal,
} from '@agora/store/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { run } from './notifications';

/**
 * The notification job over a real table.
 *
 * These are the tests that stand between a neighbour and a phone that buzzes six
 * times on a Thursday, so they are about the guarantees rather than the plumbing:
 * once per event, in the language of each phone, never past the daily cap — and a
 * cancellation always, cap or no cap.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-notifications-handler-${process.pid}`;

/** 19:00 in Madrid on the last day of February, which is La Zubia's hour. */
const EVENING = new Date('2027-02-28T18:00:00.000Z');

const EDITOR = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor' as const,
  organizationId: null,
};

/** A push that records instead of sending, and can be told to refuse. */
function fakePush(behaviour: { unregistered?: string[]; deadNetwork?: boolean } = {}) {
  const messages: PushMessage[][] = [];

  const push: Push = {
    async send(batch) {
      messages.push([...batch]);

      if (behaviour.deadNetwork === true) {
        return { sent: 0, failed: batch.length, unregistered: [] } satisfies PushOutcome;
      }

      const unregistered = (behaviour.unregistered ?? []).filter((token) =>
        batch.some((message) => message.to === token),
      );

      return {
        sent: batch.length - unregistered.length,
        failed: unregistered.length,
        unregistered,
      } satisfies PushOutcome;
    },
  };

  return { push, messages, flat: () => messages.flat() };
}

describe.skipIf(local === null)('the notification job', () => {
  let client: StoreClient;
  let store: NotificationStore;

  beforeAll(async () => {
    client = createStoreClient({
      region: 'eu-central-1',
      endpoint: local?.endpoint ?? '',
      credentials: LOCAL_CREDENTIALS,
    });

    store = createNotificationStore(client, TABLE);
  });

  afterAll(async () => {
    await dropTable(client, TABLE);
    await local?.stop();
  });

  // A table per test: a reminder is claimed once for ever, which is exactly what
  // makes a shared table between these tests misleading.
  beforeEach(async () => {
    await dropTable(client, TABLE);
    await createTable(client, TABLE);
    await seed(client, TABLE);

    const one = createDeviceStore(client, TABLE, DEVICE_ONE);
    const two = createDeviceStore(client, TABLE, DEVICE_TWO);

    await one.register({ platform: 'android', locale: 'es' });
    await two.register({ platform: 'ios', locale: 'en-GB' });
    await one.setPushToken('ExponentPushToken[one]');
    await two.setPushToken('ExponentPushToken[two]');
    await one.markInterest(ZUBIA, EVENTS.zubiaPublished);
    await two.markInterest(ZUBIA, EVENTS.zubiaPublished);
  });

  it('reminds tomorrow, in the language of each phone', async () => {
    const { push, flat } = fakePush();

    const result = await run('reminders', { store, push, now: EVENING });

    expect(result).toMatchObject({ job: 'reminders', sent: 2, capped: 0, failed: 0 });

    const sent = flat();
    const spanish = sent.find((message) => message.to === 'ExponentPushToken[one]');
    const english = sent.find((message) => message.to === 'ExponentPushToken[two]');

    // 19:00 UTC is 20:00 on a clock in La Zubia, which is the time on the poster.
    expect(spanish?.body).toBe('Mañana a las 20:00');
    expect(english?.body).toBe('Tomorrow at 20:00');
    expect(spanish?.data).toEqual({ eventId: EVENTS.zubiaPublished, municipalityId: ZUBIA });
  });

  it('sends the reminder once, however many times it runs', async () => {
    const first = fakePush();
    await run('reminders', { store, push: first.push, now: EVENING });

    const second = fakePush();
    const result = await run('reminders', { store, push: second.push, now: EVENING });

    expect(result.sent).toBe(0);
    expect(second.flat()).toEqual([]);
  });

  it('does nothing at an hour that is not the municipality’s', async () => {
    const { push, flat } = fakePush();

    // Noon in Madrid. La Zubia asked for seven in the evening.
    const result = await run('reminders', {
      store,
      push,
      now: new Date('2027-02-28T11:00:00.000Z'),
    });

    expect(result.considered).toBe(0);
    expect(flat()).toEqual([]);
  });

  it('forgets the token of a phone that uninstalled the app', async () => {
    const { push } = fakePush({ unregistered: ['ExponentPushToken[two]'] });

    await run('reminders', { store, push, now: EVENING });

    expect(
      (await store.pushTargets([DEVICE_ONE, DEVICE_TWO])).map((target) => target.deviceId),
    ).toEqual([DEVICE_ONE]);
  });

  it('delivers a change of time to the devices that marked the event', async () => {
    await createNoticeStore(client, TABLE, EDITOR).send({
      eventId: EVENTS.zubiaPublished,
      type: 'time_change',
      message: 'Empieza una hora más tarde.',
    });

    const { push, flat } = fakePush();
    const result = await run('outbox', { store, push, now: EVENING });

    expect(result).toMatchObject({ job: 'outbox', considered: 1, sent: 2 });
    expect(flat()[0]?.title).toMatch(/^Cambio de hora: /);
    expect(flat()[0]?.body).toBe('Empieza una hora más tarde.');

    // Dealt with: the order is gone and the notice knows when it went out.
    expect(await store.pendingPushes(10)).toEqual([]);

    const second = fakePush();
    await run('outbox', { store, push: second.push, now: EVENING });

    expect(second.flat()).toEqual([]);
  });

  it('keeps the order when nothing could be sent, so the next minute tries again', async () => {
    await createNoticeStore(client, TABLE, EDITOR).send({
      eventId: EVENTS.zubiaPublished,
      type: 'notice',
      message: 'Se corta la calle Real.',
    });

    const dead = fakePush({ deadNetwork: true });
    const result = await run('outbox', { store, push: dead.push, now: EVENING });

    expect(result.failed).toBe(2);
    expect(await store.pendingPushes(10)).toHaveLength(1);
  });

  it('stops at the daily cap, and never stops a cancellation', async () => {
    const notices = createNoticeStore(client, TABLE, EDITOR);

    // Three messages is what La Zubia allows per device per day.
    for (const message of ['Uno', 'Dos', 'Tres']) {
      await notices.send({ eventId: EVENTS.zubiaPublished, type: 'notice', message });
    }

    const spending = fakePush();
    const spent = await run('outbox', { store, push: spending.push, now: EVENING });

    expect(spent.sent).toBe(6);

    await notices.send({
      eventId: EVENTS.zubiaPublished,
      type: 'notice',
      message: 'Y una cuarta cosa.',
    });

    const capped = fakePush();
    const overCap = await run('outbox', { store, push: capped.push, now: EVENING });

    expect(overCap).toMatchObject({ sent: 0, capped: 2 });
    expect(capped.flat()).toEqual([]);

    await notices.send({
      eventId: EVENTS.zubiaPublished,
      type: 'cancelled',
      message: 'Se cancela por lluvia.',
    });

    const cancellation = fakePush();
    const anyway = await run('outbox', { store, push: cancellation.push, now: EVENING });

    expect(anyway.sent).toBe(2);
    expect(cancellation.flat()[0]?.title).toMatch(/^Se cancela: /);
  });

  it('tells the interested devices when the live tracking starts', async () => {
    const sessions = createLiveStore(client, TABLE, EDITOR);

    await sessions.schedule(EVENTS.zubiaPublished);
    await sessions.start(EVENTS.zubiaPublished);

    const { push, flat } = fakePush();
    const result = await run('outbox', { store, push, now: EVENING });

    expect(result.sent).toBe(2);
    expect(flat()[0]?.title).toMatch(/^Ya está en directo: /);
    expect(flat()[0]?.data?.['live']).toBe('true');
  });
});
