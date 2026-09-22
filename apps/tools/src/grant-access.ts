import { createPublicStore, createStoreClient } from '@agora/store';
import { AlreadyAMember, NoSuchMunicipality, addAdministrator } from '@agora/store/onboarding';

import { ensureAccount } from './cognito';
import { environmentOf, platformAdmins, platformAdminsParameter } from './platform-admins';

/**
 * Who can get into which town hall's panel, from one place.
 *
 * `create-municipality` already grants the platform list a membership in every
 * town it creates, so the ordinary day needs nothing from this. What it does not
 * cover is everything that happened before: a municipality that arrived through
 * the seed, a town created while somebody was not yet on the list, and the day a
 * third person joins and needs the eleven towns that already exist.
 *
 * Those are all the same job — reconcile people against municipalities — and
 * doing it by hand is a `for` loop somebody writes wrong at eleven at night.
 *
 *     # The people in Parameter Store, in every municipality there is
 *     pnpm --filter @agora/tools access -- --table agora-dev \
 *       --user-pool eu-central-1_XXXX --all
 *
 *     # One person, two towns
 *     pnpm --filter @agora/tools access -- --table agora-dev \
 *       --user-pool eu-central-1_XXXX \
 *       --email nuevo@ejemplo.es --municipality la-zubia --municipality armilla
 *
 *     # Who has access to what, changing nothing
 *     pnpm --filter @agora/tools grant-access -- --table agora-dev --list
 *
 * What it writes are ordinary memberships, the same rows the panel writes when a
 * town hall invites somebody: `municipal_admin`, one row per person per
 * municipality, auditable and revocable one town at a time. There is deliberately
 * no `--revoke` here — taking access away is a different verb with a different
 * blast radius, and the panel already does it for one person in one town.
 *
 * Named `grant-access` and not `access`, which is what it wanted to be called:
 * pnpm has a built-in command by that name and it wins.
 *
 * The output is in English because the only person who reads it is whoever ran
 * it.
 */
interface Arguments {
  table: string | null;
  region: string;
  endpoint: string | null;
  userPool: string | null;
  emails: string[];
  municipalities: string[];
  all: boolean;
  list: boolean;
  dryRun: boolean;
  help: boolean;
}

const VALUE_FLAGS = new Set([
  '--table',
  '--region',
  '--endpoint',
  '--user-pool',
  '--email',
  '--municipality',
]);

