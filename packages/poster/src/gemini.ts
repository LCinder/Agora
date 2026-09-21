import type { PosterFailure, PosterResult } from './failure';

/**
 * The one place this project talks to Gemini.
 *
 * Both poster features need the same thing — a model that reads Spanish, takes an
 * image when there is one, and answers in a fixed JSON shape — so the HTTP call
 * and the failure taxonomy live here instead of being written twice.
 *
 * Why Gemini and not a better model at this: the free tier. The requirement is a
 * demo that runs on keys anyone can get in five minutes without a card, and a
 * Flash model reads a poster well enough for a form a person then checks (D-024).
 *
 * Plain `fetch` rather than an SDK: it is one POST, and the provider is
 * deliberately easy to replace. The key is a parameter and never read from the
 * environment here, because the two callers keep it in different places — a
 * `.env.local` file in development, Parameter Store in the cloud.
 */
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * A Flash model, because those are the ones on the free tier. Flash is
 * multimodal, so the same id reads a poster and writes a brief.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiRequest<T> {
  apiKey: string | undefined;
  system: string;
  parts: GeminiPart[];
  /** Gemini's own response-schema dialect, not a converted Zod schema. */
  schema: Record<string, unknown>;
  parse: (value: unknown) => T | null;
}

/**
 * Asks Gemini for one JSON object and hands back whatever `parse` accepts.
 *
 * The schema is Gemini's dialect rather than something derived from Zod: the
 * conversion is one more thing to be subtly wrong about, and the answer is
 * validated with Zod on the way out anyway, which is where the real guarantee is.
 */
export async function geminiJson<T>({
  apiKey,
  system,
  parts,
  schema,
  parse,
}: GeminiRequest<T>): Promise<PosterResult<T>> {
  if (apiKey === undefined || apiKey === '') return { ok: false, failure: 'missing_key' };

  let response: Response;

  try {
    response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    });
  } catch {
    return { ok: false, failure: 'unreachable' };
  }

  const failure = failureForStatus(response.status);

  if (failure !== null) return { ok: false, failure };

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

  return value === null ? { ok: false, failure: 'refused' } : { ok: true, value };
}

export function failureForStatus(status: number): PosterFailure | null {
  if (status === 401 || status === 403) return 'bad_key';
  if (status === 429) return 'rate_limited';
  if (status < 200 || status >= 300) return 'unknown';

  return null;
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
