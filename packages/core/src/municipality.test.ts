import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_ZONE,
  enabledFeatures,
  isFeatureEnabled,
  municipalitySchema,
} from './municipality';
import { makeMunicipality } from './test-fixtures';

describe('municipalitySchema', () => {
  it('defaults to the Spanish time zone and to Spanish', () => {
    const municipality = makeMunicipality();

    expect(municipality.timeZone).toBe(DEFAULT_TIME_ZONE);
    expect(municipality.defaultLocale).toBe('es');
  });

  it('applies the anti-spam and reminder defaults', () => {
    const municipality = makeMunicipality();

    expect(municipality.settings.reminderHour).toBe(19);
    expect(municipality.settings.maxDailyNotifications).toBe(3);
  });

  it('rejects a malformed slug', () => {
    const result = municipalitySchema.safeParse({
      ...makeMunicipality(),
      slug: 'La Zubia',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a branding colour that is not a hex value', () => {
    const result = municipalitySchema.safeParse({
      ...makeMunicipality(),
      branding: { logoUrl: null, primaryColor: 'verde', heroImageUrl: null },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an INE code that is not five digits', () => {
    const result = municipalitySchema.safeParse({ ...makeMunicipality(), ineCode: '181' });

    expect(result.success).toBe(false);
  });
});

describe('isFeatureEnabled', () => {
  it('always allows the modules that are part of the product itself', () => {
    const municipality = makeMunicipality({ features: [] });

    expect(isFeatureEnabled(municipality, 'calendar')).toBe(true);
    expect(isFeatureEnabled(municipality, 'multi_municipality')).toBe(true);
  });

  it('keeps a module that was not contracted switched off', () => {
    const municipality = makeMunicipality({ features: ['interests'] });

    expect(isFeatureEnabled(municipality, 'interests')).toBe(true);
    expect(isFeatureEnabled(municipality, 'live_tracking')).toBe(false);
    expect(isFeatureEnabled(municipality, 'white_label')).toBe(false);
  });
});

describe('enabledFeatures', () => {
  it('lists the contracted modules together with the always-on ones', () => {
    const municipality = makeMunicipality({ features: ['live_tracking'] });

    expect(enabledFeatures(municipality)).toEqual([
      'calendar',
      'multi_municipality',
      'live_tracking',
    ]);
  });
});
