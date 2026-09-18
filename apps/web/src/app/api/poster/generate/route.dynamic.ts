import { NextResponse } from 'next/server';
import { z } from 'zod';

import { geminiErrorResponse, geminiJson } from '../../../../lib/gemini';
import { type PosterDrawing, posterBriefSchema } from '../../../../lib/poster-contract';

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
 * terrible prompt for an image model. So a text model turns it into a real
 * visual brief first, and only then does the image model draw. The officer
 * never has to learn how to prompt anything.
 *
 * The two steps run on two providers, both free and both key-only (D-024):
 * Gemini Flash writes the brief, Cloudflare Workers AI draws with FLUX schnell.
 *
 * Named `.dynamic.ts` because it needs a server, and because the credentials
 * of both providers must never reach a browser. The static export of the panel
 * leaves it out and the poster Lambda answers the same path. See D-031.
 */

/**
 * FLUX.1 [schnell] on Workers AI. Four steps is the model's own default and
 * what it was distilled for; more steps cost budget without buying much.
 */
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const IMAGE_STEPS = 4;

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

const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    imagePrompt: {
      type: 'STRING',
      description:
        'Descripción visual detallada para el modelo de imagen: escena, estilo, composición, paleta, iluminación y encuadre.',
    },
    altText: {
      type: 'STRING',
      description:
        'Texto alternativo del cartel, en español, de una frase, para lectores de pantalla. Describe la imagen, no repitas el título.',
    },
  },
  required: ['imagePrompt', 'altText'],
  propertyOrdering: ['imagePrompt', 'altText'],
} as const;

/**
 * FLUX follows English prompts noticeably better than Spanish ones, so the
 * brief is written in English while the alt text — which a neighbour's screen
 * reader will actually say out loud — stays in Spanish.
 */
const SYSTEM_PROMPT = `Escribes instrucciones para un modelo de imagen que dibuja carteles de eventos de un ayuntamiento andaluz.

Recibes la descripción breve que ha escrito un técnico municipal y la conviertes en una instrucción visual rica y concreta.

Reglas:
- El campo imagePrompt va SIEMPRE en inglés, porque el modelo de imagen entiende mejor el inglés. El campo altText va siempre en español.
- Sé concreto con la escena, el estilo, la composición, la paleta y la luz. Una instrucción de varias frases funciona mejor que una lista de palabras sueltas.
- Es un cartel institucional para vecinos de todas las edades: alegre y claro, nunca estridente ni comercial. Evita el aspecto de anuncio publicitario.
- Nada de marcas comerciales, ni logotipos reales, ni caras de personas reconocibles.
- No inventes datos del evento que no te hayan dado.`;

const BACKGROUND_RULE = `El cartel NO debe contener ningún texto, ni letras, ni números, ni carteles dentro de la imagen: el texto se compone después por encima. Pide expresamente una composición con una zona inferior despejada y de tono uniforme donde el texto se pueda leer sin estorbar al motivo principal.`;

const COMPLETE_RULE = `El cartel SÍ lleva el texto dentro de la imagen. Indica al modelo el texto exacto que debe escribir, entrecomillado y sin cambiar ni una tilde, y pídele tipografía grande, legible y bien contrastada, con el título como elemento dominante.`;

export async function POST(request: Request): Promise<NextResponse> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!account || !token) {
    return NextResponse.json(
      {
        error: 'missing_api_key',
        message: `Falta ${!account ? 'CLOUDFLARE_ACCOUNT_ID' : 'CLOUDFLARE_API_TOKEN'}. Añádelo a apps/web/.env.local para dibujar carteles.`,
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

  const brief = await geminiJson({
    system: SYSTEM_PROMPT,
    schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
    parts: [
      {
        text: `${mode === 'background' ? BACKGROUND_RULE : COMPLETE_RULE}

Descripción del técnico:
${description}

${details ? `Datos del evento:\n${details}` : 'Todavía no hay datos del evento.'}`,
      },
    ],
    parse: (value) => {
      const result = posterBriefSchema.safeParse(value);
      return result.success ? result.data : null;
    },
  });

  if (!brief.ok) {
    if (brief.failure === 'refused') {
      return NextResponse.json(
        {
          error: 'not_drawable',
          message: 'No hemos podido preparar este cartel. Prueba a describirlo de otra manera.',
        },
        { status: 422 },
      );
    }

    return geminiErrorResponse(brief.failure, 'dibujar carteles');
  }

  let drawn: Response;

  try {
    drawn = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${IMAGE_MODEL}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: brief.value.imagePrompt, steps: IMAGE_STEPS }),
      },
    );
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
          'Se ha agotado la cuota diaria gratuita de carteles. Vuelve a intentarlo mañana o amplía el plan de Cloudflare.',
      },
      { status: 429 },
    );
  }

  if (drawn.status === 401 || drawn.status === 403) {
    return NextResponse.json(
      {
        error: 'bad_api_key',
        message: 'Las credenciales de Cloudflare no son válidas o el token no tiene Workers AI.',
      },
      { status: 503 },
    );
  }

  if (!drawn.ok) {
    return NextResponse.json(
      { error: 'unknown', message: 'El servicio de imágenes ha rechazado el cartel.' },
      { status: 502 },
    );
  }

  const image = extractImage(await drawn.json().catch(() => null));

  if (!image) {
    return NextResponse.json(
      {
        error: 'no_image',
        message: 'El servicio ha respondido sin ningún cartel. Vuelve a intentarlo.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ...brief.value, image } satisfies PosterDrawing);
}

/**
 * Pulls the image out of a Workers AI response.
 *
 * The documented shape is `{ result: { image: "<base64 jpeg>" } }`, and the
 * envelope can also carry `success: false` with the error in `errors`. Reading
 * it defensively means a provider-side change surfaces as a clear message in
 * the panel rather than as a crash.
 */
function extractImage(payload: unknown): { mimeType: string; data: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const result = (payload as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return null;

  const image = (result as { image?: unknown }).image;
  if (typeof image !== 'string' || image.length === 0) return null;

  return { mimeType: 'image/jpeg', data: image };
}
