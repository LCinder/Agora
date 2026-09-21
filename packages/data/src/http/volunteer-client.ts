import { livePositionSchema } from '@agora/core';
import { z } from 'zod';

import { ApiError, type ApiClient, type ApiClientOptions, createApiClient } from './client';

/**
 * The volunteer who carries the phone in the procession.
 *
 * Two calls: exchange the code the town hall handed over for a token, and send a
 * position every few seconds. The event is never named by the app — it comes back
 * inside the redemption, and the token the API mints is bound to it, so a
 * volunteer's phone cannot write into another event's session even by accident.
 *
 * The session is kept on the device for one reason: a phone that runs out of
 * battery halfway down the carrera should come back to the same live session
 * rather than send someone looking for a town hall technician at eleven at night.
 */
const sessionSchema = z.object({
  eventId: z.string().min(1),
  municipalityId: z.string().min(1),
  token: z.string().min(1),
});

export type VolunteerSession = z.infer<typeof sessionSchema>;

/** A position as the API takes it: it stamps the time itself. */
const positionSchema = livePositionSchema.omit({ recordedAt: true });

export type VolunteerPosition = z.infer<typeof positionSchema>;

export interface VolunteerSessionStore {
  read(): Promise<VolunteerSession | null>;
  write(session: VolunteerSession): Promise<void>;
  clear(): Promise<void>;
}

export interface VolunteerClientOptions extends ApiClientOptions {
  storage: VolunteerSessionStore;
  client?: ApiClient;
}

export interface VolunteerClient {
  /** The session stored on this phone, if there is one. Call it on launch. */
  resume(): Promise<VolunteerSession | null>;
  /** Exchanges a code for a session. The code is single use. */
  redeem(code: string): Promise<VolunteerSession>;
  /** Sends one position. Returns the time the API recorded it. */
  send(position: VolunteerPosition): Promise<Date>;
  /** Forgets the session. Pressing "terminar" stops the phone being a beacon. */
  forget(): Promise<void>;
}

/** The code is read off a screen or a paper: spaces and lower case are ours to fix. */
export function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function createVolunteerClient(options: VolunteerClientOptions): VolunteerClient {
  let session: VolunteerSession | null = null;

  const api =
    options.client ??
    createApiClient({
      ...options,
      token: () => session?.token ?? null,
    });

  async function forget(): Promise<void> {
    session = null;
    await options.storage.clear();
  }

  return {
    async resume() {
      session ??= await options.storage.read();

      return session;
    },

    async redeem(code) {
      const answer = await api.send('POST', '/volunteer/redeem', { code: normaliseCode(code) });
      const fresh = sessionSchema.parse(answer);

      await options.storage.write(fresh);
      session = fresh;

      return fresh;
    },

    async send(position) {
      if (session === null) throw new Error('There is no volunteer session.');

      try {
        const answer = await api.send(
          'POST',
          '/volunteer/positions',
          positionSchema.parse(position),
        );

        return livePositionSchema.parse(answer).recordedAt;
      } catch (thrown) {
        // A rejected token is not worth keeping: it expired, or the code was
        // redeemed again on another phone. Dropping it here is what sends the
        // screen back to asking for a code instead of retrying forever.
        if (thrown instanceof ApiError && thrown.failure.kind === 'status') {
          if (thrown.failure.status === 401) await forget();
        }

        throw thrown;
      }
    },

    forget,
  };
}
