import categories from '../../../content/shared/categories.json';
import { eventCategorySchema } from '@agora/core';
import { createStoreClient } from '@agora/store';
import { AlreadyOnboarded, SlugTaken, onboardMunicipality } from '@agora/store/onboarding';
import { ZodError } from 'zod';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Sets up a town hall: the municipality, its categories and the first person who
 * can sign in.
 *
 * This is the superadmin's whole job, and it is a command rather than a screen on
 * purpose. It runs perhaps twenty times in the life of the product, it needs
 * credentials the panel does not have, and a form for creating tenants is a form
 * somebody can eventually reach. The role table in CLAUDE.md says superadmin is
 * us; this is what "us" looks like.
 *
 *     pnpm --filter @agora/tools create-municipality -- \
 *       --table agora-prod --user-pool eu-central-1_XXXX \
 *       --slug huetor-vega --name "Huétor Vega" --province Granada \
 *       --population 12000 --ine 18101 \
 *       --lat 37.1258 --lon -3.5846 --color '#1D4ED8' \
 *       --admin alcaldia@huetorvega.es --admin-name "Ana Ruiz"
 *
 * Add `--dry-run` to check everything and write nothing, which is what you do
 * first. The output is in English because the only person who reads it is
 * whoever ran it.
 */
interface Arguments {
  table: string | null;
  region: string;
  endpoint: string | null;
  userPool: string | null;
  id: string | null;
  slug: string | null;
  name: string | null;
  province: string | null;
  population: number | null;
  ine: string | null;
  latitude: number | null;
  longitude: number | null;
  color: string;
  status: string;
  admin: string | null;
  adminName: string | null;
  adminAuthId: string | null;
  dryRun: boolean;
  help: boolean;
}

const VALUE_FLAGS = new Set([
  '--table',
  '--region',
  '--endpoint',
  '--user-pool',
  '--id',
  '--slug',
  '--name',
  '--province',
  '--population',
  '--ine',
  '--lat',
  '--lon',
  '--color',
  '--status',
  '--admin',
  '--admin-name',
  '--admin-auth-id',
]);

