import type { ApiEvent, ApiResult } from './http';

/**
 * The routing the HTTP API does not do for us.
 *
 * The panel is one route in API Gateway — `ANY /panel/{proxy+}` — because the
 * alternative is forty route declarations in Terraform that have to be kept in
 * step with the code by hand. The cost is this file: about fifty lines that turn
 * a method and a path into a handler and its parameters.
 *
 * A pattern is written the way the path reads, with `:name` for the parts that
 * vary: `municipalities/:municipalityId/events/:eventId/approve`. No regular
 * expressions, no wildcards, no optional segments — every route this API has is
 * a fixed number of literal and named segments, and anything cleverer would be
 * cleverness nobody asked for.
 */
export interface Route<Context> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: string;
  run: (parameters: Record<string, string>, context: Context) => Promise<ApiResult>;
}

export interface Match<Context> {
  route: Route<Context>;
  parameters: Record<string, string>;
}

/** The path below the prefix API Gateway matched, with no leading or trailing slash. */
export function routedPath(event: ApiEvent, prefix: string): string {
  const proxy = event.pathParameters?.['proxy'];
  const raw = proxy ?? event.rawPath.replace(new RegExp(`^/*${prefix}/*`), '');

  return raw.replace(/^\/+|\/+$/g, '');
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split('/');
  const actual = path.split('/');

  if (expected.length !== actual.length) return null;

  const parameters: Record<string, string> = {};

  for (const [index, segment] of expected.entries()) {
    const given = actual[index];

    if (given === undefined || given === '') return null;

    if (segment.startsWith(':')) {
      parameters[segment.slice(1)] = decodeURIComponent(given);
      continue;
    }

    if (segment !== given) return null;
  }

  return parameters;
}

export function matchRoute<Context>(
  routes: readonly Route<Context>[],
  method: string,
  path: string,
): Match<Context> | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const parameters = matchPattern(route.pattern, path);

    if (parameters !== null) return { route, parameters };
  }

  return null;
}

/**
 * Whether a path exists under another method.
 *
 * Worth the extra loop: a 405 tells whoever is writing the panel that they used
 * the wrong verb, and a 404 sends them looking for a route that is right there.
 */
export function pathExists<Context>(routes: readonly Route<Context>[], path: string): boolean {
  return routes.some((route) => matchPattern(route.pattern, path) !== null);
}
