import {
  type Event,
  type EventCategory,
  type Municipality,
  type Organization,
  type Route,
  eventCategorySchema,
  eventSchema,
  municipalitySchema,
  organizationSchema,
} from '@agora/core';
import { z } from 'zod';

import type { DataSource, MunicipalitySummary } from '../data-source';
import { type ApiClient, type ApiClientOptions, createApiClient } from './client';

/**
 * The same `DataSource` the screens already use, served by the API.
 *
 * This is the switch the interface was written for (D-001): phase 0 read the files
 * under `content/`, and nothing in any screen changes to read a real backend
 * instead.
 *
 * One difference is worth knowing, and it is not a bug: `listEvents` here returns
 * what a resident may see, because that is all the public API will give. The seed
 * implementation returns everything and lets the caller filter. Both are correct
 * for their caller — the app only ever shows the visible ones, and the panel does
 * not use this.
 */
const summarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  province: z.string().min(1),
  population: z.number().int().positive(),
  latitude: z.number(),
  longitude: z.number(),
});

const listOf = <Schema extends z.ZodType>(schema: Schema) => z.array(schema);

export interface HttpDataSourceOptions extends ApiClientOptions {
  /** Injected in tests; otherwise built from the options. */
  client?: ApiClient;
}

export function createHttpDataSource(options: HttpDataSourceOptions): DataSource {
  const api = options.client ?? createApiClient(options);

  return {
    async listMunicipalities(): Promise<MunicipalitySummary[]> {
      return api.get('/municipalities', (value) => listOf(summarySchema).parse(value));
    },

    async getMunicipalityBySlug(slug: string): Promise<Municipality | null> {
      return api.getOrNull(`/municipalities/${encodeURIComponent(slug)}`, (value) =>
        municipalitySchema.parse(value),
      );
    },

    async listCategories(municipalityId: string): Promise<EventCategory[]> {
      return api.get(`/municipalities/${encodeURIComponent(municipalityId)}/categories`, (value) =>
        listOf(eventCategorySchema).parse(value),
      );
    },

    async listOrganizations(municipalityId: string): Promise<Organization[]> {
      return api.get(
        `/municipalities/${encodeURIComponent(municipalityId)}/organizations`,
        (value) => listOf(organizationSchema).parse(value),
      );
    },

    async listEvents(municipalityId: string): Promise<Event[]> {
      return api.get(`/municipalities/${encodeURIComponent(municipalityId)}/events`, (value) =>
        listOf(eventSchema).parse(value),
      );
    },

    async getEvent(municipalityId: string, eventId: string): Promise<Event | null> {
      return api.getOrNull(
        `/municipalities/${encodeURIComponent(municipalityId)}/events/${encodeURIComponent(eventId)}`,
        (value) => eventSchema.parse(value),
      );
    },

    async getPlannedRoute(): Promise<Route | null> {
      // Against a real API the planned route is not a property of the calendar:
      // it arrives with the live session, from `createLiveClient`, together with
      // the position and the status. Null here, and the live screen asks the right
      // client. In the seed there is one recorded route per municipality, which is
      // why this method exists at all.
      return null;
    },
  };
}
