import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { Redis } from 'ioredis';
import pg from 'pg';

import { loadDataset, readDataset } from './load.js';
import { createElastic } from '../search/elastic.js';
import { reindex } from '../search/reindex.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createPrisma } from './prisma.js';
import { databaseUrl, elasticsearchUrl, redisCacheUrl } from './url.js';
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
  await flushCache();
  await reindexSearch(prisma);
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

/**
 * Depois de recarregar do zero, ids e versões voltam a ser os mesmos: o cache antigo pareceria
 * válido. Limpa o `redis-cache` (só cópias reconstruíveis). Sem ele no ar, segue em frente.
 */
async function flushCache(): Promise<void> {
  const redis = new Redis(redisCacheUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  try {
    await redis.connect();
    await redis.flushdb();
    console.log('redis-cache limpo');
  } catch {
    console.warn('redis-cache fora do ar: nada a limpar');
  } finally {
    redis.disconnect();
  }
}

/** Os ids voltaram a ser os do gerador: a busca precisa ser reconstruída. Sem o Elasticsearch, avisa. */
async function reindexSearch(prisma: PrismaClient): Promise<void> {
  const es = createElastic(elasticsearchUrl(), 60_000);
  try {
    const r = await reindex(es, prisma);
    console.log(`busca reindexada: ${r.budgets} orçamentos e ${r.products} produtos em ${r.ms} ms`);
  } catch (error) {
    console.warn(
      `Elasticsearch indisponível, busca não reindexada (rode pnpm v2:reindex depois): ${String(error)}`,
    );
  } finally {
    await es.close();
  }
}
