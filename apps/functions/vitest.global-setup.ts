import { startDynamoLocal } from '@agora/store/testing';

/**
 * One DynamoDB for the whole run, for the same reason as in `@agora/store`: the
 * container belongs to the run, not to whichever test file finishes first.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const local = await startDynamoLocal();

  if (local === null) return async () => {};

  process.env['DYNAMODB_ENDPOINT'] = local.endpoint;

  return async () => {
    await local.stop();
  };
}
