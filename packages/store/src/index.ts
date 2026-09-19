/**
 * The DynamoDB single table, and the only code that talks to it.
 *
 * Deliberately not part of `@agora/data`: the app and the panel import that
 * package, and they must never carry the AWS SDK in their bundle. They reach
 * data over HTTP; this package is what answers on the other side, from the
 * Lambdas of `infra/terraform/lambda-src`.
 *
 * There is one store per role, mirroring the IAM policies one to one, because
 * the isolation between municipalities has to hold in more than one layer
 * (D-026, D-032):
 *
 *   * `createPublicStore` — what a resident reads. Published events only.
 *   * `createStaffStore` — the panel, scoped to one actor in one municipality.
 *   * `createDeviceStore` — a resident's own marks, and nobody else's.
 *   * `createReminderStore` — event to interested devices. The reminder job only.
 *
 * Plus `migrateSeed`, which loads a municipality's folder into the table: how a
 * town hall is set up, and the bridge between the demo data and the backend.
 */

export * from './client';
export * from './device-store';
export * from './errors';
export * from './items';
export * from './keys';
export * from './public-store';
export * from './reminder-store';
export * from './seed-migration';
export * from './staff-store';
export * from './table-definition';
