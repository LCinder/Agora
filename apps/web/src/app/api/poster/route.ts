import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Reads an event poster and fills in the form for the municipal officer.
 *
 * This attacks the biggest risk the product has, which is not that the app is
 * disliked but that the calendar stays empty because nobody at the town hall
 * has time to type events in. In a Spanish town everything arrives as a photo
 * of a poster in a WhatsApp group, so that is the input the panel accepts.
 *
 * The result is never published on its own: it fills a form a person reviews
 * and confirms. An LLM reading a date off a poster is right most of the time,
 * and most of the time is not good enough to publish unattended.
 */

const MODEL = 'claude-opus-5';
const MAX_BYTES = 8 * 1024 * 1024;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const posterSchema = z.object({
  title: z.string().describe('Título del evento, tal y como aparece en el cartel'),
  description: z
    .string()
    .describe(
      'Resumen breve del cartel, en español, de una o dos frases. Vacío si no hay más información.',
    ),
  startDate: z
    .string()
    .describe('Fecha de inicio en formato AAAA-MM-DD. Cadena vacía si el cartel no la indica.'),
  startTime: z
    .string()
    .describe('Hora de inicio en formato HH:mm, 24 horas. Cadena vacía si no aparece.'),
  endTime: z.string().describe('Hora de fin en formato HH:mm. Cadena vacía si no aparece.'),
  locationName: z.string().describe('Lugar del evento. Cadena vacía si no aparece.'),
  isFree: z
    .boolean()
    .describe('true si el cartel dice que la entrada es gratuita o no menciona precio'),
  priceInfo: z
    .string()
    .describe('Precio tal y como aparece en el cartel. Cadena vacía si es gratis.'),
  organizerName: z
    .string()
    .describe('Quién organiza, si el cartel lo dice. Cadena vacía en caso contrario.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('Cuánta confianza hay en los datos extraídos, sobre todo en la fecha'),
});

export type PosterReading = z.infer<typeof posterSchema>;

const SYSTEM_PROMPT = `Eres el asistente de un ayuntamiento andaluz. Lees carteles de eventos municipales y extraes sus datos para que un técnico los revise antes de publicarlos.

Reglas:
- Responde siempre en español.
- Copia el título tal y como aparece en el cartel, sin reescribirlo.
- Si un dato no aparece en el cartel, devuelve una cadena vacía. No lo inventes ni lo deduzcas.
- Los carteles suelen escribir las fechas en español ("sábado 12 de septiembre", "12 SEP"). Conviértelas a AAAA-MM-DD.
- Si el cartel no indica el año, usa el año en curso que se te da más abajo, salvo que la fecha ya haya pasado hace más de dos meses, en cuyo caso usa el siguiente.
- Marca la confianza como baja si la fecha es ambigua o poco legible.`;

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export async function POST(request: Request): Promise<NextResponse> {
  const anthropic = client();

  if (!anthropic) {
    return NextResponse.json(
      {
        error: 'missing_api_key',
        message:
          'Falta ANTHROPIC_API_KEY. Añádela a apps/web/.env.local para leer carteles de verdad.',
      },
      { status: 503 },
    );
  }

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

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(posterSchema) },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data,
              },
            },
            {
              type: 'text',
              text: `Extrae los datos de este cartel. Hoy es ${new Date().toISOString().slice(0, 10)}.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json(
        {
          error: 'not_readable',
          message: 'No hemos podido leer este cartel. Rellena los datos a mano.',
        },
        { status: 422 },
      );
    }

    return NextResponse.json(response.parsed_output);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'bad_api_key', message: 'La clave de la API de Claude no es válida.' },
        { status: 503 },
      );
    }

    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Demasiadas peticiones. Inténtalo en un momento.' },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: 'unknown', message: 'No hemos podido leer el cartel. Rellena los datos a mano.' },
      { status: 500 },
    );
  }
}
