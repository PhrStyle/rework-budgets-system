import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { verifyTotals } from '../db/verify.js';
import { noopReporter } from '../errors/reporter.js';
import type { ErrorReporter } from '../errors/reporter.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  BUDGET_CHANGED,
  DEFAULT_JOB_OPTIONS,
  DRIFT_CHECK,
  MAINTENANCE_QUEUE,
  SEARCH_QUEUE,
} from '../queue/queues.js';
import type { BudgetChangedJob } from '../queue/queues.js';
import { loadBudgetDocument } from './indexer.js';
import type { SearchIndexer } from './indexer.js';
import { OutboxRelay } from './relay.js';

export interface WorkerConfig {
  redisDataUrl: string;
  prisma: PrismaClient;
  indexer: SearchIndexer;
  logger: Logger;
  /** De quanto em quanto o relay olha o outbox. */
  relayEveryMs: number;
  /** Cron da conferência de drift (padrão: 03:00 todo dia); `null` desliga. */
  driftCheckCron: string | null;
  /** Trava de cada tarefa: se o worker parar de renová-la (morreu), outra instância a retoma. */
  lockDurationMs?: number;
  stalledIntervalMs?: number;
  /** Espera inicial entre tentativas (os testes usam pouco). */
  backoffMs?: number;
  /** Tarefas que esgotaram as tentativas e drift encontrado vão para o Sentry. */
  reporter?: ErrorReporter;
}

export interface RunningWorker {
  search: Queue<BudgetChangedJob>;
  maintenance: Queue;
  relay: OutboxRelay;
  close: () => Promise<void>;
}

/**
 * O processo de fundo: relay do outbox, indexação da busca e conferência de drift.
 * Roda separado da API (`pnpm v2:worker`): trabalho lento ou pesado não atrasa requisições, e as
 * tarefas esperam no `redis-data` se o worker estiver fora (deploy, queda).
 */
export async function startWorker(config: WorkerConfig): Promise<RunningWorker> {
  const { prisma, indexer, logger } = config;
  const reporter = config.reporter ?? noopReporter;
  // O BullMQ pede `maxRetriesPerRequest: null` nas conexões de worker (comandos bloqueantes).
  const connection = new Redis(config.redisDataUrl, { maxRetriesPerRequest: null });
  const defaultJobOptions = {
    ...DEFAULT_JOB_OPTIONS,
    backoff: { type: 'exponential', delay: config.backoffMs ?? 1_000 },
  };
  const search = new Queue<BudgetChangedJob>(SEARCH_QUEUE, { connection, defaultJobOptions });
  const maintenance = new Queue(MAINTENANCE_QUEUE, { connection, defaultJobOptions });
  const relay = new OutboxRelay(prisma, search);
  const lock = {
    lockDuration: config.lockDurationMs ?? 30_000,
    stalledInterval: config.stalledIntervalMs ?? 30_000,
  };

  const searchWorker = new Worker<BudgetChangedJob>(
    SEARCH_QUEUE,
    async (job: Job<BudgetChangedJob>) => {
      if (job.name !== BUDGET_CHANGED) throw new Error(`tarefa desconhecida: ${job.name}`);
      const doc = await loadBudgetDocument(prisma, job.data.budgetId);
      if (doc) await indexer.upsertBudget(doc);
      else await indexer.removeBudget(job.data.budgetId);
      const lagMs = Date.now() - Date.parse(job.data.changedAt);
      logger.info(
        { budgetId: job.data.budgetId, attempt: job.attemptsMade + 1, lagMs },
        'busca atualizada',
      );
    },
    { connection, concurrency: 5, ...lock },
  );

  const maintenanceWorker = new Worker(
    MAINTENANCE_QUEUE,
    async (job: Job) => {
      if (job.name !== DRIFT_CHECK) throw new Error(`tarefa desconhecida: ${job.name}`);
      const stored = await prisma.budget.findMany({ select: { id: true, totalCents: true } });
      const report = await verifyTotals(
        prisma,
        Object.fromEntries(stored.map((s) => [s.id, Number(s.totalCents)])),
      );
      if (report.mismatches.length > 0) {
        reporter.message('drift: totais guardados divergem do recálculo', {
          tags: { queue: MAINTENANCE_QUEUE },
          extra: { count: report.mismatches.length, sample: report.mismatches.slice(0, 20) },
        });
        logger.warn(
          { mismatches: report.mismatches.slice(0, 20), count: report.mismatches.length },
          'drift encontrado',
        );
      } else {
        logger.info({ budgets: report.budgets, items: report.items }, 'sem drift');
      }
      return { mismatches: report.mismatches.length };
    },
    { connection, concurrency: 1, ...lock },
  );

  for (const w of [searchWorker, maintenanceWorker]) {
    w.on('failed', (job, error) => {
      logger.warn(
        { queue: w.name, jobId: job?.id, attempt: job?.attemptsMade, error: error.message },
        'tarefa falhou',
      );
      // Falha que se resolve na próxima tentativa é o sistema funcionando; esgotar as tentativas,
      // não: a tarefa fica em "failed" e alguém precisa olhar.
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        reporter.capture(error, {
          tags: { queue: w.name, job: job.name },
          extra: { jobId: job.id, data: job.data, attempts: job.attemptsMade },
        });
      }
    });
    w.on('stalled', (jobId) => {
      logger.warn(
        { queue: w.name, jobId },
        'tarefa travada (worker parou de responder); voltou para a fila',
      );
    });
  }

  if (config.driftCheckCron) {
    await maintenance.upsertJobScheduler(
      DRIFT_CHECK,
      { pattern: config.driftCheckCron },
      { name: DRIFT_CHECK },
    );
  }

  // O relay olha o outbox periodicamente. Um de cada vez: a próxima rodada só começa depois da
  // anterior terminar, e uma falha (banco fora) só adia para a rodada seguinte.
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async (): Promise<void> => {
    try {
      const published = await relay.drain();
      if (published > 0) logger.debug({ published }, 'outbox publicado');
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'relay falhou; tenta de novo',
      );
    }
    if (!stopped) timer = setTimeout(() => void tick(), config.relayEveryMs);
  };
  void tick();

  return {
    search,
    maintenance,
    relay,
    close: async () => {
      stopped = true;
      clearTimeout(timer);
      await Promise.all([searchWorker.close(), maintenanceWorker.close()]);
      await Promise.all([search.close(), maintenance.close()]);
      connection.disconnect();
    },
  };
}
