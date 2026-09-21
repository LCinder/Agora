import { startDynamoLocal } from './src/testing/dynamo-local';

/**
 * One DynamoDB for the whole run, started before any worker.
 *
 * Each test file used to start its own and stop it when it finished, which is
 * fine with the service container of the CI — stopping an endpoint somebody else
 * provided is a no-op — and broken on a developer's machine: the first file to
 * finish would kill the container the other two were still using.
 *
 * Starting it here and handing the endpoint down through the environment means
 * the workers only ever probe, and the container's life matches the run's.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const local = await startDynamoLocal();

  if (local === null) {
    // No Docker and no endpoint: the suites that need a database skip and say
    // so. The rest of the tests still run.
    return async () => {};
  }

  process.env['DYNAMODB_ENDPOINT'] = local.endpoint;

  return async () => {
    await local.stop();
  };
}
