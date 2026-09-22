import { createStoreClient, createPublicStore } from '@agora/store';
import { AlreadyAMember, NoSuchMunicipality, addAdministrator } from '@agora/store/onboarding';

import { ensureAccount } from './cognito';
import { awsFrom } from './aws';
import { explain } from './aws-errors';

/**
 * Gives an existing municipality its first person.
 *
 * `create-municipality` makes a town hall and its administrator together, which
 * is right when we are setting one up from nothing. But municipalities also
 * arrive through `migrate-seed`, which loads the towns under `content/` — and
 * those arrive with a full calendar and **nobody who can open the panel for
 * them**. La Zubia is the town the product is demonstrated with, so that gap is
 * the difference between having a demo and not.
 *
 *     pnpm --filter @agora/tools add-admin -- \
 *       --table agora-dev --user-pool eu-central-1_XXXX \
 *       --municipality la-zubia \
 *       --email tecnico@lazubia.es --name "Marta Ruiz"
 *
 * Add `--dry-run` to check everything and write nothing, which is what you do
 * first. The output is in English because the only person who reads it is
 * whoever ran it.
 */
interface Arguments {
  table: string | null;
  region: string;
  profile: string | null;
  endpoint: string | null;
  userPool: string | null;
  municipality: string | null;
  email: string | null;
  fullName: string | null;
  dryRun: boolean;
  help: boolean;
}

const VALUE_FLAGS = new Set([
  '--table',
  '--region',
  '--profile',
  '--endpoint',
  '--user-pool',
  '--municipality',
  '--email',
  '--name',
]);

function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {
    table: null,
    region: 'eu-central-1',
    profile: null,
    endpoint: null,
    userPool: null,
    municipality: null,
    email: null,
    fullName: null,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (flag === '--help' || flag === '-h') {
      parsed.help = true;
      continue;
    }

    if (flag === undefined || !VALUE_FLAGS.has(flag)) continue;

    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} needs a value.`);
    }

    index += 1;

    switch (flag) {
      case '--table':
        parsed.table = value;
        break;
      case '--region':
        parsed.region = value;
        break;
      case '--profile':
        parsed.profile = value;
        break;
      case '--endpoint':
        parsed.endpoint = value;
        break;
      case '--user-pool':
        parsed.userPool = value;
        break;
      case '--municipality':
        parsed.municipality = value;
        break;
      case '--email':
        parsed.email = value;
        break;
      case '--name':
        parsed.fullName = value;
        break;
    }
  }

  return parsed;
}

const HELP = `
Gives a municipality that already exists its first administrator.

  --table          DynamoDB table, for example agora-dev            (required)
  --user-pool      Cognito user pool id                             (required)
  --municipality   Slug or id of the municipality, e.g. la-zubia    (required)
  --email          The person's email, which is how they sign in    (required)
  --name           Their name, for the panel
  --region         Defaults to eu-central-1
  --profile        AWS profile. Beats the environment. Default: AWS_PROFILE, or .env
  --endpoint       For DynamoDB Local
  --dry-run        Check everything, write nothing

There is deliberately no default table: naming it every time is what stops this
from landing in production by accident.
`.trim();

function missing(args: Arguments): string[] {
  const required: [string, unknown][] = [
    ['--table', args.table],
    ['--user-pool', args.userPool],
    ['--municipality', args.municipality],
    ['--email', args.email],
  ];

  return required.filter(([, value]) => value === null).map(([flag]) => flag);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  const absent = missing(args);

  if (absent.length > 0) {
    console.error(`Missing: ${absent.join(', ')}\n`);
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  const { credentials } = await awsFrom(args.profile);

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
    // A named profile wins outright: an expired token in the environment cannot
    // quietly take its place. See `aws.ts`.
    ...(credentials === undefined ? {} : { credentials }),
  });

  // A person thinks in slugs, because that is what the shared link and the QR
  // carry. Ids are ours. Resolve one to the other rather than making whoever
  // runs this go and look it up.
  const bySlug = await createPublicStore(client, args.table!).getMunicipalityBySlug(
    args.municipality!,
  );
  const municipalityId = bySlug?.id ?? args.municipality!;

  console.log(`Table:        ${args.table!}`);
  console.log(`Municipality: ${bySlug ? `${bySlug.name} (${municipalityId})` : municipalityId}`);
  console.log(`Person:       ${args.email!}`);
  console.log(args.dryRun ? 'Mode:         dry run, nothing is written\n' : '');

  try {
    const account = await ensureAccount(
      args.userPool!,
      args.email!,
      args.fullName,
      args.dryRun,
      credentials,
    );

    await addAdministrator(
      client,
      args.table!,
      municipalityId,
      {
        authUserId: account.authUserId,
        email: args.email!,
        ...(args.fullName === null ? {} : { fullName: args.fullName }),
      },
      {
        dryRun: args.dryRun,
        onProgress: (what) => {
          console.log(`  ${what}`);
        },
      },
    );

    if (args.dryRun) {
      console.log('\nNothing was written.');
      return;
    }

    console.log('');
    console.log(
      account.created
        ? `Cognito emailed ${args.email!} a temporary password. The panel asks for a real one on the first sign-in.`
        : `${args.email!} already had an account; only the membership was added.`,
    );
  } catch (error) {
    if (error instanceof NoSuchMunicipality) {
      console.error(`\n${error.message}`);
      console.error('Load it first:  pnpm --filter @agora/tools migrate-seed -- --table <table>');
      process.exitCode = 1;
      return;
    }

    if (error instanceof AlreadyAMember) {
      // Not an error worth a stack trace: somebody ran it twice, and the state
      // they wanted is the state there is.
      console.error(`\n${error.message}`);
      console.error('Change what they can do from the panel, under Usuarios.');
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

// Not top-level await: the bundle is CommonJS, because the AWS SDK is, and
// esbuild refuses one in the other.
main().catch((error: unknown) => {
  console.error(explain(error));
  process.exitCode = 1;
});
