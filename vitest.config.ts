import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['检测工具/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
});
