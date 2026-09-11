import cajarEvents from '../../../../content/municipalities/cajar/events.json';
import cajarMunicipality from '../../../../content/municipalities/cajar/municipality.json';
import laZubiaCategories from '../../../../content/municipalities/la-zubia/categories.json';
import laZubiaEvents from '../../../../content/municipalities/la-zubia/events.json';
import laZubiaMunicipality from '../../../../content/municipalities/la-zubia/municipality.json';
import laZubiaOrganizations from '../../../../content/municipalities/la-zubia/organizations.json';
import laZubiaRoute from '../../../../content/municipalities/la-zubia/route.json';
import ogijaresEvents from '../../../../content/municipalities/ogijares/events.json';
import ogijaresMunicipality from '../../../../content/municipalities/ogijares/municipality.json';
import oturaEvents from '../../../../content/municipalities/otura/events.json';
import oturaMunicipality from '../../../../content/municipalities/otura/municipality.json';
import sharedCategories from '../../../../content/shared/categories.json';

/**
 * The seed files, imported statically so Metro and Next bundle them.
 *
 * Everything is typed as `unknown` on purpose: the JSON is validated by the
 * schemas when it is loaded, and a structural type inferred from the file
 * would silently drift from the real model.
 *
 * Adding a municipality to the demo means adding its folder under `content/`
 * and one entry here.
 */

export interface SeedBundle {
  municipality: unknown;
  categories: unknown;
  organizations: unknown;
  events: unknown;
  route: unknown;
}

export const SHARED_CATEGORIES: unknown = sharedCategories;

export const SEED_BUNDLES: readonly SeedBundle[] = [
  {
    municipality: laZubiaMunicipality,
    categories: laZubiaCategories,
    organizations: laZubiaOrganizations,
    events: laZubiaEvents,
    route: laZubiaRoute,
  },
  {
    municipality: ogijaresMunicipality,
    categories: [],
    organizations: [],
    events: ogijaresEvents,
    route: null,
  },
  {
    municipality: cajarMunicipality,
    categories: [],
    organizations: [],
    events: cajarEvents,
    route: null,
  },
  {
    municipality: oturaMunicipality,
    categories: [],
    organizations: [],
    events: oturaEvents,
    route: null,
  },
];
