import { bp, cents, qty } from '@budgets/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calcBudget, calcFromSubtotals, itemDelta } from './calc.js';
import { NestingError } from './nesting.js';
import type { BudgetInput, GroupInput, ItemInput } from './types.js';

let nextId = 0;
const item: fc.Arbitrary<ItemInput> = fc
  .record({
    price: fc.integer({ min: 0, max: 100_000_000 }), // até R$ 1 milhão
    quantity: fc.integer({ min: 1, max: 100_000 }), // até 1.000 unidades
    discount: fc.integer({ min: 0, max: 10_000 }),
  })
  .map((r) => ({
    id: `i${String(nextId++)}`,
    price: cents(r.price),
    quantity: qty(r.quantity),
    discount: bp(r.discount),
  }));

const group: fc.Arbitrary<GroupInput> = fc
  .array(item, { maxLength: 20 })
  .map((items) => ({ id: `g${String(nextId++)}`, items }));

const prazo = fc.integer({ min: -10_000, max: 10_000 }).map(bp);
const margem = fc.integer({ min: 0, max: 10_000 }).map(bp);

const leaf: fc.Arbitrary<BudgetInput> = fc
  .record({ groups: fc.array(group, { maxLength: 4 }), prazo, margem })
  .map((r) => ({ id: nextId++, ...r, children: [] }));

const budget: fc.Arbitrary<BudgetInput> = fc
  .record({
    groups: fc.array(group, { maxLength: 4 }),
    prazo,
    margem,
    children: fc.array(leaf, { maxLength: 3 }),
  })
  .map((r) => ({ id: nextId++, ...r }));

describe('calcBudget', () => {
  it('as linhas exibidas sempre somam o total', () => {
    fc.assert(
      fc.property(budget, (b) => {
        const r = calcBudget(b);
        return (
          r.subtotal === r.groupsTotal + r.childrenTotal &&
          r.afterPrazo === r.subtotal + r.prazoAmount &&
          r.total === r.afterPrazo + r.margemAmount &&
          r.groupsTotal === r.groups.reduce((s, g) => s + g.subtotal, 0) &&
          r.groups.every((g) => g.subtotal === g.items.reduce((s, i) => s + i.total, 0))
        );
      }),
    );
  });

  it('dá o mesmo resultado que o cálculo por subtotais (o caminho da API)', () => {
    fc.assert(
      fc.property(budget, (b) => {
        const full = calcBudget(b);
        const fromSubtotals = calcFromSubtotals({
          groupSubtotals: full.groups.map((g) => g.subtotal),
          childTotals: full.children.map((c) => c.total),
          prazo: b.prazo,
          margem: b.margem,
        });
        const {
          groupsTotal,
          childrenTotal,
          subtotal,
          prazoAmount,
          afterPrazo,
          margemAmount,
          total,
        } = full;
        expect({
          groupsTotal,
          childrenTotal,
          subtotal,
          prazoAmount,
          afterPrazo,
          margemAmount,
          total,
        }).toEqual(fromSubtotals);
      }),
    );
  });

  it('recusa neto (filho que tem filhos)', () => {
    const grandchild: BudgetInput = {
      id: 3,
      prazo: bp(0),
      margem: bp(0),
      groups: [],
      children: [],
    };
    const child: BudgetInput = { ...grandchild, id: 2, children: [grandchild] };
    const parent: BudgetInput = { ...grandchild, id: 1, children: [child] };
    expect(() => calcBudget(parent)).toThrow(NestingError);
  });

  it('recusa desconto fora de 0% a 100%', () => {
    const b: BudgetInput = {
      id: 1,
      prazo: bp(0),
      margem: bp(0),
      groups: [
        {
          id: 'g',
          items: [{ id: 'i', price: cents(100), quantity: qty(100), discount: bp(10_001) }],
        },
      ],
      children: [],
    };
    expect(() => calcBudget(b)).toThrow('discount');
  });
});

describe('calcFromSubtotals', () => {
  it('recusa prazo e margem fora dos limites', () => {
    const base = { groupSubtotals: [cents(100)], childTotals: [] };
    expect(() => calcFromSubtotals({ ...base, prazo: bp(-10_001), margem: bp(0) })).toThrow(
      'prazo',
    );
    expect(() => calcFromSubtotals({ ...base, prazo: bp(10_001), margem: bp(0) })).toThrow('prazo');
    expect(() => calcFromSubtotals({ ...base, prazo: bp(0), margem: bp(-1) })).toThrow('margem');
    expect(() => calcFromSubtotals({ ...base, prazo: bp(0), margem: bp(10_001) })).toThrow(
      'margem',
    );
  });
});

describe('itemDelta', () => {
  it('aplicar edições por delta dá o mesmo que recalcular o grupo do zero', () => {
    fc.assert(
      fc.property(
        fc.array(item, { minLength: 1, maxLength: 30 }),
        fc.array(fc.tuple(fc.nat(), item, fc.constantFrom('edit', 'add', 'remove')), {
          maxLength: 50,
        }),
        (initial, edits) => {
          const items = [...initial];
          let subtotal = items.reduce((s, i) => s + itemDelta(null, i), 0);
          for (const [pos, next, kind] of edits) {
            if (kind === 'add' || items.length === 0) {
              items.push(next);
              subtotal += itemDelta(null, next);
              continue;
            }
            const k = pos % items.length;
            const current = items[k];
            if (current === undefined) continue;
            if (kind === 'remove') {
              items.splice(k, 1);
              subtotal += itemDelta(current, null);
            } else {
              items[k] = next;
              subtotal += itemDelta(current, next);
            }
          }
          const recomputed = calcBudget({
            id: 0,
            prazo: bp(0),
            margem: bp(0),
            groups: [{ id: 'g', items }],
            children: [],
          }).groupsTotal;
          return subtotal === recomputed;
        },
      ),
    );
  });

  it('criar, editar e remover', () => {
    const a: ItemInput = { id: 'a', price: cents(1000), quantity: qty(200), discount: bp(0) }; // 2000
    const b: ItemInput = { ...a, quantity: qty(300) }; // 3000
    expect(itemDelta(null, a)).toBe(2000);
    expect(itemDelta(a, b)).toBe(1000);
    expect(itemDelta(b, null)).toBe(-3000);
  });
});
