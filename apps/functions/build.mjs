import { readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/**
 * Bundles one directory per Lambda, which is what Terraform zips.
 *
 * The handlers used to be loose `.mjs` files that Terraform zipped as they were.
 * That was fine while they answered 501 and nothing else, and impossible once
 * they needed `@agora/store`: a Lambda cannot import TypeScript from a workspace
 * package. So they are bundled here, and `infra/terraform` points at `dist/`.
 *
 * Nothing is marked external, including the AWS SDK. The Node 22 runtime does
 * ship the v3 SDK, and leaving it out would take the functions that use it from
 * about two megabytes to a few kilobytes — but it would also mean the
 * code runs against whichever SDK version AWS happens to ship that month, and
 * `instanceof` checks across two copies of the same client fail in ways that
 * take an afternoon to understand. Two megabytes is under half a megabyte zipped
 * and well inside the limits, so it is the cheaper side of that trade.
 *
 * The functions that do not touch the table stay small, and that is worth
 * keeping: it only holds because `lib/http.ts` imports the error class from
 * `@agora/store/errors` rather than from the package root.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'src/handlers');
const out = join(here, 'dist');

await rm(out, { recursive: true, force: true });

const handlers = (await readdir(source))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .map((file) => file.replace(/\.ts$/, ''));

if (handlers.length === 0) {
  throw new Error('No handlers found in src/handlers.');
}

await Promise.all(
  handlers.map((name) =>
    build({
      entryPoints: [join(source, `${name}.ts`)],
      outfile: join(out, name, 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      // Nothing is minified, so the bundled output reads like the source and a
      // CloudWatch stack trace lands somewhere useful without a source map. An
      // inline map would double the size of every zip to say the same thing.
      sourcemap: false,
      minify: false,
      // Lambda loads `index.mjs` and calls `handler`, which is what every file
      // in src/handlers exports.
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
      },
      logLevel: 'warning',
    }),
  ),
);

console.log(`Bundled ${handlers.length} functions into dist/: ${handlers.join(', ')}`);
