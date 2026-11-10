import { applyRate, cents, itemTotal, sum } from '@budgets/money';
import type { Bp, Cents } from '@budgets/money';

import { assertWithinLimit } from './limits.js';
import { NestingError } from './nesting.js';
import type { BudgetBreakdown, BudgetInput, ItemInput, Totals } from './types.js';

export interface SubtotalsInput {
  groupSubtotals: readonly Cents[];
  childTotals: readonly Cents[];
  prazo: Bp;
  margem: Bp;
}

/**
 * Total do orçamento a partir de somas prontas: `(Σ grupos + Σ filhos) → prazo → margem`.
 *
 * É o caminho da API: com os subtotais guardados, mudar o prazo ou a margem não lê nenhum item.
 * Arredonda a cada passo (comercial), para que cada linha exibida seja um valor real e
 * `subtotal + prazoAmount + margemAmount === total` valha sempre.
 */
export function calcFromSubtotals({
  groupSubtotals,
  childTotals,
  prazo,
  margem,
}: SubtotalsInput): Totals {
  assertWithinLimit('prazo', prazo);
  assertWithinLimit('margem', margem);

  const groupsTotal = sum(groupSubtotals);
  const childrenTotal = sum(childTotals);
  const subtotal = sum([groupsTotal, childrenTotal]);
  const afterPrazo = applyRate(subtotal, prazo);
  const total = applyRate(afterPrazo, margem);

  return {
    groupsTotal,
    childrenTotal,
    subtotal,
    prazoAmount: cents(afterPrazo - subtotal),
    afterPrazo,
    margemAmount: cents(total - afterPrazo),
    total,
  };
}

function lineTotal(item: ItemInput): Cents {
  assertWithinLimit('discount', item.discount);
  return itemTotal(item.price, item.quantity, item.discount);
}

/**
 * Cálculo completo, a partir de todos os itens: a régua que verifica o cálculo incremental.
 * Recusa orçamento com neto (um filho que tem filhos).
 */
export function calcBudget(budget: BudgetInput): BudgetBreakdown {
  return calc(budget, 0);
}

function calc(budget: BudgetInput, depth: number): BudgetBreakdown {
  if (depth > 0 && budget.children.length > 0) {
    throw new NestingError({
      code: 'CHILD_HAS_CHILDREN',
      message: `#${String(budget.id)} está dentro de outro orçamento e não pode conter orçamentos.`,
    });
  }

  const groups = budget.groups.map((group) => {
    const items = group.items.map((item) => ({ id: item.id, total: lineTotal(item) }));
    return { id: group.id, subtotal: sum(items.map((i) => i.total)), items };
  });
  const children = budget.children.map((child) => ({
    id: child.id,
    total: calc(child, depth + 1).total,
  }));

  const totals = calcFromSubtotals({
    groupSubtotals: groups.map((g) => g.subtotal),
    childTotals: children.map((c) => c.total),
    prazo: budget.prazo,
    margem: budget.margem,
  });

  return { id: budget.id, ...totals, groups, children };
}

/**
 * Quanto o subtotal do grupo muda quando um item é editado, criado (`before = null`)
 * ou removido (`after = null`). Base do `PATCH` com delta: `subtotal += delta`.
 */
export function itemDelta(before: ItemInput | null, after: ItemInput | null): Cents {
  const oldTotal = before ? lineTotal(before) : 0;
  const newTotal = after ? lineTotal(after) : 0;
  return cents(newTotal - oldTotal);
}
