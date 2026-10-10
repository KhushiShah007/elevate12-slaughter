import { defineConfig } from 'vitest/config';

// Each server test file starts its own in-memory Postgres with the seed data, which is
// memory-hungry: run at most 3 files at a time so the machine does not run out.
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { maxForks: 3, minForks: 1 } },
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
