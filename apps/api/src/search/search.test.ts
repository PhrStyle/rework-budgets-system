import { setTimeout as sleep } from 'node:timers/promises';

import type { Client } from '@elastic/elasticsearch';
import type { BudgetSummary, Page, Product } from '@budgets/contracts';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrisma } from '../db/prisma.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { startTestApp } from '../testing/app.js';
import type { TestApp } from '../testing/app.js';
import { startTestElasticsearch } from '../testing/elasticsearch.js';
import type { TestElasticsearch } from '../testing/elasticsearch.js';
import { startWorker } from '../worker/worker.js';
import type { RunningWorker } from '../worker/worker.js';
import { createElastic } from './elastic.js';
import { ElasticIndexer } from './elastic-indexer.js';
import { BUDGETS } from './indices.js';
import { reindex } from './reindex.js';

const ANA = 1;

let elastic: TestElasticsearch;
let env: TestApp;
let prisma: PrismaClient;
let es: Client;
let worker: RunningWorker;

beforeAll(async () => {
  elastic = await startTestElasticsearch();
  env = await startTestApp({ elasticsearchUrl: elastic.url });
  prisma = createPrisma(env.db.url);
  es = createElastic(elastic.url, 30_000);
  await reindex(es, prisma);
  worker = await startWorker({
    redisDataUrl: env.redis.url(),
    prisma,
    indexer: new ElasticIndexer(es),
    logger: pino({ level: 'silent' }),
    relayEveryMs: 50,
    driftCheckCron: null,
    backoffMs: 50,
  });
}, 300_000);

afterAll(async () => {
  await worker.close();
  await es.close();
  await prisma.$disconnect();
  await env.stop();
  await elastic.stop().catch(() => undefined);
});

const products = async (search: string) =>
  (await env.request('GET', `/products?search=${encodeURIComponent(search)}&limit=50`)).json<
    Product[]
  >();
const budgets = async (query: string) =>
  (await env.request('GET', `/budgets?${query}`)).json<Page<BudgetSummary>>();

