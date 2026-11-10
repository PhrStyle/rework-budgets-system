import { calcBudget, calcFromSubtotals } from '@budgets/budget-calc';
import { bp, cents, qty } from '@budgets/money';
import type { Cents } from '@budgets/money';

import type { PrismaClient } from '../generated/prisma/client.js';
import { at } from './at.js';

const PAGE = 200;

export interface VerifyReport {
  budgets: number;
  items: number;
  /** Uma linha por divergência; vazio quando tudo bate. */
  mismatches: string[];
}

interface Own {
  parentId: number | null;
  prazo: number;
  margem: number;
  groupSubtotals: Cents[];
  storedTotal: bigint;
}

/**
 * Relê o banco pelo Prisma e recalcula tudo a partir das linhas: total de cada item, subtotal de
 * cada grupo e total de cada orçamento (com os filhos). Compara com o que está gravado e com os
 * totais esperados do gerador. Prova que a ida e volta pelo banco não perde nenhum centavo.
 */
export async function verifyTotals(
  prisma: PrismaClient,
  expected: Record<number, number>,
): Promise<VerifyReport> {
  const mismatches: string[] = [];
  const own = new Map<number, Own>();
  let items = 0;
  let cursor = 0;

  for (;;) {
    const page = await prisma.budget.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: PAGE,
      include: {
        groups: {
          orderBy: { position: 'asc' },
          include: { items: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (page.length === 0) break;
    cursor = at(page, page.length - 1).id;

    for (const b of page) {
      const calc = calcBudget({
        id: b.id,
        prazo: bp(b.prazoBp),
        margem: bp(b.margemBp),
        children: [],
        groups: b.groups.map((g) => ({
          id: g.id,
          items: g.items.map((i) => ({
            id: i.id,
            price: cents(i.priceCents),
            quantity: qty(i.quantity),
            discount: bp(i.discountBp),
          })),
        })),
      });

      for (const [gi, g] of b.groups.entries()) {
        const recalculated = at(calc.groups, gi);
        if (g.subtotalCents !== BigInt(recalculated.subtotal)) {
          mismatches.push(
            `grupo ${g.id}: gravado ${g.subtotalCents}, recalculado ${recalculated.subtotal}`,
          );
        }
        if (g.itemCount !== g.items.length) {
          mismatches.push(`grupo ${g.id}: item_count ${g.itemCount}, linhas ${g.items.length}`);
        }
        for (const [ii, i] of g.items.entries()) {
          items++;
          const total = at(recalculated.items, ii).total;
          if (i.totalCents !== BigInt(total)) {
            mismatches.push(`item ${i.id}: gravado ${i.totalCents}, recalculado ${total}`);
          }
        }
      }
      own.set(b.id, {
        parentId: b.parentId,
        prazo: b.prazoBp,
        margem: b.margemBp,
        groupSubtotals: calc.groups.map((g) => g.subtotal),
        storedTotal: b.totalCents,
      });
    }
  }

  // Filhos não têm filhos (1 nível): o total de um filho só depende dos grupos dele.
  const totalOf = (o: Own, childTotals: Cents[]): Cents =>
    calcFromSubtotals({
      groupSubtotals: o.groupSubtotals,
      childTotals,
      prazo: bp(o.prazo),
      margem: bp(o.margem),
    }).total;
  const childTotals = new Map<number, Cents[]>();
  for (const o of own.values()) {
    if (o.parentId === null) continue;
    const list = childTotals.get(o.parentId) ?? [];
    list.push(totalOf(o, []));
    childTotals.set(o.parentId, list);
  }

  for (const [id, o] of own) {
    const total = totalOf(o, childTotals.get(id) ?? []);
    if (o.storedTotal !== BigInt(total)) {
      mismatches.push(`orçamento ${id}: gravado ${o.storedTotal}, recalculado ${total}`);
    }
    if (expected[id] !== total) {
      mismatches.push(`orçamento ${id}: esperado ${String(expected[id])}, recalculado ${total}`);
    }
  }
  const missing = Object.keys(expected).filter((id) => !own.has(Number(id)));
  for (const id of missing) mismatches.push(`orçamento ${id}: esperado e não está no banco`);

  return { budgets: own.size, items, mismatches };
}