function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {
    table: null,
    region: 'eu-central-1',
    endpoint: null,
    userPool: null,
    emails: [],
    municipalities: [],
    all: false,
    list: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    // pnpm's own documentation tells people to write it, so swallowing it is
    // kinder than telling them off.
    if (flag === '--') continue;

    if (flag === '--all') {
      parsed.all = true;
      continue;
    }

    if (flag === '--list') {
      parsed.list = true;
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
      case '--endpoint':
        parsed.endpoint = value;
        break;
      case '--user-pool':
        parsed.userPool = value;
        break;
      // Repeatable, both of them: naming three towns is three flags, which reads
      // better in a shell than a comma separated list somebody has to quote.
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
Gives people access to municipalities, and says who has it.

  --table <name>            DynamoDB table, e.g. agora-dev              (required)
  --user-pool <id>          Cognito user pool  (required unless --list)

  --all                     Every municipality in the table
  --municipality <slug|id>  One municipality. Repeat for several
  --email <address>         One person. Repeat for several.
                            Default: whoever is in /agora-<env>/platform-admins

  --list                    Print who has access to what and change nothing
  --dry-run                 Say what it would do, write nothing
  --region <region>         Defaults to eu-central-1
  --endpoint <url>          For DynamoDB Local

Everyone granted here becomes a municipal administrator of that municipality.
There is no --revoke: the panel takes access away one person at a time, which is
how a decision like that should be made.
`.trim();

interface Town {
  id: string;
  slug: string;
  name: string;
}

/** Resolves what somebody typed — a slug or an id — against the real towns. */
function resolve(wanted: string, towns: readonly Town[]): Town | null {
  return towns.find((town) => town.id === wanted || town.slug === wanted) ?? null;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.table === null) {
    console.error('Missing --table.\n');
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  // Everything that can be answered without AWS is answered before AWS is
  // touched. Otherwise a command missing an argument dials out, waits, and comes
  // back with a credentials error that has nothing to do with what was wrong.
  // That is exactly how this was first run.
  if (!args.list && !args.all && args.municipalities.length === 0) {
    console.error('Say where: --all, or --municipality <slug> one or more times.\n');
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  if (!args.list && args.userPool === null) {
    console.error('Missing --user-pool.\n');
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
  });

  const store = createPublicStore(client, args.table);
  const towns: Town[] = (await store.listMunicipalities()).map((town) => ({
    id: town.id,
    slug: town.slug,
    name: town.name,
  }));

  if (towns.length === 0) {
    console.error('There are no municipalities in that table.');
    process.exitCode = 1;
    return;
  }

  if (args.list) {
    await printAccess(args, towns);
    return;
  }

  // --- who ----------------------------------------------------------------
  const environment = environmentOf(args.table);
  const emails =
    args.emails.length > 0
      ? args.emails
      : environment === null
        ? []
        : await platformAdmins({ region: args.region, environment });

  if (emails.length === 0) {
    console.error(
      environment === null
        ? `No --email given, and the environment cannot be read from ${args.table}.`
        : `No --email given, and ${platformAdminsParameter(environment)} is empty.`,
    );
    process.exitCode = 1;
    return;
  }

  // --- where --------------------------------------------------------------
  let wanted: Town[];

  if (args.all) {
    wanted = towns;
  } else if (args.municipalities.length > 0) {
    wanted = [];

    for (const name of args.municipalities) {
      const town = resolve(name, towns);

      if (town === null) {
        console.error(
          `No municipality called ${name}. Known: ${towns.map((t) => t.slug).join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      wanted.push(town);
    }
  } else {
    // Unreachable: checked before AWS was touched. Here so the compiler knows
    // `wanted` is always assigned.
    return;
  }

  console.log(`Table:  ${args.table}`);
  console.log(`People: ${emails.join(', ')}`);
  console.log(`Towns:  ${wanted.map((town) => town.slug).join(', ')}`);
  console.log(args.dryRun ? 'Mode:   dry run, nothing is written\n' : '');

  let granted = 0;
  let already = 0;
  let failed = 0;

  for (const email of emails) {
    // Once per person rather than once per pair: the account is the same in all
    // of them, and asking Cognito eleven times for the same answer is eleven
    // round trips to learn nothing.
    // Checked before AWS was touched, at the top of main.
    const account = await ensureAccount(args.userPool!, email, null, args.dryRun);

    for (const town of wanted) {
      try {
        await addAdministrator(
          client,
          args.table,
          town.id,
          { authUserId: account.authUserId, email },
          { dryRun: args.dryRun },
        );

        granted += 1;
        console.log(`  ${email} → ${town.slug}`);
      } catch (error) {
        if (error instanceof AlreadyAMember) {
          already += 1;
          continue;
        }

        failed += 1;
        console.error(
          `  ${email} → ${town.slug}: ${error instanceof NoSuchMunicipality || error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  console.log('');
  console.log(
    args.dryRun
      ? `Would grant ${granted}. ${already} already had access. Nothing was written.`
      : `Granted ${granted}. ${already} already had access.${failed === 0 ? '' : ` ${failed} failed.`}`,
  );

  if (failed > 0) process.exitCode = 1;
}

/**
 * Who has access to what, read straight from the memberships.
 *
 * The question that gets asked more often than any of the others, and the one
 * nobody should have to answer by scanning a table by hand.
 */
async function printAccess(args: Arguments, towns: readonly Town[]): Promise<void> {
  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
  });

  const { createMembershipStore } = await import('@agora/store');
  const memberships = createMembershipStore(client, args.table!);

  const rows: { email: string; role: string; slug: string }[] = [];

  for (const town of towns) {
    // Read as an administrator of that town, which is what this command is:
    // somebody with the credentials, asking about one municipality at a time.
    const actor = {
      authUserId: 'cli',
      municipalityId: town.id,
      role: 'municipal_admin' as const,
      organizationId: null,
    };

    for (const member of await memberships.listForMunicipality(actor)) {
      rows.push({ email: member.email, role: member.role, slug: town.slug });
    }
  }

  if (rows.length === 0) {
    console.log('Nobody has access to anything yet.');
    return;
  }

  const people = [...new Set(rows.map((row) => row.email))].sort();
  const width = Math.max(...people.map((email) => email.length));

  for (const email of people) {
    const mine = rows.filter((row) => row.email === email);
    const roles = [...new Set(mine.map((row) => row.role))];
    const where = mine
      .map((row) => row.slug)
      .sort()
      .join(', ');

    console.log(`${email.padEnd(width)}  ${roles.join('/')}  ${where}`);
  }

  console.log('');
  console.log(`${people.length} people, ${towns.length} municipalities.`);
}

// Not top-level await: the bundle is CommonJS, because the AWS SDK is, and
// esbuild refuses one in the other.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