/** A busca da legada, para comparar: `ILIKE '%termo%'`, sem ignorar acentos nem erros. */
async function legacyProducts(search: string): Promise<number> {
  const { rows } = await env.db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM products WHERE name ILIKE $1 OR sku ILIKE $1`,
    [`%${search}%`],
  );
  return Number(rows[0]?.n ?? 0);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

async function metric(search: string, engine: string): Promise<number> {
  const text = (await env.request('GET', '/metrics')).body;
  const line = text.split('\n').find((l) => l.includes(`search="${search}",engine="${engine}"`));
  return Number(line?.split(' ').at(-1) ?? 0);
}

describe('autocomplete de produtos', () => {
  it.each([
    ['sem acento', 'camera', 'câmera'],
    ['com erro de digitação', 'cmaera', 'câmera'],
    ['por prefixo, enquanto digita', 'instal', 'instalação'],
    // O fuzzy não vale para prefixo: aqui só a remoção de acentos (asciifolding) resolve.
    ['por prefixo de palavra acentuada', 'camer', 'câmera'],
    ['sem acento e sem cedilha', 'licenca', 'licença'],
  ])('acha %s ("%s"), onde o LIKE da legada não acha', async (_, search, expected) => {
    const found = await products(search);

    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(fold(p.name)).toContain(fold(expected).slice(0, 5));
    if (search !== 'instal') expect(await legacyProducts(search)).toBe(0);
  });

  it('o analisador tira acentos e cedilha (o fuzzy sozinho só tolera 1 ou 2 letras)', async () => {
    const { tokens } = await es.indices.analyze({
      index: BUDGETS,
      analyzer: 'pt_folded',
      text: 'Câmera, Instalação e Licença',
    });

    expect(tokens?.map((t) => t.token)).toEqual(['camera', 'instalacao', 'e', 'licenca']);
  });

  it('acha pelo SKU', async () => {
    const product = env.db.dataset.products[7];
    const found = await products(product?.sku.toLowerCase() ?? '');

    expect(found[0]?.id).toBe(product?.id);
  });

  it('todas as palavras precisam aparecer', async () => {
    const found = await products('camera ip');

    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(fold(p.name)).toMatch(/camera.*\bip\b|\bip\b.*camera/);
  });
});

describe('busca de orçamentos', () => {
  it('acha o cliente sem acento', async () => {
    // Um cliente com acento no nome e com orçamento.
    const names = new Map(env.db.dataset.clients.map((c) => [c.id, c.name]));
    const budget = env.db.dataset.budgets.find((b) => {
      const name = names.get(b.clientId) ?? '';
      return fold(name) !== name.toLowerCase();
    });
    const client = { name: names.get(budget?.clientId ?? 0) ?? '' };
    if (!budget) throw new Error('nenhum orçamento de cliente com acento no perfil small');
    const words = fold(client.name).split(' ').slice(0, 2).join(' ');

    const page = await budgets(`search=${encodeURIComponent(words)}&pageSize=100`);

    expect(page.total).toBeGreaterThan(0);
    for (const b of page.items) {
      expect(fold(`${b.client.name} ${b.description}`)).toContain(words.split(' ')[0]);
    }
  });

  it('o número do orçamento vem primeiro', async () => {
    const page = await budgets('search=42');

    expect(page.items[0]?.id).toBe(42);
  });

  it('sem texto, lista igual ao Postgres: mesmo total, mesma ordem, mesmos filtros', async () => {
    const page = await budgets('status=Aprovado&sellerId=2&pageSize=100');
    const expected = env.db.dataset.budgets
      .filter((b) => b.status === 'Aprovado' && b.sellerId === 2)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

    expect(page.total).toBe(expected.length);
    expect(page.items.map((b) => b.id)).toEqual(expected.map((b) => b.id));
    for (const b of page.items) expect(b.totalCents).toBe(env.db.dataset.expectedTotals[b.id]);
  });

  it('as buscas são atendidas pelo Elasticsearch', async () => {
    const before = await metric('budgets', 'elasticsearch');
    await budgets('search=hotel');

    expect(await metric('budgets', 'elasticsearch')).toBe(before + 1);
  });
});

describe('do salvar até a busca', () => {
  it('a descrição salva aparece na busca, também sem acento', async () => {
    const b = env.db.dataset.budgets[11];
    if (!b) throw new Error('perfil small mudou');
    await env.request('POST', `/budgets/${b.id}/draft`, { user: ANA });
    await env.request('POST', `/budgets/${b.id}/draft/ops`, {
      user: ANA,
      body: { ops: [{ op: 'header', description: 'Reforma do auditório Zeppelin' }] },
    });
    const savedAt = Date.now();
    await env.request('POST', `/budgets/${b.id}/draft/save`, { user: ANA });

    let page: Page<BudgetSummary>;
    for (;;) {
      page = await budgets('search=auditorio%20zeppelin');
      if (page.items.some((x) => x.id === b.id) || Date.now() - savedAt > 15_000) break;
      await sleep(50);
    }
    expect(page.items.map((x) => x.id)).toContain(b.id);
  });

  it('uma tarefa atrasada não sobrescreve o dado novo (versão externa)', async () => {
    const indexer = new ElasticIndexer(es);
    const doc = {
      id: 900_001,
      description: 'Versão nova',
      clientId: 1,
      clientName: 'X',
      sellerId: 1,
      sellerName: 'Y',
      status: 'Rascunho' as const,
      totalCents: 0,
      parentId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    await indexer.upsertBudget(doc);
    await indexer.upsertBudget({
      ...doc,
      description: 'Versão velha',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const stored = await es.get<{ description: string }>({ index: BUDGETS, id: '900001' });
    expect(stored._source?.description).toBe('Versão nova');
    await indexer.removeBudget(900_001);
  });

  it('reindexar troca o índice sem tirar a busca do ar', async () => {
    const before = Object.keys(await es.indices.get({ index: `${BUDGETS}-*` }));

    await reindex(es, prisma);

    const after = await es.indices.getAlias({ name: BUDGETS });
    expect(Object.keys(after)).toHaveLength(1);
    expect(before).not.toContain(Object.keys(after)[0]);
    expect((await budgets('search=hotel')).total).toBeGreaterThan(0);
  });
});

describe('Elasticsearch fora do ar', () => {
  it('a listagem e o autocomplete continuam, pelo Postgres', async () => {
    const before = await metric('budgets', 'postgres_fallback');
    await elastic.container.stop();

    const list = await env.request('GET', '/budgets?pageSize=5');
    const auto = await env.request('GET', '/products?search=cabo');

    expect(list.statusCode).toBe(200);
    expect(list.json<Page<BudgetSummary>>().items).toHaveLength(5);
    expect(auto.statusCode).toBe(200);
    expect(await metric('budgets', 'postgres_fallback')).toBe(before + 1);
  }, 60_000);
});
