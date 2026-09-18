import { handle, notImplemented } from '../lib/http';
import type { ApiEvent, ApiResult } from '../lib/http';

/**
 * The poster, both ways round: reading one and drawing one.
 *
 * Still a placeholder. The logic exists in the panel, in
 * `apps/web/src/lib/gemini.ts` and the two `route.dynamic.ts` handlers beside
 * it, and this is where it moves so that the panel can be a static export: a
 * browser cannot hold the credentials of Gemini or Cloudflare (D-031).
 *
 * The parameter names it will read are already provisioned: GEMINI_PARAMETER,
 * CLOUDFLARE_ACCOUNT_PARAMETER and CLOUDFLARE_API_TOKEN_PARAMETER.
 */
export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    console.log(JSON.stringify({ route: event.routeKey }));

    return notImplemented('El lector de carteles');
  });
