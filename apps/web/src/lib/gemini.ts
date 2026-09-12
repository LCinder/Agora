import { NextResponse } from 'next/server';

/**
 * The one place the panel talks to Gemini.
 *
 * Both poster features need the same thing — a model that reads Spanish, takes
 * an image when there is one, and answers in a fixed JSON shape — so the HTTP
 * call, the failure taxonomy and the Spanish error messages live here instead
 * of being written twice.
 *
 * Why Gemini and not Claude, which is better at this: the free tier. Anthropic
 * has never had one, and the requirement is a demo that runs on keys anyone
 * can get in five minutes without a card. A Flash model on Google's free tier
 * reads a poster well enough for a form a person then checks. See D-024.
 *
 * Plain `fetch` rather than an SDK: it is one POST, and the provider is
 * deliberately easy to replace.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * A Flash model, because those are the ones on the free tier — the Pro models
 * moved behind billing. Flash is multimodal, so the same id reads a poster and
 * writes a brief.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Why a call did not produce an answer. Each maps to its own reply. */
export type GeminiFailure =
  'missing_key' | 'bad_key' | 'rate_limited' | 'unreachable' | 'refused' | 'unknown';

export type GeminiResult<T> = { ok: true; value: T } | { ok: false; failure: GeminiFailure };

/**
 * Asks Gemini for one JSON object and hands back whatever `parse` accepts.
 *
 * `schema` is Gemini's own response-schema dialect rather than a converted Zod
 * schema: the conversion is one more thing to be subtly wrong about, and the
 * answer is validated with Zod on the way out anyway, which is where the real
 * guarantee is.
 */
export async function geminiJson<T>({
  system,
  parts,
  schema,
  parse,
}: {
  system: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  parse: (value: unknown) => T | null;
}): Promise<GeminiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, failure: 'missing_key' };

  let response: Response;

  try {
    response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });
  } catch {
    return { ok: false, failure: 'unreachable' };
  }

  if (response.status === 401 || response.status === 403) return { ok: false, failure: 'bad_key' };
  if (response.status === 429) return { ok: false, failure: 'rate_limited' };
  if (!response.ok) return { ok: false, failure: 'unknown' };

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return { ok: false, failure: 'unknown' };
  }

  const text = firstText(payload);
  if (text === null) return { ok: false, failure: 'refused' };

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, failure: 'refused' };
  }

  const value = parse(raw);
  if (value === null) return { ok: false, failure: 'refused' };

  return { ok: true, value };
}

/**
 * The model's answer, out of the candidate envelope.
 *
 * A safety block or a hit token limit comes back as a candidate with no parts
 * rather than as an HTTP error, so "no text" has to be a normal outcome here.
 */
function firstText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const content = (candidates[0] as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) return null;

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;

  const joined = parts
    .map((part) =>
      typeof part === 'object' && part !== null ? (part as { text?: unknown }).text : null,
    )
    .filter((text): text is string => typeof text === 'string')
    .join('');

  return joined.length > 0 ? joined : null;
}

/** The reply for a failure, in the panel's own voice. */
export function geminiErrorResponse(failure: GeminiFailure, what: string): NextResponse {
  switch (failure) {
    case 'missing_key':
      return NextResponse.json(
        {
          error: 'missing_api_key',
          message: `Falta GEMINI_API_KEY. Añádela a apps/web/.env.local para ${what}.`,
        },
        { status: 503 },
      );
    case 'bad_key':
      return NextResponse.json(
        { error: 'bad_api_key', message: 'La clave de Gemini no es válida.' },
        { status: 503 },
      );
    case 'rate_limited':
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: 'Se ha agotado la cuota gratuita de Gemini por hoy. Inténtalo mañana.',
        },
        { status: 429 },
      );
    case 'unreachable':
      return NextResponse.json(
        { error: 'unreachable', message: 'No hemos podido conectar con Gemini.' },
        { status: 502 },
      );
    default:
      return NextResponse.json(
        { error: 'unknown', message: `No hemos podido ${what}.` },
        { status: 502 },
      );
  }
}
