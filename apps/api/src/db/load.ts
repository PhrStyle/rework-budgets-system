import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { calcBudget } from '@budgets/budget-calc';
import type { BudgetInput } from '@budgets/budget-calc';
import { bp, cents, qty } from '@budgets/money';
import type { Dataset, SeedBudget } from '@budgets/seed';
import type { Pool, PoolClient } from 'pg';

import { at } from './at.js';

/** Linhas por INSERT: grande o bastante para poucas idas ao banco, pequeno para não estourar memória. */
const BATCH = 10_000;

export interface LoadSummary {
  budgets: number;
  groups: number;
  items: number;
  ms: number;
}

/** Lê os arquivos de `pnpm seed:generate` (o contrato entre o gerador e as duas versões). */
export async function readDataset(dir: string): Promise<Dataset> {
  const json = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(join(dir, file), 'utf8')) as T;
  const manifest = await json<{ profile: Dataset['profile']; seed: number }>('manifest.json');

  const budgets: SeedBudget[] = [];
  const lines = createInterface({ input: createReadStream(join(dir, 'budgets.ndjson')) });
  for await (const line of lines) if (line) budgets.push(JSON.parse(line) as SeedBudget);

  return {
    profile: manifest.profile,
    seed: manifest.seed,
    products: await json('catalog.json'),
    clients: await json('clients.json'),
    sellers: await json('sellers.json'),
    budgets,
    expectedTotals: await json('expected-totals.json'),
  };
}

/** Monta a entrada do cálculo: o orçamento com os filhos dele (no máximo 1 nível). */
function toInput(budget: SeedBudget, childrenOf: Map<number, SeedBudget[]>): BudgetInput {
  return {
    id: budget.id,
    prazo: bp(budget.prazo),
    margem: bp(budget.margem),
    groups: budget.groups.map((g) => ({
      id: g.id,
      items: g.items.map((i) => ({
        id: i.id,
        price: cents(i.price),
        quantity: qty(i.quantity),
        discount: bp(i.discount),
      })),
    })),
    children: (childrenOf.get(budget.id) ?? []).map((c) => toInput(c, childrenOf)),
  };
}

async function insertBatched(client: PoolClient, sql: string, columns: unknown[][]): Promise<void> {
  const rows = columns[0]?.length ?? 0;
  for (let start = 0; start < rows; start += BATCH) {
    await client.query(
      sql,
      columns.map((col) => col.slice(start, start + BATCH)),
    );
  }
}

interface ForeignKey {
  table: string;
  name: string;
  definition: string;
}

/** Remove as FKs das tabelas carregadas e devolve as definições, lidas do catálogo do Postgres. */
async function dropForeignKeys(client: PoolClient): Promise<ForeignKey[]> {
  const { rows } = await client.query<ForeignKey>(
    `SELECT conrelid::regclass::text AS table, conname AS name, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE contype = 'f' AND conrelid = ANY ('{budgets,groups,items}'::regclass[])`,
  );
  for (const fk of rows) {
    await client.query(
      `ALTER TABLE ${fk.table} DROP CONSTRAINT ${client.escapeIdentifier(fk.name)}`,
    );
  }
  return rows;
}

/**
 * Apaga tudo e carrega o dataset no banco da versão nova, numa transação só.
 * Os totais guardados (item, grupo e orçamento) saem do mesmo cálculo da API (packages/budget-calc).
 */
