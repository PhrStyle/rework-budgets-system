import { bp, cents, qty } from '@budgets/money';
import { describe, expect, it } from 'vitest';

import fixtures from '../../../fixtures/budget-cases.json';
import { calcBudget } from './calc.js';
import { NestingError } from './nesting.js';
import type { BudgetInput } from './types.js';

interface RawItem {
  id: string;
  price: number;
  quantity: number;
  discount: number;
}
interface RawBudget {
  id: number;
  prazo: number;
  margem: number;
  groups: { id: string; items: RawItem[] }[];
  children: RawBudget[];
}
interface FixtureCase {
  name: string;
  input: RawBudget;
  expected?: Record<string, unknown>;
  error?: string;
}

/** O JSON traz números puros; aqui eles passam pelos construtores que validam e marcam o tipo. */
function toInput(raw: RawBudget): BudgetInput {
  return {
    id: raw.id,
    prazo: bp(raw.prazo),
    margem: bp(raw.margem),
    groups: raw.groups.map((g) => ({
      id: g.id,
      items: g.items.map((i) => ({
        id: i.id,
        price: cents(i.price),
        quantity: qty(i.quantity),
        discount: bp(i.discount),
      })),
    })),
    children: raw.children.map(toInput),
  };
}

const cases = fixtures.cases as unknown as FixtureCase[];

describe('casos compartilhados (fixtures/budget-cases.json)', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const input = toInput(c.input);
    if (c.error !== undefined) {
      expect(() => calcBudget(input)).toThrow(NestingError);
      try {
        calcBudget(input);
      } catch (error) {
        expect((error as NestingError).violation.code).toBe(c.error);
      }
      return;
    }
    expect(calcBudget(input)).toEqual({ id: c.input.id, ...c.expected });
  });
});
