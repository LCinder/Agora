import { z } from 'zod';

/**
 * Event categories. Each municipality defines its own on top of the shared
 * ones: one town lives off its Easter processions and the next off its
 * pilgrimage, and the categories are what makes the app feel local.
 */
export const eventCategorySchema = z.object({
  id: z.string().min(1),
  /** Null means the category is shared by every municipality. */
  municipalityId: z.string().min(1).nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  /** Icon name resolved by the app; never a file path. */
  icon: z.string().min(1),
  /** Hex colour used for the category chip. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type EventCategory = z.infer<typeof eventCategorySchema>;

/** Categories available to a municipality: the shared ones plus its own. */
export function categoriesForMunicipality(
  categories: readonly EventCategory[],
  municipalityId: string,
): EventCategory[] {
  return categories.filter(
    (category) => category.municipalityId === null || category.municipalityId === municipalityId,
  );
}
