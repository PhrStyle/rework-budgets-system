import type { BudgetStatus } from '@budgets/contracts';
import type { Logger } from 'pino';

import { toCents } from '../db/database.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** O que a busca precisa saber de um orçamento (a listagem inteira sai daqui na etapa 7b). */
export interface BudgetDocument {
  id: number;
  description: string;
  clientId: number;
  clientName: string;
  sellerId: number;
  sellerName: string;
  status: BudgetStatus;
  totalCents: number;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Destino da indexação: o Elasticsearch ([`ElasticIndexer`]), ou só o log (`LogIndexer`). */
export interface SearchIndexer {
  upsertBudget(doc: BudgetDocument): Promise<void>;
  removeBudget(id: number): Promise<void>;
}

export class LogIndexer implements SearchIndexer {
  constructor(private readonly logger: Logger) {}

  upsertBudget(doc: BudgetDocument): Promise<void> {
    this.logger.info({ budgetId: doc.id, totalCents: doc.totalCents }, 'orçamento indexado (log)');
    return Promise.resolve();
  }

  removeBudget(id: number): Promise<void> {
    this.logger.info({ budgetId: id }, 'orçamento removido do índice (log)');
    return Promise.resolve();
  }
}

const documentInclude = {
  client: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
} as const;

type BudgetRow = Prisma.BudgetGetPayload<{ include: typeof documentInclude }>;

export function toBudgetDocument(b: BudgetRow): BudgetDocument {
  return {
    id: b.id,
    description: b.description,
    clientId: b.client.id,
    clientName: b.client.name,
    sellerId: b.seller.id,
    sellerName: b.seller.name,
    status: b.status,
    totalCents: toCents(b.totalCents),
    parentId: b.parentId,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Todos os orçamentos, já como documentos da busca (para reindexar do zero). */
export async function loadAllBudgetDocuments(prisma: PrismaClient): Promise<BudgetDocument[]> {
  const rows = await prisma.budget.findMany({ orderBy: { id: 'asc' }, include: documentInclude });
  return rows.map(toBudgetDocument);
}

/** Lê o orçamento como está agora no Postgres: a tarefa leva só o id, nunca os dados velhos. */
export async function loadBudgetDocument(
  prisma: PrismaClient,
  id: number,
): Promise<BudgetDocument | null> {
  const b = await prisma.budget.findUnique({ where: { id }, include: documentInclude });
  return b ? toBudgetDocument(b) : null;
}
