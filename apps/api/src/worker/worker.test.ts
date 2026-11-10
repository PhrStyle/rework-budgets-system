import { setTimeout as sleep } from 'node:timers/promises';

import type { DraftOpInput } from '@budgets/contracts';
import type { SeedBudget } from '@budgets/seed';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createPrisma } from '../db/prisma.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { DRIFT_CHECK, SEARCH_QUEUE } from '../queue/queues.js';
import type { BudgetChangedJob } from '../queue/queues.js';
import { startTestApp } from '../testing/app.js';
import type { TestApp } from '../testing/app.js';
import type { BudgetDocument, SearchIndexer } from './indexer.js';
import { OutboxRelay } from './relay.js';
import { startWorker } from './worker.js';
import type { RunningWorker } from './worker.js';

const ANA = 1;
const silent = pino({ level: 'silent' });

let env: TestApp;
let prisma: PrismaClient;
const running: RunningWorker[] = [];

beforeAll(async () => {
  env = await startTestApp();
  prisma = createPrisma(env.db.url);
}, 180_000);

afterEach(async () => {
  await Promise.all(running.splice(0).map((w) => w.close()));
});

afterAll(async () => {
  for (const c of connections) c.disconnect();
  await prisma.$disconnect();
  await env.stop();
});

/** Indexador de teste: registra o que recebeu e pode falhar ou travar de propósito. */
class FakeIndexer implements SearchIndexer {
  readonly upserts: BudgetDocument[] = [];
  /** Falha as próximas N indexações deste orçamento (os outros seguem normais). */
  failing = { budgetId: 0, times: 0 };

  upsertBudget(doc: BudgetDocument): Promise<void> {
    if (doc.id === this.failing.budgetId && this.failing.times > 0) {
      this.failing.times--;
      return Promise.reject(new Error('Elasticsearch fora do ar (simulado)'));
    }
    this.upserts.push(doc);
    return Promise.resolve();
  }

  removeBudget(): Promise<void> {
    return Promise.resolve();
  }
}

async function worker(indexer: SearchIndexer, extra: { relayEveryMs?: number } = {}) {
  const w = await startWorker({
    redisDataUrl: env.redis.url(),
    prisma,
    indexer,
    logger: silent,
    relayEveryMs: extra.relayEveryMs ?? 50,
    driftCheckCron: null,
    lockDurationMs: 1_000,
    stalledIntervalMs: 500,
    backoffMs: 50,
  });
  running.push(w);
  return w;
}

async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('tempo esgotado esperando a condição');
    await sleep(50);
  }
}

const used = new Set<number>();
function budget(filter: (b: SeedBudget) => boolean = () => true): SeedBudget {
  const found = env.db.dataset.budgets.find(
    (b) => !used.has(b.id) && b.groups[0]?.items[0] !== undefined && filter(b),
  );
  if (!found) throw new Error('nenhum orçamento disponível');
  used.add(found.id);
  if (found.parentId !== null) used.add(found.parentId);
  return found;
}

async function saveChange(id: number, ops: DraftOpInput[]) {
  await env.request('POST', `/budgets/${id}/draft`, { user: ANA });
  await env.request('POST', `/budgets/${id}/draft/ops`, { user: ANA, body: { ops } });
  return env.request('POST', `/budgets/${id}/draft/save`, { user: ANA });
}

/** Conexão para Queue/Worker/QueueEvents: o BullMQ exige `maxRetriesPerRequest: null`. */
const connections: Redis[] = [];
const bullConnection = (): Redis => {
  const c = new Redis(env.redis.url(), { maxRetriesPerRequest: null });
  connections.push(c);
  return c;
};

const pending = (ids: number[]) =>
  prisma.outboxEvent.findMany({ where: { aggregateId: { in: ids }, publishedAt: null } });

describe('outbox', () => {
  it('salvar grava o aviso na mesma transação, para o orçamento e para o pai', async () => {
    const b = budget((x) => x.parentId !== null);
    const parentId = b.parentId ?? 0;

    const res = await saveChange(b.id, [{ op: 'header', margemBp: 4200 }]);

    expect(res.statusCode).toBe(200);
    const rows = await pending([b.id, parentId]);
    expect(rows.map((r) => [r.topic, r.aggregateId]).sort()).toEqual(
      [
        ['budget.changed', b.id],
        ['budget.changed', parentId],
      ].sort(),
    );
  });

  it('um salvar recusado não deixa aviso de uma mudança que não existiu', async () => {
    const b = budget();
    const item = b.groups[0]?.items[0];
    await env.request('POST', `/budgets/${b.id}/draft`, { user: ANA });
    await env.request('POST', `/budgets/${b.id}/draft/ops`, {
      user: ANA,
      body: { ops: [{ op: 'updateItem', itemId: item?.id, discountBp: 100 }] },
    });
    await env.db.pool.query('UPDATE groups SET version = version + 1 WHERE id = $1', [
      b.groups[0]?.id,
    ]);

    const res = await env.request('POST', `/budgets/${b.id}/draft/save`, { user: ANA });

    expect(res.statusCode).toBe(409);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: b.id } })).toBe(0);
  });

  it('dois relays ao mesmo tempo publicam cada aviso uma vez só', async () => {
    const queue = new Queue<BudgetChangedJob>('relay-test', {
      connection: bullConnection(),
    });
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 300 }, (_, i) => ({
        topic: 'budget.changed',
        aggregateId: 100_000 + i,
      })),
    });

    const [a, b] = await Promise.all([
      new OutboxRelay(prisma, queue).drain(),
      new OutboxRelay(prisma, queue).drain(),
    ]);
    // Publicar de novo o mesmo lote (queda entre publicar e o commit): o jobId repetido é ignorado.
    const rows = await prisma.outboxEvent.findMany({ where: { aggregateId: { gte: 100_000 } } });
    await queue.addBulk(
      rows.map((r) => ({
        name: 'budget.changed',
        data: { budgetId: r.aggregateId, changedAt: '' },
        opts: { jobId: `outbox-${r.id}` },
      })),
    );

    expect(a + b).toBeGreaterThanOrEqual(300);
    // Só as tarefas deste teste (outros testes podem ter deixado avisos pendentes).
    const mine = (await queue.getJobs(['waiting'], 0, 1_000)).filter(
      (j) => j.data.budgetId >= 100_000,
    );
    expect(mine).toHaveLength(300);
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true);
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { gte: 100_000 } } });
  });
});

