import {
  MAX_IMAGE_BYTES,
  type PosterResult,
  codeFor,
  drawPoster,
  isAcceptedImageType,
  messageFor,
  readPoster,
  statusFor,
} from '@agora/poster';
import { z } from 'zod';

import {
  type ApiEvent,
  type ApiResult,
  badRequest,
  error,
  handle,
  json,
  notFound,
  ok,
} from '../lib/http';
import { definedOnly } from '../lib/json';
import { readSecret } from '../lib/secrets';

/**
 * The poster, both ways round: reading one and drawing one.
 *
 * All the thinking is in `@agora/poster`, which the panel's own route handlers
 * also use, so there is one implementation and not two (D-041). What is left here
 * is what only the cloud needs: getting the credentials out of Parameter Store,
 * and turning a multipart upload into bytes.
 *
 * This is also the reason the panel can be a static export: a browser cannot hold
 * these keys.
 */
const drawRequestSchema = z.object({
  description: z.string().min(3).max(2000),

  event: z
    .object({
      title: z.string().optional(),
      dateLabel: z.string().optional(),
      timeLabel: z.string().optional(),
      locationName: z.string().optional(),
      municipalityName: z.string().optional(),
    })
    .default({}),
});

/** The same answer shape both providers' failures end up in. */
function failed(result: Extract<PosterResult<never>, { ok: false }>, what: string): ApiResult {
  return json(statusFor(result.failure), {
    error: codeFor(result.failure),
    message: messageFor(result.failure, what),
  });
}

interface Credentials {
  geminiKey: string | undefined;
  cloudflare: { accountId: string | undefined; apiToken: string | undefined };
}

/**
 * The image out of the request.
 *
 * API Gateway hands a binary body as base64, which is exactly the encoding the
 * model wants, so there is nothing to decode: a JSON body with the image inline is
 * the simplest thing that works from a browser and from a phone.
 */
const imageRequestSchema = z.object({
  mimeType: z.string().min(1),
  /** Base64, without the `data:` prefix. */
  data: z.string().min(1),
});

export async function route(event: ApiEvent, credentials: Credentials): Promise<ApiResult> {
  const path = event.rawPath.replace(/^\/+|\/+$/g, '');
  const method = event.requestContext?.http?.method ?? 'POST';

  if (method !== 'POST') {
    return error(405, 'method_not_allowed', 'Los carteles se piden con POST.');
  }

  let body: unknown;

  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('El cuerpo tiene que ser JSON.');
  }

  if (path === 'poster') {
    const parsed = imageRequestSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest('Envía el cartel como { mimeType, data } en base64.');
    }

    if (!isAcceptedImageType(parsed.data.mimeType)) {
      return json(415, {
        error: 'unsupported_type',
        message: 'Sube una imagen del cartel en JPG, PNG, WEBP o GIF.',
      });
    }

    // The base64 length gives the byte count without decoding it.
    if (Math.floor((parsed.data.data.length * 3) / 4) > MAX_IMAGE_BYTES) {
      return json(413, {
        error: 'too_large',
        message: 'El cartel es demasiado grande. Máximo 8 MB.',
      });
    }

    const result = await readPoster({
      geminiKey: credentials.geminiKey,
      image: { data: parsed.data.data, mimeType: parsed.data.mimeType },
    });

    return result.ok ? ok(result.value) : failed(result, 'leer carteles');
  }

  if (path === 'poster/generate') {
    const parsed = drawRequestSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest('Describe el cartel que quieres antes de dibujarlo.');
    }

    const result = await drawPoster({
      ...credentials,
      ...parsed.data,
      // The fields of the subject are optional, and "absent" is not the same as
      // "present and undefined" here either.
      event: definedOnly(parsed.data.event),
    });

    return result.ok ? ok(result.value) : failed(result, 'dibujar carteles');
  }

  return notFound('Esa ruta no existe.');
}

/** Read once per container: see `lib/secrets.ts`. */
async function credentialsFromEnvironment(): Promise<Credentials> {
  const name = (variable: string): string | undefined => {
    const value = process.env[variable];

    return value === undefined || value === '' ? undefined : value;
  };

  const parameters = {
    gemini: name('GEMINI_PARAMETER'),
    account: name('CLOUDFLARE_ACCOUNT_PARAMETER'),
    token: name('CLOUDFLARE_API_TOKEN_PARAMETER'),
  };

  const read = async (parameter: string | undefined): Promise<string | undefined> =>
    parameter === undefined ? undefined : readSecret(parameter);

  return {
    geminiKey: await read(parameters.gemini),
    cloudflare: {
      accountId: await read(parameters.account),
      apiToken: await read(parameters.token),
    },
  };
}

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => route(event, await credentialsFromEnvironment()));
