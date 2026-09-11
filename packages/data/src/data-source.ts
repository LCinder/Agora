import type { Event, EventCategory, Municipality, Organization, Route } from '@agora/core';

/**
 * The only way the rest of the codebase reaches data.
 *
 * Phase 0 ships one implementation, reading the seed files under `content/`.
 * When the real backend arrives in phase 2 it becomes a second implementation
 * of this interface, and no screen changes. See docs/decisiones.md, D-001.
 *
 * Every method is asynchronous even though the seed answers instantly: a
 * synchronous signature today would force a rewrite of every caller later.
 *
 * Every method that reads municipality-scoped data takes a municipality id.
 * There is deliberately no way to ask for "all events" across municipalities.
 */

/** The short form used by the municipality selector. */
export interface MunicipalitySummary {
  id: string;
  slug: string;
  name: string;
  province: string;
  population: number;
  latitude: number;
  longitude: number;
}

export interface DataSource {
  /** Every municipality on the platform, for the selector. */
  listMunicipalities(): Promise<MunicipalitySummary[]>;

  getMunicipalityBySlug(slug: string): Promise<Municipality | null>;

  /** Shared categories plus the ones this municipality defined. */
  listCategories(municipalityId: string): Promise<EventCategory[]>;

  listOrganizations(municipalityId: string): Promise<Organization[]>;

  /**
   * Every event of the municipality, whatever its status. Filtering by what an
   * audience may see is the caller's job, so the same method serves residents
   * and the town hall panel.
   */
  listEvents(municipalityId: string): Promise<Event[]>;

  getEvent(municipalityId: string, eventId: string): Promise<Event | null>;

  /** The planned route used by the simulated live tracking, if there is one. */
  getPlannedRoute(municipalityId: string): Promise<Route | null>;
}
