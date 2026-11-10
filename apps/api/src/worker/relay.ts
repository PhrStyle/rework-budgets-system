import type { Queue } from 'bullmq';

import type { PrismaClient } from '../generated/prisma/client.js';
import { BUDGET_CHANGED } from '../queue/queues.js';
import type { BudgetChangedJob } from '../queue/queues.js';

const BATCH = 200;

/**
 * Leva as linhas pendentes do outbox para a fila. Numa transação: trava um lote (`SKIP LOCKED`:
 * dois relays pegam lotes diferentes), publica na fila e marca como publicado.
 *
 * Se o processo cair depois de publicar e antes do commit, o lote volta a ficar pendente e é
 * publicado de novo, com o mesmo `jobId` (o id da linha): a fila ignora a repetição.
 */
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly search: Queue<BudgetChangedJob>,
  ) {}

  /** Publica um lote; devolve quantas linhas publicou (0 = nada pendente). */
  async publishBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: bigint; topic: string; aggregate_id: number; created_at: Date }[]
      >`
        SELECT id, topic, aggregate_id, created_at FROM outbox
        WHERE published_at IS NULL
        ORDER BY id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return 0;

      await this.search.addBulk(
        rows
          .filter((r) => r.topic === BUDGET_CHANGED)
          .map((r) => ({
            name: BUDGET_CHANGED,
            data: { budgetId: r.aggregate_id, changedAt: r.created_at.toISOString() },
            opts: { jobId: `outbox-${r.id}` },
          })),
      );
      await tx.$executeRaw`
        UPDATE outbox SET published_at = now() WHERE id = ANY(${rows.map((r) => r.id)}::bigint[])`;
      return rows.length;
    });
  }

  /** Publica até esvaziar o que está pendente agora. */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const published = await this.publishBatch();
      total += published;
      if (published < BATCH) return total;
    }
  }
}
