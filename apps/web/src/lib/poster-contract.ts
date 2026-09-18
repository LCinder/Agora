/**
 * The contract of the two poster endpoints, and where they live.
 *
 * It sits apart from the route handlers for two reasons. The components need
 * the types without importing a server file, and the handlers themselves are
 * temporary: they exist so the panel works with nothing but `next dev`, and in
 * phase 2 the same two endpoints are served by the poster Lambda (see
 * `infra/terraform/modules/api`). Pointing the panel at the real API is then
 * setting a build variable, not editing components.
 */

import { z } from 'zod';

export const posterReadingSchema = z.object({
  title: z.string(),
  description: z.string(),
  startDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  locationName: z.string(),
  isFree: z.boolean(),
  priceInfo: z.string(),
  organizerName: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type PosterReading = z.infer<typeof posterReadingSchema>;

export const posterBriefSchema = z.object({
  imagePrompt: z.string().min(1),
  altText: z.string(),
});

export type PosterBrief = z.infer<typeof posterBriefSchema>;

export type PosterDrawing = PosterBrief & {
  image: { mimeType: string; data: string };
};

/**
 * Base URL of the poster endpoints.
 *
 * Empty in development, where the panel's own route handlers answer under
 * `/api`. In the static export it is the HTTP API, injected at build time as
 * `NEXT_PUBLIC_POSTER_API_BASE` — a public variable because it is a hostname,
 * not a secret: the keys stay in Parameter Store, on the Lambda's side.
 */
const BASE = process.env.NEXT_PUBLIC_POSTER_API_BASE ?? '';

/** Where to POST a poster to be read, or a description to be drawn. */
export function posterEndpoint(what: 'read' | 'draw'): string {
  const path = what === 'read' ? '/poster' : '/poster/generate';

  return BASE === '' ? `/api${path}` : `${BASE.replace(/\/$/, '')}${path}`;
}
