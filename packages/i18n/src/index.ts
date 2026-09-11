/**
 * User-facing copy, shared by the mobile app and the web panel.
 *
 * Spanish is the default locale; English is kept in place from the start so
 * the visitor mode of a later phase is a translation job, not a refactor.
 * Identifiers and code comments stay in English everywhere.
 */

export const SUPPORTED_LOCALES = ['es', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';
