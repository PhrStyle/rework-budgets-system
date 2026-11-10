import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { generate } from '@budgets/seed';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { loadDataset } from './load.js';
import { createPrisma } from './prisma.js';
import { verifyTotals } from './verify.js';

// Mesma semente de `pnpm seed:generate`: os dados do teste são os do perfil small.
const dataset = generate('small', 20_261_110);

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  const url = container.getConnectionUri();
  // As migrations de verdade, como no deploy: o teste pega um CHECK esquecido ou uma coluna trocada.
  await promisify(execFile)('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url },
  });
  pool = new pg.Pool({ connectionString: url });
  prisma = createPrisma(url);
  await loadDataset(pool, dataset);
}, 180_000);

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
  await container.stop();
});

describe('carga do gerador no banco da versão nova', () => {
  it('relê tudo pelo Prisma e cada total bate com o gerador, centavo por centavo', async () => {
    const report = await verifyTotals(prisma, dataset.expectedTotals);

    expect(report.mismatches).toEqual([]);
    expect(report.budgets).toBe(dataset.budgets.length);
    expect(report.items).toBe(
      dataset.budgets.flatMap((b) => b.groups.flatMap((g) => g.items)).length,
    );
  });

  it('guarda os vínculos entre orçamentos', async () => {
    const linked = dataset.budgets.filter((b) => b.parentId !== null);
    const count = await prisma.budget.count({ where: { parentId: { not: null } } });

    expect(count).toBe(linked.length);
  });

  it('a conferência acusa um centavo a mais num item', async () => {
    const item = await prisma.item.findFirstOrThrow({ orderBy: { id: 'asc' } });
    await prisma.item.update({
      where: { id: item.id },
      data: { totalCents: item.totalCents + 1n },
    });
    try {
      const report = await verifyTotals(prisma, dataset.expectedTotals);
      expect(report.mismatches).toEqual([
        `item ${item.id}: gravado ${item.totalCents + 1n}, recalculado ${item.totalCents}`,
      ]);
    } finally {
      await prisma.item.update({ where: { id: item.id }, data: { totalCents: item.totalCents } });
    }
  });

  it('as sequências continuam depois dos ids do gerador', async () => {
    const max = await prisma.budget.aggregate({ _max: { id: true } });
    const created = await prisma.budget.create({
      data: {
        description: 'Novo',
        clientId: 1,
        sellerId: 1,
        prazoBp: 0,
        margemBp: 0,
        groupsTotalCents: 0n,
        childrenTotalCents: 0n,
        totalCents: 0n,
      },
    });
    await prisma.budget.delete({ where: { id: created.id } });

    expect(created.id).toBeGreaterThan(max._max.id ?? Infinity);
  });

  it.each([
    [
      'margem acima de 100%',
      'UPDATE budgets SET margem_bp = 10001 WHERE id = 1',
      'budgets_margem_check',
    ],
    [
      'prazo abaixo de −100%',
      'UPDATE budgets SET prazo_bp = -10001 WHERE id = 1',
      'budgets_prazo_check',
    ],
    ['desconto negativo', 'UPDATE items SET discount_bp = -1 WHERE id = 1', 'items_discount_check'],
    [
      'fração em unidade inteira',
      "UPDATE items SET quantity = 150 WHERE id = (SELECT MIN(id) FROM items WHERE unit = 'un')",
      'items_un_whole_check',
    ],
    [
      'orçamento dentro dele mesmo',
      'UPDATE budgets SET parent_id = id WHERE id = 1',
      'budgets_parent_check',
    ],
    // As FKs saem durante a carga (por velocidade) e precisam ter voltado no fim dela.
    [
      'item de um grupo que não existe',
      `INSERT INTO items (group_id, product_id, name, unit, price_cents, quantity, discount_bp,
         position, total_cents) VALUES (-1, 1, 'x', 'un', 0, 100, 0, 1, 0)`,
      'items_group_id_fkey',
    ],
  ])('o banco recusa %s', async (_, sql, constraint) => {
    await expect(pool.query(sql)).rejects.toThrow(constraint);
  });
});
