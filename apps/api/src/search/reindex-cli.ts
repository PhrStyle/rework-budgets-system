import { createPrisma } from '../db/prisma.js';
import { elasticsearchUrl } from '../db/url.js';
import { createElastic } from './elastic.js';
import { reindex } from './reindex.js';

// Uso: pnpm v2:reindex
// Reconstrói os índices do Elasticsearch a partir do Postgres, sem tirar a busca do ar.

const prisma = createPrisma();
const es = createElastic(elasticsearchUrl(), 60_000);
try {
  const r = await reindex(es, prisma);
  console.log(
    `reindexado: ${r.budgets} orçamentos e ${r.products} produtos em ${r.ms} ms` +
      (r.catchUp > 0 ? ` (${r.catchUp} salvos durante a carga, reindexados depois da troca)` : ''),
  );
} finally {
  await es.close();
  await prisma.$disconnect();
}
