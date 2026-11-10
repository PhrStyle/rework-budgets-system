import { pino } from 'pino';

import { createPrisma } from '../db/prisma.js';
import { createReporter } from '../errors/reporter.js';
import { elasticsearchUrl, redisDataUrl } from '../db/url.js';
import { createElastic } from '../search/elastic.js';
import { ElasticIndexer } from '../search/elastic-indexer.js';
import { startWorker } from './worker.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
});
const prisma = createPrisma();
const reporter = createReporter({
  dsn: process.env.SENTRY_DSN || undefined,
  release: process.env.APP_VERSION ?? 'local',
  environment: process.env.NODE_ENV ?? 'development',
  service: 'worker',
});
const worker = await startWorker({
  redisDataUrl: redisDataUrl(),
  prisma,
  // Prazo maior que o da API: aqui ninguém espera na tela, e a fila repete o que falhar.
  indexer: new ElasticIndexer(createElastic(elasticsearchUrl(), 10_000)),
  logger,
  relayEveryMs: 500,
  driftCheckCron: process.env.DRIFT_CHECK_CRON ?? '0 3 * * *',
  reporter,
});
logger.info('worker no ar: outbox → fila → Elasticsearch, e conferência de drift agendada');

// Desligamento limpo (deploy): termina as tarefas em andamento antes de sair.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'desligando o worker');
    void worker
      .close()
      .then(() => reporter.flush())
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
}
