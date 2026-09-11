/**
 * Demo configuration for the panel.
 *
 * The panel is shown for one municipality. In phase 2 it comes from the
 * session of the logged-in municipal officer; here it is a constant.
 */
export const DEMO_MUNICIPALITY_SLUG = 'la-zubia';
export const DEMO_MUNICIPALITY_ID = 'la-zubia';

/**
 * Deterministic stand-in for the interest counts the real "Me interesa" will
 * produce.
 *
 * Derived from the event id so the numbers are stable across reloads: a demo
 * where the statistics jump every time the page is refreshed invites exactly
 * the question we do not want in a meeting.
 */
export function demoInterestCount(eventId: string, isFeatured: boolean): number {
  let hash = 0;
  for (const character of eventId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  }

  const base = 18 + (hash % 140);
  return isFeatured ? base * 3 : base;
}

/** Stand-in for the device count of the municipality. */
export const DEMO_ACTIVE_DEVICES = 2417;
