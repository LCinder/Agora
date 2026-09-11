import { describe, expect, it } from 'vitest';

import { MESSAGES, createTranslator, isLocale, resolveLocale } from './index';

describe('resolveLocale', () => {
  it('accepts a plain locale', () => {
    expect(resolveLocale('en')).toBe('en');
  });

  it('accepts a regional tag', () => {
    expect(resolveLocale('es-ES')).toBe('es');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('falls back to Spanish for anything else', () => {
    expect(resolveLocale('fr-FR')).toBe('es');
    expect(resolveLocale(null)).toBe('es');
    expect(resolveLocale('')).toBe('es');
  });
});

describe('isLocale', () => {
  it('rejects an unsupported language', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });
});

describe('createTranslator', () => {
  it('returns the message for the locale', () => {
    expect(createTranslator('es')('calendar.today')).toBe('Hoy');
    expect(createTranslator('en')('calendar.today')).toBe('Today');
  });

  it('substitutes parameters', () => {
    const t = createTranslator('es');

    expect(t('event.organisedBy', { name: 'Peña Flamenca' })).toBe('Organiza Peña Flamenca');
  });

  it('leaves an unknown placeholder alone instead of printing undefined', () => {
    const t = createTranslator('es');

    expect(t('event.organisedBy', { other: 'x' })).toBe('Organiza {name}');
  });
});

describe('catalogues', () => {
  it('translates every key in every locale', () => {
    const spanishKeys = Object.keys(MESSAGES.es).sort();
    const englishKeys = Object.keys(MESSAGES.en).sort();

    expect(englishKeys).toEqual(spanishKeys);
  });

  it('has no empty string anywhere', () => {
    for (const [locale, catalogue] of Object.entries(MESSAGES)) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(value, `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
