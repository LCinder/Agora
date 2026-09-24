import { describe, expect, it } from 'vitest';

import { organizationSchema, publishesWithoutReview } from './organization';

/**
 * The one lever the town hall has over the review queue.
 *
 * It is worth its own file because it is the rule the whole collaborative
 * calendar is sold on — the associations fill it and the town hall stops having
 * to read every line — and because it was wrong once in a way nobody could see:
 * it also required `status === 'active'`, which an association created from the
 * panel never reached.
 */
const organization = (status: string, isTrusted: boolean) =>
  organizationSchema.parse({
    id: 'org-pena',
    municipalityId: 'mun-zubia',
    name: 'Peña Flamenca',
    type: 'pena',
    contactEmail: null,
    isTrusted,
    status,
  });

describe('publishesWithoutReview', () => {
  it('lets a trusted association publish straight away', () => {
    expect(publishesWithoutReview(organization('active', true))).toBe(true);
  });

  /**
   * The regression. A town hall dares de alta an association, ticks "De
   * confianza", and expects its events to appear. Requiring `active` meant the
   * tick did nothing until somebody had pressed «Dar de baja» and «Reactivar».
   */
  it('lets a newly created association publish the moment it is trusted', () => {
    expect(publishesWithoutReview(organization('invited', true))).toBe(true);
  });

  it('sends an untrusted association to the review queue, whatever its state', () => {
    expect(publishesWithoutReview(organization('active', false))).toBe(false);
    expect(publishesWithoutReview(organization('invited', false))).toBe(false);
  });

  /**
   * The lever that has to keep working: suspending an association stops it
   * publishing even if it is still marked as trusted, so the town hall does not
   * have to remember to untick two things.
   */
  it('stops a suspended association even when it is trusted', () => {
    expect(publishesWithoutReview(organization('disabled', true))).toBe(false);
    expect(publishesWithoutReview(organization('disabled', false))).toBe(false);
  });
});
