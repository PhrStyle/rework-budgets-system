import { pino } from 'pino';

import { createPrisma } from '../db/prisma.js';
import { LogIndexer } from './indexer.js';
import { startWorker } from './worker.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
});
const prisma = createPrisma();
const worker = await startWorker({
  redisDataUrl: `redis://127.0.0.1:${process.env.REDIS_DATA_PORT ?? '6380'}`,
  prisma,
  indexer: new LogIndexer(logger),
  logger,
  relayEveryMs: 500,
  driftCheckCron: process.env.DRIFT_CHECK_CRON ?? '0 3 * * *',
});
logger.info('worker no ar: outbox → fila → busca, e conferência de drift agendada');

// Desligamento limpo (deploy): termina as tarefas em andamento antes de sair.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'desligando o worker');
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
}
