import { defineConfig, devices } from '@playwright/test';

/**
 * Testes no navegador de verdade, contra o build de produção da tela (`vite preview`, com os
 * cabeçalhos de cache) e a API. Postgres e os dois Redis precisam estar no ar (compose) e com
 * dados (`pnpm v2:seed`); sem Elasticsearch, a busca cai para o Postgres.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @budgets/api start',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: !process.env.CI,
      // A saída dos servidores vai para o log: se um não subir no CI, dá para ver por quê.
      stdout: 'pipe',
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 120_000,
    },
  ],
});
