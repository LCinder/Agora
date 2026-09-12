import { eventSchema, type Event } from './event';
import { municipalitySchema, type Municipality } from './municipality';
import type { z } from 'zod';

/**
 * Fixtures for the test suite. Deliberately not re-exported from the package
 * entry point: nothing outside the tests should depend on them.
 *
 * Every fixture goes through its schema, so a change to the model breaks the
 * fixtures rather than letting tests run against shapes that cannot exist.
 */

type EventInput = z.input<typeof eventSchema>;
type MunicipalityInput = z.input<typeof municipalitySchema>;

export function makeEvent(overrides: Partial<EventInput> = {}): Event {
  const base: EventInput = {
    id: 'event-1',
    municipalityId: 'la-zubia',
    title: 'Concierto en la plaza',
    categoryId: 'culture',
    startAt: '2026-09-11T20:00:00Z',
    location: { name: 'Plaza del Ayuntamiento', latitude: 37.1, longitude: -3.6 },
    status: 'published',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  return eventSchema.parse({ ...base, ...overrides });
}

export function makeMunicipality(overrides: Partial<MunicipalityInput> = {}): Municipality {
  const base: MunicipalityInput = {
    id: 'la-zubia',
    slug: 'la-zubia',
    name: 'La Zubia',
    province: 'Granada',
    population: 20_000,
    ineCode: '18194',
    latitude: 37.1,
    longitude: -3.6,
    status: 'demo',
    branding: { primaryColor: '#4F46E5' },
    settings: {},
    features: [],
  };

  return municipalitySchema.parse({ ...base, ...overrides });
}