export async function loadDataset(pool: Pool, dataset: Dataset): Promise<LoadSummary> {
  const started = performance.now();
  const childrenOf = new Map<number, SeedBudget[]>();
  for (const b of dataset.budgets) {
    if (b.parentId !== null) childrenOf.set(b.parentId, [...(childrenOf.get(b.parentId) ?? []), b]);
  }
  // O cálculo devolve grupos e itens na mesma ordem da entrada: o índice liga um ao outro.
  const calculated = dataset.budgets.map((budget) => ({
    budget,
    calc: calcBudget(toInput(budget, childrenOf)),
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // O outbox perde as linhas, mas NÃO a numeração: o id dele é a chave que a fila usa para não
    // processar o mesmo aviso duas vezes (`outbox-<id>`). Reiniciar em 1 faria avisos novos terem
    // o id de tarefas antigas ainda guardadas na fila, que os descartaria como repetidos.
    await client.query('TRUNCATE outbox CONTINUE IDENTITY');
    await client.query(
      'TRUNCATE items, groups, budgets, products, clients, sellers RESTART IDENTITY CASCADE',
    );
    // Uma FK confere cada linha inserida (85% do tempo da carga, medido). Recriada no fim, valida
    // a tabela inteira de uma vez. Tudo na mesma transação: ninguém vê o banco sem as FKs.
    const foreignKeys = await dropForeignKeys(client);

    await insertBatched(
      client,
      'INSERT INTO sellers (id, name) SELECT * FROM unnest($1::int[], $2::text[])',
      [dataset.sellers.map((s) => s.id), dataset.sellers.map((s) => s.name)],
    );
    await insertBatched(
      client,
      'INSERT INTO clients (id, name) SELECT * FROM unnest($1::int[], $2::text[])',
      [dataset.clients.map((c) => c.id), dataset.clients.map((c) => c.name)],
    );
    const p = dataset.products;
    await insertBatched(
      client,
      `INSERT INTO products (id, sku, name, category, unit, price_cents)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])`,
      [
        p.map((x) => x.id),
        p.map((x) => x.sku),
        p.map((x) => x.name),
        p.map((x) => x.category),
        p.map((x) => x.unit),
        p.map((x) => x.price),
      ],
    );

    // Sem as FKs, o pai (o orçamento mais novo, de id maior) pode entrar depois do filho.
    const b = dataset.budgets;
    const totals = calculated.map((x) => x.calc);
    await insertBatched(
      client,
      `INSERT INTO budgets (id, description, client_id, seller_id, status, prazo_bp, margem_bp,
         created_at, updated_at, parent_id, groups_total_cents, children_total_cents, total_cents)
       SELECT id, description, client_id, seller_id, status::"BudgetStatus", prazo_bp, margem_bp,
         created_at, created_at, parent_id, groups_total, children_total, total
       FROM unnest($1::int[], $2::text[], $3::int[], $4::int[], $5::text[], $6::int[], $7::int[],
         $8::timestamptz[], $9::int[], $10::bigint[], $11::bigint[], $12::bigint[])
         AS t(id, description, client_id, seller_id, status, prazo_bp, margem_bp, created_at,
           parent_id, groups_total, children_total, total)`,
      [
        b.map((x) => x.id),
        b.map((x) => x.description),
        b.map((x) => x.clientId),
        b.map((x) => x.sellerId),
        b.map((x) => x.status),
        b.map((x) => x.prazo),
        b.map((x) => x.margem),
        b.map((x) => x.createdAt),
        b.map((x) => x.parentId),
        totals.map((t) => t.groupsTotal),
        totals.map((t) => t.childrenTotal),
        totals.map((t) => t.total),
      ],
    );

    const groups = calculated.flatMap(({ budget, calc }) =>
      budget.groups.map((g, gi) => ({ budgetId: budget.id, g, calc: at(calc.groups, gi) })),
    );
    await insertBatched(
      client,
      `INSERT INTO groups (id, budget_id, name, category, position, subtotal_cents, item_count)
       SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::int[], $6::bigint[], $7::int[])`,
      [
        groups.map((x) => x.g.id),
        groups.map((x) => x.budgetId),
        groups.map((x) => x.g.name),
        groups.map((x) => x.g.category),
        groups.map((x) => x.g.position),
        groups.map((x) => x.calc.subtotal),
        groups.map((x) => x.g.items.length),
      ],
    );

    const items = groups.flatMap(({ g, calc }) =>
      g.items.map((i, ii) => ({ groupId: g.id, i, total: at(calc.items, ii).total })),
    );
    await insertBatched(
      client,
      `INSERT INTO items (id, group_id, product_id, name, unit, price_cents, quantity, discount_bp,
         position, total_cents)
       SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::text[], $5::text[], $6::int[],
         $7::int[], $8::int[], $9::int[], $10::bigint[])`,
      [
        items.map((x) => x.i.id),
        items.map((x) => x.groupId),
        items.map((x) => x.i.productId),
        items.map((x) => x.i.name),
        items.map((x) => x.i.unit),
        items.map((x) => x.i.price),
        items.map((x) => x.i.quantity),
        items.map((x) => x.i.discount),
        items.map((x) => x.i.position),
        items.map((x) => x.total),
      ],
    );

    for (const fk of foreignKeys) {
      await client.query(
        `ALTER TABLE ${fk.table} ADD CONSTRAINT ${client.escapeIdentifier(fk.name)} ${fk.definition}`,
      );
    }

    // Os ids vieram do gerador: as sequências precisam continuar depois do maior.
    for (const table of ['budgets', 'groups', 'items']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`,
      );
    }
    await client.query('COMMIT');
    return {
      budgets: b.length,
      groups: groups.length,
      items: items.length,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
