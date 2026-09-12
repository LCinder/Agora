import { describe, expect, it } from 'vitest';

import { COVER_TREATMENTS, coverTreatmentFor } from './cover';

describe('coverTreatmentFor', () => {
  it('gives the loudest treatment to fiestas', () => {
    expect(coverTreatmentFor({ slug: 'fiestas' })).toBe('typographic');
  });

  it('assigns every shared category deliberately', () => {
    const shared = ['fiestas', 'cultura', 'deporte', 'infantil', 'mayores', 'religioso'];

    for (const slug of shared) {
      expect(COVER_TREATMENTS).toContain(coverTreatmentFor({ slug }));
    }
  });

  it('uses more than one treatment across the shared categories', () => {
    const used = new Set(
      ['fiestas', 'cultura', 'deporte', 'infantil', 'mayores', 'religioso'].map((slug) =>
        coverTreatmentFor({ slug }),
      ),
    );

    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it('still answers for a category a municipality invented', () => {
    expect(COVER_TREATMENTS).toContain(coverTreatmentFor({ slug: 'semana-santa' }));
    expect(COVER_TREATMENTS).toContain(coverTreatmentFor({ slug: 'romeria' }));
    expect(COVER_TREATMENTS).toContain(coverTreatmentFor({ slug: 'cascamorras' }));
  });

  it('never changes its mind about the same category', () => {
    for (const slug of ['semana-santa', 'romeria', 'toros', 'feria-del-libro']) {
      expect(coverTreatmentFor({ slug })).toBe(coverTreatmentFor({ slug }));
    }
  });
});
