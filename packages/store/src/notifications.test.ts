import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoreClient, createStoreClient } from './client';
import { createDeviceStore } from './device-store';
import { createLiveStore } from './live-sessions';
import { createNoticeStore } from './notices';
import { createNotificationStore } from './notification-store';
import type { StaffActor } from './staff-store';
import { LOCAL_CREDENTIALS, type LocalDynamo, startDynamoLocal } from './testing/dynamo-local';
import {
  DEVICE_ONE,
  DEVICE_TWO,
  EVENTS,
  ZUBIA,
  createTable,
  dropTable,
  seed,
} from './testing/fixtures';

/**
 * The notification job's side of the table.
 *
 * Three things are worth proving here, because getting any of them wrong is
 * either a promise broken or a phone that buzzes all evening: the panel writing a
 * notice leaves an order to deliver it, a reminder goes out once however often the
 * job runs, and the daily cap actually stops the fourth message.
 */
const local: LocalDynamo | null = await startDynamoLocal();
const TABLE = `agora-notifications-${process.pid}`;

const editor: StaffActor = {
  authUserId: 'auth-editor',
  municipalityId: ZUBIA,
  role: 'municipal_editor',
  organizationId: null,
};

const DAY = '2027-03-01';

describe.skipIf(local === null)('the notification job', () => {
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

  it('reads the municipalities with the settings the job runs on', async () => {
    const towns = await createNotificationStore(client, TABLE).municipalities();
    const zubia = towns.find((town) => town.id === ZUBIA);

    expect(towns).toHaveLength(2);
    expect(zubia).toEqual({
      id: ZUBIA,
      timeZone: 'Europe/Madrid',
      reminderHour: 19,
      maxDailyNotifications: 3,
    });
  });

  it('asks the calendar index for tomorrow, and leaves the cancelled event out', async () => {
    const store = createNotificationStore(client, TABLE);

    const events = await store.eventsStartingBetween(
      ZUBIA,
      new Date('2027-02-28T23:00:00.000Z'),
      new Date('2027-03-01T22:59:59.999Z'),
    );

    const ids = events.map((found) => found.id);

    // Both are in the index, because a neighbour has to find out about a
    // cancellation. Only one of them is something to remind anybody to attend.
    expect(ids).toContain(EVENTS.zubiaPublished);
    expect(ids).not.toContain(EVENTS.zubiaCancelled);
    expect(ids).not.toContain(EVENTS.zubiaDraft);
  });

  it('gives a push target only for a device that has a token', async () => {
    const store = createNotificationStore(client, TABLE);
    const devices = createDeviceStore(client, TABLE, DEVICE_ONE);

    await devices.register({ platform: 'android', locale: 'es' });
    await createDeviceStore(client, TABLE, DEVICE_TWO).register({ platform: 'ios', locale: 'en' });
    await devices.setPushToken('ExponentPushToken[one]');

    const targets = await store.pushTargets([DEVICE_ONE, DEVICE_TWO, 'device-that-never-existed']);

    expect(targets).toEqual([
      { deviceId: DEVICE_ONE, token: 'ExponentPushToken[one]', locale: 'es' },
    ]);
  });

  it('spends the daily quota and then refuses, per municipality and per day', async () => {
    const store = createNotificationStore(client, TABLE);
    const spend = () => store.reserveDailyNotification(DEVICE_ONE, ZUBIA, DAY, 3);

    expect([await spend(), await spend(), await spend()]).toEqual([true, true, true]);
    expect(await spend()).toBe(false);

    // Another town's messages are not the same town's, and tomorrow is not today.
    expect(await store.reserveDailyNotification(DEVICE_ONE, 'mun-otura', DAY, 3)).toBe(true);
    expect(await store.reserveDailyNotification(DEVICE_ONE, ZUBIA, '2027-03-02', 3)).toBe(true);
  });

  it('claims a reminder once, however many times the job runs', async () => {
    const store = createNotificationStore(client, TABLE);
    const at = new Date('2027-02-28T18:00:00.000Z');

    expect(await store.claimReminder(ZUBIA, EVENTS.zubiaPublished, at)).toBe(true);
    expect(await store.claimReminder(ZUBIA, EVENTS.zubiaPublished, at)).toBe(false);
    expect(await store.claimReminder(ZUBIA, 'evt-that-never-existed', at)).toBe(false);
  });

  it('leaves an order to deliver when the town hall sends a notice, and clears it once sent', async () => {
    const notices = createNoticeStore(client, TABLE, editor);
    const store = createNotificationStore(client, TABLE);

    const notice = await notices.send({
      eventId: EVENTS.zubiaPublished,
      type: 'time_change',
      message: 'Empieza una hora más tarde.',
    });

    const pending = await store.pendingPushes(10);
    const mine = pending.find((push) => push.noticeId === notice.id);

    expect(mine).toMatchObject({
      kind: 'notice',
      municipalityId: ZUBIA,
      eventId: EVENTS.zubiaPublished,
      noticeType: 'time_change',
      message: 'Empieza una hora más tarde.',
    });

    await store.markNoticeSent(EVENTS.zubiaPublished, notice.id, new Date());
    await store.completePush(mine!);

    const left = await store.pendingPushes(10);

    expect(left.some((push) => push.noticeId === notice.id)).toBe(false);
    expect((await notices.list(EVENTS.zubiaPublished))[0]?.pushSentAt).toBeInstanceOf(Date);
  });

  it('asks for a push the first time a live session starts, and not when it resumes', async () => {
    const store = createNotificationStore(client, TABLE);
    const sessions = createLiveStore(client, TABLE, editor);

    await sessions.schedule(EVENTS.zubiaPublished);
    await sessions.start(EVENTS.zubiaPublished);

    const queued = (await store.pendingPushes(10)).filter((push) => push.kind === 'live_started');

    expect(queued).toHaveLength(1);

    await store.completePush(queued[0]!);
    await sessions.pause(EVENTS.zubiaPublished);
    await sessions.start(EVENTS.zubiaPublished);

    // A procession that stops at a balcony and sets off again is not news.
    expect((await store.pendingPushes(10)).filter((push) => push.kind === 'live_started')).toEqual(
      [],
    );
  });

  it('leaves nothing behind when a resident asks to be forgotten', async () => {
    const store = createNotificationStore(client, TABLE);
    const devices = createDeviceStore(client, TABLE, DEVICE_ONE);

    await devices.register({ platform: 'android', locale: 'es' });
    await devices.setPushToken('ExponentPushToken[one]');
    await devices.follow(ZUBIA);
    await devices.markInterest(ZUBIA, EVENTS.zubiaPublished);
    await store.reserveDailyNotification(DEVICE_ONE, ZUBIA, DAY, 3);

    await devices.forget();

    // No address to send to, no mark pointing at the phone, and the count the
    // panel reads went back down: a device that asked to be forgotten must not
    // keep showing up as interest.
    expect(await store.pushTargets([DEVICE_ONE])).toEqual([]);
    expect(await store.devicesInterestedIn(EVENTS.zubiaPublished)).not.toContain(DEVICE_ONE);
    expect(await devices.listInterests()).toEqual([]);
    expect(await store.reserveDailyNotification(DEVICE_ONE, ZUBIA, DAY, 1)).toBe(true);
  });

  it('forgets a token whose app was uninstalled', async () => {
    const store = createNotificationStore(client, TABLE);
    const devices = createDeviceStore(client, TABLE, DEVICE_ONE);

    await devices.register({ platform: 'android', locale: 'es' });
    await devices.setPushToken('ExponentPushToken[gone]');

    await store.clearPushToken(DEVICE_ONE);

    // The device row stays: it is still a phone with the app on it as far as
    // anybody knows, and its marks are still its own. What is gone is the address.
    expect(await store.pushTargets([DEVICE_ONE])).toEqual([]);
  });
});
