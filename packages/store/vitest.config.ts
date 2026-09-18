import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The isolation tests talk to a real DynamoDB in Docker, which is slower
    // than a pure unit test and worth waiting for.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
