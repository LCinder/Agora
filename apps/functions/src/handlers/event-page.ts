import { handle, notImplemented } from '../lib/http';
import type { ApiEvent, ApiResult } from '../lib/http';

/**
 * The public page of an event: the one thing here that renders HTML.
 *
 * Still a placeholder. It exists for the Open Graph tags that turn a link shared
 * on WhatsApp into a card with the title, the date and the town, which is the
 * product's growth loop rather than polish. The panel renders the same page
 * today from the seed files (`apps/web/src/app/e/[slug]/[id]/page.dynamic.tsx`),
 * and that is the code that moves here.
 */
export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  handle(event, async () => {
    console.log(JSON.stringify({ path: event.rawPath }));

    return notImplemented('La página pública de evento');
  });
