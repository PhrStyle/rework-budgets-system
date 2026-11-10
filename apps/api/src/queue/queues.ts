import type { DefaultJobOptions } from 'bullmq';

/** Tópico do outbox e nome da tarefa: um orçamento mudou (salvo, ou o total de um filho mudou). */
export const BUDGET_CHANGED = 'budget.changed';

/** Fila da busca: manter o índice igual ao Postgres. */
export const SEARCH_QUEUE = 'search';
/** Fila de manutenção: tarefas lentas (conferência de drift), separadas para não atrasar a busca. */
export const MAINTENANCE_QUEUE = 'maintenance';
export const DRIFT_CHECK = 'drift-check';

export interface BudgetChangedJob {
  budgetId: number;
  /** Quando a mudança foi gravada (do outbox): mede o atraso até a busca refletir. */
  changedAt: string;
}

/**
 * Indexar pode repetir sem efeito colateral (o documento é sobrescrito pelo id do orçamento),
 * então a fila pode entregar "pelo menos uma vez" sem problema. Com o destino fora do ar, tenta
 * de novo com espera crescente: 1 s, 2 s, 4 s… (8 tentativas ≈ 4 min no total).
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 1_000 },
  // Concluídas ficam 1 h (o jobId fixo evita reprocessar se o relay publicar de novo);
  // falhas ficam 7 dias, com o erro, para alguém olhar e reprocessar.
  removeOnComplete: { age: 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};
