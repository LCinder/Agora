import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Starts one DynamoDB Local for the whole run: see the file for why it is
    // not each test file's job.
    globalSetup: ['./vitest.global-setup.ts'],
    include: ['src/**/*.test.ts'],
    // The isolation tests talk to a real DynamoDB in Docker, which is slower
    // than a pure unit test and worth waiting for.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
