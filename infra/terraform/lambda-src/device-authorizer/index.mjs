/**
 * Validates the token a device presents. Its answers are cached for an hour,
 * so it runs far less often than the endpoints it guards.
 *
 * Placeholder. Denies everything, which is the only safe thing an unfinished
 * authorizer can do: a stub that said yes would open every device route.
 */
export const handler = async () => ({ isAuthorized: false });