describe('worker', () => {
  it('leva o estado atual do orçamento para a busca, depois de salvar', async () => {
    const indexer = new FakeIndexer();
    await worker(indexer);
    const b = budget();

    const saved = await saveChange(b.id, [{ op: 'header', description: 'Reforma do auditório' }]);
    const total = saved.json<{ detail: { totals: { total: number } } }>().detail.totals.total;

    const doc = await waitFor(() => indexer.upserts.find((d) => d.id === b.id));
    expect(doc).toMatchObject({ description: 'Reforma do auditório', totalCents: total });
    expect((await pending([b.id])).length).toBe(0);

    // E as métricas para o Prometheus: indexação, atraso, fila e outbox.
    const w = running.at(-1);
    const text = (await w?.metrics.registry.metrics()) ?? '';
    expect(text).toMatch(/^budgets_search_index_total\{result="ok",service="worker"\} [1-9]/m);
    expect(text).toMatch(/^budgets_search_index_lag_seconds_count\{service="worker"\} [1-9]/m);
    expect(text).toMatch(
      /^budgets_queue_jobs\{queue="search",state="waiting",service="worker"\} \d+/m,
    );
    expect(text).toMatch(/^budgets_outbox_pending\{service="worker"\} \d+/m);
  });

  it('com o destino fora do ar, tenta de novo até conseguir', async () => {
    const indexer = new FakeIndexer();
    const b = budget();
    indexer.failing = { budgetId: b.id, times: 3 };
    const w = await worker(indexer);

    await saveChange(b.id, [{ op: 'header', margemBp: 1000 }]);

    const doc = await waitFor(() => indexer.upserts.find((d) => d.id === b.id));
    expect(doc.id).toBe(b.id);
    const jobs = await w.search.getJobs(['completed'], 0, 50);
    // 4 tentativas: 3 falhas, cada uma com o erro guardado na tarefa, e a que deu certo.
    const job = jobs.find((j) => j.data.budgetId === b.id);
    expect(job?.attemptsStarted).toBe(4);
    expect(job?.stacktrace).toHaveLength(3);
  });

  it('se o worker morre no meio da tarefa, outro percebe e termina', async () => {
    const b = budget();
    await saveChange(b.id, [{ op: 'header', margemBp: 2500 }]);
    // Publica sem nenhum worker de pé.
    const queue = new Queue<BudgetChangedJob>(SEARCH_QUEUE, {
      connection: bullConnection(),
    });
    await new OutboxRelay(prisma, queue).drain();

    // O primeiro worker pega a tarefa e "morre": nunca termina e para de renovar a trava.
    let markStarted = (): void => undefined;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    const dying = new Worker<BudgetChangedJob>(
      SEARCH_QUEUE,
      () => {
        markStarted();
        return new Promise(() => undefined);
      },
      {
        connection: bullConnection(),
        lockDuration: 1_000,
      },
    );
    await started;
    await dying.close(true);
    expect(await queue.getActiveCount()).toBe(1);

    // Um worker novo: a trava do anterior expira, a tarefa é dada como travada e volta para a fila.
    const indexer = new FakeIndexer();
    await worker(indexer, { relayEveryMs: 60_000 });

    const doc = await waitFor(() => indexer.upserts.find((d) => d.id === b.id));
    expect(doc.id).toBe(b.id);
    await queue.close();
  }, 30_000);
});

describe('conferência de drift pela fila', () => {
  it('roda como tarefa e acusa um centavo a mais', async () => {
    const w = await worker(new FakeIndexer(), { relayEveryMs: 60_000 });
    const events = new QueueEvents(w.maintenance.name, { connection: bullConnection() });
    await events.waitUntilReady();

    // O resultado da tarefa vem como `any` do BullMQ: tratado como `unknown` e conferido abaixo.
    const clean: unknown = await (
      await w.maintenance.add(DRIFT_CHECK, {})
    ).waitUntilFinished(events, 30_000);
    await env.db.pool.query('UPDATE items SET total_cents = total_cents + 1 WHERE id = 1');
    const dirty: unknown = await (
      await w.maintenance.add(DRIFT_CHECK, {})
    ).waitUntilFinished(events, 30_000);
    await env.db.pool.query('UPDATE items SET total_cents = total_cents - 1 WHERE id = 1');

    expect(clean).toEqual({ mismatches: 0 });
    expect(dirty).toEqual({ mismatches: 1 });
    await events.close();
  });
});
