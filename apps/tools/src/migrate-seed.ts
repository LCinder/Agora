import { createSeedDataSource } from '@agora/data';
import { type MunicipalityBundle, createStoreClient, migrateSeed } from '@agora/store';
import { awsFrom } from './aws';
import { explain } from './aws-errors';

/**
 * Loads the municipalities under `content/` into a DynamoDB table.
 *
 * This is how a town hall is set up, and for now it is the only way anything at
 * all gets into the table: the panel cannot write yet.
 *
 * It bundles with esbuild rather than running the TypeScript directly, because
 * the seed files are JSON imports and Node will not take those without a
 * bundler. The bundle is CommonJS because the AWS SDK is: bundling it into an
 * ESM file breaks its own `require` calls at load time.
 *
 *     pnpm --filter @agora/tools migrate-seed -- --table agora-dev
 *     pnpm --filter @agora/tools migrate-seed -- --table agora-dev --dry-run
 *     pnpm --filter @agora/tools migrate-seed -- --table agora-local \
 *       --endpoint http://127.0.0.1:8000
 *
 * The output is in English because the only person who reads it is whoever ran
 * it. Everything a neighbour or a municipal officer sees is in Spanish.
 */
interface Arguments {
  table: string | null;
  region: string;
  profile: string | null;
  endpoint: string | null;
  municipality: string | null;
  dryRun: boolean;
  help: boolean;
}

function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {
    table: null,
    region: 'eu-central-1',
    profile: null,
    endpoint: null,
    municipality: null,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    // `pnpm run migrate-seed -- --table x` forwards the separator as an
    // argument. Ignoring it is friendlier than telling the caller off for
    // typing what pnpm's own documentation tells them to type.
    if (flag === '--') continue;

    switch (flag) {
      case '--table':
      case '--region':
      case '--endpoint':
      case '--municipality':
        if (value === undefined || value.startsWith('--')) {
          throw new Error(`${flag} needs a value.`);
        }

        if (flag === '--table') parsed.table = value;
        if (flag === '--region') parsed.region = value;
        if (flag === '--endpoint') parsed.endpoint = value;
        if (flag === '--municipality') parsed.municipality = value;
        index += 1;
        break;

      case '--dry-run':
        parsed.dryRun = true;
        break;

      case '--help':
      case '-h':
        parsed.help = true;
        break;

      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return parsed;
}

const USAGE = `
Loads the municipalities under content/ into a DynamoDB table.

  --table <name>          Required. The table to write to, e.g. agora-dev.
  --region <name>         AWS region. Default: eu-central-1.
  --endpoint <url>        For DynamoDB Local, e.g. http://127.0.0.1:8000.
  --municipality <slug>   Only this one. Default: all of them.
  --dry-run               Count what would be written, write nothing.
  -h, --help              This.

There is deliberately no default table: naming it every time is what stops a
seed load from landing in production by accident.
`.trim();

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.table === null) {
    console.error('Missing --table. Run with --help.');
    process.exitCode = 1;
    return;
  }

  const source = createSeedDataSource();
  const summaries = await source.listMunicipalities();
  const wanted =
    args.municipality === null
      ? summaries
      : summaries.filter((town) => town.slug === args.municipality);

  if (wanted.length === 0) {
    console.error(
      `No municipality with slug "${args.municipality ?? ''}" in content/. Available: ${summaries
        .map((town) => town.slug)
        .join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const bundles: MunicipalityBundle[] = [];

  for (const summary of wanted) {
    const municipality = await source.getMunicipalityBySlug(summary.slug);

    if (municipality === null) continue;

    bundles.push({
      municipality,
      categories: await source.listCategories(municipality.id),
      organizations: await source.listOrganizations(municipality.id),
      events: await source.listEvents(municipality.id),
      activities: await source.listActivities(municipality.id),
    });
  }

  console.log(
    [
      `Table:    ${args.table}`,
      `Region:   ${args.region}`,
      `Endpoint: ${args.endpoint ?? 'default (real AWS)'}`,
      `Towns:    ${bundles.map((bundle) => bundle.municipality.slug).join(', ')}`,
      args.dryRun ? 'Mode:     dry run, nothing is written' : 'Mode:     writing',
      '',
    ].join('\n'),
  );

  const { credentials } = await awsFrom(args.profile);

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
    // A named profile wins outright: an expired token in the environment cannot
    // quietly take its place. See `aws.ts`.
    ...(credentials === undefined ? {} : { credentials }),
  });

  const result = await migrateSeed(client, args.table, bundles, {
    dryRun: args.dryRun,
    onProgress: (what) => {
      console.log(`  ${what}`);
    },
  });

  console.log(
    [
      '',
      `Municipalities: ${result.municipalities}`,
      `Categories:     ${result.categories}`,
      `Organizations:  ${result.organizations}`,
      `Events:         ${result.events}`,
      `Activities:     ${result.activities}`,
      '',
      // Worth saying out loud: the seed calendar is written relative to today,
      // so what lands in the table is a snapshot taken on the day this ran.
      'Seed events are anchored to the day this ran, because the demo keeps its',
      'calendar around today. Re-run it to move them, which is safe: interest',
      'counts are preserved.',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  console.error(explain(error));
  process.exitCode = 1;
});
