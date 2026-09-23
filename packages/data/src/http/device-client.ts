import { z } from 'zod';

import { type ApiClient, type ApiClientOptions, createApiClient } from './client';

/**
 * Registering a device, and marking an event.
 *
 * The only thing a resident writes. It is not part of `DataSource` because it is
 * not reading data: it is the one place the app holds an identity, and that
 * identity is a token we minted for a device — no account, no email, nothing asked
 * of the person holding the phone (D-029).
 *
 * Where the token is kept is the app's business: this takes a store with two
 * methods so the same code works with AsyncStorage on a phone and with
 * localStorage on the web.
 */
const registrationSchema = z.object({
  deviceId: z.string().min(1),
  token: z.string().min(1),
});

export type DeviceRegistration = z.infer<typeof registrationSchema>;

/**
 * A mark, on an event or on one line of its programme.
 *
 * `activityId` is null for an event and set for an activity, and the two are
 * separate marks: a neighbour interested only in the falconry show has not said
 * anything about the feria, and marking the feria does not mark its twenty
 * lines. What ties them together is the notices — a cancelled feria reaches
 * everybody who marked anything in it — and that is the server's job, not this
 * one's.
 */
const interestSchema = z.object({
  municipalityId: z.string().min(1),
  eventId: z.string().min(1),
  activityId: z.string().min(1).nullable().default(null),
  createdAt: z.coerce.date(),
});

export type RemoteInterest = z.infer<typeof interestSchema>;

export interface DeviceTokenStore {
  read(): Promise<DeviceRegistration | null>;
  write(registration: DeviceRegistration): Promise<void>;
}

export interface DeviceClientOptions extends ApiClientOptions {
  storage: DeviceTokenStore;
  /** The platform the API records. */
  platform: 'ios' | 'android' | 'web';
  locale: string;
  client?: ApiClient;
}

export interface DeviceClient {
  /** The stored registration, or a new one. Safe to call on every launch. */
  register(): Promise<DeviceRegistration>;
  listInterests(): Promise<RemoteInterest[]>;
  mark(municipalityId: string, eventId: string): Promise<void>;
  unmark(municipalityId: string, eventId: string): Promise<void>;
  /**
   * The same thing for one line of a programme.
   *
   * Its own pair of calls rather than an argument on the two above, because the
   * path is what the API routes on and a mark on an activity lands on a different
   * counter, a different reminder and a different row.
   */
  markActivity(municipalityId: string, eventId: string, activityId: string): Promise<void>;
  unmarkActivity(municipalityId: string, eventId: string, activityId: string): Promise<void>;
  /**
   * Says this phone opened an event, which is what the town hall's "vistas" is.
   *
   * Counted once per phone per day at both ends: the caller keeps a list of what
   * it already sent today so the request is not even made, and the API refuses a
   * second one if it arrives. Nothing about the opening is recorded beyond that
   * it happened.
   */
  view(municipalityId: string, eventId: string): Promise<void>;
  /**
   * Says this phone follows a municipality.
   *
   * What the town hall's count of neighbours with the app is made of, and the only
   * thing the app sends about a resident who has not marked anything yet. Nobody
   * registers for it: it is a row saying a phone follows a town.
   */
  follow(municipalityId: string): Promise<void>;
  /**
   * Where the reminders should be sent, or null to stop receiving them.
   *
   * Called after the neighbour grants the notification permission, and again on
   * every launch: a push token is not forever — it changes when the app is
   * reinstalled or restored onto another phone — and writing the same one twice
   * costs one request and saves a reminder nobody gets.
   */
  setPushToken(token: string | null): Promise<void>;
  /**
   * Asks the API to delete this device and everything it wrote.
   *
   * The other half of "borrar mis datos": wiping the phone's own storage leaves
   * the marks and the push token on the server, and the reminders would carry on
   * arriving. The caller clears the stored registration afterwards, and the next
   * mark registers a new, equally anonymous device.
   */
  forget(): Promise<void>;
}

export function createDeviceClient(options: DeviceClientOptions): DeviceClient {
  let registration: DeviceRegistration | null = null;

  const api =
    options.client ??
    createApiClient({
      ...options,
      // Read on every call rather than captured: the first request of a launch is
      // the registration itself, and it has no token yet.
      token: () => registration?.token ?? null,
    });

  async function register(): Promise<DeviceRegistration> {
    if (registration !== null) return registration;

    const stored = await options.storage.read();

    if (stored !== null) {
      registration = stored;

      return stored;
    }

    const answer = await api.send('POST', '/devices', {
      platform: options.platform,
      locale: options.locale,
    });

    const fresh = registrationSchema.parse(answer);

    await options.storage.write(fresh);
    registration = fresh;

    return fresh;
  }

  const under = (collection: string, municipalityId: string, eventId: string) =>
    `/me/${collection}/${encodeURIComponent(eventId)}?municipalityId=${encodeURIComponent(municipalityId)}`;

  const interestPath = (municipalityId: string, eventId: string) =>
    under('interests', municipalityId, eventId);

  // The event travels too, because the mark is stored under it: a line of a
  // programme is not addressable without knowing which programme.
  const activityInterestPath = (municipalityId: string, eventId: string, activityId: string) =>
    `/me/activity-interests/${encodeURIComponent(activityId)}` +
    `?municipalityId=${encodeURIComponent(municipalityId)}&eventId=${encodeURIComponent(eventId)}`;

  return {
    register,

    async listInterests() {
      await register();

      return api.get('/me/interests', (value) => z.array(interestSchema).parse(value));
    },

    async mark(municipalityId, eventId) {
      await register();
      await api.send('PUT', interestPath(municipalityId, eventId));
    },

    async unmark(municipalityId, eventId) {
      await register();
      await api.send('DELETE', interestPath(municipalityId, eventId));
    },

    async markActivity(municipalityId, eventId, activityId) {
      await register();
      await api.send('PUT', activityInterestPath(municipalityId, eventId, activityId));
    },

    async unmarkActivity(municipalityId, eventId, activityId) {
      await register();
      await api.send('DELETE', activityInterestPath(municipalityId, eventId, activityId));
    },

    async view(municipalityId, eventId) {
      await register();
      await api.send('PUT', under('views', municipalityId, eventId));
    },

    async follow(municipalityId) {
      await register();
      await api.send('PUT', `/me/municipalities/${encodeURIComponent(municipalityId)}`);
    },

    async setPushToken(token) {
      await register();

      if (token === null) {
        await api.send('DELETE', '/me/push-token');

        return;
      }

      await api.send('PUT', '/me/push-token', { token });
    },

    async forget() {
      await register();
      await api.send('DELETE', '/me');

      registration = null;
    },
  };
}
