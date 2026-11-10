import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { calcFromSubtotals } from '@budgets/budget-calc';
import type {
  BudgetDetail,
  BudgetListQuery,
  BudgetSummary,
  GroupItemsPage,
  GroupItemsQuery,
  Page,
  Unit,
} from '@budgets/contracts';
import { bp, cents } from '@budgets/money';

import { Database, toCents } from '../db/database.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(@Inject(Database) private readonly db: Database) {}

  /** Listagem com filtro. A busca por texto vai para o Elasticsearch na etapa 7. */
  async list(query: BudgetListQuery): Promise<Page<BudgetSummary>> {
    const where: Prisma.BudgetWhereInput = {
      status: query.status,
      sellerId: query.sellerId,
    };
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' } as const;
      const number = /^\d{1,9}$/.test(query.search) ? Number(query.search) : null;
      where.OR = [
        { description: contains },
        { client: { name: contains } },
        ...(number === null ? [] : [{ id: number }]),
      ];
    }

    const [total, rows] = await this.db.prisma.$transaction([
      this.db.prisma.budget.count({ where }),
      this.db.prisma.budget.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { client: true, seller: true },
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((b) => ({
        id: b.id,
        description: b.description,
        client: { id: b.client.id, name: b.client.name },
        seller: { id: b.seller.id, name: b.seller.name },
        status: b.status,
        totalCents: toCents(b.totalCents),
        createdAt: b.createdAt.toISOString(),
        parentId: b.parentId,
      })),
    };
  }

  /**
   * Cabeçalho, totais e o resumo de cada grupo, sem nenhum item: abrir um orçamento de
   * 1.000 itens custa o mesmo que abrir um de 10. Os itens vêm por grupo, sob demanda.
   */
  async detail(id: number): Promise<BudgetDetail> {
    const b = await this.db.prisma.budget.findUnique({
      where: { id },
      include: {
        client: true,
        seller: true,
        parent: { select: { id: true, description: true } },
        groups: { orderBy: { position: 'asc' } },
        children: {
          orderBy: { id: 'asc' },
          select: { id: true, description: true, totalCents: true },
        },
      },
    });
    if (!b) throw new NotFoundException(`Orçamento ${id} não existe.`);

    // O detalhamento (valor do prazo, da margem) sai dos subtotais guardados, sem ler itens.
    const totals = calcFromSubtotals({
      groupSubtotals: b.groups.map((g) => cents(toCents(g.subtotalCents))),
      childTotals: b.children.map((c) => cents(toCents(c.totalCents))),
      prazo: bp(b.prazoBp),
      margem: bp(b.margemBp),
    });
    if (BigInt(totals.total) !== b.totalCents) {
      // Não deveria acontecer: o total guardado é regravado na mesma transação dos subtotais.
      this.logger.warn(
        { budgetId: id, stored: b.totalCents.toString(), recalculated: totals.total },
        'total guardado diverge dos subtotais',
      );
    }

    return {
      id: b.id,
      description: b.description,
      client: { id: b.client.id, name: b.client.name },
      seller: { id: b.seller.id, name: b.seller.name },
      status: b.status,
      prazoBp: b.prazoBp,
      margemBp: b.margemBp,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      parent: b.parent,
      totals,
      groups: b.groups.map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
        position: g.position,
        version: g.version,
        subtotalCents: toCents(g.subtotalCents),
        itemCount: g.itemCount,
      })),
      children: b.children.map((c) => ({
        id: c.id,
        description: c.description,
        totalCents: toCents(c.totalCents),
      })),
    };
  }

  /** Itens de um grupo por página, com cursor na posição (estável mesmo com inserções). */
  async groupItems(
    budgetId: number,
    groupId: number,
    query: GroupItemsQuery,
  ): Promise<GroupItemsPage> {
    const group = await this.db.prisma.group.findFirst({ where: { id: groupId, budgetId } });
    if (!group)
      throw new NotFoundException(`Grupo ${groupId} não existe no orçamento ${budgetId}.`);

    const rows = await this.db.prisma.item.findMany({
      where: { groupId, position: query.after === undefined ? undefined : { gt: query.after } },
      orderBy: { position: 'asc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      groupId,
      version: group.version,
      itemCount: group.itemCount,
      items: items.map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        unit: i.unit as Unit,
        priceCents: i.priceCents,
        quantity: i.quantity,
        discountBp: i.discountBp,
        position: i.position,
        totalCents: toCents(i.totalCents),
      })),
      next: hasMore ? (items.at(-1)?.position ?? null) : null,
    };
  }
}
