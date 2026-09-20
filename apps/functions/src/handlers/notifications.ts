import {
  dayKeyInZone,
  formatTime,
  hourInZone,
  nextDayRange,
  type Event,
  type FormatLocale,
} from '@agora/core';
import { createTranslator, resolveLocale, type Translate } from '@agora/i18n';
import { createExpoPush, type Push, type PushMessage } from '@agora/push';
import {
  type JobMunicipality,
  type NotificationStore,
  type PendingPush,
  type PushTarget,
  type StoreClient,
  createNotificationStore,
  createStoreClient,
} from '@agora/store';

import { tableName } from '../lib/http';

/**
 * The only function that sends notifications, and the only one that may ask who
 * is interested in an event.
 *
 * Two jobs, one Lambda, told apart by the payload EventBridge sends:
 *
 *   * `reminders` runs at the top of every hour and sends the evening reminder to
 *     the municipalities whose configured hour it is. Which municipalities those
 *     are is their own setting, so a town that wants theirs at eight in the
 *     morning gets it without a second schedule.
 *   * `outbox` runs every minute and delivers what the panel asked for: a change
 *     of time, a cancellation, a live session starting. The panel cannot send it
 *     itself — no municipal role has IAM permission on the index that says who
 *     marked an event (D-032) — so it writes the order into the outbox and this
 *     drains it. That is how "within a minute" is met without a WebSocket, a
 *     stream or a queue.
 *
 * Both end in the same three questions per device: is anybody interested, do they
 * have quota left today, and where do I send it.
 */
export type Job = 'reminders' | 'outbox';

/** How many orders one minute's run will take on. */
const OUTBOX_BATCH = 25;

export interface NotificationDependencies {
  store: NotificationStore;
  push: Push;
  /** Fixed by the tests; the job itself always runs against the real clock. */
  now?: Date;
}

export interface JobResult {
  job: Job;
  /** Events or orders this run looked at. */
  considered: number;
  sent: number;
  /** Messages not sent because the device had used its quota for the day. */
  capped: number;
  failed: number;
}

interface Copy {
  t: Translate;
  locale: FormatLocale;
}

function copyFor(target: PushTarget): Copy {
  const locale = resolveLocale(target.locale);

  return { t: createTranslator(locale), locale };
}

/**
 * Turns a token Expo rejected as unknown back into the device that holds it.
 *
 * The app was uninstalled, or the token was replaced. Left alone, every future
 * send would carry a message nobody will ever read.
 */
async function forget(
  store: NotificationStore,
  targets: readonly PushTarget[],
  tokens: readonly string[],
): Promise<void> {
  for (const token of tokens) {
    const target = targets.find((candidate) => candidate.token === token);

    if (target !== undefined) await store.clearPushToken(target.deviceId);
  }
}

function reminderMessage(
  event: Event,
  target: PushTarget,
  town: JobMunicipality,
  now: Date,
): PushMessage {
  const { t, locale } = copyFor(target);
  const time = formatTime(event.startAt, { now, timeZone: town.timeZone, locale });

  return {
    to: target.token,
    title: event.title,
    body: event.allDay ? t('push.reminderBodyAllDay') : t('push.reminderBody', { time }),
    data: { eventId: event.id, municipalityId: town.id },
  };
}

function outboxMessage(pending: PendingPush, event: Event, target: PushTarget): PushMessage {
  const { t } = copyFor(target);

  if (pending.kind === 'live_started') {
    return {
      to: target.token,
      title: t('push.liveTitle', { title: event.title }),
      body: t('push.liveBody'),
      data: { eventId: event.id, municipalityId: pending.municipalityId, live: 'true' },
    };
  }

  const title =
    pending.noticeType === 'cancelled'
      ? t('push.titleCancelled', { title: event.title })
      : pending.noticeType === 'time_change'
        ? t('push.titleTimeChange', { title: event.title })
        : pending.noticeType === 'location_change'
          ? t('push.titleLocationChange', { title: event.title })
          : event.title;

  return {
    to: target.token,
    title,
    // What the town hall wrote, unedited. They know why the street is closed.
    body: pending.message ?? '',
    data: { eventId: event.id, municipalityId: pending.municipalityId },
  };
}

/**
 * The evening reminder.
 *
 * `claimReminder` is what makes it send once: the job runs every hour, an event
 * can sit inside the window of more than one run, and a retry after a timeout is
 * a run too. Claiming before sending — rather than marking afterwards — means the
 * worst case is a reminder nobody gets, not one everybody gets twice.
 */
