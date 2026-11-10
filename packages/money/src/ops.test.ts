import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyRate, itemTotal, sum } from './ops.js';
import { bp, cents, qty } from './types.js';

const price = fc.integer({ min: 0, max: 1_000_000_000 }).map(cents); // até R$ 10 milhões
const quantity = fc.integer({ min: 1, max: 1_000_000 }).map(qty); // até 10.000 unidades
const discount = fc.integer({ min: 0, max: 10_000 }).map(bp);

describe('itemTotal', () => {
  it('R$ 1.234,56 × 3 un com 7,5% de desconto = R$ 3.425,90', () => {
    // 123456 × 300 × 9250 / 1.000.000 = 342590,4 → 342590
    expect(itemTotal(cents(123456), qty(300), bp(750))).toBe(342590);
  });

  it('quantidade fracionária: 2,5 m a R$ 19,99/m = R$ 49,98', () => {
    // 1999 × 250 / 100 = 4997,5 → 4998 (meio para cima)
    expect(itemTotal(cents(1999), qty(250), bp(0))).toBe(4998);
  });

  it('desconto de 100% zera o item; desconto 0 mantém o preço cheio', () => {
    expect(itemTotal(cents(5000), qty(200), bp(10_000))).toBe(0);
    expect(itemTotal(cents(5000), qty(200), bp(0))).toBe(10_000);
  });

  it('erra no máximo meio centavo em relação ao valor exato', () => {
    fc.assert(
      fc.property(price, quantity, discount, (p, q, d) => {
        const exactTimes1e6 = BigInt(p) * BigInt(q) * BigInt(10_000 - d); // valor exato × 10^6
        const errorTimes1e6 = BigInt(itemTotal(p, q, d)) * 1_000_000n - exactTimes1e6;
        return errorTimes1e6 > -500_000n && errorTimes1e6 <= 500_000n;
      }),
    );
  });

  it('nunca diminui quando a quantidade aumenta', () => {
    fc.assert(
      fc.property(price, quantity, quantity, discount, (p, a, b, d) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return itemTotal(p, lo, d) <= itemTotal(p, hi, d);
      }),
    );
  });

  it('recusa desconto fora de 0% a 100% e preço negativo', () => {
    expect(() => itemTotal(cents(100), qty(100), bp(-1))).toThrow(RangeError);
    expect(() => itemTotal(cents(100), qty(100), bp(10_001))).toThrow(RangeError);
    expect(() => itemTotal(cents(-1), qty(100), bp(0))).toThrow(RangeError);
  });
});

describe('applyRate', () => {
  it('aplica taxa positiva, negativa e zero', () => {
    expect(applyRate(cents(10_000), bp(500))).toBe(10_500); // +5%
    expect(applyRate(cents(10_000), bp(-250))).toBe(9_750); // −2,5% (ajuste de prazo negativo)
    expect(applyRate(cents(10_000), bp(0))).toBe(10_000);
    expect(applyRate(cents(10_000), bp(-10_000))).toBe(0); // −100%
  });

  it('arredonda meio centavo para cima', () => {
    expect(applyRate(cents(1), bp(5_000))).toBe(2); // 1,5 → 2
    expect(applyRate(cents(3), bp(-5_000))).toBe(2); // 1,5 → 2
  });

  it('bate com a referência exata para taxas de −100% a +100%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000_000 }).map(cents),
        fc.integer({ min: -10_000, max: 10_000 }).map(bp),
        (v, r) => {
          const n = BigInt(v) * BigInt(10_000 + r);
          return applyRate(v, r) === Number((2n * n + 10_000n) / 20_000n);
        },
      ),
    );
  });

  it('recusa taxa abaixo de −100% e valor negativo', () => {
    expect(() => applyRate(cents(100), bp(-10_001))).toThrow(RangeError);
    expect(() => applyRate(cents(-1), bp(0))).toThrow(RangeError);
  });
});

describe('sum', () => {
  it('soma inteiros sem arredondar, inclusive negativos (deltas)', () => {
    expect(sum([cents(342590), cents(4998), cents(-250)])).toBe(347338);
    expect(sum([])).toBe(0);
  });

  it('somar por deltas dá o mesmo que recalcular do zero', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000_000 }), { minLength: 1, maxLength: 200 }),
        fc.nat(),
        fc.integer({ min: 0, max: 100_000_000 }),
        (values, index, replacement) => {
          const items = values.map(cents);
          const i = index % items.length;
          const before = sum(items);
          const old = items[i] ?? cents(0);
          const after = [...items];
          after[i] = cents(replacement);
          // incremental: total antigo + (novo − antigo) == soma recalculada
          return before + (replacement - old) === sum(after);
        },
      ),
    );
  });

  it('recusa soma que ultrapassa o inteiro seguro', () => {
    expect(() => sum([cents(Number.MAX_SAFE_INTEGER), cents(1)])).toThrow(RangeError);
  });
});
