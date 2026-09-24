import { z } from 'zod';

import { logPosterFailure, type PosterFailure, type PosterResult } from './failure';
import {
  IMAGE_RESERVE_MS,
  failureForStatus,
  geminiJson,
  posterDeadline,
  remainingFor,
  wasAborted,
} from './gemini';

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

/**
 * Nailed to the end of every prompt FLUX is given, whatever Gemini wrote.
 *
 * The rule against text used to live only in the instructions for the model that
 * *writes* the prompt. FLUX never sees those — it sees `imagePrompt` and nothing
 * else — so the moment Gemini forgot to carry the rule across, or the brief came
 * from `briefWithoutAModel` after Gemini timed out, the drawing came back with
 * lettering in it. And FLUX cannot spell: what it draws is shapes that look like
 * writing, which on a municipal poster is worse than a blank wall, because it
 * reads as a cheap fake rather than as a picture.
 *
 * The panel writes the real title, date and place over the image afterwards,
 * from the form, so nothing is lost by forbidding it here.
 *
 * In English because the image model is given its prompt in English (see the
 * system prompt), and negatives are stated as positives — "clean surfaces",
 * "empty walls" — because diffusion models respond to what a scene contains far
 * better than to what it does not.
 */
const NO_TEXT_CLAUSE =
  ', no text, no letters, no numbers, no words, no signage, no banners, no logos, ' +
  'no watermarks, clean blank surfaces, empty walls, purely pictorial illustration';

export const posterBriefSchema = z.object({
  imagePrompt: z.string().min(1),
  altText: z.string(),
});

export type PosterBrief = z.infer<typeof posterBriefSchema>;

export type PosterDrawing = PosterBrief & {
  image: { mimeType: string; data: string };
};

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

const NO_TEXT_RULE = `El cartel NO debe contener ningún texto, ni letras, ni números, ni carteles dentro de la imagen: el texto se compone después por encima. Pide expresamente una composición con una zona inferior despejada y de tono uniforme donde el texto se pueda leer sin estorbar al motivo principal.`;

/**
 * Failures worth drawing anyway.
 *
 * Gemini on the free tier answers the same request in five seconds, then in
 * sixteen, then in twenty-four — measured on one afternoon, from the Lambda, not
 * from a laptop behind a proxy. When it overruns there is nothing wrong with the
 * request, the keys or the drawing model; there is nothing wrong at all except
 * that a queue was long. Refusing to draw in that case throws away a working
 * Cloudflare call to punish a slow Google one.
 *
 * A key that is missing or wrong is not on this list on purpose: that is a
 * configuration fault, and quietly drawing around it would hide the day somebody
 * pastes the wrong key.
 */
const WORTH_DRAWING_ANYWAY: readonly PosterFailure[] = [
  'timed_out',
  'busy',
  'rate_limited',
  'unreachable',
];

/**
 * A brief written here, for when the model that writes them does not arrive.
 *
 * It is plainly worse than what Gemini writes — it knows the title, the place
 * and nothing about what the event feels like — and it is much better than an
 * error, which is the only other thing on offer once the clock has run. The
 * alt text says the picture is illustrative, because it is: nobody has read the
 * event, so promising more would be a caption that lies.
 */
function briefWithoutAModel(input: DrawPosterInput): PosterBrief {
  const subject = input.event.title ?? input.description;
  const place = input.event.locationName ?? input.event.municipalityName;

  return {
    imagePrompt:
      `Ilustración de cartel para "${subject}"` +
      (place === undefined ? '' : `, en ${place}`) +
      ', ambiente de fiesta popular española, luz cálida de tarde, colores vivos, ' +
      'composición limpia con una zona inferior despejada donde componer el texto',
    altText: `Imagen ilustrativa para ${subject}`,
  };
}

export interface DrawPosterInput {
  geminiKey: string | undefined;
  cloudflare: { accountId: string | undefined; apiToken: string | undefined };
  description: string;
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

  // One clock for both calls, and a floor under the second one. The drawing
  // gets whatever the brief did not spend, but the brief may never spend so much
  // that the drawing has nothing left: that is how a twenty-four second brief
  // used to kill a two second drawing.
  const deadline = posterDeadline();

  const brief = await geminiJson({
    deadline: deadline - IMAGE_RESERVE_MS,
    apiKey: input.geminiKey,
    system: SYSTEM_PROMPT,
    schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
    parts: [
      {
        text: `${NO_TEXT_RULE}

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

  if (!brief.ok && !WORTH_DRAWING_ANYWAY.includes(brief.failure)) return brief;

  // Either what Gemini wrote, or ours because it did not arrive in time.
  const wording = brief.ok ? brief.value : briefWithoutAModel(input);

  let drawn: Response;

  try {
    drawn = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${IMAGE_MODEL}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ prompt: wording.imagePrompt + NO_TEXT_CLAUSE, steps: IMAGE_STEPS }),
        signal: AbortSignal.timeout(remainingFor(deadline)),
      },
    );
  } catch (error) {
    const failure: PosterFailure = wasAborted(error) ? 'timed_out' : 'unreachable';

    logPosterFailure({
      provider: 'cloudflare',
      model: IMAGE_MODEL,
      failure,
      detail: String(error),
    });

    return { ok: false, failure };
  }

  const failure = failureForStatus(drawn.status);

  if (failure !== null) {
    logPosterFailure({
      provider: 'cloudflare',
      model: IMAGE_MODEL,
      failure,
      status: drawn.status,
      detail: await drawn.text().catch(() => ''),
    });

    return { ok: false, failure };
  }

  const image = extractImage(await drawn.json().catch(() => null));

  if (image === null) {
    // A 200 with no image in it. Workers AI puts the reason in the envelope it
    // answered with, and without this line the panel says nothing was drawn and
    // the reason is gone.
    logPosterFailure({
      provider: 'cloudflare',
      model: IMAGE_MODEL,
      failure: 'no_image',
      status: drawn.status,
    });

    return { ok: false, failure: 'no_image' };
  }

  return { ok: true, value: { ...wording, image } };
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
