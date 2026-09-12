import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Draws an event poster from a one-line description.
 *
 * The counterpart to reading a poster: the town hall usually has one, but an
 * association announcing a talk or a small concert often has nothing at all,
 * and a calendar entry with no image looks like an afterthought next to one
 * that has a poster.
 *
 * It runs in two steps on purpose. What a municipal officer types is "concurso
 * de tortillas en la plaza", which is a fine description of an event and a
 * terrible prompt for an image model. So Claude turns it into a real visual
 * brief first, and only then does the image model draw. The officer never has
 * to learn how to prompt anything.
 */

const PROMPT_MODEL = 'claude-opus-5';

/**
 * Image generation runs on Gemini because Claude does not generate images.
 * Kept behind plain fetch rather than an SDK: this is one HTTP call, and the
 * provider is explicitly undecided (D-018).
 */
const IMAGE_MODEL = 'gemini-3.1-flash-image';
const IMAGE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const requestSchema = z.object({
  description: z.string().min(3).max(2000),
  /**
   * `background` draws an illustration with no text in it, for the panel to
   * lay the event details over. `complete` asks the model for the finished
   * poster, text included — quicker, and the text is the model's to get wrong.
   */
  mode: z.enum(['background', 'complete']),
  event: z.object({
    title: z.string().default(''),
    dateLabel: z.string().default(''),
    timeLabel: z.string().default(''),
    locationName: z.string().default(''),
    municipalityName: z.string().default(''),
  }),
});

const briefSchema = z.object({
  imagePrompt: z
    .string()
    .describe(
      'Descripción visual detallada para el modelo de imagen, en español: escena, estilo, composición, paleta, iluminación y encuadre.',
    ),
  altText: z
    .string()
    .describe(
      'Texto alternativo del cartel, en español, de una frase, para lectores de pantalla. Describe la imagen, no repitas el título.',
    ),
});

export type PosterBrief = z.infer<typeof briefSchema>;

export type PosterDrawing = PosterBrief & {
  image: { mimeType: string; data: string };
};

const SYSTEM_PROMPT = `Escribes instrucciones para un modelo de imagen que dibuja carteles de eventos de un ayuntamiento andaluz.

Recibes la descripción breve que ha escrito un técnico municipal y la conviertes en una instrucción visual rica y concreta.

Reglas:
- Responde siempre en español.
- Sé concreto con la escena, el estilo, la composición, la paleta y la luz. Una instrucción de varias frases funciona mejor que una lista de palabras sueltas.
- Es un cartel institucional para vecinos de todas las edades: alegre y claro, nunca estridente ni comercial. Evita el aspecto de anuncio publicitario.
- Nada de marcas comerciales, ni logotipos reales, ni caras de personas reconocibles.
- No inventes datos del evento que no te hayan dado.`;

const BACKGROUND_RULE = `El cartel NO debe contener ningún texto, ni letras, ni números, ni carteles dentro de la imagen: el texto se compone después por encima. Pide expresamente una composición con una zona inferior despejada y de tono uniforme donde el texto se pueda leer sin estorbar al motivo principal.`;

const COMPLETE_RULE = `El cartel SÍ lleva el texto dentro de la imagen. Indica al modelo el texto exacto que debe escribir, entrecomillado y sin cambiar ni una tilde, y pídele tipografía grande, legible y bien contrastada, con el título como elemento dominante.`;

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

/**
 * Pulls the image out of an Interactions response.
 *
 * The documented path is `output_image.data`; the steps array and the older
 * `candidates` shape are read too, so a provider-side response change degrades
 * into a clear error here rather than a crash somewhere in the panel.
 */
function extractImage(payload: unknown): { mimeType: string; data: string } | null {
  const seen = new Set<unknown>();

  function walk(node: unknown): { mimeType: string; data: string } | null {
    if (typeof node !== 'object' || node === null || seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    const record = node as Record<string, unknown>;
    const data = record.data ?? record.base64Data;
    const mimeType = record.mime_type ?? record.mimeType;

    if (typeof data === 'string' && data.length > 0) {
      return { mimeType: typeof mimeType === 'string' ? mimeType : 'image/jpeg', data };
    }

    for (const value of Object.values(record)) {
      const found = walk(value);
      if (found) return found;
    }

    return null;
  }

  return walk(payload);
}

export async function POST(request: Request): Promise<NextResponse> {
  const claude = anthropic();
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!claude || !geminiKey) {
    const missing = !claude ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
    return NextResponse.json(
      {
        error: 'missing_api_key',
        message: `Falta ${missing}. Añádela a apps/web/.env.local para dibujar carteles.`,
      },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Describe el cartel que quieres antes de dibujarlo.' },
      { status: 400 },
    );
  }

  const { description, mode, event } = parsed.data;

  const details = [
    event.title ? `Título: ${event.title}` : null,
    event.dateLabel ? `Fecha: ${event.dateLabel}` : null,
    event.timeLabel ? `Hora: ${event.timeLabel}` : null,
    event.locationName ? `Lugar: ${event.locationName}` : null,
    event.municipalityName ? `Municipio: ${event.municipalityName}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  let brief: PosterBrief;

  try {
    const response = await claude.messages.parse({
      model: PROMPT_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(briefSchema) },
      messages: [
        {
          role: 'user',
          content: `${mode === 'background' ? BACKGROUND_RULE : COMPLETE_RULE}

Descripción del técnico:
${description}

${details ? `Datos del evento:\n${details}` : 'Todavía no hay datos del evento.'}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json(
        {
          error: 'not_drawable',
          message: 'No hemos podido preparar este cartel. Prueba a describirlo de otra manera.',
        },
        { status: 422 },
      );
    }

    brief = response.parsed_output;
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
      { error: 'unknown', message: 'No hemos podido preparar el cartel.' },
      { status: 500 },
    );
  }

  let drawn: Response;

  try {
    drawn = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        input: [{ type: 'text', text: brief.imagePrompt }],
        // 3:4 is the shape of a poster on a noticeboard and of the card the
        // app shows it in.
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '3:4',
          image_size: '2K',
        },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: 'unreachable', message: 'No hemos podido conectar con el servicio de imágenes.' },
      { status: 502 },
    );
  }

  if (drawn.status === 429) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message:
          'Se ha agotado la cuota diaria de carteles del nivel gratuito. Inténtalo mañana o pasa a nivel de pago.',
      },
      { status: 429 },
    );
  }

  if (drawn.status === 401 || drawn.status === 403) {
    return NextResponse.json(
      { error: 'bad_api_key', message: 'La clave de la API de imágenes no es válida.' },
      { status: 503 },
    );
  }

  if (!drawn.ok) {
    return NextResponse.json(
      { error: 'unknown', message: 'El servicio de imágenes ha rechazado el cartel.' },
      { status: 502 },
    );
  }

  const image = extractImage(await drawn.json());

  if (!image) {
    return NextResponse.json(
      {
        error: 'no_image',
        message: 'El servicio ha respondido sin ningún cartel. Vuelve a intentarlo.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ...brief, image } satisfies PosterDrawing);
}
