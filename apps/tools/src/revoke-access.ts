import { createMembershipStore, createPublicStore, createStoreClient } from '@agora/store';

import { awsFrom } from './aws';
import { explain } from './aws-errors';
import { deleteAccount, findAccount } from './cognito';

/**
 * Taking access away, which is the other half of `grant-access`.
 *
 * It was missing on purpose and that was the wrong call. Granting could be done
 * to eleven towns in one command and taking it back meant walking the panel town
 * by town, and a pair of tools that is easy in one direction and tedious in the
 * other is a pair somebody stops using in the tedious direction. Access that is
 * a chore to remove is access that quietly stays.
 *
 *     # Everywhere, in one go
 *     pnpm --filter @agora/tools revoke-access -- --table agora-dev \
 *       --email quien@sea.es --all --yes
 *
 *     # One town
 *     pnpm --filter @agora/tools revoke-access -- --table agora-dev \
 *       --email quien@sea.es --municipality cajar
 *
 *     # And the account itself, once it opens nothing
 *     pnpm --filter @agora/tools revoke-access -- --table agora-dev \
 *       --user-pool eu-central-1_XXXX --email quien@sea.es --all --delete-account --yes
 *
 * Three things it refuses to do quietly, because this is the command that can
 * lock people out:
 *
 *   * `--email` is never optional and never defaults to the platform list. The
 *     one command that could remove everybody from everywhere should not be able
 *     to do it by being run with no arguments.
 *   * `--all` needs `--yes`. On its own it prints what it would do and stops.
 *   * Leaving a municipality with no administrator at all is reported loudly,
 *     because a town hall nobody can get into is a support call on a Saturday.
 *
 * The Cognito account is left alone unless `--delete-account` is given, and even
 * then only when no membership is left anywhere: an account with no memberships
 * opens nothing, so deleting it is tidying rather than security.
 */
interface Arguments {
  table: string | null;
  region: string;
  profile: string | null;
  endpoint: string | null;
  userPool: string | null;
  emails: string[];
  municipalities: string[];
  all: boolean;
  deleteAccount: boolean;
  yes: boolean;
  dryRun: boolean;
  help: boolean;
}

const VALUE_FLAGS = new Set([
  '--table',
  '--region',
  '--profile',
  '--endpoint',
  '--user-pool',
  '--email',
  '--municipality',
]);

function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {
    table: null,
    region: 'eu-central-1',
    profile: null,
    endpoint: null,
    userPool: null,
    emails: [],
    municipalities: [],
    all: false,
    deleteAccount: false,
    yes: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--') continue;

    if (flag === '--all') {
      parsed.all = true;
      continue;
    }

    if (flag === '--delete-account') {
      parsed.deleteAccount = true;
      continue;
    }

    if (flag === '--yes') {
      parsed.yes = true;
      continue;
    }

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
      case '--email':
        parsed.emails.push(value);
        break;
      case '--municipality':
        parsed.municipalities.push(value);
        break;
    }
  }

  return parsed;
}

const HELP = `
Takes access away. The other half of grant-access.

  --table <name>            DynamoDB table, e.g. agora-dev              (required)
  --email <address>         Whose access. Repeat for several            (required)

  --all                     Every municipality. Needs --yes to actually do it
  --municipality <slug|id>  One municipality. Repeat for several

  --delete-account          Also delete the Cognito account, if nothing is left.
                            Needs --user-pool
  --user-pool <id>          Cognito user pool
  --yes                     Confirm a --all run
  --dry-run                 Say what it would do, write nothing
  --region <region>         Defaults to eu-central-1
  --profile <name>          AWS profile. Beats the environment.
                            Default: AWS_PROFILE, or .env at the root
  --endpoint <url>          For DynamoDB Local

There is no default for --email on purpose: the one command that could remove
everybody from everywhere should not be able to do it by being run bare.
`.trim();

interface Town {
  id: string;
  slug: string;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  // Everything answerable without AWS, before AWS.
  const missing: string[] = [];

