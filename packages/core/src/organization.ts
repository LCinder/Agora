import { z } from 'zod';

/**
 * Associations that publish their own events: brotherhoods, social clubs,
 * sports clubs, parent associations. They are the reason the calendar stays
 * full without extra work for the town hall.
 */
export const ORGANIZATION_TYPES = [
  'brotherhood',
  'pena',
  'sports_club',
  'parents_assoc',
  'cultural',
  'seniors',
  'other',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_STATUSES = ['invited', 'active', 'disabled'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const organizationSchema = z.object({
  id: z.string().min(1),
  municipalityId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(ORGANIZATION_TYPES),
  contactEmail: z.email().nullable(),
  /**
   * A trusted association publishes without review. The town hall grants this
   * per association, and it is the main lever to keep the review queue short.
   */
  isTrusted: z.boolean().default(false),
  status: z.enum(ORGANIZATION_STATUSES),
  logoUrl: z.string().nullable().default(null),
});

export type Organization = z.infer<typeof organizationSchema>;

/** Whether an association may publish straight away, skipping the review queue. */
export function publishesWithoutReview(
  organization: Pick<Organization, 'isTrusted' | 'status'>,
): boolean {
  return organization.status === 'active' && organization.isTrusted;
}
