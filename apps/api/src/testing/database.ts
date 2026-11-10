import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { generate } from '@budgets/seed';
import type { Dataset } from '@budgets/seed';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

import { loadDataset } from '../db/load.js';

export interface TestDatabase {
  url: string;
  pool: pg.Pool;
  dataset: Dataset;
  stop: () => Promise<void>;
}

/**
 * Postgres descartável (Testcontainers) com as migrations de verdade, como no deploy, e os dados
 * do perfil small (mesma semente de `pnpm seed:generate`).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  const url = container.getConnectionUri();
  await promisify(execFile)('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url },
  });
  const pool = new pg.Pool({ connectionString: url });
  const dataset = generate('small', 20_261_110);
  await loadDataset(pool, dataset);

  return {
    url,
    pool,
    dataset,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
