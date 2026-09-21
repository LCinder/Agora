import { z } from 'zod';

/**
 * Sending a push through Expo.
 *
 * Expo sits in front of Firebase Cloud Messaging and APNs and takes one HTTP
 * call with up to a hundred messages in it. That is the whole reason it is here:
 * the alternative is a Google service account and an Apple key in Parameter
 * Store, two SDKs in the Lambda bundle, and a second delivery path to debug —
 * for a product whose whole notification volume is a few thousand messages on a
 * Thursday evening (D-046).
 *
 * Nothing here reads the environment, like the poster package: what it needs
 * arrives as arguments.
 */
const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo takes a hundred messages per request and rejects a longer list. */
const BATCH_SIZE = 100;

const DEFAULT_TIMEOUT_MS = 10_000;

/** What an Expo push token looks like. Anything else is not worth a request. */
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isExpoPushToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Travels to the app untouched: what to open when the notification is tapped. */
  data?: Record<string, string>;
}

/**
 * A ticket per message, in the order they were sent.
 *
 * Expo answers that it accepted the message, not that a phone showed it. The one
 * answer worth acting on is `DeviceNotRegistered`: the app was uninstalled or the
 * token was replaced, and the token has to go or every future send carries a
 * message nobody will read.
 */
const ticketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string().optional() }),
  z.object({
    status: z.literal('error'),
    message: z.string().optional(),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
]);

const answerSchema = z.object({ data: z.array(ticketSchema) });

export interface PushOutcome {
  /** Messages Expo accepted. */
  sent: number;
  /** Messages it refused, for any reason. */
  failed: number;
  /** Tokens to delete: the app is gone from that phone. */
  unregistered: string[];
}

export interface ExpoPushOptions {
  /**
   * Only needed when the Expo project turns on enhanced security for push. Left
   * out, the send is unauthenticated, which is how Expo push works by default.
   */
  accessToken?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface Push {
  send(messages: readonly PushMessage[]): Promise<PushOutcome>;
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function createExpoPush(options: ExpoPushOptions = {}): Push {
  const call = options.fetch ?? globalThis.fetch;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function sendBatch(batch: readonly PushMessage[], outcome: PushOutcome): Promise<void> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };

    if (options.accessToken !== undefined) {
      headers['authorization'] = `Bearer ${options.accessToken}`;
    }

    const response = await call(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      // A batch that Expo refused outright is a batch nobody received. It is
      // counted and not thrown: the reminder job has other municipalities to get
      // through, and one of them failing must not cancel the rest.
      outcome.failed += batch.length;

      return;
    }

    const parsed = answerSchema.safeParse(await response.json());

    if (!parsed.success) {
      outcome.failed += batch.length;

      return;
    }

    for (const [index, ticket] of parsed.data.data.entries()) {
      if (ticket.status === 'ok') {
        outcome.sent += 1;

        continue;
      }

      outcome.failed += 1;

      const token = batch[index]?.to;

      if (ticket.details?.error === 'DeviceNotRegistered' && token !== undefined) {
        outcome.unregistered.push(token);
      }
    }
  }

  return {
    async send(messages) {
      const outcome: PushOutcome = { sent: 0, failed: 0, unregistered: [] };
      const valid = messages.filter((message) => isExpoPushToken(message.to));

      outcome.failed += messages.length - valid.length;

      for (const batch of batches(valid, BATCH_SIZE)) {
        try {
          await sendBatch(batch, outcome);
        } catch {
          // A timeout or a dead network. The notice stays in the outbox and the
          // next run tries again; a reminder that missed its evening is gone,
          // which is better than a job that dies half way through.
          outcome.failed += batch.length;
        }
      }

      return outcome;
    },
  };
}
