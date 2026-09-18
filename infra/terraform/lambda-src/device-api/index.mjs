/**
 * Registers a device and stores its interests. The only thing a resident
 * writes, and the only place their anonymous token is minted.
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
