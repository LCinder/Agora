import {
  dayKeyInZone,
  formatTime,
  hourInZone,
  nextDayRange,
  type Activity,
  type Event,
  type FormatLocale,
} from '@agora/core';
import { createTranslator, resolveLocale, type Translate } from '@agora/i18n';
import { createExpoPush, type Push, type PushMessage } from '@agora/push';
import {
  type JobMunicipality,
  type NotificationStore,
  type PendingPush,
  type PurgeResult,
  type PushTarget,
  type StoreClient,
  createNotificationStore,
  createStoreClient,
  purgeIdleDevices,
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
export type Job = 'reminders' | 'outbox' | 'purge';

/** How many orders one minute's run will take on. */
const OUTBOX_BATCH = 25;

export interface NotificationDependencies {
  store: NotificationStore;
  push: Push;
  /** Fixed by the tests; the job itself always runs against the real clock. */
  now?: Date;
  /**
   * Forgetting the phones nobody has heard from in a year.
   *
   * Injected rather than built here because it needs the raw client and this
   * module only ever holds a notification store — and because a test that had to
   * stand up a whole table to check the job dispatches correctly would not be
   * checking the dispatch.
   */
  forgetIdleDevices?: (now: Date) => Promise<PurgeResult>;
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

/**
 * The reminder for one line of a programme.
 *
 * The title is the activity and the body says which event it is part of, which
 * is the way round a neighbour reads it: "Show de aves rapaces" is what they
 * marked, and "Mañana en Feria medieval, a las 18:00" is what tells them where
 * to go. A reminder titled "Feria medieval" would be the reminder they did not
 * ask for.
 */
function activityReminderMessage(
  activity: Activity,
  event: Event,
  target: PushTarget,
  town: JobMunicipality,
  now: Date,
): PushMessage {
  const { t, locale } = copyFor(target);
  const time = formatTime(activity.startAt, { now, timeZone: town.timeZone, locale });

  return {
    to: target.token,
    title: activity.title,
    body: t('push.activityReminderBody', { event: event.title, time }),
    data: {
      eventId: event.id,
      activityId: activity.id,
      municipalityId: town.id,
    },
  };
}

function outboxMessage(pending: PendingPush, event: Event, target: PushTarget): PushMessage {
  const { t } = copyFor(target);

  if (pending.kind === 'featured') {
    return {
      to: target.token,
      title: event.title,
      // What the town hall wrote. This one goes to the whole town, so there is no
      // wording of ours that would suit it better than theirs.
      body: pending.message ?? '',
      data: { eventId: event.id, municipalityId: pending.municipalityId },
    };
  }

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

    // And the programmes. A line of a feria is reminded on its own, to the
    // people who marked that line — which is the whole reason an activity can be
    // marked at all. The feria's own reminder went out above, to the people who
    // marked the feria; somebody who did both gets two, and that is correct, as
    // long as the daily cap below has the last word.
    const programme = await store.activitiesStartingBetween(
      town.id,
      tomorrow.start,
      tomorrow.end,
    );

    for (const activity of programme) {
      result.considered += 1;

      // The event, for the sentence that says which feria this is part of. An
      // activity whose event has gone is not a reminder anybody can act on.
      const parent = await store.getEvent(town.id, activity.eventId);

      if (parent === null || parent.status !== 'published') continue;

      if (!(await store.claimActivityReminder(town.id, activity.eventId, activity.id, now))) {
        continue;
      }

      const targets = await store.pushTargets(
        await store.devicesInterestedInActivity(activity.id),
      );
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

        messages.push(activityReminderMessage(activity, parent, target, town, now));
      }

      if (messages.length === 0) continue;

      const outcome = await push.send(messages);

      result.sent += outcome.sent;
      result.failed += outcome.failed;

      await forget(store, targets, outcome.unregistered);

      if (outcome.sent === 0 && outcome.failed > 0) {
        await store.releaseActivityReminder(town.id, activity.eventId, activity.id);
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

    // A featured event is the only notice addressed to a town rather than to the
    // people who marked something, so it is the only one that asks who follows
    // the municipality at all.
    //
    // Everything else goes to everybody with a stake in the event, programme
    // included: the neighbour who only marked the falconry show is walking to
    // the same square, and has to be told the feria moved. Deduplicated on the
    // way out, so marking six lines of it does not mean six identical pushes.
    const audience =
      pending.kind === 'featured'
        ? await store.devicesFollowing(pending.municipalityId)
        : await store.devicesToNotifyAbout(pending.municipalityId, pending.eventId);

    const targets = await store.pushTargets(audience);
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
          // A broadcast leaves the last slot of the day alone. The three
          // notifications belong to the resident, and the evening reminder is the
          // one they actually asked for: a town hall that pushes two featured
          // events in the afternoon must not be able to eat it.
          pending.kind === 'featured'
            ? Math.max(1, town.maxDailyNotifications - 1)
            : town.maxDailyNotifications,
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

/**
 * The monthly tidy: phones that stopped existing stop being counted.
 *
 * It is here, on the same function and the same scheduler as the other two,
 * because a third Lambda for something that runs twelve times a year is a
 * deployment, an alarm and a log group to pay attention to, in exchange for
 * nothing. The payload tells them apart, which is how the other two already
 * work.
 *
 * Reported in the same shape as a send so there is one log line to read and one
 * alarm to watch: what it considered is what it looked at, what it "sent" is
 * what it forgot. It never fails a run — a device that could not be forgotten
 * this month is forgotten next month, and nothing downstream is waiting.
 */
async function runPurge(dependencies: NotificationDependencies): Promise<JobResult> {
  const result: JobResult = { job: 'purge', considered: 0, sent: 0, capped: 0, failed: 0 };

  if (dependencies.forgetIdleDevices === undefined) return result;

  const purged = await dependencies.forgetIdleDevices(dependencies.now ?? new Date());

  return { ...result, considered: purged.examined, sent: purged.forgotten };
}

export async function run(job: Job, dependencies: NotificationDependencies): Promise<JobResult> {
  if (job === 'outbox') return runOutbox(dependencies);
  if (job === 'purge') return runPurge(dependencies);

  return runReminders(dependencies);
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

  const table = tableName();
  const connected = client;

  const result = await run(event.job ?? 'reminders', {
    store: createNotificationStore(connected, table),
    // No credentials: Expo push works unauthenticated unless the project turns on
    // enhanced security, and this way there is no secret to rotate (D-046).
    push: createExpoPush(),
    forgetIdleDevices: (now) => purgeIdleDevices(connected, table, { now }),
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
