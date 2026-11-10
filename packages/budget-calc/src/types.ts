import type { Bp, Cents, Qty } from '@budgets/money';

export type Id = string | number;

/** Item como entra no cálculo. A unidade não importa aqui: a quantidade já vem validada e escalada. */
export interface ItemInput {
  id: Id;
  price: Cents;
  quantity: Qty;
  discount: Bp;
}

export interface GroupInput {
  id: Id;
  items: readonly ItemInput[];
}

export interface BudgetInput {
  id: Id;
  /** Ajuste de prazo, de −100% a +100%. */
  prazo: Bp;
  /** Margem, de 0% a +100%. */
  margem: Bp;
  groups: readonly GroupInput[];
  /** Orçamentos vinculados (no máximo 1 nível: um filho não tem filhos). */
  children: readonly BudgetInput[];
}

/** Totais de um orçamento. Sempre vale `subtotal + prazoAmount + margemAmount === total`. */
export interface Totals {
  /** Soma dos subtotais dos grupos. */
  groupsTotal: Cents;
  /** Soma dos totais dos orçamentos filhos (cada um já com o prazo e a margem dele). */
  childrenTotal: Cents;
  /** `groupsTotal + childrenTotal`. */
  subtotal: Cents;
  /** Valor do ajuste de prazo (pode ser negativo). */
  prazoAmount: Cents;
  /** Subtotal com o ajuste de prazo, arredondado. */
  afterPrazo: Cents;
  /** Valor da margem. */
  margemAmount: Cents;
  /** Total do orçamento. */
  total: Cents;
}

export interface BudgetBreakdown extends Totals {
  id: Id;
  groups: { id: Id; subtotal: Cents; items: { id: Id; total: Cents }[] }[];
  children: { id: Id; total: Cents }[];
}
