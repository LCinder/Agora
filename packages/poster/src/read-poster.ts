import { z } from 'zod';

import type { PosterResult } from './failure';
import { geminiJson } from './gemini';

/**
 * Reads an event poster and fills in the form for the municipal officer.
 *
 * This attacks the biggest risk the product has, which is not that the app is
 * disliked but that the calendar stays empty because nobody at the town hall has
 * time to type events in. In a Spanish town everything arrives as a photo of a
 * poster in a WhatsApp group, so that is the input the panel accepts.
 *
 * The result is never published on its own: it fills a form a person reviews and
 * confirms. A model reading a date off a poster is right most of the time, and
 * most of the time is not good enough to publish unattended.
 */
export const posterReadingSchema = z.object({
  title: z.string(),
  description: z.string(),
  startDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  locationName: z.string(),
  isFree: z.boolean(),
  priceInfo: z.string(),
  organizerName: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type PosterReading = z.infer<typeof posterReadingSchema>;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Six megabytes, and the number comes from the transport rather than from the
 * model: the image travels base64 encoded, which inflates it by a third, and an
 * HTTP API request body cannot exceed ten megabytes. Six in, eight on the wire,
 * with room to spare.
 *
 * A photo straight off a phone is often bigger than this, so the panel should
 * shrink it before uploading — a poster does not need more than about 1500 pixels
 * across to be read. That is not written yet.
 */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * The same fields in Gemini's response-schema dialect.
 *
 * `propertyOrdering` is not decoration: the model fills the object in this order,
 * and letting it settle the title and the date before the judgement call on
 * confidence gives a better answer than asking for confidence first.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Título del evento, tal y como aparece en el cartel' },
    description: {
      type: 'STRING',
      description:
        'Resumen breve del cartel, en español, de una o dos frases. Vacío si no hay más.',
    },
    startDate: {
      type: 'STRING',
      description: 'Fecha de inicio en formato AAAA-MM-DD. Cadena vacía si el cartel no la indica.',
    },
    startTime: {
      type: 'STRING',
      description: 'Hora de inicio en formato HH:mm, 24 horas. Cadena vacía si no aparece.',
    },
    endTime: { type: 'STRING', description: 'Hora de fin en HH:mm. Cadena vacía si no aparece.' },
    locationName: { type: 'STRING', description: 'Lugar del evento. Cadena vacía si no aparece.' },
    isFree: {
      type: 'BOOLEAN',
      description: 'true si el cartel dice que la entrada es gratuita o no menciona precio',
    },
    priceInfo: {
      type: 'STRING',
      description: 'Precio tal y como aparece en el cartel. Cadena vacía si es gratis.',
    },
    organizerName: {
      type: 'STRING',
      description: 'Quién organiza, si el cartel lo dice. Cadena vacía en caso contrario.',
    },
    confidence: {
      type: 'STRING',
      enum: ['high', 'medium', 'low'],
      description: 'Cuánta confianza hay en los datos extraídos, sobre todo en la fecha',
    },
  },
  required: [
    'title',
    'description',
    'startDate',
    'startTime',
    'endTime',
    'locationName',
    'isFree',
    'priceInfo',
    'organizerName',
    'confidence',
  ],
  propertyOrdering: [
    'title',
    'startDate',
    'startTime',
    'endTime',
    'locationName',
    'organizerName',
    'isFree',
    'priceInfo',
    'description',
    'confidence',
  ],
} as const;

const SYSTEM_PROMPT = `Eres el asistente de un ayuntamiento andaluz. Lees carteles de eventos municipales y extraes sus datos para que un técnico los revise antes de publicarlos.

Reglas:
- Responde siempre en español.
- Copia el título tal y como aparece en el cartel, sin reescribirlo.
- Si un dato no aparece en el cartel, devuelve una cadena vacía. No lo inventes ni lo deduzcas.
- Los carteles suelen escribir las fechas en español ("sábado 12 de septiembre", "12 SEP"). Conviértelas a AAAA-MM-DD.
- Si el cartel no indica el año, usa el año en curso que se te da más abajo, salvo que la fecha ya haya pasado hace más de dos meses, en cuyo caso usa el siguiente.
- Marca la confianza como baja si la fecha es ambigua o poco legible.`;

export interface ReadPosterInput {
  geminiKey: string | undefined;
  /** The image, base64 encoded, and its media type. */
  image: { data: string; mimeType: string };
  /** Today, so a poster with no year lands in the right one. */
  today?: Date;
}

export function isAcceptedImageType(mimeType: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

export async function readPoster(input: ReadPosterInput): Promise<PosterResult<PosterReading>> {
  const today = (input.today ?? new Date()).toISOString().slice(0, 10);

  return geminiJson({
    apiKey: input.geminiKey,
    system: SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    parts: [
      { inlineData: { mimeType: input.image.mimeType, data: input.image.data } },
      { text: `Extrae los datos de este cartel. Hoy es ${today}.` },
    ],
    parse: (value) => {
      const parsed = posterReadingSchema.safeParse(value);

      return parsed.success ? parsed.data : null;
    },
  });
}
