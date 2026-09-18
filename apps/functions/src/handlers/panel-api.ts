import { handle, notImplemented } from '../lib/http';
import type { ApiEvent, ApiResult } from '../lib/http';

/**
 * Everything the town hall and the associations do.
 *
 * Still a placeholder, and honest about it. The layer it will sit on already
 * exists and is tested: `createStaffStore` in `@agora/store` holds the rules —
 * an association cannot publish, cannot approve, cannot touch another
 * association — and this handler's job is routing, validation and turning a
 * Cognito `sub` into the membership row that says which municipality the caller
 * belongs to.
 */
export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    console.log(
      JSON.stringify({ route: event.routeKey, method: event.requestContext?.http?.method }),
    );

    return notImplemented('El panel');
  });
