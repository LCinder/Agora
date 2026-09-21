import { z } from 'zod';

import type { PosterResult } from './failure';
import { IMAGE_TIMEOUT_MS, failureForStatus, geminiJson, wasAborted } from './gemini';

/**
 * Draws an event poster from a one-line description.
 *
 * The counterpart to reading a poster: the town hall usually has one, but an
 * association announcing a talk or a small concert often has nothing at all, and a
 * calendar entry with no image looks like an afterthought next to one that has a
 * poster.
 *
 * It runs in two steps on purpose. What a municipal officer types is "concurso de
 * tortillas en la plaza", which is a fine description of an event and a terrible
 * prompt for an image model. So a text model turns it into a real visual brief
 * first, and only then does the image model draw. The officer never has to learn
 * how to prompt anything.
 *
 * The two steps run on two providers, both free and both key-only (D-024): Gemini
 * Flash writes the brief, Cloudflare Workers AI draws with FLUX schnell.
 */

/**
 * FLUX.1 [schnell] on Workers AI. Four steps is the model's own default and what
 * it was distilled for; more steps cost budget without buying much.
 */
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const IMAGE_STEPS = 4;

export const posterBriefSchema = z.object({
  imagePrompt: z.string().min(1),
  altText: z.string(),
});

export type PosterBrief = z.infer<typeof posterBriefSchema>;

export type PosterDrawing = PosterBrief & {
  image: { mimeType: string; data: string };
};

/**
 * `background` draws an illustration with no text in it, for the panel to lay the
 * event details over. `complete` asks the model for the finished poster, text
 * included — quicker, and the text is the model's to get wrong.
 */
export type PosterMode = 'background' | 'complete';

export interface PosterSubject {
  title?: string;
  dateLabel?: string;
  timeLabel?: string;
  locationName?: string;
  municipalityName?: string;
}

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
 * FLUX follows English prompts noticeably better than Spanish ones, so the brief
 * is written in English while the alt text — which a neighbour's screen reader
 * will actually say out loud — stays in Spanish.
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

export interface DrawPosterInput {
  geminiKey: string | undefined;
  cloudflare: { accountId: string | undefined; apiToken: string | undefined };
  description: string;
  mode: PosterMode;
  event: PosterSubject;
}

export async function drawPoster(input: DrawPosterInput): Promise<PosterResult<PosterDrawing>> {
  const { accountId, apiToken } = input.cloudflare;

  if (accountId === undefined || accountId === '' || apiToken === undefined || apiToken === '') {
    return { ok: false, failure: 'missing_key' };
  }

  const details = [
    input.event.title ? `Título: ${input.event.title}` : null,
    input.event.dateLabel ? `Fecha: ${input.event.dateLabel}` : null,
    input.event.timeLabel ? `Hora: ${input.event.timeLabel}` : null,
    input.event.locationName ? `Lugar: ${input.event.locationName}` : null,
    input.event.municipalityName ? `Municipio: ${input.event.municipalityName}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const brief = await geminiJson({
    apiKey: input.geminiKey,
    system: SYSTEM_PROMPT,
    schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
    parts: [
      {
        text: `${input.mode === 'background' ? BACKGROUND_RULE : COMPLETE_RULE}

Descripción del técnico:
${input.description}

${details === '' ? 'Todavía no hay datos del evento.' : `Datos del evento:\n${details}`}`,
      },
    ],
    parse: (value) => {
      const parsed = posterBriefSchema.safeParse(value);

      return parsed.success ? parsed.data : null;
    },
  });

  if (!brief.ok) return brief;

  let drawn: Response;

  try {
    drawn = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${IMAGE_MODEL}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ prompt: brief.value.imagePrompt, steps: IMAGE_STEPS }),
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return { ok: false, failure: wasAborted(error) ? 'timed_out' : 'unreachable' };
  }

  const failure = failureForStatus(drawn.status);

  if (failure !== null) return { ok: false, failure };

  const image = extractImage(await drawn.json().catch(() => null));

  return image === null
    ? { ok: false, failure: 'no_image' }
    : { ok: true, value: { ...brief.value, image } };
}

/**
 * Pulls the image out of a Workers AI response.
 *
 * The documented shape is `{ result: { image: "<base64 jpeg>" } }`, and the
 * envelope can also carry `success: false` with the error in `errors`. Reading it
 * defensively means a provider-side change surfaces as a clear message in the
 * panel rather than as a crash.
 */
function extractImage(payload: unknown): { mimeType: string; data: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const result = (payload as { result?: unknown }).result;

  if (typeof result !== 'object' || result === null) return null;

  const image = (result as { image?: unknown }).image;

  if (typeof image !== 'string' || image.length === 0) return null;

  return { mimeType: 'image/jpeg', data: image };
}