function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {
    table: null,
    region: 'eu-central-1',
    endpoint: null,
    userPool: null,
    id: null,
    slug: null,
    name: null,
    province: null,
    population: null,
    ine: null,
    latitude: null,
    longitude: null,
    // A blue that reads on white and on black. Every town hall replaces it with
    // their own on the first call, and a required colour would only be guessed.
    color: '#1D4ED8',
    status: 'pilot',
    admin: null,
    adminName: null,
    adminAuthId: null,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    // `pnpm run x -- --table y` forwards the separator. Ignoring it is friendlier
    // than telling the caller off for typing what pnpm's own docs tell them to.
    if (flag === '--') continue;

    if (flag === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (flag === '--help' || flag === '-h') {
      parsed.help = true;
      continue;
    }

    if (flag === undefined || !VALUE_FLAGS.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? ''}`);
    }

    // A negative longitude looks like a flag, and every municipality in Andalusia
    // has one, so only a dash followed by a letter counts as the next flag.
    if (value === undefined || /^--[a-z]/.test(value)) {
      throw new Error(`${flag} needs a value.`);
    }

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
      case '--id':
        parsed.id = value;
        break;
      case '--slug':
        parsed.slug = value;
        break;
      case '--name':
        parsed.name = value;
        break;
      case '--province':
        parsed.province = value;
        break;
      case '--population':
        parsed.population = Number(value);
        break;
      case '--ine':
        parsed.ine = value;
        break;
      case '--lat':
        parsed.latitude = Number(value);
        break;
      case '--lon':
        parsed.longitude = Number(value);
        break;
      case '--color':
        parsed.color = value;
        break;
      case '--status':
        parsed.status = value;
        break;
      case '--admin':
        parsed.admin = value;
        break;
      case '--admin-name':
        parsed.adminName = value;
        break;
      case '--admin-auth-id':
        parsed.adminAuthId = value;
        break;
    }

    index += 1;
  }

  return parsed;
}

const USAGE = `
Sets up a municipality: the town, its categories and its first administrator.

  --table <name>          Required. e.g. agora-prod.
  --user-pool <id>        Cognito user pool. Required unless --admin-auth-id.
  --slug <slug>           Required. What a shared link resolves through.
  --name <name>           Required. As the neighbours write it, accents included.
  --province <name>       Required.
  --population <number>   Required. From the INE.
  --ine <code>            Required. The five digit INE code.
  --lat <number>          Required. Town hall latitude.
  --lon <number>          Required. Town hall longitude.

  --color <#RRGGBB>       Municipal colour. Default: #1D4ED8.
  --id <id>               Row id. Default: mun-<slug>.
  --status <status>       demo | pilot | active | inactive. Default: pilot.
  --admin <email>         The first administrator. An account is created and
                          Cognito emails them a temporary password.
  --admin-name <name>     Their name, for the panel.
  --admin-auth-id <id>    Use an existing Cognito user instead of creating one.
  --region <name>         Default: eu-central-1.
  --endpoint <url>        For DynamoDB Local.
  --dry-run               Check everything, write nothing. Do this first.
  -h, --help              This.

There is deliberately no default table: naming it every time is what stops this
from landing in production by accident.
`.trim();

interface Account {
  authUserId: string;
  created: boolean;
}

/**
 * The Cognito account the membership will point at.
 *
 * Created here rather than by the panel because there is nobody to invite the
 * first administrator: they are the first person who could have done it. An
 * address that already has an account is reused rather than refused — a town hall
 * officer who already works for the next town along is one person, and the
 * membership is what differs.
 */
async function ensureAccount(
  userPoolId: string,
  email: string,
  fullName: string | null,
  dryRun: boolean,
): Promise<Account> {
  const cognito = new CognitoIdentityProviderClient({});

  const existing = await cognito
    .send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }))
    .catch(() => null);

  /** Cognito's own id for the account, which is what a membership points at. */
  const subOf = (attributes: AttributeType[] | undefined): string | null =>
    attributes?.find((attribute) => attribute.Name === 'sub')?.Value ?? null;

  if (existing !== null) {
    const sub = subOf(existing.UserAttributes);

    if (sub === null) throw new Error(`Cognito user ${email} has no sub.`);

    return { authUserId: sub, created: false };
  }

  if (dryRun) return { authUserId: 'dry-run-no-account-yet', created: false };

  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          // Verified because we are vouching for an address we were given by the
          // town hall, and because an unverified account cannot reset its own
          // password — which is the first thing this person will need to do.
          { Name: 'email_verified', Value: 'true' },
          ...(fullName === null || fullName === ''
            ? []
            : [{ Name: 'custom:full_name', Value: fullName }]),
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );

    const sub = subOf(created.User?.Attributes);

    if (sub === null) throw new Error(`Cognito created ${email} without a sub.`);

    return { authUserId: sub, created: true };
  } catch (error) {
    // Lost a race with somebody else running this. Read it back instead of
    // failing: the account is what we wanted and now it is there.
    if (error instanceof UsernameExistsException) {
      const again = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
      );
      const sub = subOf(again.UserAttributes);

      if (sub === null) {
        throw new Error(`Cognito user ${email} has no sub.`, { cause: error });
      }

      return { authUserId: sub, created: false };
    }

    throw error;
  }
}

function missing(args: Arguments): string[] {
  const required: [string, unknown][] = [
    ['--table', args.table],
    ['--slug', args.slug],
    ['--name', args.name],
    ['--province', args.province],
    ['--population', args.population],
    ['--ine', args.ine],
    ['--lat', args.latitude],
    ['--lon', args.longitude],
  ];

  const absent = required.filter(([, value]) => value === null).map(([flag]) => flag);

  if (args.admin === null && args.adminAuthId === null) absent.push('--admin');
  if (args.userPool === null && args.adminAuthId === null) absent.push('--user-pool');

  return absent;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const absent = missing(args);

  if (absent.length > 0) {
    console.error(`Missing ${absent.join(', ')}. Run with --help.`);
    process.exitCode = 1;
    return;
  }

  for (const [flag, value] of [
    ['--population', args.population],
    ['--lat', args.latitude],
    ['--lon', args.longitude],
  ] as const) {
    if (Number.isNaN(value)) {
      console.error(`${flag} is not a number.`);
      process.exitCode = 1;
      return;
    }
  }

  const account =
    args.adminAuthId !== null
      ? { authUserId: args.adminAuthId, created: false }
      : await ensureAccount(args.userPool!, args.admin!, args.adminName, args.dryRun);

  console.log(
    [
      `Table:    ${args.table!}`,
      `Region:   ${args.region}`,
      `Endpoint: ${args.endpoint ?? 'default (real AWS)'}`,
      `Town:     ${args.name!} (${args.slug!}), ${args.province!}`,
      `Admin:    ${args.admin ?? account.authUserId}${account.created ? ' (account created)' : ''}`,
      args.dryRun ? 'Mode:     dry run, nothing is written' : 'Mode:     writing',
      '',
    ].join('\n'),
  );

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
  });

  try {
    const result = await onboardMunicipality(
      client,
      args.table!,
      {
        id: args.id ?? `mun-${args.slug!}`,
        slug: args.slug!,
        name: args.name!,
        province: args.province!,
        population: args.population!,
        ineCode: args.ine!,
        latitude: args.latitude!,
        longitude: args.longitude!,
        primaryColor: args.color,
        status: args.status as 'demo' | 'pilot' | 'active' | 'inactive',
      },
      {
        authUserId: account.authUserId,
        email: args.admin ?? `${account.authUserId}@unknown`,
        ...(args.adminName === null ? {} : { fullName: args.adminName }),
      },
      categories.map((category) => eventCategorySchema.parse(category)),
      {
        dryRun: args.dryRun,
        onProgress: (what) => {
          console.log(`  ${what}`);
        },
      },
    );

    console.log(
      [
        '',
        `Municipality: ${result.municipality.name} (${result.municipality.id})`,
        `Categories:   ${result.categories}`,
        '',
        args.dryRun
          ? 'Nothing was written. Run it again without --dry-run.'
          : `Done. ${args.admin ?? 'The administrator'} has a temporary password by email and can sign in to the panel.`,
        '',
      ].join('\n'),
    );
  } catch (error) {
    // The two mistakes worth naming: a slug that belongs to a live town hall,
    // and running this twice.
    if (error instanceof SlugTaken || error instanceof AlreadyOnboarded) {
      console.error(`\n${error.message}\n`);
      process.exitCode = 1;
      return;
    }

    // A flag with a bad value. Zod's own dump names the field and the rule, and
    // buries both in JSON; this says which flag to fix.
    if (error instanceof ZodError) {
      const flags: Record<string, string> = {
        ineCode: '--ine',
        population: '--population',
        latitude: '--lat',
        longitude: '--lon',
        slug: '--slug',
        name: '--name',
        province: '--province',
        status: '--status',
        'branding.primaryColor': '--color',
      };

      console.error('');

      for (const issue of error.issues) {
        const path = issue.path.join('.');

        console.error(`  ${flags[path] ?? path}: ${issue.message}`);
      }

      console.error('');
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

// Not top-level await: the bundle is CommonJS, because the AWS SDK is, and
// esbuild refuses one in the other.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
