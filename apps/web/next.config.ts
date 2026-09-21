import type { NextConfig } from 'next';

/**
 * Two builds out of one app.
 *
 * `next build` is the development and demo build: everything is there,
 * including the two parts that need a server — the poster endpoints and the
 * public event page.
 *
 * `PANEL_STATIC_EXPORT=1 next build` is the build that goes to S3. The panel
 * itself is client components from top to bottom, so it exports to plain files
 * and costs nothing to serve; the parts that need a server are left out,
 * because in phase 2 they are Lambdas behind the same CloudFront
 * distribution (`/poster*` on the HTTP API, `/e/*` on its own function).
 *
 * The mechanism is `pageExtensions`: a file is only a route if its extension is
 * in that list, so naming those files `.dynamic.ts(x)` and dropping the
 * extension from the export build removes them from it and from nothing else.
 * It beats the alternatives — a second Next app duplicates the config, and a
 * script that moves folders aside before building is a build that behaves
 * differently from the one you can run by hand. See D-031.
 */
const staticExport = process.env.PANEL_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  ...(staticExport ? { output: 'export' as const } : {}),

  // Order matters: the longer extension has to be tried first, or `page.tsx`
  // would win the match for `page.dynamic.tsx`.
  pageExtensions: staticExport ? ['tsx', 'ts'] : ['dynamic.tsx', 'dynamic.ts', 'tsx', 'ts'],

  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ['@agora/core', '@agora/data', '@agora/i18n', '@agora/poster'],
  // Next drops its own CLAUDE.md and AGENTS.md into this folder on every dev
  // run. The project already has one at the root, and a second, untracked
  // copy inside the panel is just something waiting to be committed by
  // accident.
  agentRules: false,
};

export default nextConfig;
