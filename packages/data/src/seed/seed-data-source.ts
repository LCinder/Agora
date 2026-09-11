import {
  categoriesForMunicipality,
  eventCategorySchema,
  municipalitySchema,
  organizationSchema,
  routeSchema,
  type Event,
  type EventCategory,
  type Municipality,
  type Organization,
  type Route,
} from '@agora/core';
import { z } from 'zod';

import type { DataSource, MunicipalitySummary } from '../data-source';
import { SEED_BUNDLES, SHARED_CATEGORIES, type SeedBundle } from './content';
import { resolveSeedEvent } from './resolve';
import { seedEventSchema } from './seed-schema';

/**
 * The phase 0 data source: everything comes from the files under `content/`.
 *
 * Seed files are parsed once and kept in memory. Events are the exception:
 * relative dates are resolved against the current day on every read, so the
 * calendar stays anchored to today for as long as the demo is open.
 */

interface LoadedMunicipality {
  municipality: Municipality;
  categories: EventCategory[];
  organizations: Organization[];
  events: unknown;
  route: Route | null;
}

function loadBundle(bundle: SeedBundle): LoadedMunicipality {
  const municipality = municipalitySchema.parse(bundle.municipality);

  return {
    municipality,
    categories: z.array(eventCategorySchema).parse(bundle.categories),
    organizations: z.array(organizationSchema).parse(bundle.organizations),
    events: bundle.events,
    route: bundle.route === null ? null : routeSchema.parse(bundle.route),
  };
}

export interface SeedDataSourceOptions {
  /**
   * Clock used to resolve relative seed dates. Injected so tests can pin a day
   * instead of depending on when they happen to run.
   */
  now?: () => Date;
}

export function createSeedDataSource(options: SeedDataSourceOptions = {}): DataSource {
  const now = options.now ?? (() => new Date());

  const shared = z.array(eventCategorySchema).parse(SHARED_CATEGORIES);
  const loaded = SEED_BUNDLES.map(loadBundle);

  const byId = new Map(loaded.map((entry) => [entry.municipality.id, entry]));
  const bySlug = new Map(loaded.map((entry) => [entry.municipality.slug, entry]));

  function requireMunicipality(municipalityId: string): LoadedMunicipality {
    const entry = byId.get(municipalityId);
    if (!entry) {
      throw new Error(`Unknown municipality: ${municipalityId}`);
    }
    return entry;
  }

  function eventsOf(entry: LoadedMunicipality): Event[] {
    const seeds = z.array(seedEventSchema).parse(entry.events);
    const context = {
      municipalityId: entry.municipality.id,
      timeZone: entry.municipality.timeZone,
      now: now(),
    };

    return seeds.map((seed) => resolveSeedEvent(seed, context));
  }

  return {
    async listMunicipalities(): Promise<MunicipalitySummary[]> {
      return loaded
        .map(({ municipality }) => ({
          id: municipality.id,
          slug: municipality.slug,
          name: municipality.name,
          province: municipality.province,
          population: municipality.population,
          latitude: municipality.latitude,
          longitude: municipality.longitude,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },

    async getMunicipalityBySlug(slug: string): Promise<Municipality | null> {
      return bySlug.get(slug)?.municipality ?? null;
    },

    async listCategories(municipalityId: string): Promise<EventCategory[]> {
      const entry = requireMunicipality(municipalityId);
      return categoriesForMunicipality([...shared, ...entry.categories], municipalityId);
    },

    async listOrganizations(municipalityId: string): Promise<Organization[]> {
      return requireMunicipality(municipalityId).organizations;
    },

    async listEvents(municipalityId: string): Promise<Event[]> {
      return eventsOf(requireMunicipality(municipalityId));
    },

    async getEvent(municipalityId: string, eventId: string): Promise<Event | null> {
      const events = eventsOf(requireMunicipality(municipalityId));
      return events.find((event) => event.id === eventId) ?? null;
    },

    async getPlannedRoute(municipalityId: string): Promise<Route | null> {
      return requireMunicipality(municipalityId).route;
    },
  };
}
