import categories from '../../../content/shared/categories.json';
import { eventCategorySchema } from '@agora/core';
import { createStoreClient } from '@agora/store';
import {
  AlreadyAMember,
  AlreadyOnboarded,
  SlugTaken,
  addAdministrator,
  onboardMunicipality,
} from '@agora/store/onboarding';
import { ZodError } from 'zod';

import { ensureAccount } from './cognito';
import { environmentOf, platformAdmins, platformAdminsParameter } from './platform-admins';
import { explain } from './aws-errors';

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
  /** Skips granting the people in the platform-admins parameter. */
  skipPlatformAdmins: boolean;
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
    skipPlatformAdmins: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    // `pnpm run x -- --table y` forwards the separator. Ignoring it is friendlier
    // than telling the caller off for typing what pnpm's own docs tell them to.
    if (flag === '--') continue;

    if (flag === '--no-platform-admins') {
      parsed.skipPlatformAdmins = true;
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
  --no-platform-admins    Do not grant the people in /agora-<env>/platform-admins.
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

/**
 * Gives the people on the platform list a membership in the town just created.
 *
 * This is what keeps adding a municipality to one command however many of us
 * there are. What it writes are ordinary memberships, one row per person per
 * town: auditable one town at a time, revocable one town at a time. A role that
 * crossed municipalities would remove the rows and with them the property every
 * request depends on — credentials pinned to the municipality in its path.
 *
 * Nothing here can stop a municipality being created. It has already been
 * written by the time this runs, and a membership that did not land is one
 * `add-admin` away — so every failure is reported and none is thrown.
 */
async function grantPlatformAdmins(args: Arguments, municipalityId: string): Promise<string[]> {
  if (args.skipPlatformAdmins) return [];

  const environment = environmentOf(args.table!);

  if (environment === null) {
    return [`Platform admins: skipped, cannot tell the environment from ${args.table!}`];
  }

  const emails = await platformAdmins({ region: args.region, environment });

  if (emails.length === 0) {
    return [`Platform admins: none listed in ${platformAdminsParameter(environment)}`];
  }

  if (args.dryRun) {
    return [`Platform admins: would grant ${emails.join(', ')}`];
  }

  const client = createStoreClient({
    region: args.region,
    ...(args.endpoint === null ? {} : { endpoint: args.endpoint }),
  });

  const lines: string[] = [];

  for (const email of emails) {
    try {
      const account = await ensureAccount(args.userPool!, email, null, false);

      await addAdministrator(client, args.table!, municipalityId, {
        authUserId: account.authUserId,
        email,
      });

      lines.push(`Platform admin: ${email} granted`);
    } catch (error) {
      // Already a member is the ordinary case when this is re-run, and it is not
      // worth a stack trace.
      lines.push(
        error instanceof AlreadyAMember
          ? `Platform admin: ${email} already had access`
          : `Platform admin: ${email} NOT granted (${error instanceof Error ? error.message : 'unknown'})`,
      );
    }
  }

  return lines;
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

    const alsoGranted = await grantPlatformAdmins(args, result.municipality.id);

    console.log(
      [
        '',
        `Municipality: ${result.municipality.name} (${result.municipality.id})`,
        `Categories:   ${result.categories}`,
        ...alsoGranted,
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
  console.error(explain(error));
  process.exitCode = 1;
});
