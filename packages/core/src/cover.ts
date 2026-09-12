import type { EventCategory } from './category';

/**
 * How an event without a poster is drawn.
 *
 * Most events arrive with no image at all — an association's talk, a council
 * workshop, a league match — and an entry with no picture reads like an
 * afterthought next to one that has a poster. So the app draws the cover
 * itself, out of the two things every event does have: its category's colour
 * and its date.
 *
 * One treatment per category rather than one for the whole municipality: the
 * calendar comes alive, and nobody at the town hall has to choose anything.
 */

export const COVER_TREATMENTS = ['date', 'lattice', 'typographic', 'bands'] as const;

export type CoverTreatment = (typeof COVER_TREATMENTS)[number];

/**
 * The shared categories are assigned by character, not at random: the loudest
 * treatment goes to fiestas, the ornamental lattice to the solemn ones, and
 * the plain date to the everyday ones.
 */
const BY_SLUG: Record<string, CoverTreatment> = {
  fiestas: 'typographic',
  cultura: 'date',
  deporte: 'bands',
  infantil: 'date',
  mayores: 'lattice',
  religioso: 'lattice',
};

/**
 * Stable for a given slug, so a category does not change its look between two
 * openings of the app, or between two devices.
 */
function fallback(slug: string): CoverTreatment {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) % 104_729;

  return COVER_TREATMENTS[hash % COVER_TREATMENTS.length] as CoverTreatment;
}

/**
 * A municipality's own categories — one town's Semana Santa, another's
 * romería — get a treatment derived from their slug, because they cannot be
 * listed here in advance.
 */
export function coverTreatmentFor(category: Pick<EventCategory, 'slug'>): CoverTreatment {
  return BY_SLUG[category.slug] ?? fallback(category.slug);
}
