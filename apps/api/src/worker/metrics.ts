import { createServer } from 'node:http';
import type { Server } from 'node:http';

import type { Queue } from 'bullmq';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import type { PrismaClient } from '../generated/prisma/client.js';

const STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

/**
 * Métricas do worker. As da fila e do outbox são lidas na hora da coleta (o Prometheus pergunta,
 * o worker conta), em vez de guardar no processo um número que envelhece.
 */
export class WorkerMetrics {
  readonly registry = new Registry();

  /** Indexações na busca, por resultado (falha = esgotou as tentativas). */
  readonly indexed = new Counter({
    name: 'budgets_search_index_total',
    help: 'Orçamentos levados para a busca, por resultado.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /** Do salvar (gravação no outbox) até a busca refletir: a consistência eventual, medida. */
  readonly lag = new Histogram({
    name: 'budgets_search_index_lag_seconds',
    help: 'Atraso entre salvar e a busca refletir a mudança.',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [this.registry],
  });

  readonly stalled = new Counter({
    name: 'budgets_jobs_stalled_total',
    help: 'Tarefas retomadas porque o worker que as tinha parou de responder.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  /** Divergências na última conferência de drift (0 = totais guardados batem com o recálculo). */
  readonly drift = new Gauge({
    name: 'budgets_drift_mismatches',
    help: 'Divergências encontradas na última conferência de drift.',
    registers: [this.registry],
  });

  constructor(prisma: PrismaClient, queues: Queue[]) {
    this.registry.setDefaultLabels({ service: 'worker' });
    collectDefaultMetrics({ register: this.registry });

    new Gauge({
      name: 'budgets_queue_jobs',
      help: 'Tarefas em cada fila, por estado.',
      labelNames: ['queue', 'state'] as const,
      registers: [this.registry],
      async collect() {
        for (const queue of queues) {
          const counts = await queue.getJobCounts(...STATES);
          for (const state of STATES) this.set({ queue: queue.name, state }, counts[state] ?? 0);
        }
      },
    });

    new Gauge({
      name: 'budgets_outbox_pending',
      help: 'Avisos no outbox ainda não publicados na fila.',
      registers: [this.registry],
      async collect() {
        this.set(await prisma.outboxEvent.count({ where: { publishedAt: null } }));
      },
    });
  }
}

/** Servidor HTTP mínimo só para o Prometheus ler `GET /metrics`. */
export function serveMetrics(registry: Registry, port: number, host: string): Server {
  const server = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    registry
      .metrics()
      .then((body) => {
        res.writeHead(200, { 'content-type': registry.contentType }).end(body);
      })
      .catch((error: unknown) => {
        res.writeHead(500).end(String(error));
      });
  });
  return server.listen(port, host);
}
