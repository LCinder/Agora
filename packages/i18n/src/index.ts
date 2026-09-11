/**
 * User-facing copy, shared by the mobile app and the web panel.
 *
 * Spanish is the default locale; English is kept in place from the start so
 * the visitor mode of a later phase is a translation job, not a refactor.
 * Identifiers and code comments stay in English everywhere.
 */

import { MESSAGES, type Messages } from './messages';

export type { Messages };
export { MESSAGES };

export const SUPPORTED_LOCALES = ['es', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export type MessageKey = keyof Messages;

/** Values substituted into a message, as in `Organiza {name}`. */
export type MessageParams = Record<string, string | number>;

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported locale for a device language tag such as `es-ES`.
 * Falls back to Spanish, which is what the town halls write their events in.
 */
export function resolveLocale(languageTag: string | null | undefined): Locale {
  if (!languageTag) return DEFAULT_LOCALE;

  const base = languageTag.split('-')[0]?.toLowerCase() ?? '';
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

function format(template: string, params?: MessageParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * Builds the translation function for a locale.
 *
 * A key missing from a locale falls back to Spanish rather than showing the
 * raw key: a half-translated screen is bad, a screen showing `event.share` is
 * broken.
 */
export function createTranslator(locale: Locale): Translate {
  const catalogue = MESSAGES[locale];

  return (key, params) => format(catalogue[key] ?? MESSAGES.es[key], params);
}
