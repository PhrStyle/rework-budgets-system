import type { Client, estypes } from '@elastic/elasticsearch';

import type { PrismaClient } from '../generated/prisma/client.js';
import { loadAllBudgetDocuments, loadBudgetDocument } from '../worker/indexer.js';
import { BUDGETS, budgetsIndex, PRODUCTS, productsIndex } from './indices.js';

const BATCH = 2_000;

export interface ReindexSummary {
  budgets: number;
  products: number;
  catchUp: number;
  ms: number;
}

/**
 * Reconstrói os índices a partir do Postgres, sem tirar a busca do ar: cria índices novos (com a
 * hora no nome), carrega em lote, troca os aliases numa operação só e apaga os antigos.
 *
 * Quem salvar durante a carga atualiza o índice antigo (o alias ainda aponta para ele); por isso,
 * depois da troca, os orçamentos gravados desde o início da carga são indexados de novo no novo.
 */
export async function reindex(es: Client, prisma: PrismaClient): Promise<ReindexSummary> {
  const started = Date.now();
  const suffix = new Date(started)
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 17);

  const budgetsName = `${BUDGETS}-${suffix}`;
  await es.indices.create({ ...budgetsIndex, index: budgetsName });
  const budgets = await loadAllBudgetDocuments(prisma);
  await bulk(
    es,
    budgetsName,
    budgets.map((doc) => ({ id: doc.id, version: Date.parse(doc.updatedAt), doc })),
  );

  const productsName = `${PRODUCTS}-${suffix}`;
  await es.indices.create({ ...productsIndex, index: productsName });
  const products = await prisma.product.findMany({ orderBy: { id: 'asc' } });
  await bulk(
    es,
    productsName,
    products.map((doc) => ({ id: doc.id, doc })),
  );

  await es.indices.refresh({ index: [budgetsName, productsName] });
  await swapAlias(es, BUDGETS, budgetsName);
  await swapAlias(es, PRODUCTS, productsName);

  // Recupera o que foi salvo durante a carga (foi para o índice antigo).
  const changed = await prisma.budget.findMany({
    where: { updatedAt: { gte: new Date(started) } },
    select: { id: true },
  });
  for (const { id } of changed) {
    const doc = await loadBudgetDocument(prisma, id);
    if (doc) {
      await es.index({
        index: BUDGETS,
        id: String(id),
        document: doc,
        version: Date.parse(doc.updatedAt),
        version_type: 'external_gte',
        refresh: true,
      });
    }
  }

  return {
    budgets: budgets.length,
    products: products.length,
    catchUp: changed.length,
    ms: Date.now() - started,
  };
}

async function bulk(
  es: Client,
  index: string,
  entries: { id: number; version?: number; doc: object }[],
): Promise<void> {
  for (let start = 0; start < entries.length; start += BATCH) {
    const operations: estypes.BulkRequest['operations'] = entries
      .slice(start, start + BATCH)
      .flatMap(({ id, version, doc }) => [
        {
          index: {
            _index: index,
            _id: String(id),
            ...(version === undefined ? {} : { version, version_type: 'external' as const }),
          },
        },
        doc,
      ]);
    const res = await es.bulk({ operations });
    if (res.errors) {
      const first = res.items.find((i) => i.index?.error)?.index?.error;
      throw new Error(`falha ao indexar em lote: ${JSON.stringify(first)}`);
    }
  }
}

/** Aponta o alias para o índice novo e apaga os antigos, numa operação atômica de aliases. */
async function swapAlias(es: Client, alias: string, index: string): Promise<void> {
  const existing = await es.indices.get({ index: `${alias}-*` });
  const old = Object.keys(existing).filter((name) => name !== index);
  // Um índice criado sem alias (por engano) com o nome do alias impediria a troca.
  if (await es.indices.exists({ index: alias, expand_wildcards: 'none' }).catch(() => false)) {
    const isAlias = await es.indices.existsAlias({ name: alias });
    if (!isAlias) await es.indices.delete({ index: alias });
  }
  await es.indices.updateAliases({
    actions: [
      ...old.map((name) => ({ remove: { index: name, alias } })),
      { add: { index, alias } },
    ],
  });
  if (old.length > 0) await es.indices.delete({ index: old });
}
