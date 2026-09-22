import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@agora/i18n';
import { z } from 'zod';

/**
 * A municipality is the tenant of the platform. Every other record belongs to
 * one, and no query may ever span two of them.
 *
 * Field names are camelCase here and in the seed files; the phase 2 database
 * uses snake_case columns and maps at its boundary.
 */

/** Every feature the platform can offer. See docs/modulos-por-municipio.md. */
export const FEATURE_KEYS = [
  'calendar',
  'multi_municipality',
  'poster_import',
  'interests',
  'associations',
  'analytics',
  'live_tracking',
  'annual_report',
  'syndication',
  'post_event_survey',
  'visitor_mode',
  'local_business',
  'white_label',
  'general_notices',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Features that are part of the product itself and cannot be switched off.
 * Everything else is sold, and billed, as a module.
 */
export const ALWAYS_ON_FEATURES = [
  'calendar',
  'multi_municipality',
] as const satisfies readonly FeatureKey[];

export const MUNICIPALITY_STATUSES = ['demo', 'pilot', 'active', 'inactive'] as const;
export type MunicipalityStatus = (typeof MUNICIPALITY_STATUSES)[number];

/** Spanish municipalities all share one time zone, but never assume it. */
export const DEFAULT_TIME_ZONE = 'Europe/Madrid';

/**
 * How long a phone that never comes back is kept.
 *
 * A resident who taps "borrar mis datos" is forgotten there and then. This is
 * the other way a device stops existing: somebody clears the app's storage from
 * the phone's own settings, or reinstalls, or changes phone. The app never gets
 * to say so, it registers again as a new device, and the old row stays — with
 * its marks still counted on every event it had marked and still counted in the
 * town's total of neighbours with the app.
 *
 * That is not a privacy problem, because there is nothing personal in the row to
 * leak. It is a truthfulness problem, and the numbers it makes untrue are the
 * ones this product is sold on: a counter that only ever goes up stops being a
 * counter. Hence a plazo, applied by the monthly job.
 *
 * Twelve months, for one reason a person can check: it has to cover somebody who
 * opens the app at the feria and again at Semana Santa and not think they left.
 * Anything shorter forgets a real neighbour who simply has a quiet autumn.
 */
export const DEVICE_IDLE_MONTHS = 12;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a six digit hex colour, for example #4F46E5');

export const brandingSchema = z.object({
  logoUrl: z.string().nullable().default(null),
  primaryColor: hexColor,
  heroImageUrl: z.string().nullable().default(null),
});

export const municipalitySettingsSchema = z.object({
  /** Hour of the day, in the municipality time zone, for the evening reminder. */
  reminderHour: z.number().int().min(0).max(23).default(19),
  /** Anti-spam cap: notifications a single device may receive per day. */
  maxDailyNotifications: z.number().int().min(1).max(20).default(3),
});

export const municipalitySchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase, dash separated slug'),
  name: z.string().min(1),
  province: z.string().min(1),
  population: z.number().int().positive(),
  /** Spanish statistics office code, the stable identifier across datasets. */
  ineCode: z.string().regex(/^\d{5}$/, 'Expected a five digit INE code'),
  /** Town hall centre, used to place the map and to detect the nearest municipality. */
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).default(DEFAULT_TIME_ZONE),
  defaultLocale: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE),
  status: z.enum(MUNICIPALITY_STATUSES),
  branding: brandingSchema,
  settings: municipalitySettingsSchema,
  features: z.array(z.enum(FEATURE_KEYS)).default([]),
});

export type Branding = z.infer<typeof brandingSchema>;
export type MunicipalitySettings = z.infer<typeof municipalitySettingsSchema>;
export type Municipality = z.infer<typeof municipalitySchema>;

/**
 * Whether a module is available for a municipality.
 *
 * The check is meant to run on the server too, not only to hide buttons: a
 * module that is off must reject the operation, not merely stop showing it.
 */
export function isFeatureEnabled(
  municipality: Pick<Municipality, 'features'>,
  feature: FeatureKey,
): boolean {
  if ((ALWAYS_ON_FEATURES as readonly FeatureKey[]).includes(feature)) {
    return true;
  }
  return municipality.features.includes(feature);
}

/** Every module active for a municipality, always-on ones included. */
export function enabledFeatures(municipality: Pick<Municipality, 'features'>): FeatureKey[] {
  return FEATURE_KEYS.filter((feature) => isFeatureEnabled(municipality, feature));
}
