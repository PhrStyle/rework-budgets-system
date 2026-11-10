import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { loadDataset, readDataset } from './load.js';
import { createPrisma } from './prisma.js';
import { databaseUrl } from './url.js';
import { verifyTotals } from './verify.js';

// Uso: pnpm v2:seed [small|full]  (as migrations rodam antes, no script da raiz)
const { positionals } = parseArgs({
  // o pnpm repassa um "--" literal para o script
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  allowPositionals: true,
});
const profile = positionals[0] ?? 'full';
const dir = resolve(process.env.INIT_CWD ?? process.cwd(), 'data/seed', profile);

const dataset = await readDataset(dir);
const pool = new pg.Pool({ connectionString: databaseUrl() });
const prisma = createPrisma();
try {
  const loaded = await loadDataset(pool, dataset);
  console.log(
    `carregado (${profile}): ${loaded.budgets} orçamentos, ${loaded.groups} grupos, ` +
      `${loaded.items} itens em ${loaded.ms} ms`,
  );

  const started = performance.now();
  const report = await verifyTotals(prisma, dataset.expectedTotals);
  const ms = Math.round(performance.now() - started);
  if (report.mismatches.length > 0) {
    console.error(`${report.mismatches.length} divergências:`);
    for (const line of report.mismatches.slice(0, 20)) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log(
      `conferido em ${ms} ms: ${report.budgets} totais e ${report.items} itens relidos do banco ` +
        'e recalculados batem com o gerador, centavo por centavo',
    );
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
