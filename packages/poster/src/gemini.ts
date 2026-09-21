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
 * A Flash Lite model, because of the free tier, and measured rather than assumed.
 *
 * `gemini-3.5-flash` was here first, on the understanding that a Flash model
 * gives about 1,500 requests a day. It does not: the free tier allows **twenty
 * a day** for that model, `GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
 * which an afternoon of testing spends before lunch. Lite has a far larger
 * allowance and is the difference between a feature that works in a meeting and
 * one that answers 429.
 *
 * It is also three to five times quicker — 3 seconds against 7 to 14 measured
 * on the same day — and that matters for more than patience: API Gateway gives
 * the poster function 30 seconds for the brief and the drawing together.
 *
 * And it is good enough at the only two jobs here. Reading a municipal poster it
 * returned the title, the date resolved to the right year, the time, the place,
 * the organiser and that it was free. Writing a visual brief from one Spanish
 * sentence is easier than that.
 *
 * Lite is still multimodal, so the same id reads a poster and writes a brief. A
 * town hall in a real pilot needs billing enabled on the project whichever model
 * this is; the free tier is for the demo (D-024).
 */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

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
      signal: AbortSignal.timeout(BRIEF_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: wasAborted(error) ? 'timed_out' : 'unreachable' };
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
  // A free tier answers 500, 502, 503 and 504 for "too many people are asking
  // right now", and it does it often enough to be worth its own message: the
  // answer is to press the button again in a minute, not to call somebody.
  if (status >= 500) return 'busy';
  if (status < 200 || status >= 300) return 'unknown';

  return null;
}

/**
 * How long a provider gets before we stop waiting.
 *
 * There is a hard ceiling above this that nothing here can raise: API Gateway
 * gives an integration 30 seconds and the poster function is set to 29, so a
 * call that runs past it does not come back as an error — the gateway times out
 * and the panel gets a 503 with no message in it. This budget keeps the failure
 * ours, with a sentence in Spanish attached to it.
 *
 * The two numbers are what the providers actually take: writing the brief is a
 * few seconds of a Flash model and has been seen at fourteen, drawing with FLUX
 * schnell at four steps is two or three. Both leave room inside the 29.
 */
export const BRIEF_TIMEOUT_MS = 18_000;
export const IMAGE_TIMEOUT_MS = 20_000;

/**
 * True when a fetch rejected because we stopped waiting, rather than because the
 * provider could not be reached. They are different things to tell somebody:
 * one means try again, the other means check the network.
 *
 * Both names, and the second one is the one that actually happens:
 * `AbortSignal.timeout` rejects with a `TimeoutError`, not an `AbortError` — its
 * reason is a TimeoutError by specification. Checking only for `AbortError`
 * reported the deadline running out as "no hemos podido conectar", which sends
 * somebody to look at their network over a provider that was simply slow. Seen
 * in the logs as an 18.2 second invocation answering `unreachable`.
 */
export function wasAborted(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
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
