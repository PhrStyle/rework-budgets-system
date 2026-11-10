import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { calcFromSubtotals } from '@budgets/budget-calc';
import type {
  BudgetDetail,
  BudgetListQuery,
  BudgetStatus,
  BudgetSummary,
  GroupItemsPage,
  GroupSummary,
  Item,
  GroupItemsQuery,
  Page,
  Unit,
} from '@budgets/contracts';
import { bp, cents } from '@budgets/money';

import { Database, toCents } from '../db/database.js';
import type { DraftGroup, DraftItem } from '../drafts/draft.js';
import { DraftStore } from '../drafts/draft.store.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(DraftStore) private readonly drafts: DraftStore,
  ) {}

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
   *
   * Com rascunho aberto: o dono vê o orçamento como ficará ao salvar (rascunho sobre o banco);
   * os outros veem o que está salvo, com o aviso de quem está editando.
   */
  async detail(id: number, viewerId: number | null = null): Promise<BudgetDetail> {
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
    const draft = await this.drafts.get(id);
    const mine = draft?.ownerId === viewerId ? draft : null;

    const groups = new Map<number, GroupSummary>(
      b.groups.map((g) => [
        g.id,
        {
          id: g.id,
          name: g.name,
          category: g.category,
          position: g.position,
          version: g.version,
          subtotalCents: toCents(g.subtotalCents),
          itemCount: g.itemCount,
        },
      ]),
    );
    for (const g of Object.values(mine?.groups ?? {})) {
      if (g.deleted) groups.delete(g.id);
      else groups.set(g.id, summary(g));
    }
    const header = { ...pick(b), ...mine?.header };
    const children = b.children.map((c) => ({
      id: c.id,
      description: c.description,
      totalCents: toCents(c.totalCents),
    }));

    // O detalhamento (valor do prazo, da margem) sai dos subtotais, sem ler itens.
    const totals = calcFromSubtotals({
      groupSubtotals: [...groups.values()].map((g) => cents(g.subtotalCents)),
      childTotals: children.map((c) => cents(c.totalCents)),
      prazo: bp(header.prazoBp),
      margem: bp(header.margemBp),
    });
    if (!mine && BigInt(totals.total) !== b.totalCents) {
      // Não deveria acontecer: o total guardado é regravado na mesma transação dos subtotais.
      this.logger.warn(
        { budgetId: id, stored: b.totalCents.toString(), recalculated: totals.total },
        'total guardado diverge dos subtotais',
      );
    }

    return {
      id: b.id,
      ...header,
      client: { id: b.client.id, name: b.client.name },
      seller: { id: b.seller.id, name: b.seller.name },
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      parent: b.parent,
      totals,
      groups: [...groups.values()].sort((x, y) => x.position - y.position),
      children,
      draft: draft ? await this.drafts.info(draft, viewerId) : null,
    };
  }

  /**
   * Itens de um grupo por página, com cursor na posição (estável mesmo com inserções).
   * Para o dono do rascunho, os itens alterados, criados e removidos no rascunho entram na página.
   */
  async groupItems(
    budgetId: number,
    groupId: number,
    query: GroupItemsQuery,
    viewerId: number | null = null,
  ): Promise<GroupItemsPage> {
    const draft = await this.drafts.get(budgetId);
    const mine = draft?.ownerId === viewerId ? draft : null;
    const inDraft = mine?.groups[groupId];
    const group =
      inDraft ?? (await this.db.prisma.group.findFirst({ where: { id: groupId, budgetId } }));
    if (!group || inDraft?.deleted) {
      throw new NotFoundException(`Grupo ${groupId} não existe no orçamento ${budgetId}.`);
    }

    const draftItems = Object.values(mine?.items ?? {}).filter((i) => i.groupId === groupId);
    // Busca a mais o número de itens do rascunho: os que ele tira da página são repostos.
    const take = query.limit + draftItems.length + 1;
    const rows =
      groupId > 0
        ? await this.db.prisma.item.findMany({
            where: {
              groupId,
              position: query.after === undefined ? undefined : { gt: query.after },
            },
            orderBy: { position: 'asc' },
            take,
          })
        : [];
    const truncated = rows.length === take;
    // Com o banco cortado, só vale o que está até a última posição lida (depois dela pode haver
    // itens do banco que não vieram).
    const boundary = truncated ? (rows.at(-1)?.position ?? Infinity) : Infinity;

    const overridden = new Set(draftItems.map((i) => i.id));
    const merged: Item[] = [
      ...rows.filter((r) => !overridden.has(r.id)).map(toItem),
      ...draftItems
        .filter((i) => !i.deleted && i.position > (query.after ?? -Infinity))
        .map(itemOf),
    ]
      .filter((i) => i.position <= boundary)
      .sort((x, y) => x.position - y.position);

    const items = merged.slice(0, query.limit);
    const hasMore = merged.length > query.limit || truncated;
    return {
      groupId,
      version: group.version,
      itemCount: group.itemCount,
      items,
      next: hasMore ? (items.at(-1)?.position ?? null) : null,
    };
  }
}

function pick(b: { description: string; status: BudgetStatus; prazoBp: number; margemBp: number }) {
  return { description: b.description, status: b.status, prazoBp: b.prazoBp, margemBp: b.margemBp };
}

function summary(g: DraftGroup): GroupSummary {
  return {
    id: g.id,
    name: g.name,
    category: g.category,
    position: g.position,
    version: g.version,
    subtotalCents: g.subtotalCents,
    itemCount: g.itemCount,
  };
}

export function itemOf(i: DraftItem): Item {
  return {
    id: i.id,
    productId: i.productId,
    name: i.name,
    unit: i.unit,
    priceCents: i.priceCents,
    quantity: i.quantity,
    discountBp: i.discountBp,
    position: i.position,
    totalCents: i.totalCents,
  };
}

function toItem(i: {
  id: number;
  productId: number;
  name: string;
  unit: string;
  priceCents: number;
  quantity: number;
  discountBp: number;
  position: number;
  totalCents: bigint;
}): Item {
  return {
    id: i.id,
    productId: i.productId,
    name: i.name,
    unit: i.unit as Unit,
    priceCents: i.priceCents,
    quantity: i.quantity,
    discountBp: i.discountBp,
    position: i.position,
    totalCents: toCents(i.totalCents),
  };
}