  if (args.table === null) missing.push('--table');
  if (args.emails.length === 0) missing.push('--email');
  if (!args.all && args.municipalities.length === 0) missing.push('--all or --municipality');
  if (args.deleteAccount && args.userPool === null)
    missing.push('--user-pool (for --delete-account)');

  if (missing.length > 0) {
    console.error(`Missing ${missing.join(', ')}.\n`);
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  const { credentials } = await awsFrom(args.profile);

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
    ...(credentials === undefined ? {} : { credentials }),
  });

  const towns: Town[] = (await createPublicStore(client, args.table!).listMunicipalities()).map(
    (town) => ({ id: town.id, slug: town.slug }),
  );

  let wanted: Town[];

  if (args.all) {
    wanted = towns;
  } else {
    wanted = [];

    for (const name of args.municipalities) {
      const town = towns.find((entry) => entry.id === name || entry.slug === name);

      if (town === undefined) {
        console.error(
          `No municipality called ${name}. Known: ${towns.map((t) => t.slug).join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      wanted.push(town);
    }
  }

  const memberships = createMembershipStore(client, args.table!);

  // What is actually there, before anything is removed. Printing the plan from
  // the real rows rather than from the arguments is what makes --dry-run worth
  // running: it shows what will happen, not what was asked for.
  const plan: { email: string; authUserId: string; slug: string; townId: string }[] = [];
  const leftBehind = new Map<string, number>();

  for (const town of wanted) {
    const actor = {
      authUserId: 'cli',
      municipalityId: town.id,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    const members = await memberships.listForMunicipality(actor);
    const going = members.filter((member) => args.emails.includes(member.email));

    for (const member of going) {
      plan.push({
        email: member.email,
        authUserId: member.authUserId,
        slug: town.slug,
        townId: town.id,
      });
    }

    const remaining = members.filter(
      (member) => !args.emails.includes(member.email) && member.role === 'municipal_admin',
    );

    if (going.length > 0 && remaining.length === 0) leftBehind.set(town.slug, members.length);
  }

  if (plan.length === 0) {
    console.log(
      `${args.emails.join(', ')} has no access to ${wanted.map((t) => t.slug).join(', ')}.`,
    );
    return;
  }

  console.log(`Table: ${args.table!}`);
  console.log('');

  for (const entry of plan) {
    console.log(`  remove ${entry.email} from ${entry.slug}`);
  }

  for (const [slug, members] of leftBehind) {
    console.log('');
    console.log(
      `  WARNING: ${slug} would be left with no administrator${members === 1 ? ' and nobody at all' : ''}.`,
    );
  }

  if (args.dryRun) {
    console.log('');
    console.log('Dry run. Nothing was written.');
    return;
  }

  if (args.all && !args.yes) {
    console.log('');
    console.log('This is every municipality. Run it again with --yes if that is what you want.');
    process.exitCode = 1;
    return;
  }

  console.log('');

  for (const entry of plan) {
    // As an administrator of that municipality, which is what the panel does —
    // the same path, so the same two rows come out together.
    const actor = {
      authUserId: 'cli',
      municipalityId: entry.townId,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    await memberships.revoke(actor, entry.authUserId);
  }

  console.log(`Removed ${plan.length}.`);

  if (!args.deleteAccount) return;

  for (const email of new Set(plan.map((entry) => entry.email))) {
    const account = await findAccount(args.userPool!, email, credentials);

    if (account === null) continue;

    const left = await memberships.listForUser(account.authUserId);

    if (left.length > 0) {
      console.log(
        `Kept the account of ${email}: still has access to ${left.map((m) => m.municipalityId).join(', ')}.`,
      );
      continue;
    }

    await deleteAccount(args.userPool!, email, credentials);
    console.log(`Deleted the account of ${email}.`);
  }
}

main().catch((error: unknown) => {
  console.error(explain(error));
  process.exitCode = 1;
});
