import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { calcFromSubtotals } from '@budgets/budget-calc';
import { bp, cents } from '@budgets/money';

import { Database, toCents } from '../db/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BUDGET_CHANGED } from '../queue/queues.js';
import type { Draft } from './draft.js';

type Tx = Prisma.TransactionClient;

export interface SaveOutcome {
  createdIds: { groups: Record<string, number>; items: Record<string, number> };
  written: { groups: number; items: number };
}

/**
 * Grava o rascunho no Postgres numa transação: **só o que mudou** (o changeset), nunca o
 * orçamento inteiro. Confere a versão de cada grupo tocado e recalcula os totais acima dele.
 */
@Injectable()
export class DraftSaver {
  private readonly logger = new Logger(DraftSaver.name);

  constructor(@Inject(Database) private readonly db: Database) {}

  save(draft: Draft): Promise<SaveOutcome> {
    return this.db.prisma.$transaction((tx) => this.write(tx, draft), { timeout: 30_000 });
  }

  private async write(tx: Tx, draft: Draft): Promise<SaveOutcome> {
    const budgetId = draft.budgetId;
    // Dois "Salvar" ao mesmo tempo (duplo clique, duas abas) esperam um pelo outro aqui.
    await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${budgetId} FOR UPDATE`;

    const groups = Object.values(draft.groups);
    const items = Object.values(draft.items);

    // 1. Versão: cada grupo tocado precisa estar como estava quando o rascunho o leu. Com o
    //    bloqueio, só falha se algo gravou fora do rascunho (script, outra versão da API).
    const conflicts: number[] = [];
    for (const g of groups) {
      if (g.baseVersion === null) continue;
      const { count } = await tx.group.updateMany({
        where: { id: g.id, budgetId, version: g.baseVersion },
        data: { version: { increment: 1 } },
      });
      if (count === 0) conflicts.push(g.id);
    }
    if (conflicts.length > 0) {
      throw new ConflictException({
        message:
          'Alguns grupos mudaram no banco depois que o rascunho os leu. Nada foi gravado; ' +
          'descarte o rascunho e refaça as alterações desses grupos.',
        details: { groups: conflicts },
      });
    }

    // 2. Cabeçalho.
    if (Object.keys(draft.header).length > 0) {
      await tx.budget.update({ where: { id: budgetId }, data: draft.header });
    }

    // 3. Grupos: remover, renomear, criar (ids definitivos para os temporários).
    const removedGroups = groups.filter((g) => g.deleted && g.baseVersion !== null);
    if (removedGroups.length > 0) {
      await tx.group.deleteMany({ where: { id: { in: removedGroups.map((g) => g.id) } } });
    }
    const groupIds = new Map<number, number>();
    for (const g of groups) {
      if (g.deleted) continue;
      if (g.baseVersion === null) {
        const created = await tx.group.create({
          data: {
            budgetId,
            name: g.name,
            category: g.category,
            position: g.position,
            subtotalCents: 0,
            itemCount: 0,
          },
        });
        groupIds.set(g.id, created.id);
      } else {
        await tx.group.update({
          where: { id: g.id },
          data: { name: g.name, category: g.category },
        });
        groupIds.set(g.id, g.id);
      }
    }
    const realGroup = (id: number): number => groupIds.get(id) ?? id;

    // 4. Itens. Mover pode trocar posições entre itens e violar o UNIQUE (grupo, posição) no meio
    //    do caminho: quem muda de posição passa antes por uma temporária negativa (−id, única).
    const existing = items.filter((i) => i.basePosition !== null);
    const removed = existing.filter((i) => i.deleted);
    const changed = existing.filter((i) => !i.deleted);
    const created = items.filter((i) => i.basePosition === null && !i.deleted);

    if (removed.length > 0) {
      await tx.item.deleteMany({ where: { id: { in: removed.map((i) => i.id) } } });
    }
    const moved = changed.filter((i) => i.position !== i.basePosition).map((i) => i.id);
    if (moved.length > 0) {
      await tx.$executeRaw`UPDATE items SET position = -id WHERE id = ANY(${moved}::int[])`;
    }
    if (changed.length > 0) {
      await tx.$executeRaw`
        UPDATE items SET quantity = t.quantity, discount_bp = t.discount_bp,
          total_cents = t.total_cents, position = t.position
        FROM unnest(${changed.map((i) => i.id)}::int[], ${changed.map((i) => i.quantity)}::int[],
          ${changed.map((i) => i.discountBp)}::int[], ${changed.map((i) => i.totalCents)}::bigint[],
          ${changed.map((i) => i.position)}::int[])
          AS t(id, quantity, discount_bp, total_cents, position)
        WHERE items.id = t.id`;
    }
    const itemIds: Record<string, number> = {};
    if (created.length > 0) {
      const rows = await tx.item.createManyAndReturn({
        data: created.map((i) => ({
          groupId: realGroup(i.groupId),
          productId: i.productId,
          name: i.name,
          unit: i.unit,
          priceCents: i.priceCents,
          quantity: i.quantity,
          discountBp: i.discountBp,
          position: i.position,
          totalCents: i.totalCents,
        })),
        select: { id: true, groupId: true, position: true },
      });
      // (grupo, posição) é único: liga cada linha criada ao id temporário, sem depender da ordem.
      const byPlace = new Map(rows.map((r) => [`${r.groupId}:${r.position}`, r.id]));
      for (const i of created) {
        const id = byPlace.get(`${realGroup(i.groupId)}:${i.position}`);
        if (id !== undefined) itemIds[i.id] = id;
      }
    }

    // 5. Subtotais dos grupos tocados, pelo banco. O rascunho chegou a eles por delta; se
    //    divergirem, vale o banco e fica o aviso (é o "drift" que a conferência procura).
    const touched = [...groupIds.values()];
    if (touched.length > 0) {
      const sums = await tx.$queryRaw<{ id: number; subtotal: bigint; count: number }[]>`
        UPDATE groups g SET subtotal_cents = s.subtotal, item_count = s.count
        FROM (
          SELECT g2.id, COALESCE(SUM(i.total_cents), 0)::bigint AS subtotal, COUNT(i.id)::int AS count
          FROM groups g2 LEFT JOIN items i ON i.group_id = g2.id
          WHERE g2.id = ANY(${touched}::int[]) GROUP BY g2.id
        ) s
        WHERE g.id = s.id
        RETURNING g.id, s.subtotal, s.count`;
      const draftById = new Map(groups.map((g) => [realGroup(g.id), g]));
      for (const s of sums) {
        const d = draftById.get(s.id);
        if (d && (BigInt(d.subtotalCents) !== s.subtotal || d.itemCount !== s.count)) {
          this.logger.warn(
            {
              budgetId,
              groupId: s.id,
              draft: { subtotal: d.subtotalCents, count: d.itemCount },
              database: { subtotal: s.subtotal.toString(), count: s.count },
            },
            'subtotal do rascunho diverge do banco; gravado o do banco',
          );
        }
      }
    }

    // 6. Totais do orçamento e, se ele estiver dentro de outro, do pai.
    const parentId = await this.recalculate(tx, budgetId);
    if (parentId !== null) await this.recalculate(tx, parentId);

    // 7. Outbox, na mesma transação: se o commit acontecer, a busca vai saber; se não, não há
    //    aviso de uma mudança que não existiu. O relay leva estas linhas para a fila.
    await tx.outboxEvent.createMany({
      data: [budgetId, ...(parentId === null ? [] : [parentId])].map((id) => ({
        topic: BUDGET_CHANGED,
        aggregateId: id,
      })),
    });

    return {
      createdIds: {
        groups: Object.fromEntries([...groupIds].filter(([tmp, real]) => tmp !== real)),
        items: itemIds,
      },
      written: { groups: groupIds.size + removedGroups.length, items: items.length },
    };
  }

  /** Regrava os totais de um orçamento a partir dos subtotais dos grupos e dos totais dos filhos. */
  private async recalculate(tx: Tx, budgetId: number): Promise<number | null> {
    const budget = await tx.budget.findUniqueOrThrow({
      where: { id: budgetId },
      select: {
        parentId: true,
        prazoBp: true,
        margemBp: true,
        groups: { select: { subtotalCents: true } },
        children: { select: { totalCents: true } },
      },
    });
    const totals = calcFromSubtotals({
      groupSubtotals: budget.groups.map((g) => cents(toCents(g.subtotalCents))),
      childTotals: budget.children.map((c) => cents(toCents(c.totalCents))),
      prazo: bp(budget.prazoBp),
      margem: bp(budget.margemBp),
    });
    await tx.budget.update({
      where: { id: budgetId },
      data: {
        groupsTotalCents: totals.groupsTotal,
        childrenTotalCents: totals.childrenTotal,
        totalCents: totals.total,
      },
    });
    return budget.parentId;
  }
}
