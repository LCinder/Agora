import {
  type VolunteerClient,
  type VolunteerSession,
  createVolunteerClient,
  normaliseCode,
} from '@agora/data';

import { apiBaseUrl, usingRealBackend } from './data';
import { clearVolunteerSession, loadVolunteerSession, saveVolunteerSession } from './storage';

/**
 * The volunteer's client, wired to wherever this build talks to.
 *
 * Against a real API it redeems the code the town hall generated and posts a
 * position every few seconds. In the demo there is no API, and the volunteer mode
 * is one of the things worth showing a councillor — so the demo build accepts any
 * code and pretends to send, which is honest as long as the screen says so.
 */
export interface DemoTarget {
  municipalityId: string;
  eventId: string;
}

/** Shortest code the real API accepts, so the demo refuses the same nonsense. */
const MINIMUM_CODE_LENGTH = 4;

function createDemoVolunteerClient(target: DemoTarget): VolunteerClient {
  let session: VolunteerSession | null = null;

  return {
    async resume() {
      return session;
    },

    async redeem(code) {
      if (normaliseCode(code).length < MINIMUM_CODE_LENGTH) {
        throw new Error('demo: the code is too short');
      }

      session = { ...target, token: 'demo' };

      return session;
    },

    async send() {
      // Nothing leaves the phone. The map the neighbour sees in the demo replays
      // the planned route, so there is nothing to feed either.
      return new Date();
    },

    async forget() {
      session = null;
    },
  };
}

/**
 * The demo target is resolved by the screen from the seed, so it arrives one
 * render late; a real build never uses it.
 */
export function createAppVolunteerClient(target: DemoTarget | null): VolunteerClient {
  if (!usingRealBackend) {
    return createDemoVolunteerClient(target ?? { municipalityId: '', eventId: '' });
  }

  return createVolunteerClient({
    baseUrl: apiBaseUrl,
    storage: {
      read: loadVolunteerSession,
      write: saveVolunteerSession,
      clear: clearVolunteerSession,
    },
  });
}
