import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'services/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    // Integration tests share one database and reset tables between cases.
    fileParallelism: false,
  },
});
