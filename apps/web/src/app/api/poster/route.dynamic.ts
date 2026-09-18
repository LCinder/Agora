import { NextResponse } from 'next/server';

import { geminiErrorResponse, geminiJson } from '../../../lib/gemini';
import { posterReadingSchema } from '../../../lib/poster-contract';

/**
 * Reads an event poster and fills in the form for the municipal officer.
 *
 * This attacks the biggest risk the product has, which is not that the app is
 * disliked but that the calendar stays empty because nobody at the town hall
 * has time to type events in. In a Spanish town everything arrives as a photo
 * of a poster in a WhatsApp group, so that is the input the panel accepts.
 *
 * The result is never published on its own: it fills a form a person reviews
 * and confirms. A model reading a date off a poster is right most of the time,
 * and most of the time is not good enough to publish unattended.
 *
 * Runs on Gemini Flash for its free tier — see `lib/gemini.ts` and D-024.
 *
 * Named `.dynamic.ts` because it needs a server: the static export of the
 * panel leaves it out and the poster Lambda answers the same path instead.
 * See `next.config.ts` and D-031.
 */

const MAX_BYTES = 8 * 1024 * 1024;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * The same fields in Gemini's response-schema dialect. `propertyOrdering` is
 * not decoration: the model fills the object in this order, and letting it
 * settle the title and the date before the judgement call on confidence gives
 * a better answer than asking for confidence first.
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

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const file = form.get('poster');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'missing_file', message: 'No se ha recibido ningún cartel.' },
      { status: 400 },
    );
  }

  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return NextResponse.json(
      {
        error: 'unsupported_type',
        message: 'Sube una imagen del cartel en JPG, PNG, WEBP o GIF.',
      },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'El cartel es demasiado grande. Máximo 8 MB.' },
      { status: 413 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');

  const result = await geminiJson({
    system: SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    parts: [
      { inlineData: { mimeType: file.type, data } },
      {
        text: `Extrae los datos de este cartel. Hoy es ${new Date().toISOString().slice(0, 10)}.`,
      },
    ],
    parse: (value) => {
      const parsed = posterReadingSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  });

  if (result.ok) return NextResponse.json(result.value);

  // A poster the model could not make sense of is not an error the officer can
  // act on, so it gets its own message: fill it in by hand and carry on.
  if (result.failure === 'refused') {
    return NextResponse.json(
      {
        error: 'not_readable',
        message: 'No hemos podido leer este cartel. Rellena los datos a mano.',
      },
      { status: 422 },
    );
  }

  return geminiErrorResponse(result.failure, 'leer carteles');
}
