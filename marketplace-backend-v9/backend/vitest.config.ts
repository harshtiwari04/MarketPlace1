import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20_000, // mongodb-memory-server downloads/starts a real mongod on first run
    hookTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one in-memory Mongo instance and must not run concurrently
    // against it (each test cleans collections between runs — see tests/setup.ts).
    fileParallelism: false,
  },
});
