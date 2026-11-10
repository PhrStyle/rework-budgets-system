import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
        },
      },
      // A tela roda num DOM simulado (jsdom), com a configuração dela.
      'apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'apps/api/src/generated/**', 'apps/web/e2e/**'],
    },
  },
});
