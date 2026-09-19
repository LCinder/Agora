import { codeFor, drawPoster, messageFor, statusFor } from '@agora/poster';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Draws an event poster, in development.
 *
 * An adapter, like its sibling: the two-step work — a text model writes the visual
 * brief, an image model draws it — lives in `@agora/poster` and is shared with the
 * Lambda (D-041).
 *
 * Named `.dynamic.ts` because the credentials of both providers must never reach a
 * browser, so this cannot be part of the static export. See D-031.
 */
const requestSchema = z.object({
  description: z.string().min(3).max(2000),
  mode: z.enum(['background', 'complete']),
  // Every field has a default, so the whole object has one too: the panel sends
  // what it knows about the event, which early on is nothing.
  event: z
    .object({
      title: z.string().default(''),
      dateLabel: z.string().default(''),
      timeLabel: z.string().default(''),
      locationName: z.string().default(''),
      municipalityName: z.string().default(''),
    })
    .default({
      title: '',
      dateLabel: '',
      timeLabel: '',
      locationName: '',
      municipalityName: '',
    }),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Describe el cartel que quieres antes de dibujarlo.' },
      { status: 400 },
    );
  }

  const result = await drawPoster({
    geminiKey: process.env.GEMINI_API_KEY,
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    },
    ...parsed.data,
  });

  if (result.ok) return NextResponse.json(result.value);

  return NextResponse.json(
    { error: codeFor(result.failure), message: messageFor(result.failure, 'dibujar carteles') },
    { status: statusFor(result.failure) },
  );
}
