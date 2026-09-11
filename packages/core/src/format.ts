import { TZDate } from '@date-fns/tz';
import { format, isSameDay } from 'date-fns';
import { enGB, es } from 'date-fns/locale';

import { dayRange } from './time';

/**
 * Date formatting for the calendar.
 *
 * Shared by the app and the panel so a date never reads one way on the phone
 * and another on the web. Always formatted in the time zone of the
 * municipality, for the same reason grouping is.
 */

export type FormatLocale = 'es' | 'en';

const LOCALES = { es, en: enGB } as const;

export interface FormatContext {
  now: Date;
  timeZone: string;
  locale: FormatLocale;
}

function zoned(date: Date, timeZone: string): TZDate {
  return new TZDate(date, timeZone);
}

/** "20:00" */
export function formatTime(date: Date, context: FormatContext): string {
  return format(zoned(date, context.timeZone), 'HH:mm', { locale: LOCALES[context.locale] });
}

/** "sáb 12 sep" */
export function formatShortDate(date: Date, context: FormatContext): string {
  return format(zoned(date, context.timeZone), 'EEE d MMM', { locale: LOCALES[context.locale] });
}

/** "sábado, 12 de septiembre de 2026" */
export function formatLongDate(date: Date, context: FormatContext): string {
  const pattern = context.locale === 'es' ? "EEEE, d 'de' MMMM 'de' yyyy" : 'EEEE, d MMMM yyyy';
  return format(zoned(date, context.timeZone), pattern, { locale: LOCALES[context.locale] });
}

/**
 * The day label a resident reads fastest: "Hoy" and "Mañana" beat a date they
 * have to decode, and everything further out gets the weekday.
 */
export function formatRelativeDay(date: Date, context: FormatContext): string {
  const today = dayRange(context.now, context.timeZone);
  const tomorrow = dayRange(new Date(today.end.getTime() + 1), context.timeZone);

  if (isSameDay(zoned(date, context.timeZone), zoned(today.start, context.timeZone))) {
    return context.locale === 'es' ? 'Hoy' : 'Today';
  }

  if (isSameDay(zoned(date, context.timeZone), zoned(tomorrow.start, context.timeZone))) {
    return context.locale === 'es' ? 'Mañana' : 'Tomorrow';
  }

  return formatShortDate(date, context);
}

/** "Hoy · 22:00" or "sáb 12 sep · 11:00 – 14:00" */
export function formatWhen(
  event: { startAt: Date; endAt: Date | null; allDay: boolean },
  context: FormatContext,
): string {
  const day = formatRelativeDay(event.startAt, context);

  if (event.allDay) return day;

  const start = formatTime(event.startAt, context);
  if (event.endAt === null) return `${day} · ${start}`;

  const endsSameDay = isSameDay(
    zoned(event.startAt, context.timeZone),
    zoned(event.endAt, context.timeZone),
  );

  if (!endsSameDay) {
    return `${day} · ${start} – ${formatRelativeDay(event.endAt, context)}`;
  }

  return `${day} · ${start} – ${formatTime(event.endAt, context)}`;
}
