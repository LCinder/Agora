import {
  MAX_IMAGE_BYTES,
  codeFor,
  isAcceptedImageType,
  messageFor,
  readPoster,
  statusFor,
} from '@agora/poster';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Reads an event poster, in development.
 *
 * An adapter and nothing else: the work is in `@agora/poster`, which the poster
 * Lambda also uses, so there is one implementation of it and not two (D-041).
 * This exists so the panel works with nothing but `next dev` and a key in
 * `.env.local`.
 *
 * Named `.dynamic.ts` because it needs a server: the static export of the panel
 * leaves it out, and in the cloud the Lambda answers the same path. See D-031.
 */
const imageSchema = z.object({
  mimeType: z.string().min(1),
  /** Base64, without the `data:` prefix. */
  data: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = imageSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'missing_file', message: 'No se ha recibido ningún cartel.' },
      { status: 400 },
    );
  }

  const { mimeType, data } = parsed.data;

  if (!isAcceptedImageType(mimeType)) {
    return NextResponse.json(
      { error: 'unsupported_type', message: 'Sube una imagen del cartel en JPG, PNG, WEBP o GIF.' },
      { status: 415 },
    );
  }

  if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'El cartel es demasiado grande. Máximo 6 MB.' },
      { status: 413 },
    );
  }

  const result = await readPoster({
    geminiKey: process.env.GEMINI_API_KEY,
    image: { data, mimeType },
  });

  if (result.ok) return NextResponse.json(result.value);

  return NextResponse.json(
    { error: codeFor(result.failure), message: messageFor(result.failure, 'leer carteles') },
    { status: statusFor(result.failure) },
  );
}