async function runReminders(dependencies: NotificationDependencies): Promise<JobResult> {
  const { store, push } = dependencies;
  const now = dependencies.now ?? new Date();
  const result: JobResult = { job: 'reminders', considered: 0, sent: 0, capped: 0, failed: 0 };

  for (const town of await store.municipalities()) {
    if (hourInZone(now, town.timeZone) !== town.reminderHour) continue;

    const tomorrow = nextDayRange(now, town.timeZone);
    const events = await store.eventsStartingBetween(town.id, tomorrow.start, tomorrow.end);
    const day = dayKeyInZone(now, town.timeZone);

    for (const event of events) {
      result.considered += 1;

      if (!(await store.claimReminder(town.id, event.id, now))) continue;

      const targets = await store.pushTargets(await store.devicesInterestedIn(event.id));
      const messages: PushMessage[] = [];

      for (const target of targets) {
        const allowed = await store.reserveDailyNotification(
          target.deviceId,
          town.id,
          day,
          town.maxDailyNotifications,
        );

        if (!allowed) {
          result.capped += 1;

          continue;
        }

        messages.push(reminderMessage(event, target, town, now));
      }

      if (messages.length === 0) continue;

      const outcome = await push.send(messages);

      result.sent += outcome.sent;
      result.failed += outcome.failed;

      await forget(store, targets, outcome.unregistered);

      // Nothing got through at all, which is the provider being down or this
      // function having no network. The claim goes back so the retry — the
      // schedule's, minutes later — sends it, instead of an evening of reminders
      // being marked as sent and never sent.
      if (outcome.sent === 0 && outcome.failed > 0) {
        await store.releaseReminder(town.id, event.id);
      }
    }
  }

  return result;
}

/**
 * The orders the panel left: a change, a cancellation, a live session starting.
 *
 * An order is deleted once it has been dealt with, whatever came of it — except
 * when nothing at all could be sent, which is what a dead network looks like. Then
 * it stays for the next minute. It cannot stay forever: the row carries a TTL,
 * because a notice delivered a day late saying the time changed is worse than one
 * never delivered.
 */
async function runOutbox(dependencies: NotificationDependencies): Promise<JobResult> {
  const { store, push } = dependencies;
  const now = dependencies.now ?? new Date();
  const result: JobResult = { job: 'outbox', considered: 0, sent: 0, capped: 0, failed: 0 };
  const towns = new Map((await store.municipalities()).map((town) => [town.id, town]));

  for (const pending of await store.pendingPushes(OUTBOX_BATCH)) {
    result.considered += 1;

    const town = towns.get(pending.municipalityId);
    const event = await store.getEvent(pending.municipalityId, pending.eventId);

    // The event was deleted between the order and now. Nothing to say about it.
    if (town === undefined || event === null) {
      await store.completePush(pending);

      continue;
    }

    const targets = await store.pushTargets(await store.devicesInterestedIn(pending.eventId));
    const day = dayKeyInZone(now, town.timeZone);
    const messages: PushMessage[] = [];

    for (const target of targets) {
      // A cancellation ignores the daily cap. Somebody who marked an event and is
      // about to walk down there has to be told it is off, and "you have already
      // had three messages today" is not a reason to let them find a locked door.
      if (pending.noticeType !== 'cancelled') {
        const allowed = await store.reserveDailyNotification(
          target.deviceId,
          town.id,
          day,
          town.maxDailyNotifications,
        );

        if (!allowed) {
          result.capped += 1;

          continue;
        }
      }

      messages.push(outboxMessage(pending, event, target));
    }

    const outcome =
      messages.length === 0 ? { sent: 0, failed: 0, unregistered: [] } : await push.send(messages);

    result.sent += outcome.sent;
    result.failed += outcome.failed;

    await forget(store, targets, outcome.unregistered);

    const nothingGotThrough = messages.length > 0 && outcome.sent === 0;

    if (nothingGotThrough) continue;

    if (pending.noticeId !== null) {
      await store.markNoticeSent(pending.eventId, pending.noticeId, now);
    }

    await store.completePush(pending);
  }

  return result;
}

export async function run(job: Job, dependencies: NotificationDependencies): Promise<JobResult> {
  return job === 'reminders' ? runReminders(dependencies) : runOutbox(dependencies);
}

/**
 * A run that had something to send and sent none of it.
 *
 * Which is the one outcome worth waking somebody for. A handful of failures among
 * many is routine — a phone that uninstalled the app counts as one — but zero
 * delivered out of anything is the push provider being down, and until this was
 * checked it looked exactly like a quiet evening in a small town.
 *
 * `run` reports and does not throw, because the other municipalities' work has to
 * finish. What turns the report into an error is the handler, so the function's own
 * error metric catches it and the schedule keeps the event that did not happen.
 */
export function deliveredNothing(result: JobResult): boolean {
  return result.sent === 0 && result.failed > 0;
}

let client: StoreClient | null = null;

/** What EventBridge Scheduler sends. Anything else is the evening reminder. */
export interface JobEvent {
  job?: Job;
}

export const handler = async (event: JobEvent = {}): Promise<JobResult> => {
  client ??= createStoreClient();

  const result = await run(event.job ?? 'reminders', {
    store: createNotificationStore(client, tableName()),
    // No credentials: Expo push works unauthenticated unless the project turns on
    // enhanced security, and this way there is no secret to rotate (D-046).
    push: createExpoPush(),
  });

  // One line per run, which is what makes "did the reminders go out on Wednesday"
  // answerable from CloudWatch without a dashboard. Logged before the throw below,
  // so the numbers are there either way.
  console.log(JSON.stringify({ ...result, environment: process.env['ENVIRONMENT'] }));

  if (deliveredNothing(result)) {
    // Recorded as an error on purpose: it is what the alarm watches, and what
    // sends the event to the queue of runs that did not happen instead of letting
    // the afternoon pass in silence.
    throw new Error(
      `The ${result.job} job delivered none of its ${result.failed} messages. See the log line above.`,
    );
  }

  return result;
};
