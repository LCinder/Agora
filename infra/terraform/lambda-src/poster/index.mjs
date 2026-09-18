/**
 * The poster, both ways round: reads one with Gemini and returns the fields for
 * a person to confirm, or turns a description into a drawing with Cloudflare
 * Workers AI. Touches no table and publishes nothing.
 *
 * The logic already exists in the panel, in `apps/web/src/lib/gemini.ts` and
 * the two `route.dynamic.ts` handlers next to it. Moving it here is what makes
 * the panel a static export: a browser cannot hold these credentials.
 *
 * Placeholder. The infrastructure is real; this handler is not yet. Replaced
 * when the API is written, and answering honestly until then rather than
 * pretending to work.
 */
export const handler = async (event) => {
  console.log(
    JSON.stringify({
      route: event.routeKey ?? event.rawPath,
      method: event.requestContext?.http?.method,
    }),
  );

  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      error: 'not_implemented',
      message: 'Este endpoint todavia no esta implementado.',
      environment: process.env.ENVIRONMENT,
    }),
  };
};
